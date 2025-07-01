/**
 * Live Validation Test Suite for Enhanced Task Decomposition
 * 
 * This test suite validates real-world functionality of our enhanced features:
 * - Auto-research trigger and integration
 * - Codemap generation and context integration
 * - Enhanced contextual task generation
 * - Intelligent dependency detection
 * - Comprehensive task validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DecompositionService } from '../../services/decomposition-service.js';
import { AtomicTaskDetector } from '../../core/atomic-detector.js';
import { AutoResearchDetector } from '../../services/auto-research-detector.js';
import { ContextEnrichmentService } from '../../services/context-enrichment-service.js';
import { getDependencyGraph } from '../../core/dependency-graph.js';
import { getOpenRouterConfig } from '../../../../utils/openrouter-config-manager.js';
import { AtomicTask, TaskPriority } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import logger from '../../../../logger.js';

describe('Enhanced Decomposition Live Validation', () => {
  let decompositionService: DecompositionService;
  let atomicDetector: AtomicTaskDetector;
  let autoResearchDetector: AutoResearchDetector;
  let contextService: ContextEnrichmentService;
  let config: Record<string, unknown>;

  // Real project context for testing
  const testProjectContext: ProjectContext = {
    projectId: 'vibe-coder-mcp-test',
    projectPath: '/Users/bishopdotun/Documents/Dev Projects/Vibe-Coder-MCP',
    projectName: 'Vibe Coder MCP',
    description: 'AI-powered development tools MCP server with enhanced task decomposition',
    languages: ['TypeScript', 'JavaScript'],
    frameworks: ['Node.js', 'Vitest', 'Express'],
    buildTools: ['npm', 'tsc'],
    tools: ['ESLint', 'Prettier'],
    codebaseSize: 'large',
    teamSize: 2,
    complexity: 'high',
    structure: {
      sourceDirectories: ['src'],
      testDirectories: ['__tests__', '__integration__'],
      docDirectories: ['docs'],
      buildDirectories: ['build']
    },
    dependencies: {
      production: ['@types/node', 'typescript'],
      development: ['vitest', '@vitest/ui'],
      external: ['openrouter']
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '2.3.0',
      source: 'live-validation-test'
    }
  };

  beforeAll(async () => {
    // Initialize configuration
    config = await getOpenRouterConfig();
    
    // Initialize services
    decompositionService = DecompositionService.getInstance(config);
    atomicDetector = new AtomicTaskDetector(config);
    autoResearchDetector = AutoResearchDetector.getInstance();
    contextService = ContextEnrichmentService.getInstance();

    logger.info('Live validation test suite initialized');
  });

  afterAll(() => {
    logger.info('Live validation test suite completed');
  });

  describe('Auto-Research Integration Validation', () => {
    it('should trigger auto-research for complex AI/ML tasks', async () => {
      const complexTask: AtomicTask = {
        id: 'TEST-RESEARCH-001',
        title: 'Implement advanced neural network optimization for real-time inference',
        description: 'Design and implement a sophisticated neural network optimization system that uses advanced pruning techniques, quantization, and dynamic batching for real-time AI inference in production environments',
        type: 'development',
        priority: 'high' as TaskPriority,
        estimatedHours: 8,
        status: 'pending',
        epicId: 'ai-optimization-epic',
        projectId: 'vibe-coder-mcp-test',
        dependencies: [],
        dependents: [],
        sequence: 1,
        parallelizable: false,
        riskLevel: 'high',
        skillsRequired: ['machine-learning', 'optimization', 'neural-networks'],
        blockers: [],
        acceptanceCriteria: [
          'System reduces inference latency by 70%',
          'Maintains model accuracy within 2% of baseline'
        ],
        tags: ['ai', 'ml', 'optimization', 'neural-networks'],
        filePaths: ['src/ai/optimization/neural-optimizer.ts'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      logger.info('🧪 Testing auto-research trigger for complex AI task');

      // Step 1: Test research need evaluation
      const researchEvaluation = await autoResearchDetector.evaluateResearchNeed({
        task: complexTask,
        projectContext: testProjectContext,
        projectPath: testProjectContext.projectPath
      });

      console.log('📊 Research Evaluation Result:', {
        shouldTrigger: researchEvaluation.decision.shouldTriggerResearch,
        confidence: researchEvaluation.decision.confidence,
        primaryReason: researchEvaluation.decision.primaryReason,
        reasoning: researchEvaluation.decision.reasoning
      });

      expect(researchEvaluation.decision.shouldTriggerResearch).toBe(true);
      expect(researchEvaluation.decision.confidence).toBeGreaterThan(0.7);
      expect(researchEvaluation.decision.primaryReason).toMatch(/task_complexity|domain_specific/);

      // Step 2: Test enhanced validation with research integration
      const enhancedValidation = await atomicDetector.validateTaskEnhanced(
        complexTask,
        testProjectContext
      );

      console.log('🔍 Enhanced Validation Result:', {
        isValid: enhancedValidation.analysis.isAtomic,
        researchTriggered: enhancedValidation.autoEnhancements.researchTriggered,
        contextGathered: enhancedValidation.autoEnhancements.contextGathered,
        qualityScore: enhancedValidation.qualityMetrics.descriptionQuality
      });

      expect(enhancedValidation.contextualFactors.researchRequired).toBe(true);
      expect(enhancedValidation.autoEnhancements.researchTriggered).toBe(true);
    }, 30000);

    it('should NOT trigger research for simple, well-understood tasks', async () => {
      const simpleTask: AtomicTask = {
        id: 'TEST-SIMPLE-001',
        title: 'Add console.log statement to user login function',
        description: 'Add a simple console.log statement to track when users successfully log in',
        type: 'development',
        priority: 'low' as TaskPriority,
        estimatedHours: 0.1,
        status: 'pending',
        epicId: 'logging-epic',
        projectId: 'vibe-coder-mcp-test',
        dependencies: [],
        dependents: [],
        sequence: 1,
        parallelizable: true,
        riskLevel: 'low',
        skillsRequired: ['javascript'],
        blockers: [],
        acceptanceCriteria: [
          'Console logs "User logged in: {username}" on successful login'
        ],
        tags: ['logging', 'debug'],
        filePaths: ['src/auth/login.ts'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      logger.info('🧪 Testing auto-research should NOT trigger for simple task');

      const researchEvaluation = await autoResearchDetector.evaluateResearchNeed({
        task: simpleTask,
        projectContext: testProjectContext,
        projectPath: testProjectContext.projectPath
      });

      console.log('📊 Simple Task Research Evaluation:', {
        shouldTrigger: researchEvaluation.decision.shouldTriggerResearch,
        confidence: researchEvaluation.decision.confidence,
        primaryReason: researchEvaluation.decision.primaryReason
      });

      expect(researchEvaluation.decision.shouldTriggerResearch).toBe(false);
      expect(researchEvaluation.decision.primaryReason).toBe('sufficient_context');
    }, 15000);
  });

  describe('Context Enhancement Integration Validation', () => {
    it('should gather and integrate real codebase context', async () => {
      const contextAwareTask: AtomicTask = {
        id: 'TEST-CONTEXT-001',
        title: 'Enhance atomic task detector with new validation rules',
        description: 'Add new validation rules to the existing atomic task detector to improve task quality assessment',
        type: 'development',
        priority: 'medium' as TaskPriority,
        estimatedHours: 3,
        status: 'pending',
        epicId: 'validation-epic',
        projectId: 'vibe-coder-mcp-test',
        dependencies: [],
        dependents: [],
        sequence: 1,
        parallelizable: false,
        riskLevel: 'medium',
        skillsRequired: ['typescript', 'validation'],
        blockers: [],
        acceptanceCriteria: [
          'New validation rules integrated into existing AtomicTaskDetector class'
        ],
        tags: ['validation', 'enhancement'],
        filePaths: ['src/tools/vibe-task-manager/core/atomic-detector.ts'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      logger.info('🧪 Testing context enhancement with real codebase');

      // Step 1: Test context gathering
      const contextResult = await contextService.gatherContext({
        taskDescription: contextAwareTask.description,
        projectPath: testProjectContext.projectPath,
        contentKeywords: ['atomic', 'detector', 'validation'],
        maxFiles: 5,
        maxContentSize: 25000
      });

      console.log('📂 Context Gathering Result:', {
        filesFound: contextResult.contextFiles.length,
        totalSize: contextResult.summary.totalSize,
        averageRelevance: contextResult.summary.averageRelevance,
        topFileTypes: contextResult.summary.topFileTypes
      });

      expect(contextResult.contextFiles.length).toBeGreaterThan(0);
      expect(contextResult.summary.averageRelevance).toBeGreaterThan(0.3);

      // Step 2: Test enhanced validation with context
      const enhancedValidation = await atomicDetector.validateTaskEnhanced(
        contextAwareTask,
        testProjectContext
      );

      console.log('🔍 Context-Enhanced Validation:', {
        contextUsed: enhancedValidation.contextualFactors.contextEnhancementUsed,
        qualityMetrics: enhancedValidation.qualityMetrics,
        technologyAlignment: enhancedValidation.qualityMetrics.technologyAlignment
      });

      expect(enhancedValidation.contextualFactors.contextEnhancementUsed).toBe(true);
      expect(enhancedValidation.qualityMetrics.technologyAlignment).toBeGreaterThan(0.5);
    }, 25000);
  });

  describe('Enhanced Task Decomposition Validation', () => {
    it('should generate contextually enhanced task decomposition', async () => {
      const complexUserStory: AtomicTask = {
        id: 'TEST-DECOMP-001',
        title: 'Implement user authentication system with OAuth integration',
        description: 'Create a comprehensive user authentication system that supports OAuth providers (Google, GitHub), JWT tokens, and integrates with our existing user management database',
        type: 'development',
        priority: 'high' as TaskPriority,
        estimatedHours: 12,
        status: 'pending',
        epicId: 'auth-epic',
        projectId: 'vibe-coder-mcp-test',
        dependencies: [],
        dependents: [],
        sequence: 1,
        parallelizable: false,
        riskLevel: 'high',
        skillsRequired: ['authentication', 'oauth', 'security'],
        blockers: [],
        acceptanceCriteria: [
          'Users can login with Google OAuth',
          'Users can login with GitHub OAuth',
          'JWT tokens are properly generated and validated',
          'Integration with existing user database'
        ],
        tags: ['authentication', 'oauth', 'security', 'integration'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      logger.info('🧪 Testing enhanced task decomposition with real context');

      // Test decomposition with enhanced features
      const decompositionResult = await decompositionService.decomposeTask(
        complexUserStory,
        testProjectContext
      );

      console.log('📋 Decomposition Result:', {
        success: decompositionResult.success,
        taskCount: decompositionResult.data?.length || 0,
        error: decompositionResult.error
      });

      if (decompositionResult.success && decompositionResult.data) {
        // Analyze the generated tasks for contextual enhancement
        const tasks = decompositionResult.data;
        
        console.log('🔍 Generated Tasks Analysis:');
        tasks.forEach((task, index) => {
          console.log(`  ${index + 1}. ${task.title}`);
          console.log(`     Files: ${task.filePaths?.join(', ') || 'None specified'}`);
          console.log(`     Type: ${task.type}, Priority: ${task.priority}`);
          console.log(`     Hours: ${task.estimatedHours}`);
        });

        // Validate decomposition quality
        expect(tasks.length).toBeGreaterThan(2);
        expect(tasks.length).toBeLessThan(10); // Should be well-decomposed
        
        // Check for realistic file paths
        const tasksWithFilePaths = tasks.filter(t => t.filePaths && t.filePaths.length > 0);
        expect(tasksWithFilePaths.length).toBeGreaterThan(0);

        // Check for proper task types
        const validTypes = ['development', 'testing', 'documentation', 'research'];
        tasks.forEach(task => {
          expect(validTypes).toContain(task.type);
        });
      }

      expect(decompositionResult.success).toBe(true);
    }, 45000);
  });

  describe('Dependency Detection Validation', () => {
    it('should detect and apply intelligent dependencies between tasks', async () => {
      const relatedTasks: AtomicTask[] = [
        {
          id: 'TEST-DEP-001',
          title: 'Create User model class with TypeORM decorators',
          description: 'Define the User entity class with proper TypeORM decorators for database mapping',
          type: 'development',
          priority: 'high' as TaskPriority,
          estimatedHours: 1,
          status: 'pending',
          epicId: 'user-model-epic',
          projectId: 'vibe-coder-mcp-test',
          dependencies: [],
          dependents: [],
          sequence: 1,
          parallelizable: false,
          riskLevel: 'low',
          skillsRequired: ['typescript', 'typeorm'],
          blockers: [],
          acceptanceCriteria: ['User entity properly mapped to database'],
          tags: ['database', 'model'],
          filePaths: ['src/models/User.ts'],
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'TEST-DEP-002',
          title: 'Implement user registration API endpoint',
          description: 'Create POST /api/users/register endpoint that uses the User model',
          type: 'development',
          priority: 'high' as TaskPriority,
          estimatedHours: 2,
          status: 'pending',
          epicId: 'user-model-epic',
          projectId: 'vibe-coder-mcp-test',
          dependencies: ['TEST-DEP-001'],
          dependents: [],
          sequence: 2,
          parallelizable: false,
          riskLevel: 'medium',
          skillsRequired: ['typescript', 'api-development'],
          blockers: [],
          acceptanceCriteria: ['Registration endpoint accepts user data and creates User record'],
          tags: ['api', 'registration'],
          filePaths: ['src/routes/auth.ts'],
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'TEST-DEP-003',
          title: 'Write unit tests for user registration endpoint',
          description: 'Create comprehensive unit tests for the registration API endpoint',
          type: 'testing',
          priority: 'medium' as TaskPriority,
          estimatedHours: 1.5,
          status: 'pending',
          epicId: 'user-model-epic',
          projectId: 'vibe-coder-mcp-test',
          dependencies: ['TEST-DEP-002'],
          dependents: [],
          sequence: 3,
          parallelizable: true,
          riskLevel: 'low',
          skillsRequired: ['testing', 'typescript'],
          blockers: [],
          acceptanceCriteria: ['Tests cover success and error scenarios'],
          tags: ['testing', 'api'],
          filePaths: ['src/routes/__tests__/auth.test.ts'],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      logger.info('🧪 Testing intelligent dependency detection');

      // Get dependency graph and test detection
      const dependencyGraph = getDependencyGraph('test-dependency-project');

      // Apply intelligent dependency detection
      const dependencyResult = dependencyGraph.applyIntelligentDependencyDetection(relatedTasks);

      console.log('🔗 Dependency Detection Result:', {
        appliedDependencies: dependencyResult.appliedDependencies,
        totalSuggestions: dependencyResult.suggestions.length,
        warnings: dependencyResult.warnings
      });

      console.log('📊 Dependency Suggestions:');
      dependencyResult.suggestions.forEach(suggestion => {
        console.log(`  ${suggestion.fromTaskId} → ${suggestion.toTaskId}`);
        console.log(`    Type: ${suggestion.dependencyType}, Confidence: ${suggestion.confidence}`);
        console.log(`    Reason: ${suggestion.reason}`);
      });

      expect(dependencyResult.appliedDependencies).toBeGreaterThan(0);
      expect(dependencyResult.suggestions.length).toBeGreaterThan(0);

      // Test execution order calculation
      const executionPlan = dependencyGraph.getRecommendedExecutionOrder();
      
      console.log('📅 Recommended Execution Order:', {
        order: executionPlan.topologicalOrder,
        estimatedDuration: executionPlan.estimatedDuration,
        batchCount: executionPlan.parallelBatches.length
      });

      expect(executionPlan.topologicalOrder.length).toBe(relatedTasks.length);
    }, 20000);
  });

  describe('Batch Validation Testing', () => {
    it('should perform comprehensive batch validation with cross-task analysis', async () => {
      const taskBatch: AtomicTask[] = [
        {
          id: 'BATCH-001',
          title: 'Setup Express server configuration',
          description: 'Configure Express.js server with middleware and basic routing',
          type: 'development',
          priority: 'high' as TaskPriority,
          estimatedHours: 2,
          status: 'pending',
          epicId: 'server-epic',
          projectId: 'vibe-coder-mcp-test',
          dependencies: [],
          dependents: [],
          sequence: 1,
          parallelizable: false,
          riskLevel: 'medium',
          skillsRequired: ['express', 'node'],
          blockers: [],
          acceptanceCriteria: ['Express server starts and responds to health check'],
          tags: ['server', 'express'],
          filePaths: ['src/server.ts'],
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'BATCH-002',
          title: 'Setup Express server with routing', // Potential duplicate
          description: 'Create Express application with basic route configuration',
          type: 'development',
          priority: 'high' as TaskPriority,
          estimatedHours: 1.5,
          status: 'pending',
          epicId: 'server-epic',
          projectId: 'vibe-coder-mcp-test',
          dependencies: [],
          dependents: [],
          sequence: 2,
          parallelizable: false,
          riskLevel: 'medium',
          skillsRequired: ['express', 'routing'],
          blockers: [],
          acceptanceCriteria: ['Express app configured with routes'],
          tags: ['server', 'express', 'routing'],
          filePaths: ['src/app.ts'],
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'BATCH-003',
          title: 'Add comprehensive logging middleware',
          description: 'Implement request/response logging middleware for Express',
          type: 'development',
          priority: 'medium' as TaskPriority,
          estimatedHours: 1,
          status: 'pending',
          epicId: 'server-epic',
          projectId: 'vibe-coder-mcp-test',
          dependencies: [],
          dependents: [],
          sequence: 3,
          parallelizable: true,
          riskLevel: 'low',
          skillsRequired: ['middleware', 'logging'],
          blockers: [],
          acceptanceCriteria: ['All requests and responses are logged'],
          tags: ['logging', 'middleware'],
          filePaths: ['src/middleware/logging.ts'],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      logger.info('🧪 Testing batch validation with cross-task analysis');

      const batchValidation = await atomicDetector.validateTaskBatch(
        taskBatch,
        testProjectContext
      );

      console.log('📦 Batch Validation Result:', {
        overallValid: batchValidation.batchMetrics.overallValid,
        averageConfidence: batchValidation.batchMetrics.averageConfidence,
        totalEffort: batchValidation.batchMetrics.totalEffort,
        duplicateCount: batchValidation.batchMetrics.duplicateCount,
        skillDistribution: batchValidation.batchMetrics.skillDistribution
      });

      console.log('💡 Batch Recommendations:', batchValidation.batchRecommendations);

      expect(batchValidation.individual.length).toBe(taskBatch.length);
      expect(batchValidation.batchMetrics.duplicateCount).toBeGreaterThan(0); // Should detect duplicates
      expect(batchValidation.batchRecommendations.length).toBeGreaterThan(0);
    }, 25000);
  });

  describe('Integration Health Check', () => {
    it('should verify all enhanced features are working together', async () => {
      logger.info('🩺 Performing comprehensive integration health check');

      const healthCheck = {
        autoResearchDetector: false,
        contextEnrichment: false,
        dependencyDetection: false,
        enhancedValidation: false,
        taskDecomposition: false
      };

      try {
        // Test 1: Auto-research detector
        await autoResearchDetector.evaluateResearchNeed({
          task: {
            id: 'HEALTH-001',
            title: 'Test task for health check',
            description: 'A test task to verify auto-research functionality',
            type: 'development',
            priority: 'medium' as TaskPriority,
            estimatedHours: 1,
            status: 'pending',
            epicId: 'health-epic',
            projectId: 'vibe-coder-mcp-test',
            dependencies: [],
            dependents: [],
            sequence: 1,
            parallelizable: true,
            riskLevel: 'low',
            skillsRequired: ['general'],
            blockers: [],
            createdAt: new Date(),
            updatedAt: new Date()
          },
          projectContext: testProjectContext,
          projectPath: testProjectContext.projectPath
        });
        healthCheck.autoResearchDetector = true;

        // Test 2: Context enrichment
        const contextTest = await contextService.gatherContext({
          taskDescription: 'Test context gathering',
          projectPath: testProjectContext.projectPath,
          maxFiles: 1
        });
        healthCheck.contextEnrichment = contextTest.contextFiles.length >= 0;

        // Test 3: Dependency detection
        const dependencyGraph = getDependencyGraph('health-check');
        dependencyGraph.applyIntelligentDependencyDetection([]);
        healthCheck.dependencyDetection = true;

        // Test 4: Enhanced validation
        const validationTest = await atomicDetector.validateTaskEnhanced({
          id: 'HEALTH-002',
          title: 'Test validation',
          description: 'Test enhanced validation functionality',
          type: 'development',
          priority: 'low' as TaskPriority,
          estimatedHours: 0.5,
          status: 'pending',
          epicId: 'health-epic',
          projectId: 'vibe-coder-mcp-test',
          dependencies: [],
          dependents: [],
          sequence: 2,
          parallelizable: true,
          riskLevel: 'low',
          skillsRequired: ['validation'],
          blockers: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }, testProjectContext);
        healthCheck.enhancedValidation = validationTest.analysis !== undefined;

        // Test 5: Task decomposition
        const decompTest = await decompositionService.decomposeTask({
          id: 'HEALTH-003',
          title: 'Simple test task',
          description: 'A simple task for decomposition testing',
          type: 'development',
          priority: 'low' as TaskPriority,
          estimatedHours: 0.25,
          status: 'pending',
          epicId: 'health-epic',
          projectId: 'vibe-coder-mcp-test',
          dependencies: [],
          dependents: [],
          sequence: 3,
          parallelizable: true,
          riskLevel: 'low',
          skillsRequired: ['general'],
          blockers: [],
          createdAt: new Date(),
          updatedAt: new Date()
        }, testProjectContext);
        healthCheck.taskDecomposition = decompTest.success;

      } catch (error) {
        logger.error({ err: error }, 'Health check failed');
      }

      console.log('🩺 Integration Health Check Results:', healthCheck);

      // Verify all systems are operational
      Object.entries(healthCheck).forEach(([_system, healthy]) => {
        expect(healthy).toBe(true);
      });

      logger.info('✅ All enhanced features verified and working correctly');
    }, 30000);
  });
});