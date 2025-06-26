# Debug Scripts Collection

This folder contains all debugging and troubleshooting scripts created during the development and fixing of the Vibe Coder MCP Server.

## Current Working Scripts

### fix-sharp-windows.bat ⭐
- **Status**: WORKING SOLUTION
- **Purpose**: Fixes Sharp module installation issues on Windows
- **Usage**: Run when getting "Cannot find module sharp-win32-x64.node" errors
- **What it does**: Installs Sharp with proper Windows platform targeting for both main project and transformers dependency

### install-sharp.bat
- **Status**: WORKING
- **Purpose**: Basic Sharp installation for Windows
- **Usage**: Simple Sharp reinstallation script

## Build & Setup Scripts

### build-and-test.bat / build-and-test.sh
- **Purpose**: Complete build and test workflow
- **Usage**: Full project build with testing

### setup.bat / setup.sh
- **Purpose**: Initial project setup
- **Usage**: First-time project configuration

### rebuild.bat / rebuild-fixed.sh
- **Purpose**: Clean rebuild of the project
- **Usage**: When you need to rebuild from scratch

### clean-rebuild.sh
- **Purpose**: Clean rebuild for Unix systems
- **Usage**: Removes build artifacts and rebuilds

## Platform-Specific Fixes

### Windows Scripts
- `windows-fix.bat` - General Windows fixes
- `enhanced-fix.bat` - Enhanced Windows setup
- `final-fix.bat` - Final Windows fix attempt
- `simple-fix.bat` - Simple Windows fix
- `fix-server.bat` - Server-specific fixes
- `fix-windows-setup-safe.bat` - Safe Windows setup
- `fix-windows-setup.ps1` - PowerShell Windows setup
- `cleanup.bat` - Windows cleanup script

### Unix/WSL Scripts
- `unix-fix.sh` - General Unix fixes
- `wsl-fix.sh` - WSL-specific fixes
- `wsl-quick-fix.sh` - Quick WSL fixes
- `simple-fix.sh` - Simple Unix fix
- `fix-and-build.sh` - Fix and build for Unix

## Debug & Diagnostic Scripts

### debug-paths.js
- **Purpose**: Debug Windows path resolution issues
- **Usage**: `node debug-paths.js`

### debug-unix-paths.js
- **Purpose**: Debug Unix path resolution issues
- **Usage**: `node debug-unix-paths.js`

### isolate-issue.js / isolate-issue-esm.js
- **Purpose**: Isolate specific runtime issues
- **Usage**: Standalone issue reproduction

### test-startup.sh
- **Purpose**: Test server startup
- **Usage**: Automated startup testing

## Documentation

### FIXES_APPLIED.md
- **Purpose**: Complete history of all fixes applied
- **Contents**: Detailed log of what was fixed and when

### fix-windows-setup.bat.old
- **Status**: DEPRECATED - DO NOT USE
- **Purpose**: Legacy fix script that incorrectly removed functionality
- **Note**: Kept for reference only

## Usage Instructions

### For Sharp Issues (Most Common)
```bash
cd debug
fix-sharp-windows.bat
```

### For Complete Rebuild
```bash
cd debug
clean-rebuild.sh    # Unix/WSL
# or
rebuild.bat         # Windows
```

### For Path Issues
```bash
cd debug
node debug-paths.js
```

## Issue Categories Fixed

1. **Sharp Module**: Missing win32-x64 binaries
2. **Path Validation**: Windows vs Unix path handling
3. **ESM Issues**: Module loading problems
4. **Build Issues**: TypeScript compilation problems
5. **Dependency Conflicts**: Package version mismatches
6. **Configuration**: Path resolution in config files

## Notes

- Scripts marked with ⭐ are the current working solutions
- Windows-specific scripts work on Windows/PowerShell
- Unix scripts work on WSL/Linux/macOS
- Always check the server logs after running any fix script
- Most issues were related to Windows path handling and Sharp module compilation

## Script Evolution

The scripts evolved through multiple debugging sessions:
1. **Initial Setup**: Basic build scripts
2. **Path Issues**: Debug path resolution
3. **Sharp Problems**: Fix binary compilation
4. **Integration**: Combine fixes into working solution
5. **Cleanup**: Organize and document

The final working solution is `fix-sharp-windows.bat` which addresses both major issues that were causing startup failures.
