const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const bcrypt = require('bcrypt');
const { WebSocketServer } = require('ws');

const Routes = require('./routes/routes');
const mqtt = require('./components/mqtt/mqttService');
const { readUsers, writeUsers } = require('./components/db/users');
const { readServers } = require('./components/db/servers');

const app = express();
const port = process.env.PORT || 5000;

const clientsMap = new Map();
let mqttConnected = false;
let connectedClientId = null;

/*
var options = {
  key: fs.readFileSync('certs/tls.key'),
  cert: fs.readFileSync('certs/tls.crt'),
  ca: fs.readFileSync('certs/rootCA.crt'),
  requestCert: false
};
*/

// Uncomment the line below to use HTTPS instead of HTTP
//const webserver = https.createServer(options, app);

// Uncomment the line below to use HTTP instead of HTTPS
const webserver = http.createServer(app);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend/build')));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

app.use('/api/mqtt', Routes);
app.use('/api/http', Routes);

// Handle 404 errors
app.use((req, res) => { 
  res.status(404).json({ error: 'Not Found' });
});

webserver.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

// Create a WebSocket server
const wss = new WebSocketServer({ noServer: true, path: '/api/ws' });

// Initialize MQTT service with WebSocket server
mqtt.initializeMqttService(wss);

// WebSocket upgrade handling
webserver.on('upgrade', (req,socket,head) => {
  // Handle WebSocket upgrade requests
  wss.handleUpgrade(req,socket,head, (ws) => {
    console.log('upgrading to ws ...')
    wss.emit('connection',ws,req)  
  })
})

// WebSocket connection handling
wss.on('connection', ws => {
  // Generate a unique ID for the WebSocket connection
  ws.id = wss.getUniqueID();

  console.log(`New client connected with ID: ${ws.id}`)  

  // Get the token from the WebSocket handshake
  const token = ws.handshake.headers['sec-websocket-key'];

  // Add the client to the Map
  /*
  clientsMap.set(ws.id, {
    ws: ws,
    isAlive: true,
    mqttConnected: false
  });
  */
  // Initialize the client in the Map
  clientsMap.set(ws.id, {
    isAlive: true,    
    ws: ws,
    token: token,
    timestamp: Date.now()
  });

  // Ping pong to maintain the connection
  ws.on('ping', () => {
    const client = clientsMap.get(ws.id);
    if (client) {
      client.isAlive = true;
    }
    ws.ping();
  });

  // Handle client disconnection
  ws.on('close', (code,reason) => {
    console.log(`Client with ID: ${ws.id} has disconnected!`);
    console.log("code " + code + " reason " + reason);
    clientsMap.delete(ws.id);
    if (ws.id === connectedClientId && clientsMap.size > 0) {
      // If the disconnected client was the one who initiated the MQTT connection,
      // and there are still other clients, pass the connection to another client
      connectedClientId = clientsMap.keys().next().value;
    } else if (clientsMap.size === 0 && mqttConnected) {
      // If this was the last client, disconnect from MQTT
      mqtt.disconnect();
      mqttConnected = false;
      connectedClientId = null;
    }
  })

  // Handle incoming messages
  ws.on('message', async (message) => {

    // Parse the incoming message
    const data = JSON.parse(message);

    // Get the client from the Map
    const client = clientsMap.get(ws.id);

    const storedToken = client.token;
    const storedTimestamp = client.timestamp;

    // Verify the token
    if (storedToken !== token || storedTimestamp !== data.timestamp) {
      ws.send(JSON.stringify({ error: 'Invalid token' }));
      return;
    }

    // Invoke the route or handler based on the incoming message    
    if (data.route === 'connect') {
      // Handle connect action
      console.log('Mqtt Client connected');
      if (!mqttConnected) {
        console.log(`Connecting to MQTT server with index: ${data.serverIndex}`);
        if (data.serverIndex === undefined || data.serverIndex < 0) {
          ws.send(JSON.stringify({ error: 'serverIndex is required' }));  
          return;
        }

        const servers = readServers();
        if (data.serverIndex >= servers.length) {
          ws.send(JSON.stringify({ error: 'Invalid serverIndex' }));  
          return;
        }

        console.log(`Connected to MQTT server with index: ${servers[data.serverIndex].name}`);       

        try {
          const status = await mqtt.connect(servers[data.serverIndex]);
          console.log(`Status: ${status}`);
          if (status === 'connected' || status.includes('success')) {
            mqttConnected = true;
            connectedClientId = ws.id;
            ws.send(JSON.stringify({ status: status }));
          } else {
            mqttConnected = false;
            ws.send(JSON.stringify({ status: status }));
          }
        } catch (error) {
          console.error('Error connecting to MQTT broker:', error);
          mqttConnected = false;
          ws.send(JSON.stringify({ error: 'Failed to connect to MQTT broker' }));
          return;
        }
      } else {
        ws.send(JSON.stringify({ status: 'Already connected to MQTT broker' }));
      }
    } else if (data.route === 'disconnect') {
      // Handle disconnect action
      console.log(`Mqtt Client should disconnect ${clientsMap.size}`);
      if (mqttConnected && clientsMap.size ===1) {
        const status = await mqtt.disconnect();
        console.log(`Status: ${status}`);
        mqttConnected = false;
        connectedClientId = null
        ws.send(JSON.stringify({ status: status }));
      } else if (!mqttConnected) {
        ws.send(JSON.stringify({ status: 'Not connected to MQTT broker' }));
      } else {
        ws.send(JSON.stringify({ status: 'Other clients are still connected' }));
      }
    } else if (data.route === 'publish') {
      // Handle publish action
      console.log(`Publishing message: ${data.message} to topic: ${data.topic}`);
      if (!data.topic || !data.message) {
        ws.send(JSON.stringify({ error: 'topic and message are required' }));
        return;
      }
      if (!mqttConnected) {
        ws.send(JSON.stringify({ error: 'Not connected to MQTT broker' }));
        return;
      }
      const status = await mqtt.publishMessage(data.topic, data.message, { retain: data.retain || false  });
      // Send a success message back to the client
      ws.send(JSON.stringify({ topic:data.topic, status: status }));
    } else  {
      console.log(`Received command: ${data.cmd} with data: ${data.data}`);
    }
  });

  // Handle WebSocket pong messages to maintain the connection
  ws.on('pong', (data) => {
    console.log(`Received ${data} from client ${ws.id}`);
    const client = clientsMap.get(ws.id);
    if (client) {
      client.isAlive = true;
    }
  });
  
  // Handle WebSocket errors
  ws.on('error', function () {
    console.log('websocket error');
    clientsMap.delete(ws.id);
  });

});

wss.getUniqueID = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4();
};

const interval = setInterval(async function ping() {
  clientsMap.forEach((client, id) => {
    if (client.isAlive === false) {
      console.log(`ping error terminating connection for client ${id}`);
      client.ws.terminate();
      clientsMap.delete(id);
    } else {
      client.isAlive = false;
      console.log(`sending ping to client ${id}`);
      client.ws.ping('ping');
    }
  });
}, 30000);

// Modify the close event handler
wss.on('close', function close() {
  console.log('websocket closed');
  clearInterval(interval);
  clientsMap.forEach((client) => {
    client.ws.terminate();
  });
  clientsMap.clear();
  if (mqttConnected) {
    mqtt.disconnect();
    mqttConnected = false;
    connectedClientId = null;
  }
});
