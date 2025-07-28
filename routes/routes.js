const express = require('express');
const router = express.Router();
const mqttController = require('../components/mqtt/mqttController');
const httpService = require('../components/http/httpService');


// Define routes for MQTT operations
router.get('/hello', httpService.getHello);
router.get('/image', httpService.getImage);
router.get('/users', httpService.getUsers);
router.get('/servers', httpService.getServers);
router.post('/register', httpService.registerUser);
router.post('/login', httpService.loginUser);
router.post('/logout', httpService.authMiddleware, httpService.logoutUser);
router.post('/connect', mqttController.connect);
router.post('/disconnect', mqttController.disconnect);
router.post('/publish', mqttController.publishMessage);

router.get('/', async () => {
    console.log('hit route for websocket');
});

module.exports = router;