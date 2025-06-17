#!/bin/bash
# Setup script for Vibe Coder MCP Server (Production Ready v2.3)
set -e # Exit immediately if a command exits with a non-zero status.

# Color codes for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo "Setting up Vibe Coder MCP Server v2.3..."
echo "=================================================="
echo "Production-ready MCP server with complete agent integration"
echo "Multi-transport support • Real-time notifications • Dynamic port allocation"
echo "Agent coordination • Task management • Code analysis • Research • Context curation"
echo "=================================================="

# Check if npm is installed
echo "Checking if npm is installed..."
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install Node.js and npm first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi
print_status "npm is installed."

# Check Node.js version (require v18+)
echo "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

node_version=$(node -v | cut -d "v" -f 2 | cut -d "." -f 1)
if [ "$node_version" -lt 18 ]; then
    print_error "Node.js v18+ is required (found v$(node -v)). Please upgrade Node.js."
    echo "Visit: https://nodejs.org/"
    exit 1
fi
print_status "Node.js version check passed (found v$(node -v))."

# Check npm cache and clean if needed
echo "Checking npm cache health..."
if ! npm cache verify &> /dev/null; then
    print_warning "npm cache issues detected. Cleaning cache..."
    npm cache clean --force
fi

# Install dependencies
echo "Installing dependencies..."
if ! npm install; then
    print_error "npm install failed. Check npm logs above."
    echo "Troubleshooting steps:"
    echo "  1. Try: npm cache clean --force && npm install"
    echo "  2. Delete node_modules and package-lock.json, then run npm install"
    echo "  3. Check your internet connection"
    echo "  4. Ensure you have sufficient disk space"
    exit 1
fi
print_status "Dependencies installed successfully."

# Verify critical dependencies
echo "Verifying critical dependencies..."
missing_deps=()

# Core MCP and TypeScript dependencies
if ! npm list @modelcontextprotocol/sdk &> /dev/null; then
    missing_deps+=("@modelcontextprotocol/sdk")
fi
if ! npm list typescript &> /dev/null; then
    missing_deps+=("typescript")
fi
if ! npm list dotenv &> /dev/null; then
    missing_deps+=("dotenv")
fi
if ! npm list vitest &> /dev/null; then
    missing_deps+=("vitest")
fi
if ! npm list zod &> /dev/null; then
    missing_deps+=("zod")
fi
if ! npm list yaml &> /dev/null; then
    missing_deps+=("yaml")
fi

# Runtime server dependencies
if ! npm list express &> /dev/null; then
    missing_deps+=("express")
fi
if ! npm list cors &> /dev/null; then
    missing_deps+=("cors")
fi
if ! npm list axios &> /dev/null; then
    missing_deps+=("axios")
fi
if ! npm list ws &> /dev/null; then
    missing_deps+=("ws")
fi

# File system and utilities
if ! npm list fs-extra &> /dev/null; then
    missing_deps+=("fs-extra")
fi
if ! npm list uuid &> /dev/null; then
    missing_deps+=("uuid")
fi
if ! npm list pino &> /dev/null; then
    missing_deps+=("pino")
fi

# Code analysis dependencies
if ! npm list web-tree-sitter &> /dev/null; then
    missing_deps+=("web-tree-sitter")
fi
if ! npm list dependency-cruiser &> /dev/null; then
    missing_deps+=("dependency-cruiser")
fi

if [ ${#missing_deps[@]} -gt 0 ]; then
    print_warning "Some critical dependencies are missing:"
    for dep in "${missing_deps[@]}"; do
        echo "  - $dep"
    done
    print_warning "This may cause issues. Consider running: npm install"
else
    print_status "All critical dependencies verified."
fi

# Create required VibeCoderOutput directories (for tools that save files)
echo "Creating required VibeCoderOutput directories..."
mkdir -p VibeCoderOutput # Ensure base dir exists

# Core tool output directories (based on actual tools in src/tools/):
declare -a tool_dirs=(
    "research-manager"
    "rules-generator"
    "prd-generator"
    "user-stories-generator"
    "task-list-generator"
    "fullstack-starter-kit-generator"
    "workflow-runner"
    "code-map-generator"
    "vibe-task-manager"
    "context-curator"
    "job-result-retriever"
    "agent-registry"
    "agent-tasks"
    "agent-response"
    "generated_task_lists"
)

for dir in "${tool_dirs[@]}"; do
    if mkdir -p "VibeCoderOutput/$dir"; then
        print_info "Created directory: VibeCoderOutput/$dir"
    else
        print_warning "Failed to create directory: VibeCoderOutput/$dir"
    fi
done

print_status "Output directories created."

# Build TypeScript
echo "Building TypeScript project..."
if ! npm run build; then
    print_error "TypeScript build failed (npm run build). Check compiler output above."
    echo "Common fixes:"
    echo "  - Check for TypeScript syntax errors with: npm run lint"
    echo "  - Ensure all dependencies are installed"
    echo "  - Check tsconfig.json for configuration issues"
    echo "  - Try cleaning and rebuilding: rm -rf build && npm run build"
    exit 1
fi
print_status "TypeScript project built successfully."

# Verify build output
echo "Verifying build output..."
required_files=(
    "build/index.js"
    "build/server.js"
    "build/logger.js"
)

missing_files=()
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
    print_error "Build verification failed. Missing files:"
    for file in "${missing_files[@]}"; do
        echo "  - $file"
    done
    print_error "Build may have failed silently. Check TypeScript compilation."
    exit 1
fi
print_status "Build verification complete."

# Ensure the built file is executable
echo "Setting executable permissions for build files..."
chmod +x build/index.js
if [ -f "build/server.js" ]; then
    chmod +x build/server.js
fi
print_status "Executable permissions set."

# Verify configuration files
echo "Verifying configuration files..."
config_files=(
    "llm_config.json:LLM model mappings"
    "mcp-config.json:MCP tool configurations"
    "workflows.json:Workflow definitions"
    "tsconfig.json:TypeScript configuration"
    "package.json:Project dependencies"
)

missing_configs=()
for config_entry in "${config_files[@]}"; do
    file="${config_entry%%:*}"
    description="${config_entry##*:}"

    if [ ! -f "$file" ]; then
        missing_configs+=("$file ($description)")
    else
        print_info "Found: $file"
    fi
done

if [ ${#missing_configs[@]} -gt 0 ]; then
    print_error "Missing required configuration files:"
    for config in "${missing_configs[@]}"; do
        echo "  - $config"
    done
    exit 1
fi
print_status "Configuration files verified."

# Check if .env file exists, copy from .env.example if not
echo "Checking for .env file..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "Creating .env file from template (.env.example)..."
        cp .env.example .env
        print_warning ".env file created from template."
        print_warning "You MUST edit .env to add your OPENROUTER_API_KEY before starting the server."
    else
        print_error ".env.example template is missing. Cannot create .env file."
        echo "Please create .env manually with your OPENROUTER_API_KEY."
        exit 1
    fi
else
    print_status ".env file already exists."

    # Validate .env file has required variables
    if ! grep -q "OPENROUTER_API_KEY" .env; then
        print_warning ".env file exists but may be missing OPENROUTER_API_KEY."
        print_warning "Please ensure .env contains all required environment variables."
    fi
fi

# Run post-setup validation
echo "Running post-setup validation..."

# Test TypeScript compilation
if npm run build &> /dev/null; then
    print_status "TypeScript compilation test passed."
else
    print_warning "TypeScript compilation test failed. There may be build issues."
fi

# Test basic npm scripts
if npm run lint &> /dev/null; then
    print_status "Linting test passed."
else
    print_warning "Linting test failed. There may be code quality issues."
fi

# Check if server can start (basic syntax check)
if timeout 5s node build/index.js --help &> /dev/null; then
    print_status "Server startup test passed."
else
    print_warning "Server startup test failed. Check for runtime issues."
fi

# Validate directory structure
echo "Validating directory structure..."
if [ -d "VibeCoderOutput" ] && [ -d "build" ] && [ -d "src" ]; then
    print_status "Directory structure validation passed."
else
    print_warning "Directory structure validation failed."
fi

echo ""
print_status "Setup completed successfully!"
echo "=================================================="
echo "Vibe Coder MCP Server v2.3 (Production Ready) is now set up with complete agent integration:"
echo ""
echo "📋 PLANNING & DOCUMENTATION TOOLS:"
echo "  - Research Manager (research-manager) - AI-powered research with Perplexity Sonar"
echo "  - PRD Generator (generate-prd) - Comprehensive Product Requirements Documents"
echo "  - User Stories Generator (generate-user-stories) - Agile user stories with acceptance criteria"
echo "  - Task List Generator (generate-task-list) - Development task breakdown with dependencies"
echo "  - Rules Generator (generate-rules) - Development guidelines and coding standards"
echo ""
echo "🏗️ PROJECT SCAFFOLDING & CODE ANALYSIS:"
echo "  - Fullstack Starter Kit Generator (generate-fullstack-starter-kit) - Dynamic LLM-generated project scaffolding"
echo "  - Code Map Generator (map-codebase) - Semantic codebase analysis (30+ languages, 95% token reduction)"
echo "  - Context Curator (curate-context) - Intelligent context curation with chunked processing and relevance scoring"
echo ""
echo "🤖 TASK MANAGEMENT & AUTOMATION:"
echo "  - Vibe Task Manager (vibe-task-manager) - Production-ready AI-agent-native task management with RDD methodology"
echo "    * Natural language processing with 6 core intents and multi-strategy recognition"
echo "    * Artifact parsing for PRD and task list integration from other Vibe Coder tools"
echo "    * Session persistence and orchestration workflows with comprehensive CLI"
echo "    * Multi-agent coordination with capability mapping and real-time status synchronization"
echo "    * 99.9% test success rate with zero mock code policy"
echo "  - Workflow Runner (run-workflow) - Predefined development workflow execution"
echo "  - Job Result Retriever (get-job-result) - Asynchronous task result management with real-time polling"
echo ""
echo "🔗 AGENT COORDINATION & COMMUNICATION:"
echo "  - Agent Registry (register-agent) - Register AI agents for task coordination"
echo "  - Agent Tasks (get-agent-tasks) - Retrieve assigned tasks for agents"
echo "  - Agent Response (submit-task-response) - Submit completed task results"
echo "  - Process Request (process-request) - Unified request processing with semantic routing"
echo ""
echo "🔧 ADVANCED FEATURES:"
echo "  - Complete Agent Task Integration with unified payload format and real-time status synchronization"
echo "  - Multi-Transport Support with dynamic port allocation and conflict resolution"
echo "  - SSE Task Notifications with real-time assignment and completion events"
echo "  - Advanced Error Recovery with automatic retry, escalation, and pattern analysis"
echo "  - Semantic Routing & Sequential Thinking for intelligent tool selection"
echo "  - Asynchronous Job Handling with SSE notifications for long-running tasks"
echo "  - Multi-language support (30+ programming languages)"
echo "  - Agent coordination and autonomous development workflows"
echo "  - Unified communication protocol (stdio/SSE/WebSocket/HTTP)"
echo "  - Production-ready task management with zero mock code (99.9% test success rate)"
echo "  - Real-time agent orchestration and task assignment"
echo "  - Enhanced JSON parsing with 6-strategy progressive pipeline"
echo "  - Memory optimization with sophisticated caching"
echo "  - Security boundaries with separate read/write path validation"
echo "  - Schema-aware LLM integration with Zod validation"
echo "  - Dynamic template generation replacing static YAML templates"
echo "  - Chunked processing for large codebases (>40 files)"
echo "  - Enhanced project type detection with multi-language intelligence"
echo ""
echo ""
echo -e "${YELLOW}⚠️  CRITICAL NEXT STEPS:${NC}"
echo ""
echo -e "${RED}1. REQUIRED: Configure Environment Variables${NC}"
echo "   - Open .env in a text editor"
echo "   - Replace 'YOUR_OPENROUTER_API_KEY_HERE' with your actual OpenRouter API key"
echo "   - Optionally set other variables like LOG_LEVEL, NODE_ENV, etc."
echo "   - Save the file"
echo ""
echo -e "${BLUE}2. OPTIONAL: Review Configuration Files${NC}"
echo "   - llm_config.json: LLM model mappings for different tasks"
echo "   - mcp-config.json: MCP tool configurations and routing patterns"
echo "   - workflows.json: Predefined workflow definitions"
echo ""
echo -e "${GREEN}3. START THE SERVER${NC}"
echo "   - For Claude Desktop (stdio): npm start"
echo "   - For web clients (SSE): npm run start:sse"
echo "   - For development with hot reload: npm run dev"
echo "   - For development with SSE: npm run dev:sse"
echo ""
echo -e "${BLUE}4. CONFIGURE YOUR MCP CLIENT${NC}"
echo "   - Add server configuration to your MCP client settings"
echo "   - Use the paths shown in README.md for your specific client"
echo "   - Restart your MCP client after configuration"
echo ""
echo -e "${GREEN}5. VALIDATE THE SETUP${NC}"
echo "   - Run tests: npm test"
echo "   - Test specific tools: npm run test:unit"
echo "   - Run E2E tests: npm run test:e2e"
echo "   - Check test coverage: npm run coverage"
echo ""
echo -e "${BLUE}6. TEST TOOL FUNCTIONALITY${NC}"
echo "   - Try: 'Research modern JavaScript frameworks' (research-manager)"
echo "   - Try: 'vibe-task-manager create project \"Test Project\" \"Testing setup\"'"
echo "   - Try: 'map-codebase ./src' (code-map-generator)"
echo "   - Try: 'curate-context' for intelligent context curation"
echo "   - Try: 'generate-fullstack-starter-kit' for dynamic project scaffolding"
echo ""
echo -e "${YELLOW}7. ADVANCED USAGE${NC}"
echo "   - Use 'get-job-result <jobId>' to retrieve outcomes from long-running tasks"
echo "   - Register agents for coordination: 'register-agent' with capabilities"
echo "   - Use agent tools for distributed task execution and coordination"
echo "   - Configure security settings via environment variables"
echo ""
echo -e "${BLUE}📚 DOCUMENTATION${NC}"
echo "   - README.md: Complete setup and usage guide"
echo "   - VIBE_CODER_MCP_SYSTEM_INSTRUCTIONS.md: System prompt documentation"
echo "   - docs/: Additional documentation and examples"
echo "   - Individual tool READMEs in src/tools/*/README.md"
echo ""
echo -e "${GREEN}🧪 TESTING & DEBUGGING${NC}"
echo "   - Run all tests: npm test"
echo "   - Run unit tests only: npm run test:unit"
echo "   - Run integration tests: npm run test:integration"
echo "   - Run E2E tests: npm run test:e2e"
echo "   - Run agent integration tests: npm run test:agent-integration"
echo "   - Run multi-transport tests: npm run test:multi-transport"
echo "   - Run agent response tests: npm run test:agent-response"
echo "   - Run full integration suite: npm run test:full-integration"
echo "   - Check coverage: npm run coverage"
echo "   - Lint code: npm run lint"
echo ""
echo -e "${YELLOW}🔧 TROUBLESHOOTING${NC}"
echo "   - If build fails: rm -rf build && npm run build"
echo "   - If dependencies fail: rm -rf node_modules package-lock.json && npm install"
echo "   - If tests fail: Check .env file has OPENROUTER_API_KEY set"
echo "   - For permission issues: chmod +x setup.sh && ./setup.sh"
echo "   - Check logs in server.log for runtime issues"
echo ""
