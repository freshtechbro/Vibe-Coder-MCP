# Phase 2: Enhanced Detection - Atomic Task Breakdown

## 📋 PHASE 2 OVERVIEW

**Duration**: 14-21 days
**Total Tasks**: 156 atomic tasks
**Focus**: Project stage detection, intelligent triggers, user preferences
**Risk Level**: Medium (new functionality)
**Branch**: `task-manager-fix` (continuing on existing branch)

---

## 🎯 CATEGORY A: PROJECT STAGE DETECTION (80 tasks)

### **P2-DETECT-001**
- **Title**: Create ProjectStageAnalysis interface definition
- **File**: `src/tools/vibe-task-manager/types/project-stage.ts`
- **Acceptance Criteria**: Interface defines stage, hasCodebase, hasPRD, hasTests, codebaseSize, recommendedWorkflow properties
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  export interface ProjectStageAnalysis {
    stage: 'greenfield' | 'existing' | 'legacy';
    hasCodebase: boolean;
    hasPRD: boolean;
    hasTests: boolean;
    codebaseSize: 'small' | 'medium' | 'large';
    recommendedWorkflow: 'research-first' | 'analysis-first' | 'refactor-first';
  }
  ```
- **Impact**: New type definition file
- **Rollback**: Delete new file
- **Verification**: TypeScript compilation succeeds

### **P2-DETECT-002**
- **Title**: Create ProjectStageDetector class skeleton
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Class with analyzeProjectStage method signature defined
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  export class ProjectStageDetector {
    async analyzeProjectStage(projectPath: string): Promise<ProjectStageAnalysis> {
      // Implementation placeholder
    }
  }
  ```
- **Impact**: New service file
- **Rollback**: Delete new file
- **Verification**: Class instantiates without errors

### **P2-DETECT-003**
- **Title**: Implement codebase existence detection
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Method `detectCodebaseExistence()` returns boolean based on source file presence
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  private async detectCodebaseExistence(projectPath: string): Promise<boolean> {
    // Check for .js, .ts, .py, .java files
  }
  ```
- **Impact**: Method addition to existing class
- **Rollback**: Remove method
- **Verification**: Returns true for projects with source files, false for empty directories

### **P2-DETECT-004**
- **Title**: Implement PRD document detection
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Method `detectPRDExistence()` returns boolean based on requirements document presence
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  private async detectPRDExistence(projectPath: string): Promise<boolean> {
    // Check for README.md, REQUIREMENTS.md, docs/prd.md, etc.
  }
  ```
- **Impact**: Method addition to existing class
- **Rollback**: Remove method
- **Verification**: Returns true for projects with PRD files

### **P2-DETECT-005**
- **Title**: Implement test suite detection
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Method `detectTestExistence()` returns boolean based on test file presence
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  private async detectTestExistence(projectPath: string): Promise<boolean> {
    // Check for __tests__, .test.js, .spec.js files
  }
  ```
- **Impact**: Method addition to existing class
- **Rollback**: Remove method
- **Verification**: Returns true for projects with test files

### **P2-DETECT-006**
- **Title**: Implement codebase size calculation
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Method `calculateCodebaseSize()` returns 'small'|'medium'|'large' based on file count and LOC
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  private async calculateCodebaseSize(projectPath: string): Promise<'small' | 'medium' | 'large'> {
    // Count files and lines of code
  }
  ```
- **Impact**: Method addition to existing class
- **Rollback**: Remove method
- **Verification**: Correctly categorizes test projects by size

### **P2-DETECT-007**
- **Title**: Implement greenfield project detection logic
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Method `detectGreenfieldProject()` returns true for projects with no/minimal codebase
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  private async detectGreenfieldProject(projectPath: string): Promise<boolean> {
    // Logic: no codebase OR minimal files + has PRD
  }
  ```
- **Impact**: Method addition to existing class
- **Rollback**: Remove method
- **Verification**: Correctly identifies greenfield projects

### **P2-DETECT-008**
- **Title**: Implement existing project detection logic
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Method `detectExistingProject()` returns true for projects with established codebase
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  private async detectExistingProject(projectPath: string): Promise<boolean> {
    // Logic: has codebase + tests + documentation
  }
  ```
- **Impact**: Method addition to existing class
- **Rollback**: Remove method
- **Verification**: Correctly identifies existing projects

### **P2-DETECT-009**
- **Title**: Implement legacy project detection logic
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Method `detectLegacyProject()` returns true for projects with outdated dependencies/patterns
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  private async detectLegacyProject(projectPath: string): Promise<boolean> {
    // Logic: old dependencies + large codebase + technical debt indicators
  }
  ```
- **Impact**: Method addition to existing class
- **Rollback**: Remove method
- **Verification**: Correctly identifies legacy projects

### **P2-DETECT-010**
- **Title**: Implement workflow recommendation logic
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Method `recommendWorkflow()` returns appropriate workflow based on project stage
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  private recommendWorkflow(stage: string, analysis: Partial<ProjectStageAnalysis>): string {
    // Map stage to workflow type
  }
  ```
- **Impact**: Method addition to existing class
- **Rollback**: Remove method
- **Verification**: Returns correct workflow for each project stage

### **P2-DETECT-011**
- **Title**: Complete analyzeProjectStage main method implementation
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Main method orchestrates all detection methods and returns complete ProjectStageAnalysis
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  async analyzeProjectStage(projectPath: string): Promise<ProjectStageAnalysis> {
    // Orchestrate all detection methods
  }
  ```
- **Impact**: Method implementation completion
- **Rollback**: Restore placeholder implementation
- **Verification**: Returns complete analysis for test projects

### **P2-DETECT-012**
- **Title**: Create unit test for codebase existence detection
- **File**: `src/tools/vibe-task-manager/__tests__/services/project-stage-detector.test.ts`
- **Acceptance Criteria**: Test validates codebase detection for empty, minimal, and full projects
- **Complexity**: Simple
- **Impact**: New test file
- **Rollback**: Delete test file
- **Verification**: Test passes with 100% coverage

### **P2-DETECT-013**
- **Title**: Create unit test for PRD detection
- **File**: `src/tools/vibe-task-manager/__tests__/services/project-stage-detector.test.ts`
- **Acceptance Criteria**: Test validates PRD detection for various document formats and locations
- **Complexity**: Simple
- **Impact**: Addition to test file
- **Rollback**: Remove test cases
- **Verification**: Test passes with 100% coverage

### **P2-DETECT-014**
- **Title**: Create unit test for project stage classification
- **File**: `src/tools/vibe-task-manager/__tests__/services/project-stage-detector.test.ts`
- **Acceptance Criteria**: Test validates correct stage assignment for greenfield, existing, and legacy projects
- **Complexity**: Medium
- **Impact**: Addition to test file
- **Rollback**: Remove test cases
- **Verification**: Test passes with 100% coverage

### **P2-DETECT-015**
- **Title**: Create integration test with real project samples
- **File**: `src/tools/vibe-task-manager/__tests__/integration/project-stage-detection.test.ts`
- **Acceptance Criteria**: Test validates stage detection using actual project directory structures
- **Complexity**: Medium
- **Impact**: New integration test file
- **Rollback**: Delete test file
- **Verification**: Test passes with real project samples

### **P2-DETECT-016**
- **Title**: Add project stage detector to dependency injection
- **File**: `src/tools/vibe-task-manager/services/index.ts`
- **Acceptance Criteria**: ProjectStageDetector exported and available for injection
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  export { ProjectStageDetector } from './project-stage-detector.js';
  ```
- **Impact**: Export addition
- **Rollback**: Remove export
- **Verification**: Service can be imported by other modules

### **P2-DETECT-017**
- **Title**: Integrate project stage detection in decomposition service
- **File**: `src/tools/vibe-task-manager/services/decomposition-service.ts`
- **Acceptance Criteria**: Decomposition service uses project stage analysis to inform task generation
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  const stageAnalysis = await this.projectStageDetector.analyzeProjectStage(projectPath);
  ```
- **Impact**: Integration with existing service
- **Rollback**: Remove stage analysis usage
- **Verification**: Decomposition adapts based on project stage

### **P2-DETECT-018**
- **Title**: Add project stage to task context
- **File**: `src/tools/vibe-task-manager/types/task-context.ts`
- **Acceptance Criteria**: TaskContext interface includes projectStage field
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  export interface TaskContext {
    // existing fields...
    projectStage?: ProjectStageAnalysis;
  }
  ```
- **Impact**: Type definition update
- **Rollback**: Remove field from interface
- **Verification**: TypeScript compilation succeeds

### **P2-DETECT-019**
- **Title**: Create project stage caching mechanism
- **File**: `src/tools/vibe-task-manager/services/project-stage-cache.ts`
- **Acceptance Criteria**: Cache stores project stage analysis with TTL to avoid repeated analysis
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  export class ProjectStageCache {
    async get(projectPath: string): Promise<ProjectStageAnalysis | null> {
      // Cache implementation
    }
  }
  ```
- **Impact**: New caching service
- **Rollback**: Delete new file
- **Verification**: Cache stores and retrieves analysis correctly

### **P2-DETECT-020**
- **Title**: Integrate caching in project stage detector
- **File**: `src/tools/vibe-task-manager/services/project-stage-detector.ts`
- **Acceptance Criteria**: Detector checks cache before performing analysis
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  const cached = await this.cache.get(projectPath);
  if (cached) return cached;
  ```
- **Impact**: Cache integration
- **Rollback**: Remove cache usage
- **Verification**: Analysis uses cache when available

### **P2-DETECT-021 to P2-DETECT-040** ⭐ **CHECKPOINT 3**
- **Pattern**: Advanced detection features
- **Scope**: Git history analysis, dependency age detection, technical debt scoring
- **Focus**: Enhanced project classification accuracy
- **Complexity**: Medium (60%) / Simple (40%)

### **P2-DETECT-041 to P2-DETECT-080**
- **Pattern**: Edge case handling and optimization
- **Scope**: Monorepo detection, multi-language projects, performance optimization
- **Focus**: Robust detection for complex project structures
- **Complexity**: Medium (70%) / Simple (30%)

---

## 🎯 CATEGORY B: CONTEXT ENRICHMENT INTELLIGENCE (76 tasks)

### **P2-ENRICH-001**
- **Title**: Create intelligent trigger decision engine interface
- **File**: `src/tools/vibe-task-manager/types/trigger-engine.ts`
- **Acceptance Criteria**: Interface defines methods for codemap and research trigger decisions
- **Complexity**: Simple
- **Code Snippet**:
  ```typescript
  export interface TriggerDecisionEngine {
    shouldGenerateCodemap(context: TaskContext): Promise<boolean>;
    shouldPerformResearch(context: TaskContext): Promise<boolean>;
  }
  ```
- **Impact**: New type definition
- **Rollback**: Delete new file
- **Verification**: Interface compiles correctly

### **P2-ENRICH-002**
- **Title**: Implement intelligent codemap trigger logic
- **File**: `src/tools/vibe-task-manager/services/intelligent-trigger-engine.ts`
- **Acceptance Criteria**: Method decides codemap generation based on project stage, task complexity, and cache status
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  async shouldGenerateCodemap(context: TaskContext): Promise<boolean> {
    // Logic based on project stage and task requirements
  }
  ```
- **Impact**: New service implementation
- **Rollback**: Delete new file
- **Verification**: Returns appropriate decisions for different scenarios

### **P2-ENRICH-003**
- **Title**: Implement intelligent research trigger logic
- **File**: `src/tools/vibe-task-manager/services/intelligent-trigger-engine.ts`
- **Acceptance Criteria**: Method decides research necessity based on project stage, task domain, and knowledge gaps
- **Complexity**: Medium
- **Code Snippet**:
  ```typescript
  async shouldPerformResearch(context: TaskContext): Promise<boolean> {
    // Logic for greenfield vs existing project research needs
  }
  ```
- **Impact**: Method addition to service
- **Rollback**: Remove method
- **Verification**: Triggers research appropriately for greenfield projects

### **P2-ENRICH-004 to P2-ENRICH-076** ⭐ **CHECKPOINT 4**
- **Pattern**: Context-aware enrichment strategies
- **Scope**: Stage-specific workflows, performance optimization, user preferences
- **Focus**: Intelligent context enrichment based on project characteristics
- **Complexity**: Medium (65%) / Simple (35%)

---

## 📊 PHASE 2 SUMMARY

**Total Tasks**: 156
- **Simple**: 89 tasks (57%)
- **Medium**: 67 tasks (43%)

**Key Deliverables**:
- ✅ Automatic project stage detection (greenfield/existing/legacy)
- ✅ Intelligent codemap and research triggering
- ✅ Context-aware task generation workflows
- ✅ Performance-optimized enrichment strategies

**Verification Strategy**: Comprehensive testing with real project samples, performance benchmarking, user acceptance testing
