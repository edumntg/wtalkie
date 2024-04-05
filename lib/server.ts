import * as WebSocket from 'ws';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import {EventsDict, LazyDict, TokenDict} from './interfaces';
import {ServerArgs} from './types';
import * as http from 'http';
import express, {Express} from 'express';
import * as ServerIO from 'socket.io';
import { EVENT_CONNECTION, EVENT_MESSAGE, EVENT_REQUEST_CONNECTION } from './constants';
import assert from 'assert';

dotenv.config();

export class Server {
    private expressApp: Express;
    private serverSocket: ServerIO.Server;
    private httpServer: http.Server;
    private host: string;
    private port: number | string;
    private _events: EventsDict;
    private _serverEvents: EventsDict;
    private _clientEvents: EventsDict;

    private pendingConnections: LazyDict;
    private openConnections: LazyDict;

    constructor(args: ServerArgs) {
        this.host = args.host;
        this.port = args.port;
        this._events = {};
        this._serverEvents = {};
        this._clientEvents = {};
        this.openConnections = {};
        this.pendingConnections = {};
        this.expressApp = express();
        this.httpServer = http.createServer(this.expressApp);
        this.serverSocket = new ServerIO.Server(this.httpServer);
    }

    private async __wait_for_socket(socket: WebSocket, waitTime = 0): Promise<boolean> {
        return new Promise((resolve) => {
            if(waitTime < 5000) {
                setTimeout(async () => {
                    if(socket.readyState !== 1) {
                        await this.__wait_for_socket(socket, waitTime + 100);
                    } else {
                        resolve(true);
                    }
                }, 100);
            } else {
                resolve(false);
                return;
            }
        });
    
    }

    start(): void {
        this.serverSocket.on(EVENT_CONNECTION, (socket) => {
            console.log('Connection received from', socket.handshake.address);

            // Check if auth key is given
            if(socket.handshake.query.auth) {
                const authKey: string | string[] = socket.handshake.query.auth;
                // Decode key
                const tokenData: TokenDict = jwt.decode(authKey as string) as TokenDict;
                // Validate key
                try {
                    jwt.verify(authKey as string, process.env.SECRET_KEY as string);

                    // The given key is valid, so this client comes from an approved request. It means that, its data should be stored
                    // in the pendingConnections map. 

                    if(this.pendingConnections[tokenData.uid]) {
                        assert(authKey === this.pendingConnections[tokenData.uid].key, "Auth key provided by server differs from the one provided by client. Aborting connection");
                        
                        // Move socket data from pending-connections to open-connections
                        this.openConnections[tokenData.uid] = {
                            uid: tokenData.uid,
                            socket,
                            address: socket.handshake.address,
                            handshake: socket.handshake,
                            key: authKey,
                            iat: new Date().getTime()
                        }

                        // Delete previous data from pendingConnections
                        delete this.pendingConnections[tokenData.uid];
                    }

                    // decode
                    console.log(`Authorized connection with ${socket.handshake.address} from client ${tokenData.uid}`);
                } catch(error) {
                    console.log(`Reject authorized connection with ${socket.handshake.address} from client ${tokenData.uid} because jwt token is invalid`);
                    socket.disconnect();
                }
            }

            // Now, if there is a custom event registered by user, execute it
            if(this._serverEvents[EVENT_CONNECTION]) {
                this._serverEvents[EVENT_CONNECTION](socket);
            }

            socket.on(EVENT_REQUEST_CONNECTION, (message: string) => {
                console.log(`Received ${EVENT_REQUEST_CONNECTION}`);
    
                // Parse JSON
                const data: LazyDict = JSON.parse(message);
        
                if(data.method != EVENT_REQUEST_CONNECTION) return;

                console.log(`Request connection from ${data.uid} received`);
    
                // Verify authorization token to validate connection

                const authorized: LazyDict = this.onAuthorizeRequest(data);
                console.log(authorized)
                if(!authorized.success) {
                    socket.send(
                        JSON.stringify(
                            {
                                method: EVENT_REQUEST_CONNECTION,
                                response: 'rejected',
                                reason: authorized.reason,
                                code: 400,
                                mid: data.mid
                            }
                        )
                    );

                    socket.disconnect();
                    return;
                }

                // Request is authorized
                console.log(`Request connection from ${data.uid} validated`);

                // decode
                const tokenData: TokenDict = jwt.decode(data.headers.authorization) as TokenDict;
                console.log(tokenData);

                // At this point, the identity of the client has been validated, so add its socket to the pendingConnections map
                // Connection verified, so add to pending connections and assign a key
                this.pendingConnections[tokenData.uid] = {
                    socket,
                    key: jwt.sign({uid: tokenData.uid, token: data.headers.authorization}, process.env.SECRET_KEY as string),
                    token: data.headers.token
                }

                console.log(`Request connection from ${tokenData.uid} approved and remains pending`);
                
                socket.send(
                    JSON.stringify(
                        {
                            method: EVENT_REQUEST_CONNECTION,
                            response: 'verified',
                            code: 200,
                            mid: data.mid,
                            key: this.pendingConnections[data.uid].key
                        }
                    )
                );
    
                // Even if the connection is verified, we won't stablish it yet. We wait for client to call the 'connect' method
                socket.disconnect();

                // Call custom event if exits
                if(this._clientEvents[EVENT_REQUEST_CONNECTION]) {
                    this._clientEvents[EVENT_REQUEST_CONNECTION](message);
                }
            });

            socket.on(EVENT_MESSAGE, (message: string) => {
                if(this._clientEvents[EVENT_MESSAGE]) {
                    this._clientEvents[EVENT_MESSAGE](socket, message);
                }
            });
        });

        this.httpServer.listen(this.port, () => {
            console.log(`Listening on port ${this.port}`);
        })

    }

    close(): void {
        for(const uid of Object.keys(this.openConnections)) {
            this.openConnections[uid].close();
        }

        this.serverSocket?.close();
    }

    broadcast(message: string): number {
        // Send message to all open connections
        let counter: number = 0;
        for(const uid of Object.keys(this.openConnections)) {
            const socket: ServerIO.Socket = this.openConnections[uid].socket;
            if(socket.connected) {
                socket.send(message);
                counter += 1;
            }
        }

        return counter;
    }

    registerServerEvent(eventName: string, callback: () => unknown) {
        this._serverEvents[eventName] = callback;
    }

    registerClientEvent(eventName: string, callback: () => unknown) {
        this._clientEvents[eventName] = callback;
    }

    onAuthorizeRequest(data: LazyDict) {
        // Default onAuthorize event will receive a JWT token from data, in a property called 'authorization'.
        // The token will be verified using a secret key stored in .env as SECRET_KEY
        // The function returns true/false
        try {
            jwt.verify(data.headers.authorization, process.env.SECRET_KEY as string);
            return {success: true};
        } catch(error: unknown) {
            console.log(error);
            return {success: false, reason: error};
        }
    }
}