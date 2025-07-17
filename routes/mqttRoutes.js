const express = require('express');
const router = express.Router();
const mqttController = require('../components/mqtt/mqttController');

router.post('/connect', mqttController.connect);
router.post('/disconnect', mqttController.disconnect);
router.post('/publish', mqttController.publishMessage);

module.exports = router;