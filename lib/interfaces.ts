/* eslint-disable @typescript-eslint/no-explicit-any */
interface EventsDict {
    [key: string]: (...args: unknown[]) => void
}

interface LazyDict {
    [key: string | number]: any
}

interface TokenDict {
    [uid: string]: string
}

interface MessagesDict {
    [key: string]: object
}

export {
    EventsDict,
    LazyDict,
    TokenDict,
    MessagesDict
}