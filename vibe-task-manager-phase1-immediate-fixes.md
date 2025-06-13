# Phase 1: Immediate Fixes - Atomic Task Breakdown

## 📋 PHASE 1 OVERVIEW

**Duration**: 5-7 days
**Total Tasks**: 89 atomic tasks
**Focus**: Replace hardcoded values, fix TODOs, improve error handling
**Risk Level**: Low (isolated changes)
**Branch**: `task-manager-fix` (all work done on existing branch)

---

## 🎯 CATEGORY A: HARDCODED PROJECT CONTEXT FIXES (25 tasks)

### **P1-FIX-001**
- **Title**: Create dynamic language detection utility function
- **File**: `src/tools/vibe-task-manager/utils/project-analyzer.ts`
- **Acceptance Criteria**: Function `detectProjectLanguages(projectPath: string)` returns array of detected languages from package.json
- **Complexity**: Simple
- **Code Snippet**: 
  ```typescript
  export async function detectProjectLanguages(projectPath: string): Promise<string[]> {
    // Parse package.json dependencies
  }
  ```
- **Impact**: New utility file, zero downstream impact
- **Rollback**: Delete new file
- **Verification**: Unit test returns correct languages for sample package.json

### **P1-FIX-002**
- **Title**: Create dynamic framework detection utility function
- **File**: `src/tools/vibe-task-manager/utils/project-analyzer.ts`
- **Acceptance Criteria**: Function `detectProjectFrameworks(projectPath: string)` returns array of detected frameworks
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  export async function detectProjectFrameworks(projectPath: string): Promise<string[]> {
    // Analyze dependencies for React, Vue, Angular, etc.
  }
  ```
- **Impact**: Addition to existing utility file
- **Rollback**: Remove function from file
- **Verification**: Unit test detects React, Vue, Angular correctly

### **P1-FIX-003**
- **Title**: Create dynamic tools detection utility function
- **File**: `src/tools/vibe-task-manager/utils/project-analyzer.ts`
- **Acceptance Criteria**: Function `detectProjectTools(projectPath: string)` returns array of detected development tools
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  export async function detectProjectTools(projectPath: string): Promise<string[]> {
    // Detect webpack, vite, jest, etc.
  }
  ```
- **Impact**: Addition to existing utility file
- **Rollback**: Remove function from file
- **Verification**: Unit test detects common tools correctly

### **P1-FIX-004**
- **Title**: Import project analyzer utilities in decomposition handlers
- **File**: `src/tools/vibe-task-manager/nl/handlers/decomposition-handlers.ts`
- **Acceptance Criteria**: Import statement added for project analyzer utilities
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  import { detectProjectLanguages, detectProjectFrameworks, detectProjectTools } from '../../utils/project-analyzer.js';
  ```
- **Impact**: Import addition only
- **Rollback**: Remove import statement
- **Verification**: File compiles without errors

### **P1-FIX-005**
- **Title**: Replace hardcoded languages array in decomposition-handlers.ts line 154
- **File**: `src/tools/vibe-task-manager/nl/handlers/decomposition-handlers.ts`
- **Acceptance Criteria**: Line 154 uses `await detectProjectLanguages(projectPath)` instead of hardcoded array
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  // Before: languages: ['typescript', 'javascript'],
  // After: languages: await detectProjectLanguages(projectPath),
  ```
- **Impact**: Single line modification
- **Rollback**: Restore hardcoded array
- **Verification**: Function returns dynamic languages for test project

### **P1-FIX-006**
- **Title**: Replace hardcoded frameworks array in decomposition-handlers.ts line 155
- **File**: `src/tools/vibe-task-manager/nl/handlers/decomposition-handlers.ts`
- **Acceptance Criteria**: Line 155 uses `await detectProjectFrameworks(projectPath)` instead of hardcoded array
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  // Before: frameworks: ['react', 'node.js'],
  // After: frameworks: await detectProjectFrameworks(projectPath),
  ```
- **Impact**: Single line modification
- **Rollback**: Restore hardcoded array
- **Verification**: Function returns dynamic frameworks for test project

### **P1-FIX-007**
- **Title**: Replace hardcoded tools array in decomposition-handlers.ts
- **File**: `src/tools/vibe-task-manager/nl/handlers/decomposition-handlers.ts`
- **Acceptance Criteria**: Tools array uses `await detectProjectTools(projectPath)` instead of hardcoded values
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  // Before: tools: ['vscode', 'git'],
  // After: tools: await detectProjectTools(projectPath),
  ```
- **Impact**: Single line modification
- **Rollback**: Restore hardcoded array
- **Verification**: Function returns dynamic tools for test project

### **P1-FIX-008**
- **Title**: Add error handling for project analyzer in decomposition handlers
- **File**: `src/tools/vibe-task-manager/nl/handlers/decomposition-handlers.ts`
- **Acceptance Criteria**: Try-catch block wraps project analyzer calls with fallback to defaults
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  try {
    languages = await detectProjectLanguages(projectPath);
  } catch (error) {
    languages = ['javascript']; // fallback
  }
  ```
- **Impact**: Error handling addition
- **Rollback**: Remove try-catch, restore direct calls
- **Verification**: Graceful fallback when project analysis fails

### **P1-FIX-009**
- **Title**: Create unit test for detectProjectLanguages function
- **File**: `src/tools/vibe-task-manager/__tests__/utils/project-analyzer.test.ts`
- **Acceptance Criteria**: Test validates language detection for TypeScript, JavaScript, Python projects
- **Complexity**: Simple
- **Impact**: New test file
- **Rollback**: Delete test file
- **Verification**: Test passes with 100% coverage

### **P1-FIX-010**
- **Title**: Create unit test for detectProjectFrameworks function
- **File**: `src/tools/vibe-task-manager/__tests__/utils/project-analyzer.test.ts`
- **Acceptance Criteria**: Test validates framework detection for React, Vue, Angular projects
- **Complexity**: Simple
- **Impact**: Addition to existing test file
- **Rollback**: Remove test cases
- **Verification**: Test passes with 100% coverage

### **P1-FIX-011 to P1-FIX-025**
- **Pattern**: Similar atomic tasks for remaining hardcoded values
- **Scope**: Package.json parsing, tsconfig.json analysis, dependency detection
- **Focus**: One function, one test, one verification per task
- **Complexity**: Simple (80%) / Medium (20%)

---

## 🎯 CATEGORY B: DEFAULT PROJECT/EPIC ID FIXES (15 tasks)

### **P1-FIX-026**
- **Title**: Create project context extraction utility function
- **File**: `src/tools/vibe-task-manager/utils/context-extractor.ts`
- **Acceptance Criteria**: Function `extractProjectFromContext(context)` returns project ID from context or current directory
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  export async function extractProjectFromContext(context: any): Promise<string> {
    // Extract from context, git remote, or directory name
  }
  ```
- **Impact**: New utility file
- **Rollback**: Delete new file
- **Verification**: Returns correct project ID for various context types

### **P1-FIX-027**
- **Title**: Create epic context extraction utility function
- **File**: `src/tools/vibe-task-manager/utils/context-extractor.ts`
- **Acceptance Criteria**: Function `extractEpicFromContext(context)` returns epic ID from context or defaults intelligently
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  export async function extractEpicFromContext(context: any): Promise<string> {
    // Extract from context, task description, or generate
  }
  ```
- **Impact**: Addition to utility file
- **Rollback**: Remove function
- **Verification**: Returns appropriate epic ID for different scenarios

### **P1-FIX-028**
- **Title**: Import context extractor in command handlers
- **File**: `src/tools/vibe-task-manager/nl/command-handlers.ts`
- **Acceptance Criteria**: Import statement added for context extraction utilities
- **Complexity**: Simple
- **Impact**: Import addition only
- **Rollback**: Remove import
- **Verification**: File compiles without errors

### **P1-FIX-029**
- **Title**: Replace default project ID in command-handlers.ts line 288
- **File**: `src/tools/vibe-task-manager/nl/command-handlers.ts`
- **Acceptance Criteria**: Line 288 uses `await extractProjectFromContext(context)` with fallback
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  // Before: projectId: 'default-project',
  // After: projectId: await extractProjectFromContext(context) || 'default-project',
  ```
- **Impact**: Single line modification
- **Rollback**: Restore hardcoded value
- **Verification**: Dynamic project ID extraction works

### **P1-FIX-030** ⭐ **CHECKPOINT 1**
- **Title**: Replace default epic ID in command-handlers.ts line 289
- **File**: `src/tools/vibe-task-manager/nl/command-handlers.ts`
- **Acceptance Criteria**: Line 289 uses `await extractEpicFromContext(context)` with fallback
- **Complexity**: Simple
- **Impact**: Single line modification
- **Rollback**: Restore hardcoded value
- **Verification**: Dynamic epic ID extraction works

### **P1-FIX-031 to P1-FIX-040**
- **Pattern**: Context extraction for various command types
- **Scope**: Task creation, decomposition, refinement commands
- **Focus**: Replace all default ID usage with dynamic extraction
- **Complexity**: Simple (70%) / Medium (30%)

---

## 🎯 CATEGORY C: MISSING PROJECT DETECTION (15 tasks)

### **P1-FIX-041 to P1-FIX-055**
- **Scope**: Basic project detection infrastructure
- **Focus**: File system analysis, git repository detection, package manager identification
- **Complexity**: Simple (60%) / Medium (40%)

---

## 🎯 CATEGORY D: CONTEXT ENRICHMENT IMPROVEMENTS (15 tasks)

### **P1-FIX-056 to P1-FIX-070**
- **Scope**: Error handling, fallback mechanisms, performance optimization
- **Focus**: Robust context enrichment with graceful degradation
- **Complexity**: Simple (40%) / Medium (60%)

---

## 🎯 CATEGORY E: RETRY MECHANISM FIXES (19 tasks)

### **P1-FIX-071 to P1-FIX-089**
- **Scope**: Store original requests, implement retry logic, session management
- **Focus**: Error recovery and request replay capability
- **Complexity**: Simple (30%) / Medium (70%)

---

## 📊 PHASE 1 SUMMARY

**Total Tasks**: 89
- **Simple**: 67 tasks (75%)
- **Medium**: 22 tasks (25%)

**Verification Strategy**: Each task includes immediate unit test and integration verification
**Risk Mitigation**: All changes isolated, comprehensive fallbacks, feature flags where needed
