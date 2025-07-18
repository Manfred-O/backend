const mqttService = require('./mqttService');

async function connect(req, res) {
  const { serverIndex } = req.body;

  try {
    const status = await mqttService.connect(serverIndex);
    res.json({ status });
  } catch (error) {
    res.status(500).json({ status: 'Connection failed', error: error.message });
  }
}

async function disconnect(req, res) {
  try {
    const status = await mqttService.disconnect();
    res.json({ status });
  } catch (error) {
    res.status(400).json({ status: 'Not connected', error: error.message });
  }
}

async function publishMessage(req, res) {
  const { topic, message } = req.body;

    if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  let jsonMessage;
  try {
    // Try to parse the message as JSON
    jsonMessage = JSON.parse(message);
  } catch (error) {
    // If parsing fails, wrap the message in a JSON object
    jsonMessage = { content: message };
  }

  console.log(`Publishing message to topic: ${topic}`);
  console.log('Message content:', jsonMessage);

  try {
    await mqttService.publishMessage(topic, JSON.stringify(jsonMessage));
    res.json({ status: 'Message published successfully' });
  } catch (error) {
    res.status(500).json({ status: 'Failed to publish message', error: error.message });
  }
}

module.exports = { connect, disconnect, publishMessage };