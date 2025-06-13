# Vibe Task Manager - Implementation Guidelines

## 🌿 BRANCH INFORMATION

**Current Branch**: `task-manager-fix`
**All implementation work should be done on the existing `task-manager-fix` branch**

This simplified approach eliminates branch management complexity and provides:
- ✅ **Linear Development**: All 387 tasks on single branch
- ✅ **Simple Workflow**: No branch switching required
- ✅ **Easy Tracking**: Clear commit history with task IDs
- ✅ **Quick Rollback**: Simple git reset for any issues

## 📋 ATOMIC TASK EXECUTION FRAMEWORK

### **🎯 Task Execution Rules**

#### **Time Constraints**
- **Maximum Duration**: 10 minutes per atomic task
- **Minimum Duration**: 2 minutes (avoid over-atomization)
- **Focus Rule**: One specific change per task (one function, one file, one modification)
- **Verification Time**: Include 2-3 minutes for immediate verification

#### **Acceptance Criteria Standards**
- **Single Criterion**: Each task must have exactly ONE measurable success condition
- **Unambiguous**: Success/failure must be objectively determinable
- **Testable**: Criterion must be verifiable through automated or manual testing
- **Specific**: Avoid vague terms like "improve" or "enhance"

#### **Independence Requirements**
- **No Hidden Dependencies**: Tasks must be executable in any order within a phase
- **Self-Contained**: All required information included in task description
- **Rollback Capable**: Each task must include specific rollback instructions
- **Isolated Impact**: Changes confined to specified files/functions

---

## 🔧 DEVELOPMENT WORKFLOW

### **Pre-Implementation Setup**

#### **Current Branch**: `task-manager-fix`
**All implementation work should be done on the existing `task-manager-fix` branch**

#### **Environment Preparation**
```bash
# 1. Ensure you're on the correct branch
git checkout task-manager-fix
git pull origin task-manager-fix

# 2. Set up feature flags
export VIBE_TASK_MANAGER_ENHANCED_DETECTION=false
export VIBE_TASK_MANAGER_PRD_INTEGRATION=false
export VIBE_TASK_MANAGER_ISSUE_INTEGRATION=false

# 3. Verify test environment
npm test -- src/tools/vibe-task-manager/__tests__/ --run
```

#### **Task Execution Protocol**
```bash
# For each atomic task:
# 1. Ensure you're on task-manager-fix branch
git checkout task-manager-fix

# 2. Implement single change directly on branch
# (follow task specification exactly)

# 3. Verify immediately
npm test -- <specific-test-file>
npm run build

# 4. Commit with task ID
git add .
git commit -m "feat(task-manager): P1-FIX-001 - Replace hardcoded languages with dynamic detection"

# 5. Continue with next task on same branch
# (no branch switching needed)
```

### **Quality Assurance Checkpoints**

#### **Per-Task Verification**
- ✅ **Compilation**: TypeScript compiles without errors
- ✅ **Unit Tests**: All related tests pass
- ✅ **Integration**: No breaking changes to existing functionality
- ✅ **Performance**: No significant performance degradation
- ✅ **Security**: No new security vulnerabilities introduced

#### **Milestone Checkpoints**
- **Every 20-30 tasks**: Full test suite execution
- **Every 50 tasks**: Integration testing with other MCP tools
- **Phase completion**: End-to-end workflow validation

---

## 🛡️ ZERO IMPACT GUARANTEE

### **Isolation Boundaries**

#### **File System Boundaries**
```
✅ ALLOWED MODIFICATIONS:
src/tools/vibe-task-manager/
├── services/
├── types/
├── utils/
├── integrations/
├── __tests__/
└── cli/

❌ FORBIDDEN MODIFICATIONS:
src/tools/context-curator/
src/tools/code-map-generator/
src/tools/research-integration/
src/shared/ (without explicit isolation)
```

#### **API Compatibility**
- **Public Interfaces**: No breaking changes to exported functions
- **Configuration**: Maintain backward compatibility with existing configs
- **CLI Commands**: Preserve existing command signatures
- **Event Emissions**: Maintain existing event structure

#### **Dependency Management**
- **New Dependencies**: Must be isolated to vibe-task-manager
- **Shared Dependencies**: No version changes without impact analysis
- **Optional Dependencies**: Use feature flags for new integrations

### **Fallback Mechanisms**

#### **Graceful Degradation**
```typescript
// Example: Dynamic detection with fallback
try {
  const languages = await detectProjectLanguages(projectPath);
  return languages.length > 0 ? languages : ['javascript'];
} catch (error) {
  logger.warn('Project language detection failed, using fallback', error);
  return ['javascript'];
}
```

#### **Feature Flags**
```typescript
// Example: Feature flag implementation
if (process.env.VIBE_TASK_MANAGER_ENHANCED_DETECTION === 'true') {
  return await this.enhancedProjectDetection(projectPath);
} else {
  return await this.basicProjectDetection(projectPath);
}
```

---

## 📊 TESTING STRATEGY

### **Test Coverage Requirements**

#### **Unit Testing**
- **Coverage Target**: >95% for new code
- **Test Types**: Function-level, class-level, integration
- **Mock Strategy**: Minimal mocking, prefer real implementations
- **Test Data**: Use realistic project samples

#### **Integration Testing**
- **Scope**: Cross-service interactions within vibe-task-manager
- **External APIs**: Mock external services (GitHub, Jira, Notion)
- **Performance**: Validate response times under load
- **Error Handling**: Test failure scenarios and recovery

#### **End-to-End Testing**
- **Workflows**: Complete task generation workflows
- **Real Projects**: Test with actual project repositories
- **User Scenarios**: Validate common user interactions
- **Regression**: Ensure no functionality breaks

### **Test Execution Strategy**

#### **Continuous Testing**
```bash
# Run tests after each atomic task
npm test -- src/tools/vibe-task-manager/__tests__/path/to/specific.test.ts

# Run integration tests at checkpoints
npm test -- src/tools/vibe-task-manager/__tests__/integration/

# Run full suite at phase completion
npm test -- src/tools/vibe-task-manager/__tests__/
```

#### **Performance Benchmarking**
```bash
# Baseline measurement before changes
npm run benchmark -- vibe-task-manager

# Performance validation after major changes
npm run benchmark -- vibe-task-manager --compare-baseline
```

---

## 🔄 ROLLBACK PROCEDURES

### **Task-Level Rollback**

#### **Immediate Rollback (within same session)**
```bash
# Undo last commit
git reset --hard HEAD~1

# Restore specific file
git checkout HEAD~1 -- path/to/file.ts

# Revert specific changes
git revert <commit-hash>
```

#### **Delayed Rollback (after other changes)**
```bash
# Create rollback branch
git checkout -b rollback/P1-FIX-001

# Apply reverse changes as specified in task
# (follow task-specific rollback instructions)

# Test rollback
npm test

# Merge rollback
git checkout feature/vibe-task-manager-phase1
git merge rollback/P1-FIX-001
```

### **Phase-Level Rollback**

#### **Feature Flag Disable**
```bash
# Disable all new features
export VIBE_TASK_MANAGER_ENHANCED_DETECTION=false
export VIBE_TASK_MANAGER_PRD_INTEGRATION=false
export VIBE_TASK_MANAGER_ISSUE_INTEGRATION=false

# Restart services
npm run restart
```

#### **Branch Rollback**
```bash
# Rollback to specific commit on task-manager-fix branch
git checkout task-manager-fix
git reset --hard <backup-commit-hash>

# Or create backup branch before major changes
git checkout task-manager-fix
git checkout -b task-manager-fix-backup
git checkout task-manager-fix
```

---

## 📈 PROGRESS TRACKING

### **Task Completion Tracking**

#### **Progress Metrics**
- **Tasks Completed**: Count of finished atomic tasks
- **Test Coverage**: Percentage of new code covered by tests
- **Performance Impact**: Response time changes
- **Error Rate**: Frequency of task execution failures

#### **Quality Metrics**
- **Rollback Rate**: Percentage of tasks requiring rollback
- **Bug Discovery**: Issues found during verification
- **Integration Failures**: Cross-service compatibility issues
- **User Acceptance**: Feedback on new functionality

### **Reporting Framework**

#### **Daily Progress Report**
```markdown
## Daily Progress Report - Phase 1 Day 3

### Completed Tasks
- P1-FIX-001 ✅ Dynamic language detection utility
- P1-FIX-002 ✅ Dynamic framework detection utility
- P1-FIX-003 ✅ Dynamic tools detection utility

### In Progress
- P1-FIX-004 🔄 Import statements in decomposition handlers

### Blocked
- None

### Metrics
- Tasks Completed: 3/89 (3.4%)
- Test Coverage: 98.2%
- Performance Impact: +2ms average response time
- Issues Found: 0
```

#### **Milestone Report**
```markdown
## Checkpoint 1 Report - P1-FIX-030 Complete

### Summary
- 30 tasks completed successfully
- Zero rollbacks required
- All tests passing
- Performance within acceptable limits

### Key Achievements
- Hardcoded values 50% eliminated
- Dynamic project detection functional
- Error handling improved

### Next Steps
- Continue with default project/epic ID fixes
- Begin context enrichment improvements
- Prepare for Phase 2 planning
```

---

## 🎯 SUCCESS CRITERIA

### **Phase Completion Criteria**

#### **Phase 1 Success**
- ✅ Zero hardcoded language/framework values
- ✅ Dynamic project/epic ID detection
- ✅ All existing tests pass
- ✅ No breaking changes to public APIs
- ✅ Performance impact < 5%

#### **Phase 2 Success**
- ✅ Automatic project stage detection
- ✅ Context-aware triggering
- ✅ User preference system
- ✅ Performance impact < 10%

#### **Phase 3 Success**
- ✅ PRD parsing for 5+ formats
- ✅ Issue tracker integration
- ✅ End-to-end workflow validation
- ✅ Production-ready deployment

### **Overall Project Success**
- ✅ 387 atomic tasks completed
- ✅ Zero impact on other MCP tools
- ✅ Comprehensive test coverage
- ✅ User acceptance validation
- ✅ Performance benchmarks met
- ✅ Documentation updated
- ✅ Production deployment successful
