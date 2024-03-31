import {Server} from "./server"
import {Client} from "./client"
import * as crypto from 'crypto';

let UID = crypto.randomBytes(6).toString('hex'); // Generate an unique id for this instance
function setId(id: string) {
    UID = id;
}

export {
    Server,
    Client,
    UID,
    setId
}