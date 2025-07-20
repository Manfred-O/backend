const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const bcrypt = require('bcrypt');
const { WebSocketServer } = require('ws');

const mqttRoutes = require('./routes/mqttRoutes');
const { readUsers, writeUsers } = require('./components/db/users');

const app = express();
const port = process.env.PORT || 5000;

/*
var options = {
  key: fs.readFileSync('certs/tls.key'),
  cert: fs.readFileSync('certs/tls.crt'),
  ca: fs.readFileSync('certs/rootCA.crt'),
  requestCert: false
};
*/

// Uncomment the line below to use HTTPS instead of HTT
//const webserver = https.createServer(options, app);

// Uncomment the line below to use HTTP instead of HTTPS
const webserver = http.createServer(app);

app.use(cors());
app.use(bodyParser.json());

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  const users = readUsers();
  
  if (users.some(user => user.username === username || user.email === email)) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ username, email, password: hashedPassword });
  writeUsers(users);
  
  res.status(201).json({ message: 'User registered successfully' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  
  const user = users.find(u => u.username === username);
  
  if (user && await bcrypt.compare(password, user.password)) {
    res.json({ message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/users', (req, res) => {
  const users = readUsers();
  const safeUsers = users.map(({ username, email }) => ({ username, email }));
  res.json(safeUsers);
});

app.use(express.static(path.join(__dirname, '../frontend/build')));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

app.use('/api/mqtt', mqttRoutes);

// Handle 404 errors
app.use((req, res) => { 
  res.status(404).json({ error: 'Not Found' });
});

webserver.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

// WebSocket upgrade handling
webserver.on('upgrade', (req,socket,head) => {
  // Handle WebSocket upgrade requests
  wss.handleUpgrade(req,socket,head, (ws) => {
    console.log('upgrading to ws ...')
    wss.emit('connection',ws,req)  
  })
})

// Create a WebSocket server
const wss = new WebSocketServer({ noServer: true })

// WebSocket connection handling
wss.on('connection', ws => {
  console.log('New client connected');  

  ws.on('close', (code,reason) => {
    console.log('Client has disconnected!')
    console.log("code " + code + " reason " + reason)
    })

  // Handle incoming messages
  ws.on('message', message => {

    // Parse the incoming message
    const data = JSON.parse(message);

    // Invoke the route or handler based on the incoming message    
    if (data.route === 'connect') {
      // Handle connect action
      console.log('Mqtt Client connected');
      ws.send(JSON.stringify({ success: true, message: 'Connected to MQTT broker' }));
    } else if (data.route === 'disconnect') {
      // Handle disconnect action
      console.log('Mqtt Client disconnected');
      ws.send(JSON.stringify({ success: true, message: 'Disconnected from MQTT broker' }));
    } else if (data.route === 'publish') {
      // Handle publish action
      console.log(`Publishing message: ${data.message} to topic: ${data.topic}`);
      ws.send(JSON.stringify({ success: true, message: `Message published to ${data.topic}` }));
    } else if (data.route === 'subscribe') {
      // Handle subscribe action
      console.log(`Subscribed to topic: ${data.topic}`);
      ws.send(JSON.stringify({ success: true, message: `Subscribed to ${data.topic}` }));
    } else {
      ws.send(JSON.stringify({ error: 'Unknown route' }));
    } 
  });

  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.onerror = function () {
    console.log('websocket error')
  }

});

let close = 0;
const interval = setInterval(function ping() {

  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      console.log('ping error');
      return ws.terminate();
    }
    close++;
    ws.isAlive = false;
    console.log(`sending ping number  ${close}`);
    ws.ping('ping');
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});
