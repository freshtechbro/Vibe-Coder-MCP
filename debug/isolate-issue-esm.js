import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function isolateIssue() {
    console.log('=== WSL ES Module Issue Isolation Test ===');
    
    try {
        console.log('1. Testing path module...');
        console.log('✓ Path module loaded');
        
        console.log('2. Testing basic path operations...');
        const projectRoot = process.cwd();
        const configPath = path.join(projectRoot, 'llm_config.json');
        console.log('✓ Path operations work');
        console.log('   Project root:', projectRoot);
        console.log('   Config path:', configPath);
        
        console.log('3. Testing file-utils import...');
        const { FileUtils } = await import('./build/tools/vibe-task-manager/utils/file-utils.js');
        console.log('✓ FileUtils imported successfully');
        
        console.log('4. Testing config loading...');
        const result = await FileUtils.readJsonFile(configPath);
        console.log('Config load result:', result.success ? '✓ SUCCESS' : '✗ FAILED');
        if (!result.success) {
            console.log('   Error:', result.error);
        }
        
        console.log('5. Testing server module imports...');
        try {
            const logger = await import('./build/logger.js');
            console.log('✓ Logger imported');
        } catch (e) {
            console.log('✗ Logger failed:', e.message);
        }
        
        try {
            const { createServer } = await import('./build/server.js');
            console.log('✓ Server module imported');
        } catch (e) {
            console.log('✗ Server module failed:', e.message);
        }
        
        try {
            console.log('6. Testing sharp module specifically...');
            const sharp = await import('sharp');
            console.log('✓ Sharp module loaded successfully');
        } catch (e) {
            console.log('✗ Sharp module failed:', e.message);
            console.log('   This is likely the root cause!');
        }
        
    } catch (error) {
        console.log('✗ Test failed with error:');
        console.log('   Message:', error.message);
        console.log('   Stack:', error.stack);
    }
}

isolateIssue().catch(console.error);
