const fs = require('fs');
const path = require('path');

const usersFilePath = path.join(__dirname, 'users.json');

// Helper function to read users from file
 function readUsers(){
  if (fs.existsSync(usersFilePath)) {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    return JSON.parse(data);
  }
  return [];
};

// Helper function to write users to file
 function writeUsers(users){
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
};

module.exports = {
  readUsers,    
  writeUsers        
};