const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { readUsers, writeUsers } = require('..//db/users');
const { readServers } = require('..//db/servers');
const { getUniqueID } = require('..//helpers/helperFunctions');


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
    try {
        const { username, email, password } = req.body;
        const users = readUsers();
        
        // Regular expression for email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
        }

        // Check if the username or email already exists in the users array
        if (users.some(user => user.username === username || user.email === email)) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Validating password length
        if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
        }

        // Generate a unique ID for the user
        const userId = getUniqueID();

        // Hash the password before storing it in the users array
        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ id: userId, username, email, password: hashedPassword  });
        writeUsers(users);
        
        // Generate and send a JSON Web Token (JWT) to the client
        const token = jwt.sign({ userId }, process.env.JWT_SECRET, {expiresIn: "1d"});

        res.status(201).json({ token: token , message: 'User registered successfully' });
    }
    catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Error registering user' });
    }
}

async function loginUser( req, res ) {
    console.log('Logging in user');  
    try {
        // Implement password hashing here if you want to use it in your application. Otherwise, you can simply compare plain text passwords.
        const {username, password } = req.body;
        const users = readUsers();
        
        const user = users.find(u => u.username === username);
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        const userId = user.id;

        // check if user and passowrd are good
        if (!user &&  !isPasswordCorrect){
            return res.status(400).json({ error: "Invalid username or password" });            
        }

        // Generate and send a JSON Web Token (JWT) to the client
        const token = jwt.sign({ userId }, process.env.JWT_SECRET, {expiresIn: "1d"});

        res.json({ token: token,  message: 'Login successful' });
        
    }
    catch (error) {
        console.error('Error login user:', error);
        res.status(500).json({ error: 'Error login user' });        
    }

}    

async function logoutUser( req, res ) {
    console.log('Logout user');  
    try {
        // Implement password hashing here if you want to use it in your application. Otherwise, you can simply compare plain text passwords.
        const {username } = req.body;
        const users = readUsers();
        
        const user = users.find(u => u.username === username);
        const userId = user.id;

        // check if user and passowrd are good
        if (!user ){
            return res.status(400).json({ error: "Invalid username" });            
        }

        res.json({ message: 'Logout successful' });
        
    }
    catch (error) {
        console.error('Error logout user:', error);
        res.status(500).json({ error: 'Error logout user' });        
    }

}  

async function authMiddleware(req, res, next) {
    console.log('check authentication');
    //const token = req.header('Authorization')?.replace('Bearer ', '');
    const {token, username} = req.body;
    const users = readUsers();
    
    const user = users.find(u => u.username === username);

    // check if user and passowrd are good
    if (!user ){
        return res.status(400).json({ error: "Invalid username" });            
    }

    if (!token) {
        return res.status(401).json({ error: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token is not valid' });
    }
}

module.exports = { getHello,
                getImage,
                getUsers, 
                getServers, 
                registerUser, 
                loginUser, 
                logoutUser, 
                authMiddleware };
