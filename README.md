# wtalkie
WalkieTalkie is a JavaScript library that implements secure connections through WebSocket, using authorization tokens to accept only desired connections.

# Getting Started
First, you need to install the package using ```npm```

```javascript
npm i wtalkie
```

# Usage
### To run a new server:
```javascript
const wtalkie = require('wtalkie');

(async(() => {
    const server = new wtalkie.Server({
        port: 3535
    });
    
    server.start();
    
    server.on('message', (message) => {
        console.log('Message received!');
    });
})();
```

### Create a new client:
```javascript
const wtalkie = require('wtalkie');
const jwt = require('jsonwebtoken'); // for auth

require('dotenv').config();

(async () => {
    try {
        // Create a new cliet that connects to the server
        let client = new wtalkie.Client({host: 'localhost', port: 3535, authorization: jwt.sign({uid: wtalkie.UID}, process.env.SECRET_KEY)});

        // Request connection permission
        await client.requestConnection(); // If not approved, exception is thrown
        // NOTE: you can manually authorize a client without calling requestConnection. Use client.authorize(token)
        
        // Now that we have been authorized, connect to server and keep connection alive
        await client.connect(true);

        // Override socket methods
        client.on("message", (message) => {
            console.log("Received message: ", message);
        });

        // Send a message to the server
        client.send("This is a test");
    } catch(error) {
        console.log("Error", error);
    }
})();
```


