const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const dotenv = require('dotenv');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const Routes = require('./routes/routes');
const mqtt = require('./components/mqtt/mqttService');
const { readUsers, writeUsers } = require('./components/db/users');
const { readServers } = require('./components/db/servers');
const { getUniqueID } = require('./components/helpers/helperFunctions');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const tls = process.env.TLS || false;

const clientsMap = new Map();
let webserver = null
let mqttConnected = false;
let connectedClientId = null;
let initialized = false;

// TLS configuration for HTTPS server
if (tls) {
  console.log('TLS enabled');
  // Load TLS certificates from the 'certs' directory
  var options = {
    key: fs.readFileSync('certs/tls.key'),
    cert: fs.readFileSync('certs/tls.crt'),
    ca: fs.readFileSync('certs/rootCA.crt'),
    requestCert: false
  };
  webserver = https.createServer(options, app);
} else {
  console.log('TLS disabled');
  // Load TLS certificates from the 'certs' directory
  webserver = http.createServer(app);  
}

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
wss.getUniqueID = () => getUniqueID();

function generateAcceptKey(key) {
    const guid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const sha1 = crypto.createHash('sha1');
    sha1.update(key + guid);
    return sha1.digest('base64');
}

function prepareHandshakeResponse (id) {
  const acceptKey = generateAcceptKey(id)

  return [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `sec-webSocket-accept: ${acceptKey}`,
    // This empty line MUST be present for the response to be valid
    ''
  ].map(line => line.concat('\r\n')).join('')
}

function onSocketUpgrade (req, socket, head) {
  const { 'sec-websocket-key': webClientSocketKey } = req.headers
  const response = prepareHandshakeResponse(webClientSocketKey)
  socket.write(response);
  socket.on('readable', () => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log(`Received message: ${message}`);
      wss.emit('connection', ws, req);
      });
  });
}

webserver.on('upgrade', onSocketUpgrade);

/*
// WebSocket upgrade handling
webserver.on('upgrade', (req,socket,head) => {
  console.log('upgrading to ws ...');  

  console.log({head: req.headers});
 
  // Handle WebSocket upgrade requests
  wss.handleUpgrade(req,socket,head, (ws) => {

        // Verify the request
    const secWebSocketKey = req.headers['sec-websocket-key'];
    const secWebSocketAccept = generateAcceptKey(secWebSocketKey);

    // Create the response header
    const response = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${secWebSocketAccept}`,
      ''
    ].join('\r\n');
    socket.write(response + '\r\n');

    console.log('response header:', response);
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
    ws.on('message', (message) => {
      console.log('Received message:', message);
    });
    ws.on('open', () => {
      console.log('upgrading finished');
      //wss.emit('connection', ws, req);     
    });
  })
})
*/

// WebSocket connection handling
wss.on('connection', (ws,req) => {
  // Generate a unique ID for the WebSocket connection
  ws.id = wss.getUniqueID();

  console.log(`New client connected with ID: ${ws.id}`)  

  // Get the token from the WebSocket handshake
  const { 'sec-websocket-key': webClientSocketKey } = req.headers
  console.log({webClientSocketKey});
  //const token = webClientSocketKey;
  const userId = ws.id;

  // Generate a token and send it back to the client
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  console.log(`WebSocket server is listening and sends token: ${token}`);
  ws.send(JSON.stringify({ token: token }));
   
  

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
    try {
      const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
      // Authenticate the client using the decoded token
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
    } catch (err) {
      ws.close(1008, 'Authentication failed');
      return;
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

/*
wss.getUniqueID = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4();
};
*/

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
