# Changelog

All notable changes to the Vibe Coder MCP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2025-08-18

### Fixed
- **Global Installation Alignment**
  - Ensured global and local versions are properly synchronized
  - Updated all version references across configuration files
  - Fixed global installation process to use proper package build

### Changed
- **Version Synchronization**
  - Updated package.json version to 0.3.1
  - Updated all setup scripts (setup.sh, setup.bat) to reflect new version
  - Updated configuration templates and system instructions
  - Synchronized .vibe-config.json version number

### Improved
- **Build Process**
  - Enhanced clean build process for both local and global installations
  - Improved global package installation workflow
  - Better version consistency across all project files

## [0.3.0] - 2025-01-11

### Added
- **Enhanced Natural Language Processing System**
  - Reconnected pattern matching system for 94%+ accuracy
  - Added 314 semantically relevant patterns across all 15 tools
  - Implemented ultra-fast keyword prefiltering with <1ms response time
  - Multi-layer matching pipeline: Keyword → Pattern → Semantic → Sequential → Fallback

- **Comprehensive Pattern Coverage**
  - vibe-task-manager: 33 patterns for project and task management
  - research-manager: 27 patterns for research queries
  - map-codebase: 25 patterns for code analysis
  - fullstack-starter-kit-generator: 23 patterns for project scaffolding
  - rules-generator: 23 patterns for coding standards
  - task-list-generator: 22 patterns for task planning
  - curate-context: 22 patterns for context curation
  - user-stories-generator: 21 patterns for agile stories
  - prd-generator: 20 patterns for requirements documents
  - All other tools: 15-19 patterns each

- **Integration Tests**
  - New test suite for NLP improvements validation
  - Pattern matching tests with 94.3% success rate
  - Keyword prefiltering validation tests

### Changed
- **Semantic Matching Improvements**
  - Lowered semantic threshold from 0.70 to 0.60 for better coverage
  - Sequential thinking now aware of all 15 tools (was only 6)
  - Improved confidence scoring for all matching methods

- **Performance Optimizations**
  - Pattern matching: <5ms for 90% confidence matches
  - Keyword matching: <1ms for 85% confidence matches
  - Overall accuracy improved from ~20% to 94%+ for defined patterns
  - Reduced fallback usage by 75%

### Fixed
- Pattern matcher disconnection issue resolved
- Sequential thinking incomplete tool list fixed
- Semantic matching threshold optimization
- Tool routing accuracy significantly improved

### Technical Details
- Fully type-safe implementation with zero TypeScript errors
- All changes follow existing architectural patterns
- Respects centralized configuration, security, and transport systems
- Comprehensive test coverage for all improvements

## [0.2.8] - 2025-01-10

### Fixed
- CLI Interactive Mode configuration persistence issues
- Project root detection in CLI context
- Configuration file management reliability
- Unified configuration toggle behavior
- NPM package installation and global execution
- Configuration loading for various installation scenarios

### Changed
- Enhanced error handling in CLI interactive mode
- Improved configuration state management
- Better edge case handling in setup wizard
- More robust project directory detection

## [0.2.7] - 2025-01-09

### Fixed
- Missing configuration files in npm package
- Added llm_config.json and job-timeout-config.json to package files
- Resolved configuration loading errors

## [0.2.6] - 2025-01-08

### Fixed
- Runtime dependency issues with @xenova/transformers
- Semantic matching functionality errors

## [0.2.5] - 2025-01-07

### Fixed
- Critical CLI onboarding loop bug
- Implemented context-aware configuration system
- Enhanced auto-detection improvements

## [0.2.3] - 2025-01-05

### Added
- Interactive REPL Mode (`vibe --interactive`)
- Enhanced Setup Wizard with first-run detection
- Configuration Templates in src/config-templates/
- Unified CLI Binary with single `vibe` command

### Changed
- CI/CD pipeline 70% faster performance
- Optimized memory usage for large codebases
- Streamlined validation process

### Fixed
- Resource management improvements
- Configuration validation and backup system

## [0.2.0] - 2024-12-20

### Added
- Multi-transport support (stdio, SSE, WebSocket, HTTP)
- Agent orchestration system
- Comprehensive test suite with 99.9% success rate

### Changed
- Major architecture improvements
- Enhanced tool registry system
- Improved error handling

## [0.1.0] - 2024-11-15

### Added
- Initial release
- Basic MCP server implementation
- Core tool set (research, PRD, user stories, task lists)
- Code map generator
- Context curator
- Task manager with RDD methodology