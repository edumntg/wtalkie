import * as WebSocket from 'ws';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import {EventsDict, LazyDict, TokenDict} from './interfaces';
import {ServerArgs} from './types';
import * as http from 'http';
import express, {Express} from 'express';
import * as IOServer from 'socket.io';
import { EVENT_CONNECTION, EVENT_MESSAGE, EVENT_REQUEST_CONNECTION } from './constants';

dotenv.config();

export class Server {
    private express_app: Express;
    private socket_server: WebSocket.Server | undefined;
    private io_server: IOServer.Server;
    private http_server: any;
    private host: string;
    private port: number | string;
    private _events: EventsDict;

    private open_connections: LazyDict;
    private verified_connections: LazyDict;

    constructor(args: ServerArgs) {
        this.host = args.host;
        this.port = args.port;
        this._events = {};
        this.open_connections = {};
        this.verified_connections = {};
        this.express_app = express();
        this.http_server = http.createServer(this.express_app);
        this.io_server = new IOServer.Server(this.http_server);
    }

    private async __wait_for_socket(socket: WebSocket, waitTime = 0) {
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

    on(event_name: string, callback: Function) {
        if(event_name === EVENT_REQUEST_CONNECTION) return; // cannot override this event, it is reserved

        this._events[event_name] = callback;

        return this.socket_server?.on(event_name, (args) => callback(args));
    }

    start() {
        this.io_server.on(EVENT_CONNECTION, (socket) => {
            console.log('Connection received');

            // Check if auth key is given
            if(socket.handshake.query.auth) {
                // Decode key
                let tokenData: TokenDict = jwt.decode(socket.handshake.query.auth as string) as TokenDict;
                // Validate key
                try {
                    jwt.verify(socket.handshake.query.auth as string, process.env.SECRET_KEY as string);

                    // decode
                    console.log(`Received authorized connection from ${tokenData.uid}`);
                } catch(error) {
                    console.log(`Received authorized connection from ${tokenData.uid}, but token is invalid`);
                    socket.disconnect();
                }
            }

            socket.on(EVENT_MESSAGE, (message) => {
                console.log("Received message", message);
                // Send reply
                socket.send("This is the reply");
            })

            socket.on(EVENT_REQUEST_CONNECTION, (message: string) => {
                console.log(`Received ${EVENT_REQUEST_CONNECTION}`);
    
                // Parse JSON
                let data = JSON.parse(message);
        
                if(data.method != EVENT_REQUEST_CONNECTION) return;

                console.log(`Request connection from ${data.uid} received`);
    
                // Verify authorization token to validate connection
                try {
                    jwt.verify(data.headers.authorization, process.env.SECRET_KEY as string);
                    console.log(`Request connection from ${data.uid} validated`);

                    // decode
                    let tokenData: TokenDict = jwt.decode(data.headers.authorization) as TokenDict;
                    console.log(tokenData);
    
                    // Connection verified, so set it as verified and assign a new key
                    this.verified_connections[tokenData.uid] = {
                        socket,
                        key: jwt.sign({uid: tokenData.uid, token: data.headers.authorization}, process.env.SECRET_KEY as string),
                        token: data.headers.token
                    }

                    console.log(`Request connection from ${tokenData.uid} approved`);
                    
                    socket.send(
                        JSON.stringify(
                            {
                                method: EVENT_REQUEST_CONNECTION,
                                response: 'verified',
                                code: 200,
                                mid: data.mid,
                                key: this.verified_connections[data.uid].key
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
            });
        });

        this.http_server.listen(this.port, () => {
            console.log(`Listening on port ${this.port}`);
        })

    }

    close() {
        for(let uid of Object.keys(this.open_connections)) {
            this.open_connections[uid].close();
        }

        this.socket_server?.close();
    }
}