interface EventsDict {
    [key: string]: Function
}

interface LazyDict {
    [key: string | number]: any
}

interface TokenDict {
    [uid: string]: string
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

type ClientArgs = {
    host: string;
    port: string | number;
    authorization?: string;
    serverUrl?: string;
}

interface MessagesDict {
    [key: string]: Object
}

type AuthToken = {
    uid: string;
}

export {
    EventsDict,
    LazyDict,
    TokenDict,
    RequestFunctionArgs,
    ServerArgs,
    ClientArgs,
    AuthToken
}