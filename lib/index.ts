import {Server} from "./server"
import WebSocket from 'ws';
import * as crypto from 'crypto';
import { RequestedConnection } from "./requested-connection";
import {EventsDict, LazyDict, TokenDict, RequestFunctionArgs} from "./interfaces";
import * as IOClient from "socket.io-client";
import * as jwt from 'jsonwebtoken';

let UID = crypto.randomBytes(6).toString('hex'); // Generate an unique id for this instance
let logs: LazyDict = {};

function __wait_for_response(mid: string, tries = 0, resolves: Function[] = []) {
    return new Promise((resolve, reject) => {
        if(tries < 10) {
            setTimeout(async () => {
                if(!logs[mid].replied && !logs[mid].timedout) {
                    await __wait_for_response(mid, tries + 1, [...resolves, resolve]);
                } else {
                    resolves.forEach(res => res(!logs[mid].timedout));
                    resolve(!logs[mid].timedout);
                }
            }, 100)
        } else {
            logs[mid].timedout = true;
            resolve(false);
            resolves.forEach(res => res(false));
            return;
        }
    })
}

async function __wait_for_socket(socket: WebSocket, waitTime = 0) {
    return new Promise((resolve, reject) => {
        if(waitTime < 5000) {
            setTimeout(async () => {
                if(socket.readyState !== 1) {
                    await __wait_for_socket(socket, waitTime + 100);
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

function request_connection(args: RequestFunctionArgs) {
    return new Promise(async (resolve, reject) => {
        // Create a WebSocket client and stablish connection with given host
        let hostUrl: string = "ws://" + args.host + ":" + args.port.toString();
        if(args.url) {
            hostUrl = args.url;
        }
        let client: IOClient.Socket = IOClient.io(hostUrl);
        //let server: any = new WebSocket('ws://' + host + ":" + port.toString()); // Connection to server

        //console.log(client.readyState);
        //await __wait_for_socket(server);
        //console.log(client.readyState);

        let requestedConnection = new RequestedConnection({host: hostUrl, uid: UID, headers: args.headers});

        client.on('message', (buffer: { toString: () => any; }) => {
            // Convert to string
            let message = buffer.toString();

            // Parse data
            let data = JSON.parse(message);
            if(data.mid in logs) {
                logs[data.mid].replied = true;
                logs[data.mid].response = data;
            }

            switch(data.method) {
                case 'request_connection':
                    // If request is successful, return a new RequestedConnection object
                    if(data.code === 200) {
                        requestedConnection.authorize(data.key);
                    } else {
                        resolve(false);
                    }
                    break;
            }
        });

        // Create a message object
        let message_data = {
            // Specify action
            method: 'request_connection',
            // Create an unique id for this client
            uid: UID,
            headers: args.headers,
            mid: crypto.randomBytes(6).toString('hex'),
            replied: false,
            response: null,
            timedout: false
        };

        logs[message_data.mid] = message_data;

        // Now, send the headers
        console.log('Emitting');
        client.emit("request_connection", JSON.stringify(message_data));

        // Wait for response
        console.log('Connection requested');
        let replied = await __wait_for_response(message_data.mid);
        console.log('Received response and request is', logs[message_data.mid].response.response);
        requestedConnection.setTimedOut(!replied);

        resolve(requestedConnection);
    });
}

function setId(id: string) {
    UID = id;
}

export {
    Server,
    request_connection,
    UID,
    setId
}