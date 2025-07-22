const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws')


let mqttClient = null;
let wss = null;

function initializeMqttService(webSocketServer) {
  wss = webSocketServer;
}

function connect(server) {
  return new Promise((resolve, reject) => {
    //const selectedServer = connectionOptions[serverIndex];
    console.log(`Connecting to MQTT server: ${server.name} as ${server.username}`);

    if (mqttClient) {
      mqttClient.end();
    }

    const clientId = `mqtt_${Math.random().toString(16).slice(3)}`;
    const connectUrl = `${server.host}:${server.port}`;

    const connectOptions = {
      clientId,
      clean: true,
      connectTimeout: 4000,
      username: server.username,
      password: server.password,
      reconnectPeriod: 1000,
    }

    if (server.ssl) {
      connectOptions.protocol = 'mqtts';

      // connectOptions.rejectUnauthorized = false;

      if (server.name === "Test Server") {
        console.log('Loading CA certificate for Test Server');

        if(fs.existsSync(path.join(__dirname, '..', '..', 'certs', 'rootCA.crt')) === false) 
        {
          console.error('CA certificate not found for Test Server');
          return reject(new Error('CA certificate not found for Test Server'));
        }

        // Add LWT (Last Will and Testament) configuration
        connectOptions.will = {
          topic: 'test/online',
          payload: '0',
          qos: 1,
          retain: true
        }

        // Load the CA certificate for the Test Server)
        connectOptions.ca = fs.readFileSync(path.join(__dirname, '..', '..', 'certs', 'rootCA.crt'));
      }

      if (server.name === "Private Server") {
        console.log('Loading CA certificate for Private Server');
        
        if(fs.existsSync(path.join(__dirname, '..', '..', 'certs', 'rootCA_local.crt')) === false) 
        {
          console.error('CA certificate not found for Private Server');
          return reject(new Error('CA certificate not found for Private Server'));
        }

        // Add LWT (Last Will and Testament) configuration
        connectOptions.will = {
          topic: 'automat/v2/1401/41/lacon/msg/fromSys/online',
          payload: '0',
          qos: 1,
          retain: true
        }

        // Load the CA certificate for the Test Server)
        connectOptions.ca = fs.readFileSync(path.join(__dirname, '..', '..', 'certs', 'rootCA_local.crt'));
      }      

      // if (selectedServer.certPath && fs.existsSync(selectedServer.certPath && selectedServer.name === "Test Server")) {
      //   connectOptions.cert = fs.readFileSync(selectedServer.certPath);
      // }
      // if (selectedServer.keyPath && fs.existsSync(selectedServer.keyPath && selectedServer.name === "Test Server")) {
      //   connectOptions.key = fs.readFileSync(selectedServer.keyPath);
      // }

    }

    // Set the topic to subscribe to
    //topic = server.topics;

    mqttClient = mqtt.connect(connectUrl, connectOptions);

    mqttClient.on('connect', () => {
      console.log('Connected to MQTT broker');
      
      // Publish message to test/online topic
      publishMessage('test/online', '1', { retain: true })
        .then(() => {
          console.log('Published online status');

          // Subscribe to the topic
          for (let i = 0; i < server.topics.length; i++) {
            mqttClient.subscribe([server.topics[i].value], { qos:1 }, (error, granted) => {
            if(error) {
              console.error('Failed to subscribe to topic:', error);
              return reject(error);
            }
            console.log(`Subscribed to topic '${server.topics[i].value}' with qos ${granted[0].qos}`);
            })
          } 

          resolve('Connected and published online status success');
        })
        .catch((error) => {
          console.error('Failed to publish online status:', error);
          resolve('Connected but failed to publish online status');
        });
    });

    mqttClient.on("packetreceive", (packet) =>{	
      console.log("receive packet: " + JSON.stringify(packet));  
    });

    mqttClient.on('error', (error) => {
      console.error('Connection failed', error);
      reject(error);
    });

    mqttClient.on('message', (topic, message) => {
      console.log('Received message:', topic, message.toString());
      // Broadcast the message to all connected WebSocket clients
      if(wss && wss.clients.size > 0) {
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ topic, status: 'received', message: message.toString() }));
          }
        });
      }
    });

    mqttClient.on('reconnect', (error) => {
        console.error('reconnect failed', error)
    });

  });
}

function disconnect() {
  return new Promise((resolve, reject) => {
    if (mqttClient) {
      // Publish offline status before disconnecting
      publishMessage('test/online', '0', { retain: true })
        .then(() => {
          mqttClient.end(false, {}, () => {
            console.log('Disconnected from MQTT broker');
            
            // Reset the mqttClient to null after disconnecting
            mqttClient = null;
          });
          resolve('Disconnected and published offline status');
        })
        .catch((error) => {
          console.error('Failed to publish offline status:', error);
          mqttClient.end(false, {}, () => {
            console.log('Disconnected from MQTT broker');
            
            // Reset the mqttClient to null after disconnecting
            mqttClient = null;
          });
          resolve('Disconnected but failed to publish offline status');
        });
    } else {
      reject(new Error('Not connected'));
    }
  });
}

function publishMessage(topic, message, options = {}) {
  return new Promise((resolve, reject) => {
    if (!mqttClient) {
      reject(new Error('Not connected to MQTT broker'));
      return;
    }

    mqttClient.publish(topic, message, options, (error) => {
      if (error) {
        console.error('Failed to publish message:', error);
        reject(error);
      } else {
        console.log('Message published successfully');
        resolve('success');
      }
    });
  });  
}

module.exports = {initializeMqttService, connect, disconnect, publishMessage };

