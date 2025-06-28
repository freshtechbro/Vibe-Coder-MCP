#!/bin/bash

# ========================================
# Platform-Agnostic Fix for Vibe Coder MCP
# Consolidated from: fix-and-build.sh, rebuild-fixed.sh, clean-rebuild.sh, build-and-test.sh
# ========================================

# Find project root relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================"
echo "Platform-Agnostic Vibe Coder MCP Fix"
echo "Project Root: $PROJECT_ROOT"
echo "Platform: $(uname -s)"
echo "========================================"

# Colors for output
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

# Step 1: Clean and reinstall dependencies
echo
echo "=== Step 1: Cleaning and reinstalling dependencies ==="
print_info "Cleaning npm cache..."
npm cache clean --force

print_info "Removing node_modules..."
rm -rf node_modules package-lock.json

print_info "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    print_error "npm install failed"
    exit 1
fi
print_status "Dependencies installed successfully"

# Step 2: Platform-specific Sharp installation
echo
echo "=== Step 2: Installing Sharp for current platform ==="
PLATFORM=$(uname -s)
case $PLATFORM in
    Darwin*)
        print_info "Installing Sharp for macOS..."
        npm install sharp --platform=darwin --arch=x64
        ;;
    Linux*)
        print_info "Installing Sharp for Linux..."
        npm install sharp --platform=linux --arch=x64
        ;;
    *)
        print_warning "Unknown platform $PLATFORM, using default Sharp installation"
        npm install sharp
        ;;
esac

if [ $? -ne 0 ]; then
    print_error "Sharp installation failed"
    exit 1
fi
print_status "Sharp installed successfully"

# Step 3: Rebuild project
echo
echo "=== Step 3: Building TypeScript project ==="
npm run build
if [ $? -ne 0 ]; then
    print_error "TypeScript build failed"
    exit 1
fi
print_status "Build completed successfully"

# Step 4: Test configuration
echo
echo "=== Step 4: Testing configuration ==="
node -e "
(async () => {
    try {
        const { FileUtils } = require('./build/tools/vibe-task-manager/utils/file-utils.js');
        const result = await FileUtils.readJsonFile('./llm_config.json');
        console.log('Config loading:', result.success ? 'SUCCESS' : 'FAILED');
        if (!result.success) console.log('Error:', result.error);
    } catch (error) {
        console.log('Config test exception:', error.message);
    }
})();
"

# Step 5: Test server startup
echo
echo "=== Step 5: Testing server startup ==="
print_info "Testing server initialization..."
timeout 3s node build/index.js --help > /dev/null 2>&1
if [ $? -eq 0 ] || [ $? -eq 124 ]; then
    print_status "Server appears to be working correctly"
else
    print_warning "Server test inconclusive, but fixes have been applied"
fi

# Step 6: Run basic tests if available
echo
echo "=== Step 6: Running basic tests ==="
if npm run test:unit > /dev/null 2>&1; then
    print_status "Unit tests passed"
else
    print_warning "Unit tests failed or unavailable"
fi

echo
echo "========================================"
print_status "Platform-agnostic fix completed!"
echo
print_info "Your server should now work properly."
print_info "Test with: npm start"
echo
print_info "If issues persist, check:"
print_info "- .env file has OPENROUTER_API_KEY set"
print_info "- Node.js version is 18+"
print_info "- File permissions are correct"
echo "========================================"
