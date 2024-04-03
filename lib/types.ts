type ClientArgs = {
    host: string;
    port: string | number;
    authorization?: string;
    serverUrl?: string;
}

type ServerArgs = {
    host: string;
    port: string | number;
}

type AuthToken = {
    uid: string;
}

type RequestFunctionArgs = {
    host: string;
    port: string | number;
    headers: object;
    url?: string;
}

export {
    ClientArgs,
    AuthToken,
    RequestFunctionArgs,
    ServerArgs
}