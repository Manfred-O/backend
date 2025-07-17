const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const mqttRoutes = require('./routes/mqttRoutes');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const usersFilePath = path.join(__dirname, 'users.json');

// Helper function to read users from file
const readUsers = () => {
  if (fs.existsSync(usersFilePath)) {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    return JSON.parse(data);
  }
  return [];
};

// Helper function to write users to file
const writeUsers = (users) => {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
};

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

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});