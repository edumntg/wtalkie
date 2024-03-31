import {Server} from "./server"
import {Client} from "./client"
import WebSocket from 'ws';
import * as crypto from 'crypto';
import {LazyDict} from "./interfaces";

let UID = crypto.randomBytes(6).toString('hex'); // Generate an unique id for this instance
let logs: LazyDict = {};

function _waitForResponse(mid: string, tries = 0, resolves: Function[] = []) {
    return new Promise((resolve, reject) => {
        if(tries < 10) {
            setTimeout(async () => {
                if(!logs[mid].replied && !logs[mid].timedout) {
                    await _waitForResponse(mid, tries + 1, [...resolves, resolve]);
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

async function _waitForSocket(socket: WebSocket, waitTime = 0) {
    return new Promise((resolve, reject) => {
        if(waitTime < 5000) {
            setTimeout(async () => {
                if(socket.readyState !== 1) {
                    await _waitForSocket(socket, waitTime + 100);
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

function setId(id: string) {
    UID = id;
}

export {
    Server,
    Client,
    UID,
    setId
}