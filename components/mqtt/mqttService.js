const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

var topic = null;
let mqttClient = null;

const connectionOptions = [
  {
    name: "Test Server",
    host: "mqtt://server1.sander-elektronik.com",
    port: 8883,
    username: 'manfred',
    password: '123456',
    ssl: true,
    caPath: path.join(__dirname, '..', '..', 'certs', 'rootCA.crt'),
    topic : 'test/data',
  },
  {
    name: "Private Server",
    host: "mqtt://shelf-backbone-test.witglobal.net",
    port: 9883,
    username: 'lacon',
    password: 'GbEZuiZhdjVdlub',
    ssl: true,
    caPath: path.join(__dirname, '..', '..', 'certs', 'Sectigo(AAA).crt'),
    topic : 'automat/v2/1401/41/lacon/lcd',
  }
];

function connect(serverIndex) {
  return new Promise((resolve, reject) => {
    const selectedServer = connectionOptions[serverIndex];
    console.log(`Connecting to MQTT server: ${selectedServer.name} as ${selectedServer.username}`);

    if (mqttClient) {
      mqttClient.end();
    }

    const clientId = `mqtt_${Math.random().toString(16).slice(3)}`;
    const connectUrl = `${selectedServer.host}:${selectedServer.port}`;

    const connectOptions = {
      clientId,
      clean: true,
      connectTimeout: 4000,
      username: selectedServer.username,
      password: selectedServer.password,
      reconnectPeriod: 1000,
    }

    if (selectedServer.ssl) {
      connectOptions.protocol = 'mqtts';

      // connectOptions.rejectUnauthorized = false;

      if (selectedServer.caPath && fs.existsSync(selectedServer.caPath) && selectedServer.name === "Test Server") {
        console.log('Loading CA certificate for Test Server');

        // Add LWT (Last Will and Testament) configuration
        connectOptions.will = {
          topic: 'test/online',
          payload: '0',
          qos: 1,
          retain: true
        }

        // Load the CA certificate for the Test Server)
        connectOptions.ca = fs.readFileSync(selectedServer.caPath);
      }

      if (selectedServer.caPath && fs.existsSync(selectedServer.caPath) && selectedServer.name === "Private Server") {
        console.log('Loading CA certificate for Private Server');
        
        // Add LWT (Last Will and Testament) configuration
        connectOptions.will = {
          topic: 'automat/v2/1401/41/lacon/msg/fromSys/online',
          payload: '0',
          qos: 1,
          retain: true
        }

        // Load the CA certificate for the Test Server)
        connectOptions.ca = fs.readFileSync(selectedServer.caPath);
      }      

      // if (selectedServer.certPath && fs.existsSync(selectedServer.certPath && selectedServer.name === "Test Server")) {
      //   connectOptions.cert = fs.readFileSync(selectedServer.certPath);
      // }
      // if (selectedServer.keyPath && fs.existsSync(selectedServer.keyPath && selectedServer.name === "Test Server")) {
      //   connectOptions.key = fs.readFileSync(selectedServer.keyPath);
      // }

    }

    // Set the topic to subscribe to
    topic = selectedServer.topic;

    mqttClient = mqtt.connect(connectUrl, connectOptions);

    mqttClient.on('connect', () => {
      console.log('Connected to MQTT broker');
      
      // Publish message to test/online topic
      publishMessage('test/online', '1', { retain: true })
        .then(() => {
          console.log('Published online status');

          // Subscribe to the topic
          mqttClient.subscribe([topic], { qos:1 }, (error, granted) => {
            if(error) {
              console.error('Failed to subscribe to topic:', error);
              return reject(error);
            }
            console.log(`Subscribe to topic '${topic}'`)
          })
          resolve('Connected and published online status');
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
      // Here you can implement WebSocket to send messages to the client in real-time
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
        resolve();
      }
    });
  });  
}

module.exports = { connect, disconnect, publishMessage };

