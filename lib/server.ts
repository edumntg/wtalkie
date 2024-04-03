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
    private httpServer: any;
    private host: string;
    private port: number | string;
    private _events: EventsDict;
    private _serverEvents: EventsDict;
    private _clientEvents: EventsDict;

    private pendingConnections: LazyDict;
    private openConnections: LazyDict;
    private verifiedConnections: LazyDict;

    constructor(args: ServerArgs) {
        this.host = args.host;
        this.port = args.port;
        this._events = {};
        this._serverEvents = {};
        this._clientEvents = {};
        this.openConnections = {};
        this.verifiedConnections = {};
        this.pendingConnections = {};
        this.expressApp = express();
        this.httpServer = http.createServer(this.expressApp);
        this.serverSocket = new ServerIO.Server(this.httpServer);
    }

    private async __wait_for_socket(socket: WebSocket, waitTime = 0): Promise<boolean> {
        return new Promise((resolve, reject) => {
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

    /*on(event_name: string, callback: Function): void {
        //if(event_name === EVENT_REQUEST_CONNECTION) return; // cannot override this event, it is reserved

        this._events[event_name] = callback;

        //this.serverSocket?.on(event_name, (args) => callback(args));
    }*/

    start(): void {
        this.serverSocket.on(EVENT_CONNECTION, (socket) => {
            console.log('Connection received from', socket.handshake.address);

            // Check if auth key is given
            if(socket.handshake.query.auth) {
                let authKey: string | string[] = socket.handshake.query.auth;
                // Decode key
                let tokenData: TokenDict = jwt.decode(authKey as string) as TokenDict;
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
                let data: LazyDict = JSON.parse(message);
        
                if(data.method != EVENT_REQUEST_CONNECTION) return;

                console.log(`Request connection from ${data.uid} received`);
    
                // Verify authorization token to validate connection
                try {
                    jwt.verify(data.headers.authorization, process.env.SECRET_KEY as string);
                    console.log(`Request connection from ${data.uid} validated`);

                    // decode
                    let tokenData: TokenDict = jwt.decode(data.headers.authorization) as TokenDict;
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
                    )
                } catch(error: any) {
                    console.log(`Request connection from ${data.uid} rejected`);
                    // Reject connection
                    socket.send(
                        JSON.stringify(
                            {
                                method: EVENT_REQUEST_CONNECTION,
                                response: 'rejected',
                                reason: error.name + ": " + error.message,
                                code: 400,
                                mid: data.mid
                            }
                        )
                    );
                }
    
                // Even if the connection is verified, we won't stablish it yet. We wait for client to call the 'connect' method
                socket.disconnect();

                // Call custom event if exits
                if(this._clientEvents[EVENT_REQUEST_CONNECTION]) {
                    this._clientEvents[EVENT_REQUEST_CONNECTION](message);
                }
            });

            socket.on(EVENT_MESSAGE, (message: string) => {
                if(this._clientEvents[EVENT_MESSAGE]) {
                    this._clientEvents[EVENT_MESSAGE](message);
                }
            });
        });

        this.httpServer.listen(this.port, () => {
            console.log(`Listening on port ${this.port}`);
        })

    }

    close(): void {
        for(let uid of Object.keys(this.openConnections)) {
            this.openConnections[uid].close();
        }

        this.serverSocket?.close();
    }

    broadcast(message: string): number {
        // Send message to all open connections
        let counter: number = 0;
        for(let uid in Object.keys(this.openConnections)) {
            let socket: ServerIO.Socket = this.openConnections[uid].socket;
            if(socket.connected) {
                socket.send(message);
                counter += 1;
            }
        }

        return counter;
    }

    registerServerEvent(eventName: string, callback: Function) {
        this._serverEvents[eventName] = callback;
    }

    registerClientEvent(eventName: string, callback: Function) {
        this._clientEvents[eventName] = callback;
    }
}