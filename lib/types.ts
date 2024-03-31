type ClientArgs = {
    host: string;
    port: string | number;
    authorization?: string;
    serverUrl?: string;
}

type AuthToken = {
    uid: string;
}

type RequestFunctionArgs = {
    host: string;
    port: string | number;
    headers: Object;
    url?: string;
}

type ServerArgs = {
    host: string;
    port: string | number;
}

export {
    ClientArgs,
    AuthToken,
    RequestFunctionArgs,
    ServerArgs
}