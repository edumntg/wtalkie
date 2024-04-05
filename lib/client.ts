/* eslint-disable no-async-promise-executor */
import {EventsDict, LazyDict} from './interfaces';
import {ClientArgs, AuthToken} from './types';
import * as IOClient from 'socket.io-client';
import * as crypto from 'crypto';
import assert from 'assert';
import * as jwt from 'jsonwebtoken';
import { EVENT_MESSAGE, EVENT_REQUEST_CONNECTION, EVENT_JWT_EXPIRE } from './constants';

export class Client {
    private args: ClientArgs;
    private host: string;
    private port: string | number;
    private UID: string;
    private messagesReceived: LazyDict;
    private serverUrl?: string;
    private authorization?: string; // jwt token
    private authorizedToken?: string;
    private socket?: IOClient.Socket;
    private authorized: boolean;
    private _events: EventsDict;
    
    constructor(args: ClientArgs) {
        this.args = args;
        this.host = args.host;
        this.port = args.port;
        this.serverUrl = args.serverUrl;
        this.authorization = args.authorization;
        this.UID = (jwt.decode(args.authorization as string) as AuthToken).uid;
        this.messagesReceived = {};
        this.authorized = false;
        this._events = {};
    }
    
    authorize(token: string) {
        this.authorizedToken = token;
        this.authorized = true;
    }

    requestConnection() {
        return new Promise(async (resolve, reject) => {
            // Create a WebSocket client and stablish connection with given host

            // Construct a ws host url, but if serverUrl is given, then use that one
            let hostUrl: string = "ws://" + this.host + ":" + this.port.toString();
            if(this.serverUrl) {
                hostUrl = this.serverUrl;
            }

            // Create connection
            const client: IOClient.Socket = IOClient.io(hostUrl);
    
            client.on(EVENT_MESSAGE, (buffer: { toString: () => string; }) => {
                // Convert to string
                const message: string = buffer.toString();
    
                // Parse data
                const data: LazyDict = JSON.parse(message);
                if(data.mid in this.messagesReceived) {
                    this.messagesReceived[data.mid] = {...this.messagesReceived[data.mid], replied: true, response: data};
                }
    
                switch(data.method) {
                    case EVENT_REQUEST_CONNECTION:
                        if(data.code === 200) {
                            this.authorize(data.key);
                        } else {
                            reject(data);
                        }
                        break;
                }
            });
    
            // Create a message object
            const message_data: LazyDict = {
                // Specify action
                method: EVENT_REQUEST_CONNECTION,
                // Create an unique id for this client
                uid: this.UID,
                headers: {authorization: this.authorization},
                mid: crypto.randomBytes(6).toString('hex'),
                replied: false,
                response: null,
                timedout: false
            };
    
            this.messagesReceived[message_data.mid] = message_data;
    
            // Now, send the headers
            console.log('Emitting');
            client.emit(EVENT_REQUEST_CONNECTION, JSON.stringify(message_data));
    
            // Wait for response
            console.log('Connection requested');
            const replied: boolean = await this._waitForResponse(message_data.mid);
            let timedOut = false;
            if(replied) {
                console.log('Received response and request is', this.messagesReceived[message_data.mid].response.response);
            } else {
                console.log('Request timed out');
                timedOut = true;
            }
    
            resolve({response: this.messagesReceived[message_data.mid].response.response, timedOut});
        });
    }

    async connect(verbose = false) {
        assert(!!this.authorizedToken, "Authorization key required");

        // Create connection
        const url = this.serverUrl || "ws://" + this.host + ":" + this.port.toString();

        verbose && console.log("Connecting to", url);

        const connection: IOClient.Socket = await IOClient.io(url + `?auth=${this.authorizedToken}`);

        verbose && console.log("Connected!");

        this.socket = connection;

        // Register message event
        this.socket.on(EVENT_MESSAGE, (message) => {
            if(this._events[EVENT_MESSAGE]) {
                this._events[EVENT_MESSAGE](message);
            }
        });

        this.socket.on(EVENT_JWT_EXPIRE, () => {

        });


        return connection;
    }

    _waitForResponse(mid: string, tries = 0, resolves: ((param: boolean) => unknown)[] = []): Promise<boolean> {
        return new Promise((resolve) => {
            if(tries < 10) {
                setTimeout(async () => {
                    if(!this.messagesReceived[mid].replied && !this.messagesReceived[mid].timedout) {
                        await this._waitForResponse(mid, tries + 1, [...resolves, resolve]);
                    } else {
                        resolves.forEach((res: (param: boolean) => void) => res(!this.messagesReceived[mid].timedout));
                        resolve(!this.messagesReceived[mid].timedout);
                    }
                }, 100)
            } else {
                this.messagesReceived[mid].timedout = true;
                resolve(false);
                resolves.forEach((res: (param: boolean) => void) => res(false));
                return;
            }
        })
    }

    send(data: string) {
        this.socket?.send(data);
    }

    close() {
        this.socket?.disconnect();
    }

    disconnect() {
        return this.close();
    }

    kill() {
        return this.close();
    }

    registerEvent(eventName: string, callback: (() => void)) {
        this._events[eventName] = callback;
    }
}