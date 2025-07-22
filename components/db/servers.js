const fs = require('fs');
const path = require('path');

const serversFilePath = path.join(__dirname, 'servers.json');

// Helper function to read users from file
 function readServers(){
  if (fs.existsSync(serversFilePath)) {
    const data = fs.readFileSync(serversFilePath, 'utf8');
    return JSON.parse(data);
  }
  return [];
};

module.exports = {
  readServers        
};