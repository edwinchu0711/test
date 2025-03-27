const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const clients = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    // Forward signaling data to the other client
    if (data.to && clients.has(data.to)) {
      clients.get(data.to).send(JSON.stringify(data));
    }

    // Register client
    if (data.register) {
      clients.set(data.register, ws);
    }
  });

  ws.on('close', () => {
    for (const [key, client] of clients.entries()) {
      if (client === ws) {
        clients.delete(key);
      }
    }
  });
});