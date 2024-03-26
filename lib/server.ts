import * as WebSocket from 'ws';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import {EventsDict, LazyDict, TokenDict} from "./interfaces";
import * as http from 'http';
import express, {Express, Request, Response} from "express";
import * as IOServer from 'socket.io';

dotenv.config();

export class Server {
    //private express_app: Express;
    private express_app: Express;
    private socket_server: WebSocket.Server | undefined;
    private io_server: IOServer.Server;
    private http_server: any;
    private host: string;
    private port: number;
    private __events: EventsDict;

    private open_connections: LazyDict;
    private verified_connections: LazyDict;
    private server_url: string;

    constructor({host = 'localhost', port = 3535}: {host: string, port: number}) {
        this.host = host;
        this.port = port;
        this.server_url = '';
        this.__events = {};
        this.open_connections = {};
        this.verified_connections = {};
        //this.express_app = express();
        this.express_app = express();
        this.http_server = http.createServer(this.express_app);
        this.io_server = new IOServer.Server(this.http_server);

        this._construct_url();
    }

    private _construct_url() {
        this.server_url = 'ws://' + this.host + ":" + this.port.toString();
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

        if(event_name === 'request_connection') return; // cannot override this event, it is reserved

        console.log('CALLED ON', event_name);
        this.__events[event_name] = callback;

        return this.socket_server?.on(event_name, (args) => callback(args));
    }

    async start() {

        //this.socket_server = new WebSocket.Server({port: this.port});
        //this.socket_server = socketio(this.http_server);

        this.io_server.on('connection', (socket) => {
            console.log('Connection received');

            socket.on("request_connection", (message: string) => {
                console.log('Received request_connection', message);
    
                // Parse JSON
                let data = JSON.parse(message);
        
                if(data.method != 'request_connection') return;
    
                // Verify authorization token to validate connection
                try {
                    jwt.verify(data.headers.authorization, process.env.SECRET_KEY as string);

                    // decode
                    let tokenData: TokenDict = jwt.decode(data.headers.authorization) as TokenDict;
    
                    // Connection verified, so set it as verified and assign a new key
                    this.verified_connections[tokenData.uid] = {
                        socket,
                        key: jwt.sign({uid: tokenData.uid, token: data.headers.authorization}, process.env.SECRET_KEY as string),
                        token: data.headers.token
                    }
    
                    socket.send(
                        JSON.stringify(
                            {
                                method: 'request_connection',
                                response: 'verified',
                                code: 200,
                                mid: data.mid,
                                key: this.verified_connections[data.uid].key
                            }
                        )
                    )
                } catch(error) {
                    // Reject connection
                    socket.send(
                        JSON.stringify(
                            {
                                method: 'request_connection',
                                response: 'rejected',
                                code: 400,
                                mid: data.mid
                            }
                        )
                    );
                }
    
                // Even if the connection is verified, we won't stablish it yet. We wait for client to call the 'connect' method
                socket.disconnect();
            });
        })

        this.io_server.on('request_connection', (socket, buffer) => {
            console.log('Received request_connection');

            // Convert buffer to string
            let message = buffer.toString();

            // Parse JSON
            let data = JSON.parse(message);

            if(data.method != 'request_connection') return;

            // Verify authorization token to validate connection
            try {
                jwt.verify(data.headers.authorization, process.env.SECRET_KEY as string);

                // Connection verified, so set it as verified and assign a new key
                this.verified_connections[data.uid] = {
                    socket,
                    key: jwt.sign({uid: data.uid, token: data.headers.authorization}, process.env.SECRET_KEY as string),
                    token: data.headers.token
                }

                socket.send(
                    JSON.stringify(
                        {
                            method: 'request_connection',
                            response: 'verified',
                            code: 200,
                            mid: data.mid,
                            key: this.verified_connections[data.uid].key
                        }
                    )
                )
            } catch(error) {
                // Reject connection
                socket.send(
                    JSON.stringify(
                        {
                            method: 'request_connection',
                            response: 'rejected',
                            code: 400,
                            mid: data.mid
                        }
                    )
                );
            }

            // Even if the connection is verified, we won't stablish it yet. We wait for client to call the 'connect' method
            socket.close();
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