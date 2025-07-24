const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const { readUsers, writeUsers } = require('..//db/users');
const { readServers } = require('..//db/servers');

function getHello( req, res ) {
    res.json({ message: 'Server up and running!' });
}; 

function getImage( req, res ) {
    console.log('Fetching image from file');  
    console.log('Image requested:', req.query.image);
    
    // Ensure the path to the image is correct
    //const filePath = path.join(__dirname, '..\\..\\images', 'istockphoto-2167092274-1024x1024.jpg');
    const filePath = path.join(__dirname,'..\\..\\images', req.query.image );

    // Check if the image file exists
    if (!fs.existsSync(filePath)) {
        console.error('Image file not found:', filePath);
        return res.status(404).json({ error: 'Image file not found' });
    }
    // Read the image file
    // Note: Adjust the path to your image file as needed   
    // Adjust the path to your image file as needed
    console.log('Reading image file:', filePath);
    // Read the image file and send it as a response
    // Use fs.readFile to read the image file
    // This will read the file asynchronously and send it in the response
    fs.readFile( filePath , (err, data) => {
        if (err) {
        console.error('Error reading image file:', err);
        return res.status(500).json({ error: 'Error reading image file' });
        }
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        console.log('Sending image data');

        // Send the image data
        res.end(data);
    }
    );
};

function getUsers( req, res ) { 
    console.log('Fetching users from file');
    const users = readUsers();
    const safeUsers = users.map(({ username, email }) => ({ username, email }));
    if (!safeUsers || safeUsers.length === 0) {
        return res.status(404).json({ error: 'No users found' });
    }     
    res.json(safeUsers);
}


function getServers( req, res ) {
    console.log('Fetching servers from file');
    const servers = readServers();
    console.log(servers);
    if (!servers || servers.length === 0) {
        return res.status(404).json({ error: 'No servers found' });
    }
    res.json(servers);
}

async function registerUser( req, res ) {
    console.log('Registering new user');
    const { username, email, password } = req.body;
    const users = readUsers();
    
    if (users.some(user => user.username === username || user.email === email)) {
        return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, email, password: hashedPassword });
    writeUsers(users);
    
    res.status(201).json({ message: 'User registered successfully' });
}

async function loginUser( req, res ) {
    console.log('Logging in user');  
    // Implement password hashing here if you want to use it in your application. Otherwise, you can simply compare plain text passwords.
    const { username, password } = req.body;
    const users = readUsers();
    
    const user = users.find(u => u.username === username);
    
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ message: 'Login successful' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
}    

module.exports = { getHello, getImage, getUsers, getServers, registerUser, loginUser };
