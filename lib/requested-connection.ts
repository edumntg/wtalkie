import assert from "assert";
import * as IOClient from "socket.io-client";

export class RequestedConnection {
    private host: string;
    private headers: Object;
    private UID: string;
    private auth_key: string;
    private timed_out: boolean;

    constructor({host, headers, uid}: {host: string, headers: Object, uid: string}) {
        this.host = host;
        this.headers = headers;
        this.UID = uid;
        this.timed_out = false;
        this.auth_key = '';
    }

    authorize(key: string) {
        this.auth_key = key;
    }

    setTimedOut(bool: boolean) {
        this.timed_out = bool;
    }

    connect() {
        assert(!!this.auth_key, "Authorization key required");

        // Create connection
        let connection: IOClient.Socket = IOClient.io(this.host + `?auth=${this.auth_key}`);

        return connection;

    }
}