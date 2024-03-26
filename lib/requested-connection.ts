import assert from "assert";
import * as IOClient from "socket.io-client";
import { RequestedConnectionArgs } from "./interfaces";

export class RequestedConnection {
    private _host: string;
    private _headers: Object;
    private _UID: string;
    private _auth_key: string;
    private _timed_out: boolean;

    constructor(args: RequestedConnectionArgs) {
        this._host = args.host;
        this._headers = args.headers;
        this._UID = args.uid;
        this._timed_out = false;
        this._auth_key = '';
    }

    authorize(key: string) {
        this._auth_key = key;
    }

    setTimedOut(bool: boolean) {
        this._timed_out = bool;
    }

    connect() {
        assert(!!this._auth_key, "Authorization key required");

        // Create connection
        let connection: IOClient.Socket = IOClient.io(this._host + `?auth=${this._auth_key}`);

        return connection;

    }
}