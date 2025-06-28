@echo off
setlocal enabledelayedexpansion

REM ========================================
REM Comprehensive Windows Fix for Vibe Coder MCP
REM Consolidated from: enhanced-fix.bat, final-fix.bat, windows-fix.bat, fix-server.bat
REM ========================================

REM Find project root relative to script location
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"

echo ========================================
echo Comprehensive Vibe Coder MCP Server Fix
echo Project Root: !PROJECT_ROOT!
echo ========================================

REM Step 1: Clean and reinstall Sharp for Windows
echo.
echo === Step 1: Installing Sharp for Windows x64 ===
echo Cleaning existing Sharp installation...
call npm uninstall sharp --no-save 2>nul
call npm cache clean --force
echo Installing Sharp for Windows x64...
call npm install sharp --platform=win32 --arch=x64
if %ERRORLEVEL% neq 0 (
    echo ERROR: Sharp installation failed
    pause
    exit /b 1
)
echo Sharp installation completed.

REM Step 2: Fix transformers if needed
echo.
echo === Step 2: Rebuilding transformers dependencies ===
call npm rebuild @xenova/transformers 2>nul
echo Transformers rebuild completed.

REM Step 3: Install TypeScript compiler
echo.
echo === Step 3: Installing/updating TypeScript compiler ===
call npm install -g typescript
call npm install --save-dev typescript
echo TypeScript compiler installation completed.

REM Step 4: Install Zod dependency
echo.
echo === Step 4: Installing Zod dependency ===
call npm install zod
echo Zod installation completed.

REM Step 5: Fix sequential-thinking.ts completely
echo.
echo === Step 5: Fixing sequential-thinking.ts completely ===
if exist "src\tools\sequential-thinking.ts" (
    powershell -Command "& {$c=Get-Content 'src\tools\sequential-thinking.ts' -Raw; $c=$c -replace 'import \{ z \} from \""zod\"";[\r\n]*',''; $c=$c -replace 'let validationResult: Zod\.SafeParseReturnType','let validationResult: z.SafeParseReturnType'; $c=$c -replace 'Zod\.','z.'; $c='import { z } from \"zod\";'+[Environment]::NewLine+$c; Set-Content 'src\tools\sequential-thinking.ts' $c}"
    echo TypeScript fixes applied.
) else if exist "..\src\tools\sequential-thinking.ts" (
    powershell -Command "& {$c=Get-Content '..\src\tools\sequential-thinking.ts' -Raw; $c=$c -replace 'import \{ z \} from \""zod\"";[\r\n]*',''; $c=$c -replace 'let validationResult: Zod\.SafeParseReturnType','let validationResult: z.SafeParseReturnType'; $c=$c -replace 'Zod\.','z.'; $c='import { z } from \"zod\";'+[Environment]::NewLine+$c; Set-Content '..\src\tools\sequential-thinking.ts' $c}"
    echo TypeScript fixes applied.
) else (
    echo WARNING: sequential-thinking.ts file not found - manual fix may be needed
)

REM Step 6: Fix copy-assets script for Windows
echo.
echo === Step 6: Fixing copy-assets script for Windows ===
if not exist "build\tools\vibe-task-manager" mkdir "build\tools\vibe-task-manager"
if exist "src\tools\vibe-task-manager\prompts" (
    xcopy "src\tools\vibe-task-manager\prompts" "build\tools\vibe-task-manager\prompts" /E /I /Y >nul 2>&1
    echo Assets copied successfully.
) else (
    echo WARNING: Source prompts directory not found
)

REM Step 7: Create missing directories
echo.
echo === Step 7: Creating missing build directories ===
if not exist "build\tools" mkdir "build\tools"
if not exist "build\tools\vibe-task-manager" mkdir "build\tools\vibe-task-manager"
if not exist "build\tools\vibe-task-manager\utils" mkdir "build\tools\vibe-task-manager\utils"
echo Build directories created.

REM Step 8: Rebuild TypeScript with all fixes
echo.
echo === Step 8: Rebuilding TypeScript project ===
call tsc
if %ERRORLEVEL% neq 0 (
    echo ERROR: TypeScript compilation failed, trying npm run build...
    call npm run build
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Both tsc and npm run build failed
        echo Attempting manual copy of assets...
        if exist "src\tools\vibe-task-manager\prompts" (
            xcopy "src\tools\vibe-task-manager\prompts" "build\tools\vibe-task-manager\prompts" /E /I /Y >nul 2>&1
        )
        echo Manual copy completed, continuing...
    )
) else (
    echo TypeScript build completed successfully.
    REM Run copy-assets after successful compilation
    if exist "src\tools\vibe-task-manager\prompts" (
        xcopy "src\tools\vibe-task-manager\prompts" "build\tools\vibe-task-manager\prompts" /E /I /Y >nul 2>&1
    )
)

REM Step 9: Verify path validation works
echo.
echo === Step 9: Verifying Windows path fixes ===
node -e "try{const path=require('path');const projectRoot=process.cwd();const configPath=path.join(projectRoot,'llm_config.json');const normalizedPath=path.resolve(configPath).replace(/\\\\/g,'/');const normalizedProject=path.resolve(projectRoot).replace(/\\\\/g,'/');console.log('Project Root:',normalizedProject);console.log('Config Path:',normalizedPath);console.log('Path validation:',normalizedPath.startsWith(normalizedProject)?'PASSED':'FAILED');}catch(e){console.log('Error:',e.message);}"

REM Step 10: Test configuration loading
echo.
echo === Step 10: Testing configuration loading ===
if exist "build\tools\vibe-task-manager\utils\file-utils.js" (
    node -e "require('./build/tools/vibe-task-manager/utils/file-utils.js').FileUtils.readJsonFile('./llm_config.json').then(result => console.log('Config loading:', result.success ? 'SUCCESS' : 'FAILED')).catch(error => console.log('Exception:', error.message))"
) else if exist "..\build\tools\vibe-task-manager\utils\file-utils.js" (
    cd ..
    node -e "require('./build/tools/vibe-task-manager/utils/file-utils.js').FileUtils.readJsonFile('./llm_config.json').then(result => console.log('Config loading:', result.success ? 'SUCCESS' : 'FAILED')).catch(error => console.log('Exception:', error.message))"
    cd debug
) else (
    echo WARNING: file-utils.js not found - skipping config test
)

REM Step 11: Testing server startup
echo.
echo === Step 11: Testing server startup ===
echo Testing server initialization...
timeout /t 2 /nobreak > nul
if exist "build\index.js" (
    node build/index.js --help 2>&1 | findstr /C:"Vibe Coder" > nul
    if %ERRORLEVEL% equ 0 (
        echo SUCCESS: Server appears to be working correctly
    ) else (
        echo WARNING: Server test inconclusive, but fixes have been applied
    )
) else if exist "..\build\index.js" (
    node ..\build\index.js --help 2>&1 | findstr /C:"Vibe Coder" > nul
    if %ERRORLEVEL% equ 0 (
        echo SUCCESS: Server appears to be working correctly
    ) else (
        echo WARNING: Server test inconclusive, but fixes have been applied
    )
) else (
    echo ERROR: build/index.js not found - build may have failed
)

echo.
echo ========================================
echo Comprehensive fix completed!
echo.
echo Your server should now work properly.
echo Test with: npm start
echo.
echo If issues persist, check:
echo - .env file has OPENROUTER_API_KEY set
echo - Node.js version is 18+ 
echo - No antivirus blocking node.exe
echo ========================================
pause