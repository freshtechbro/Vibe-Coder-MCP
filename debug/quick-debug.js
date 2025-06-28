#!/usr/bin/env node

/**
 * Quick Debug Tool for Vibe Coder MCP
 * Consolidated from: debug-paths.js, debug-unix-paths.js, isolate-issue.js, isolate-issue-esm.js
 * 
 * This script performs comprehensive diagnostics:
 * - Path validation testing
 * - Configuration loading
 * - Module loading
 * - Environment validation
 * - Platform-specific checks
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(color, symbol, message) {
    console.log(`${colors[color]}${symbol}${colors.reset} ${message}`);
}

function success(message) { log('green', '✓', message); }
function error(message) { log('red', '✗', message); }
function warning(message) { log('yellow', '⚠', message); }
function info(message) { log('blue', 'ℹ', message); }
function debug(message) { log('cyan', '🔍', message); }

async function runDiagnostics() {
    console.log(`${colors.blue}========================================`);
    console.log('Vibe Coder MCP Quick Diagnostics');
    console.log(`========================================${colors.reset}\n`);

    const projectRoot = process.cwd();
    info(`Project Root: ${projectRoot}`);
    info(`Platform: ${process.platform}`);
    info(`Node Version: ${process.version}`);
    info(`Architecture: ${process.arch}`);
    
    const results = {
        pathValidation: false,
        configLoading: false,
        moduleLoading: false,
        buildExists: false,
        envFile: false
    };

    // Test 1: Path Validation
    console.log('\n=== Test 1: Path Validation ===');
    try {
        const configPath = path.join(projectRoot, 'llm_config.json');
        const normalizedPath = path.resolve(configPath);
        const normalizedProject = path.resolve(projectRoot);
        
        debug(`Original config path: ${configPath}`);
        debug(`Normalized config path: ${normalizedPath}`);
        debug(`Normalized project root: ${normalizedProject}`);
        
        // Test Windows path normalization
        const windowsNormalizedPath = normalizedPath.replace(/\\/g, '/');
        const windowsNormalizedProject = normalizedProject.replace(/\\/g, '/');
        
        debug(`Windows normalized config: ${windowsNormalizedPath}`);
        debug(`Windows normalized project: ${windowsNormalizedProject}`);
        
        const pathValid = windowsNormalizedPath.startsWith(windowsNormalizedProject);
        
        if (pathValid) {
            success('Path validation passed');
            results.pathValidation = true;
        } else {
            error('Path validation failed');
        }
    } catch (err) {
        error(`Path validation error: ${err.message}`);
    }

    // Test 2: Build Directory Check
    console.log('\n=== Test 2: Build Directory Check ===');
    const buildPath = path.join(projectRoot, 'build');
    if (fs.existsSync(buildPath)) {
        success('Build directory exists');
        results.buildExists = true;
        
        // Check key build files
        const keyFiles = [
            'index.js',
            'server.js',
            'logger.js',
            'tools/vibe-task-manager/utils/file-utils.js'
        ];
        
        let allFilesExist = true;
        for (const file of keyFiles) {
            const filePath = path.join(buildPath, file);
            if (fs.existsSync(filePath)) {
                debug(`Found: ${file}`);
            } else {
                warning(`Missing: ${file}`);
                allFilesExist = false;
            }
        }
        
        if (allFilesExist) {
            success('All key build files present');
        } else {
            warning('Some build files missing - rebuild may be needed');
        }
    } else {
        error('Build directory missing - run npm run build');
    }

    // Test 3: Environment File Check
    console.log('\n=== Test 3: Environment File Check ===');
    const envPath = path.join(projectRoot, '.env');
    if (fs.existsSync(envPath)) {
        success('.env file exists');
        results.envFile = true;
        
        try {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            if (envContent.includes('OPENROUTER_API_KEY')) {
                success('OPENROUTER_API_KEY found in .env');
            } else {
                warning('OPENROUTER_API_KEY not found in .env');
            }
        } catch (err) {
            warning(`Could not read .env file: ${err.message}`);
        }
    } else {
        warning('.env file missing - copy from .env.example');
    }

    // Test 4: Configuration Loading
    console.log('\n=== Test 4: Configuration Loading ===');
    try {
        const configPath = path.join(projectRoot, 'llm_config.json');
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            success('llm_config.json loaded successfully');
            debug(`Config keys: ${Object.keys(config).join(', ')}`);
            results.configLoading = true;
        } else {
            error('llm_config.json not found');
        }
    } catch (err) {
        error(`Configuration loading failed: ${err.message}`);
    }

    // Test 5: Module Loading (if build exists)
    console.log('\n=== Test 5: Module Loading ===');
    if (results.buildExists) {
        try {
            // Test loading the file utils module
            const fileUtilsPath = path.join(projectRoot, 'build/tools/vibe-task-manager/utils/file-utils.js');
            if (fs.existsSync(fileUtilsPath)) {
                const { FileUtils } = require(fileUtilsPath);
                if (FileUtils && typeof FileUtils.readJsonFile === 'function') {
                    success('FileUtils module loaded successfully');
                    results.moduleLoading = true;
                    
                    // Test actual file reading
                    try {
                        const result = await FileUtils.readJsonFile('./llm_config.json');
                        if (result.success) {
                            success('FileUtils.readJsonFile works correctly');
                        } else {
                            warning(`FileUtils.readJsonFile failed: ${result.error}`);
                        }
                    } catch (err) {
                        warning(`FileUtils test failed: ${err.message}`);
                    }
                } else {
                    error('FileUtils module structure incorrect');
                }
            } else {
                error('file-utils.js not found in build directory');
            }
        } catch (err) {
            error(`Module loading failed: ${err.message}`);
        }
    } else {
        warning('Skipping module loading test - build directory missing');
    }

    // Test 6: Dependencies Check
    console.log('\n=== Test 6: Critical Dependencies Check ===');
    const criticalDeps = [
        '@modelcontextprotocol/sdk',
        'typescript',
        'dotenv',
        'express',
        'sharp',
        'axios'
    ];

    for (const dep of criticalDeps) {
        try {
            require.resolve(dep);
            debug(`${dep}: installed`);
        } catch (err) {
            warning(`${dep}: not found or not accessible`);
        }
    }

    // Summary
    console.log('\n=== Diagnostic Summary ===');
    const passedTests = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    if (passedTests === totalTests) {
        success(`All ${totalTests} tests passed! Your setup looks good.`);
    } else {
        warning(`${passedTests}/${totalTests} tests passed. Some issues detected.`);
        
        console.log('\n=== Recommendations ===');
        if (!results.buildExists) {
            info('Run: npm run build');
        }
        if (!results.envFile) {
            info('Create .env file from .env.example');
        }
        if (!results.configLoading) {
            info('Check llm_config.json file exists and is valid JSON');
        }
        if (!results.moduleLoading && results.buildExists) {
            info('Try running the comprehensive fix script');
        }
    }

    console.log(`\n${colors.blue}========================================${colors.reset}`);
}

// Run diagnostics
runDiagnostics().catch(err => {
    console.error('Diagnostic script failed:', err);
    process.exit(1);
});
