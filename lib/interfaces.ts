interface EventsDict {
    [key: string]: Function
}

interface LazyDict {
    [key: string | number]: any
}

interface TokenDict {
    [uid: string]: string
}

interface MessagesDict {
    [key: string]: Object
}

export {
    EventsDict,
    LazyDict,
    TokenDict,
    MessagesDict
}