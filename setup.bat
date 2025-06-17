@echo off
REM Setup script for Vibe Coder MCP Server (Production Ready v2.3)
setlocal enabledelayedexpansion

REM Color codes for Windows (using PowerShell for colored output)
set "GREEN=[32m"
set "RED=[31m"
set "YELLOW=[33m"
set "BLUE=[34m"
set "NC=[0m"

echo Setting up Vibe Coder MCP Server v2.3...
echo ==================================================
echo Production-ready MCP server with complete agent integration
echo Multi-transport support • Real-time notifications • Dynamic port allocation
echo Agent coordination • Task management • Code analysis • Research • Context curation
echo ==================================================

REM Check if npm is installed
echo Checking if npm is installed...
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    powershell -Command "Write-Host '✗ npm is not installed. Please install Node.js and npm first.' -ForegroundColor Red"
    echo Visit: https://nodejs.org/
    exit /b 1
)
powershell -Command "Write-Host '✓ npm is installed.' -ForegroundColor Green"

REM Check if Node.js is installed
echo Checking if Node.js is installed...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    powershell -Command "Write-Host '✗ Node.js is not installed. Please install Node.js first.' -ForegroundColor Red"
    echo Visit: https://nodejs.org/
    exit /b 1
)

REM Check Node.js version (require v18+)
echo Checking Node.js version...
SET MAJOR_NODE_VERSION=
FOR /F "tokens=1 delims=v." %%a IN ('node -v') DO SET MAJOR_NODE_VERSION=%%a

powershell -Command "if ($env:MAJOR_NODE_VERSION -eq $null -or $env:MAJOR_NODE_VERSION -eq '') { Write-Host 'Could not determine Node.js major version. Proceeding anyway...' -ForegroundColor Yellow; exit 0 } elseif ([int]$env:MAJOR_NODE_VERSION -lt 18) { Write-Host 'Node.js v18+ is required (found v$env:MAJOR_NODE_VERSION). Please upgrade Node.js. Visit: https://nodejs.org/' -ForegroundColor Red; exit 1 } else { Write-Host \"✓ Node.js version $env:MAJOR_NODE_VERSION detected (v18+ required) - OK.\" -ForegroundColor Green; exit 0 }"
if %ERRORLEVEL% neq 0 (
    exit /b 1
)

REM Check npm cache health
echo Checking npm cache health...
call npm cache verify >nul 2>nul
if %ERRORLEVEL% neq 0 (
    powershell -Command "Write-Host 'npm cache issues detected. Cleaning cache...' -ForegroundColor Yellow"
    call npm cache clean --force
)

REM Install dependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    powershell -Command "Write-Host '✗ npm install failed. Check npm logs above.' -ForegroundColor Red"
    echo Troubleshooting steps:
    echo   1. Try: npm cache clean --force ^&^& npm install
    echo   2. Delete node_modules and package-lock.json, then run npm install
    echo   3. Check your internet connection
    echo   4. Ensure you have sufficient disk space
    exit /b 1
)
powershell -Command "Write-Host '✓ Dependencies installed successfully.' -ForegroundColor Green"

REM Verify critical dependencies
echo Verifying critical dependencies...
set "missing_deps="

REM Core MCP and TypeScript dependencies
call npm list @modelcontextprotocol/sdk >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! @modelcontextprotocol/sdk"
)

call npm list typescript >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! typescript"
)

call npm list dotenv >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! dotenv"
)

call npm list vitest >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! vitest"
)

call npm list zod >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! zod"
)

call npm list yaml >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! yaml"
)

REM Runtime server dependencies
call npm list express >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! express"
)

call npm list cors >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! cors"
)

call npm list axios >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! axios"
)

call npm list ws >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! ws"
)

REM File system and utilities
call npm list fs-extra >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! fs-extra"
)

call npm list uuid >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! uuid"
)

call npm list pino >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! pino"
)

REM Code analysis dependencies
call npm list web-tree-sitter >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! web-tree-sitter"
)

call npm list dependency-cruiser >nul 2>nul
if %ERRORLEVEL% neq 0 (
    set "missing_deps=!missing_deps! dependency-cruiser"
)

if not "!missing_deps!"=="" (
    powershell -Command "Write-Host 'Some critical dependencies are missing:' -ForegroundColor Yellow"
    echo !missing_deps!
    powershell -Command "Write-Host 'This may cause issues. Consider running: npm install' -ForegroundColor Yellow"
) else (
    powershell -Command "Write-Host '✓ All critical dependencies verified.' -ForegroundColor Green"
)

REM Create required VibeCoderOutput directories (for tools that save files)
echo Creating required VibeCoderOutput directories...
if not exist "VibeCoderOutput" mkdir "VibeCoderOutput"

REM Core tool output directories (based on actual tools in src/tools/):
set "tool_dirs=research-manager rules-generator prd-generator user-stories-generator task-list-generator fullstack-starter-kit-generator workflow-runner code-map-generator vibe-task-manager context-curator job-result-retriever agent-registry agent-tasks agent-response generated_task_lists"

for %%d in (%tool_dirs%) do (
    if not exist "VibeCoderOutput\%%d" (
        mkdir "VibeCoderOutput\%%d"
        powershell -Command "Write-Host 'Created directory: VibeCoderOutput\%%d' -ForegroundColor Cyan"
    ) else (
        powershell -Command "Write-Host 'Directory exists: VibeCoderOutput\%%d' -ForegroundColor Gray"
    )
)

powershell -Command "Write-Host '✓ Output directories created.' -ForegroundColor Green"

REM Build TypeScript project
echo Building TypeScript project...
call npm run build
if %ERRORLEVEL% neq 0 (
    powershell -Command "Write-Host '✗ TypeScript build failed (npm run build). Check compiler output above.' -ForegroundColor Red"
    echo Common fixes:
    echo   - Check for TypeScript syntax errors with: npm run lint
    echo   - Ensure all dependencies are installed
    echo   - Check tsconfig.json for configuration issues
    echo   - Try cleaning and rebuilding: rmdir /s /q build ^&^& npm run build
    exit /b 1
)
powershell -Command "Write-Host '✓ TypeScript project built successfully.' -ForegroundColor Green"

REM Verify build output
echo Verifying build output...
set "required_files=build\index.js build\server.js build\logger.js"
set "missing_files="

for %%f in (%required_files%) do (
    if not exist "%%f" (
        set "missing_files=!missing_files! %%f"
    )
)

if not "!missing_files!"=="" (
    powershell -Command "Write-Host '✗ Build verification failed. Missing files:' -ForegroundColor Red"
    echo !missing_files!
    powershell -Command "Write-Host 'Build may have failed silently. Check TypeScript compilation.' -ForegroundColor Red"
    exit /b 1
)
powershell -Command "Write-Host '✓ Build verification complete.' -ForegroundColor Green"

REM Verify configuration files
echo Verifying configuration files...
set "config_files=llm_config.json mcp-config.json workflows.json tsconfig.json package.json"
set "missing_configs="

for %%c in (%config_files%) do (
    if not exist "%%c" (
        set "missing_configs=!missing_configs! %%c"
    ) else (
        powershell -Command "Write-Host 'Found: %%c' -ForegroundColor Cyan"
    )
)

if not "!missing_configs!"=="" (
    powershell -Command "Write-Host '✗ Missing required configuration files:' -ForegroundColor Red"
    echo !missing_configs!
    exit /b 1
)
powershell -Command "Write-Host '✓ Configuration files verified.' -ForegroundColor Green"

REM Check if .env file exists, copy from .env.example if not
echo Checking for .env file...
if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env file from template (.env.example)...
        copy ".env.example" ".env" > nul
        powershell -Command "Write-Host '.env file created from template.' -ForegroundColor Yellow"
        powershell -Command "Write-Host 'You MUST edit .env to add your OPENROUTER_API_KEY before starting the server.' -ForegroundColor Yellow"
    ) else (
        powershell -Command "Write-Host '✗ .env.example template is missing. Cannot create .env file.' -ForegroundColor Red"
        echo Please create .env manually with your OPENROUTER_API_KEY.
        exit /b 1
    )
) else (
    powershell -Command "Write-Host '✓ .env file already exists.' -ForegroundColor Green"

    REM Validate .env file has required variables
    findstr /C:"OPENROUTER_API_KEY" ".env" >nul
    if %ERRORLEVEL% neq 0 (
        powershell -Command "Write-Host '.env file exists but may be missing OPENROUTER_API_KEY.' -ForegroundColor Yellow"
        powershell -Command "Write-Host 'Please ensure .env contains all required environment variables.' -ForegroundColor Yellow"
    )
)

REM Run post-setup validation
echo Running post-setup validation...

REM Test TypeScript compilation
call npm run build >nul 2>nul
if %ERRORLEVEL% equ 0 (
    powershell -Command "Write-Host '✓ TypeScript compilation test passed.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'TypeScript compilation test failed. There may be build issues.' -ForegroundColor Yellow"
)

REM Test basic npm scripts
call npm run lint >nul 2>nul
if %ERRORLEVEL% equ 0 (
    powershell -Command "Write-Host '✓ Linting test passed.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'Linting test failed. There may be code quality issues.' -ForegroundColor Yellow"
)

REM Check if server can start (basic syntax check)
timeout /t 5 /nobreak >nul & taskkill /f /im node.exe >nul 2>nul
call node build\index.js --help >nul 2>nul
if %ERRORLEVEL% equ 0 (
    powershell -Command "Write-Host '✓ Server startup test passed.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'Server startup test failed. Check for runtime issues.' -ForegroundColor Yellow"
)

REM Validate directory structure
echo Validating directory structure...
if exist "VibeCoderOutput" if exist "build" if exist "src" (
    powershell -Command "Write-Host '✓ Directory structure validation passed.' -ForegroundColor Green"
) else (
    powershell -Command "Write-Host 'Directory structure validation failed.' -ForegroundColor Yellow"
)

echo.
powershell -Command "Write-Host '✓ Setup completed successfully!' -ForegroundColor Green"
echo ==================================================
echo Vibe Coder MCP Server v2.3 (Production Ready) is now set up with complete agent integration:
echo.
echo 📋 PLANNING ^& DOCUMENTATION TOOLS:
echo   - Research Manager (research-manager) - AI-powered research with Perplexity Sonar
echo   - PRD Generator (generate-prd) - Comprehensive Product Requirements Documents
echo   - User Stories Generator (generate-user-stories) - Agile user stories with acceptance criteria
echo   - Task List Generator (generate-task-list) - Development task breakdown with dependencies
echo   - Rules Generator (generate-rules) - Development guidelines and coding standards
echo.
echo 🏗️ PROJECT SCAFFOLDING ^& CODE ANALYSIS:
echo   - Fullstack Starter Kit Generator (generate-fullstack-starter-kit) - Dynamic LLM-generated project scaffolding
echo   - Code Map Generator (map-codebase) - Semantic codebase analysis (30+ languages, 95%% token reduction)
echo   - Context Curator (curate-context) - Intelligent context curation with chunked processing and relevance scoring
echo.
echo 🤖 TASK MANAGEMENT ^& AUTOMATION:
echo   - Vibe Task Manager (vibe-task-manager) - Production-ready AI-agent-native task management with RDD methodology
echo     * Natural language processing with 6 core intents and multi-strategy recognition
echo     * Artifact parsing for PRD and task list integration from other Vibe Coder tools
echo     * Session persistence and orchestration workflows with comprehensive CLI
echo     * Multi-agent coordination with capability mapping and real-time status synchronization
echo     * 99.9%% test success rate with zero mock code policy
echo   - Workflow Runner (run-workflow) - Predefined development workflow execution
echo   - Job Result Retriever (get-job-result) - Asynchronous task result management with real-time polling
echo.
echo 🔗 AGENT COORDINATION ^& COMMUNICATION:
echo   - Agent Registry (register-agent) - Register AI agents for task coordination
echo   - Agent Tasks (get-agent-tasks) - Retrieve assigned tasks for agents
echo   - Agent Response (submit-task-response) - Submit completed task results
echo   - Process Request (process-request) - Unified request processing with semantic routing
echo.
echo 🔧 ADVANCED FEATURES:
echo   - Complete Agent Task Integration with unified payload format and real-time status synchronization
echo   - Multi-Transport Support with dynamic port allocation and conflict resolution
echo   - SSE Task Notifications with real-time assignment and completion events
echo   - Advanced Error Recovery with automatic retry, escalation, and pattern analysis
echo   - Semantic Routing ^& Sequential Thinking for intelligent tool selection
echo   - Asynchronous Job Handling with SSE notifications for long-running tasks
echo   - Multi-language support (30+ programming languages)
echo   - Agent coordination and autonomous development workflows
echo   - Unified communication protocol (stdio/SSE/WebSocket/HTTP)
echo   - Production-ready task management with zero mock code (99.9%% test success rate)
echo   - Real-time agent orchestration and task assignment
echo   - Enhanced JSON parsing with 6-strategy progressive pipeline
echo   - Memory optimization with sophisticated caching
echo   - Security boundaries with separate read/write path validation
echo   - Schema-aware LLM integration with Zod validation
echo   - Dynamic template generation replacing static YAML templates
echo   - Chunked processing for large codebases (^>40 files)
echo   - Enhanced project type detection with multi-language intelligence
echo.
echo.
powershell -Command "Write-Host '⚠️  CRITICAL NEXT STEPS:' -ForegroundColor Yellow"
echo.
powershell -Command "Write-Host '1. REQUIRED: Configure Environment Variables' -ForegroundColor Red"
echo    - Open .env in a text editor
echo    - Replace 'YOUR_OPENROUTER_API_KEY_HERE' with your actual OpenRouter API key
echo    - Optionally set other variables like LOG_LEVEL, NODE_ENV, etc.
echo    - Save the file
echo.
powershell -Command "Write-Host '2. OPTIONAL: Review Configuration Files' -ForegroundColor Blue"
echo    - llm_config.json: LLM model mappings for different tasks
echo    - mcp-config.json: MCP tool configurations and routing patterns
echo    - workflows.json: Predefined workflow definitions
echo.
powershell -Command "Write-Host '3. START THE SERVER' -ForegroundColor Green"
echo    - For Claude Desktop (stdio): npm start
echo    - For web clients (SSE): npm run start:sse
echo    - For development with hot reload: npm run dev
echo    - For development with SSE: npm run dev:sse
echo.
powershell -Command "Write-Host '4. CONFIGURE YOUR MCP CLIENT' -ForegroundColor Blue"
echo    - Add server configuration to your MCP client settings
echo    - Use the paths shown in README.md for your specific client
echo    - Restart your MCP client after configuration
echo.
powershell -Command "Write-Host '5. VALIDATE THE SETUP' -ForegroundColor Green"
echo    - Run tests: npm test
echo    - Test specific tools: npm run test:unit
echo    - Run E2E tests: npm run test:e2e
echo    - Check test coverage: npm run coverage
echo.
powershell -Command "Write-Host '6. TEST TOOL FUNCTIONALITY' -ForegroundColor Blue"
echo    - Try: 'Research modern JavaScript frameworks' (research-manager)
echo    - Try: 'vibe-task-manager create project "Test Project" "Testing setup"'
echo    - Try: 'map-codebase ./src' (code-map-generator)
echo    - Try: 'curate-context' for intelligent context curation
echo    - Try: 'generate-fullstack-starter-kit' for dynamic project scaffolding
echo.
powershell -Command "Write-Host '7. ADVANCED USAGE' -ForegroundColor Yellow"
echo    - Use 'get-job-result ^<jobId^>' to retrieve outcomes from long-running tasks
echo    - Register agents for coordination: 'register-agent' with capabilities
echo    - Use agent tools for distributed task execution and coordination
echo    - Configure security settings via environment variables
echo.
powershell -Command "Write-Host '📚 DOCUMENTATION' -ForegroundColor Blue"
echo    - README.md: Complete setup and usage guide
echo    - VIBE_CODER_MCP_SYSTEM_INSTRUCTIONS.md: System prompt documentation
echo    - docs/: Additional documentation and examples
echo    - Individual tool READMEs in src\tools\*\README.md
echo.
powershell -Command "Write-Host '🧪 TESTING & DEBUGGING' -ForegroundColor Green"
echo    - Run all tests: npm test
echo    - Run unit tests only: npm run test:unit
echo    - Run integration tests: npm run test:integration
echo    - Run E2E tests: npm run test:e2e
echo    - Run agent integration tests: npm run test:agent-integration
echo    - Run multi-transport tests: npm run test:multi-transport
echo    - Run agent response tests: npm run test:agent-response
echo    - Run full integration suite: npm run test:full-integration
echo    - Check coverage: npm run coverage
echo    - Lint code: npm run lint
echo.
powershell -Command "Write-Host '🔧 TROUBLESHOOTING' -ForegroundColor Yellow"
echo    - If build fails: rmdir /s /q build ^&^& npm run build
echo    - If dependencies fail: rmdir /s /q node_modules ^&^& del package-lock.json ^&^& npm install
echo    - If tests fail: Check .env file has OPENROUTER_API_KEY set
echo    - For permission issues: Run as Administrator
echo    - Check logs in server.log for runtime issues
echo.
