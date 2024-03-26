interface EventsDict {
    [key: string]: Function
}

interface LazyDict {
    [key: string | number]: any
}

interface TokenDict {
    [uid: string]: string
}

export {
    EventsDict,
    LazyDict,
    TokenDict
}