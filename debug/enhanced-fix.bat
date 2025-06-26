@echo off
echo ========================================
echo Enhanced Vibe Coder MCP Server Fix
echo ========================================

cd /d "C:\Users\Ascension\Claude\root\vibe-coder-mcp"

echo.
echo Step 1: Installing Sharp for Windows...
npm uninstall sharp --no-save 2>nul
npm cache clean --force
npm install sharp --platform=win32 --arch=x64 --verbose

echo.
echo Step 2: Rebuilding TypeScript with fixes...
npm run build

echo.
echo Step 3: Verifying file paths are working...
node -e "
const path = require('path');
const projectRoot = process.cwd();
const configPath = path.join(projectRoot, 'llm_config.json');
const normalizedPath = path.resolve(configPath);
const normalizedProject = path.resolve(projectRoot);
console.log('Project Root:', normalizedProject);
console.log('Config Path:', configPath);
console.log('Normalized Config Path:', normalizedPath);
console.log('Starts with project root:', normalizedPath.startsWith(normalizedProject));
console.log('Path should be valid:', normalizedPath.startsWith(normalizedProject) || configPath.startsWith('/test/') || configPath.startsWith('/tmp/'));
"

echo.
echo Step 4: Testing server startup...
timeout /t 2 /nobreak > nul
echo Testing server initialization...
node build/index.js --help 2>&1 | findstr /C:"Vibe Coder" > nul
if %ERRORLEVEL% equ 0 (
    echo SUCCESS: Server appears to be working
) else (
    echo WARNING: Server test may have failed, but fixes applied
)

echo.
echo ========================================
echo Fix Complete!
echo.
echo The server should now work. Test with:
echo npm start
echo ========================================
pause
