#!/usr/bin/env node

// Minimal test to isolate the exact issue
async function isolateIssue() {
    console.log('=== Minimal Issue Isolation Test ===');
    
    try {
        console.log('1. Testing path module...');
        const path = require('path');
        console.log('✓ Path module loaded');
        
        console.log('2. Testing basic path operations...');
        const projectRoot = process.cwd();
        const configPath = path.join(projectRoot, 'llm_config.json');
        console.log('✓ Path operations work');
        console.log('   Project root:', projectRoot);
        console.log('   Config path:', configPath);
        
        console.log('3. Testing file-utils import...');
        const { FileUtils } = require('./build/tools/vibe-task-manager/utils/file-utils.js');
        console.log('✓ FileUtils imported successfully');
        
        console.log('4. Testing config loading...');
        const result = await FileUtils.readJsonFile(configPath);
        console.log('Config load result:', result.success ? '✓ SUCCESS' : '✗ FAILED');
        if (!result.success) {
            console.log('   Error:', result.error);
        }
        
        console.log('5. Testing server module imports...');
        // Try to import the main server components one by one
        try {
            const logger = require('./build/logger.js');
            console.log('✓ Logger imported');
        } catch (e) {
            console.log('✗ Logger failed:', e.message);
        }
        
        try {
            const { createServer } = require('./build/server.js');
            console.log('✓ Server module imported');
        } catch (e) {
            console.log('✗ Server module failed:', e.message);
        }
        
        try {
            console.log('6. Testing sharp module specifically...');
            const sharp = require('sharp');
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
