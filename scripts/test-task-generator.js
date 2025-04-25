import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Import necessary modules

// Get the directory name using ES module approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the test data (relative to this script's location)
const testDataPath = path.join(__dirname, 'test-task-list.json');
const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));

// Format the message for the MCP server
const message = {
  id: 'test-' + Date.now(),
  type: 'request',
  request: {
    name: testData.name,
    params: testData.params,
  },
};

// Define paths relative to the project root (one level up from __dirname)
const projectRoot = path.join(__dirname, '..');
const outputLogPath = path.join(projectRoot, 'task-list-test-output.log');
const debugLogPath = path.join(projectRoot, 'server-debug.log');
const messageFilePath = path.join(projectRoot, 'message.json');

// Create a file stream to capture the output
const outputFile = fs.createWriteStream(outputLogPath, { flags: 'w' });

// Send the request to the stdio-based server
console.log('Sending request to the server...');
fs.writeFileSync(debugLogPath, '', { flag: 'a' }); // Append a marker in the log

// Write message to a temporary file in the project root
fs.writeFileSync(messageFilePath, JSON.stringify(message, null, 2));

// Use PowerShell to cat the message.json file (from root) and pipe it to npm start (run from root)
const psCommand = `Get-Content '${messageFilePath}' | npm start`;
const ps = spawn('powershell', ['-Command', psCommand], { cwd: projectRoot }); // Ensure spawn runs from project root

ps.stdout.on('data', (data) => {
  outputFile.write(data);
  console.log(data.toString());
});

ps.stderr.on('data', (data) => {
  outputFile.write(data);
  console.error(data.toString());
});

ps.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
  outputFile.end();
});
