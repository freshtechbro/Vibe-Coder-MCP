const path = require('path');

// Test the path validation logic
console.log('=== Path Validation Debug ===');

const projectRoot = process.cwd();
const configPath = path.join(projectRoot, 'llm_config.json');

console.log('Project Root (CWD):', projectRoot);
console.log('Config Path (joined):', configPath);
console.log('Is absolute:', path.isAbsolute(configPath));

// Normalize paths with Windows path separator handling
const normalizedPath = path.resolve(configPath).replace(/\\/g, '/');
const normalizedProject = path.resolve(projectRoot).replace(/\\/g, '/');

console.log('Normalized Config Path:', normalizedPath);
console.log('Normalized Project Root:', normalizedProject);
console.log('Config starts with project:', normalizedPath.startsWith(normalizedProject));

// Test the validation function
function validateFilePath(filePath) {
    // Check for path traversal attempts
    if (filePath.includes('..') || filePath.includes('~')) {
        return { valid: false, error: 'Path traversal not allowed' };
    }
    
    // Check for absolute paths outside allowed directories (allow project root and subdirectories)
    if (path.isAbsolute(filePath)) {
        const projectRoot = process.cwd();
        const normalizedPath = path.resolve(filePath).replace(/\\/g, '/');
        const normalizedProject = path.resolve(projectRoot).replace(/\\/g, '/');
        
        console.log('  Validation - filePath:', filePath);
        console.log('  Validation - normalizedPath:', normalizedPath);
        console.log('  Validation - normalizedProject:', normalizedProject);
        console.log('  Validation - starts with project:', normalizedPath.startsWith(normalizedProject));
        
        // Allow paths within project root, test directories, or temp directories
        if (!normalizedPath.startsWith(normalizedProject) &&
            !filePath.startsWith('/test/') &&
            !filePath.startsWith('/tmp/')) {
            return { valid: false, error: 'Absolute paths outside project directory not allowed' };
        }
    }
    
    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    const ALLOWED_EXTENSIONS = ['.json', '.yaml', '.yml', '.md', '.txt'];
    if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
        return { valid: false, error: `File extension ${ext} not allowed` };
    }
    
    return { valid: true };
}

console.log('\n=== Testing Validation Function ===');
const result = validateFilePath(configPath);
console.log('Validation result:', result);

console.log('\n=== File Existence Check ===');
const fs = require('fs');
console.log('llm_config.json exists:', fs.existsSync(configPath));
console.log('mcp-config.json exists:', fs.existsSync(path.join(projectRoot, 'mcp-config.json')));
