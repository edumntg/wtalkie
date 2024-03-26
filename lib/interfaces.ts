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

type RequestedConnectionArgs = {
    host: string;
    headers: Object;
    uid: string;
    url?: string;
}

export {
    EventsDict,
    LazyDict,
    TokenDict,
    RequestFunctionArgs,
    ServerArgs,
    RequestedConnectionArgs
}