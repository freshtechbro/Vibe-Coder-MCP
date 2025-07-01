/**
 * LLM Integration Tests for Vibe Task Manager
 * Tests LLM functionality with mocked OpenRouter API calls for fast, reliable testing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { IntentRecognitionEngine } from '../../nl/intent-recognizer.js';
import { RDDEngine } from '../../core/rdd-engine.js';
import { TaskScheduler } from '../../services/task-scheduler.js';
import { OptimizedDependencyGraph } from '../../core/dependency-graph.js';
import { transportManager } from '../../../../services/transport-manager/index.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import type { AtomicTask, ProjectContext } from '../../types/project-context.js';
import logger from '../../../../logger.js';
import { 
  queueMockResponses, 
  setTestId, 
  clearMockQueue,
  clearAllMockQueues,
  MockQueueBuilder
} from '../../../../testUtils/mockLLM.js';

// Mock all external dependencies to avoid live LLM calls
vi.mock('../../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn().mockResolvedValue(JSON.stringify({
    isAtomic: true,
    confidence: 0.95,
    reasoning: 'Task is atomic and focused',
    estimatedHours: 0.1
  })),
  performFormatAwareLlmCall: vi.fn().mockResolvedValue(JSON.stringify({
    tasks: [{
      title: 'Test Subtask',
      description: 'Test subtask description',
      estimatedHours: 0.1,
      acceptanceCriteria: ['Test criteria'],
      priority: 'medium'
    }]
  }))
}));

// Optimized timeout for mocked LLM calls - performance target <2 seconds
const LLM_TIMEOUT = 2000; // 2 seconds - optimized for mock performance
const DECOMPOSITION_TIMEOUT = 3000; // 3 seconds for decomposition tests - reduced from 10s

// Helper function to create a complete AtomicTask for testing
function createTestTask(overrides: Partial<AtomicTask>): AtomicTask {
  const baseTask: AtomicTask = {
    id: 'test-task-001',
    title: 'Test Task',
    description: 'Test task description',
    status: 'pending',
    priority: 'medium',
    type: 'development',
    estimatedHours: 4,
    actualHours: 0,
    epicId: 'test-epic-001',
    projectId: 'test-project',
    dependencies: [],
    dependents: [],
    filePaths: ['src/test-file.ts'],
    acceptanceCriteria: ['Task should be completed successfully', 'All tests should pass'],
    testingRequirements: {
      unitTests: ['should test basic functionality'],
      integrationTests: ['should integrate with existing system'],
      performanceTests: ['should meet performance criteria'],
      coverageTarget: 80
    },
    performanceCriteria: {
      responseTime: '< 200ms',
      memoryUsage: '< 100MB'
    },
    qualityCriteria: {
      codeQuality: ['ESLint passing'],
      documentation: ['JSDoc comments'],
      typeScript: true,
      eslint: true
    },
    integrationCriteria: {
      compatibility: ['Node.js 18+'],
      patterns: ['MVC']
    },
    validationMethods: {
      automated: ['Unit tests'],
      manual: ['Code review']
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
    tags: ['test'],
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: ['test']
    }
  };

  return { ...baseTask, ...overrides };
}

describe.sequential('Vibe Task Manager - LLM Integration Tests', () => {
  let intentEngine: IntentRecognitionEngine;
  let rddEngine: RDDEngine;
  let taskScheduler: TaskScheduler;
  let testProjectContext: ProjectContext;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Set unique test ID for isolation
    const testId = `llm-integration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setTestId(testId);
    // Clear mock queue for this test
    clearMockQueue();
    
    // Set up comprehensive mock queue for all potential LLM calls
    const builder = new MockQueueBuilder();
    builder
      .addIntentRecognitions(10, 'create_task')
      .addAtomicDetections(20, true)
      .addTaskDecompositions(5, 2);
    builder.queueResponses();
  });

  afterEach(() => {
    // Clean up mock queue after each test
    clearMockQueue();
  });

  afterAll(() => {
    // Clean up all mock queues
    clearAllMockQueues();
  });

  beforeAll(async () => {
    // Get configuration for RDD engine
    const config = await getVibeTaskManagerConfig();
    const openRouterConfig = {
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      geminiModel: process.env.GEMINI_MODEL || 'google/gemini-2.5-flash-preview-05-20',
      perplexityModel: process.env.PERPLEXITY_MODEL || 'perplexity/llama-3.1-sonar-small-128k-online',
      llm_mapping: config?.llm?.llm_mapping || {}
    };

    // Initialize components
    intentEngine = new IntentRecognitionEngine();
    rddEngine = new RDDEngine(openRouterConfig);
    taskScheduler = new TaskScheduler({ enableDynamicOptimization: false });

    // Create realistic project context
    testProjectContext = {
      projectPath: process.cwd(),
      projectName: 'Vibe-Coder-MCP',
      description: 'AI-powered MCP server with task management capabilities',
      languages: ['typescript', 'javascript'],
      frameworks: ['node.js', 'express'],
      buildTools: ['npm', 'vitest'],
      tools: ['vscode', 'git', 'npm', 'vitest'],
      configFiles: ['package.json', 'tsconfig.json', 'vitest.config.ts'],
      entryPoints: ['src/index.ts'],
      architecturalPatterns: ['mvc', 'singleton'],
      codebaseSize: 'medium',
      teamSize: 3,
      complexity: 'medium',
      existingTasks: [],
      structure: {
        sourceDirectories: ['src'],
        testDirectories: ['src/**/__tests__'],
        docDirectories: ['docs'],
        buildDirectories: ['build', 'dist']
      },
      dependencies: {
        production: ['express', 'cors', 'dotenv'],
        development: ['vitest', 'typescript', '@types/node'],
        external: ['openrouter-api']
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.1.0',
        source: 'integration-test' as const
      }
    };

    logger.info('Starting LLM integration tests with real API calls');
  }, LLM_TIMEOUT);

  afterAll(async () => {
    try {
      await transportManager.stopAll();
      if (taskScheduler && typeof taskScheduler.dispose === 'function') {
        taskScheduler.dispose();
      }
    } catch (error) {
      logger.warn({ err: error }, 'Error during cleanup');
    }
  });

  describe.sequential('1. Intent Recognition with Mocked LLM', () => {
    it('should recognize task creation intents using mocked OpenRouter API', async () => {
      const testInputs = [
        'Create a new task to implement user authentication',
        'I need to add a login feature to the application',
        'Please create a task for database migration'
      ];

      for (const input of testInputs) {
        // Clear any previous mocks and set up fresh mock for each test
        vi.clearAllMocks();

        // Use queue-based mocking for proper test isolation
        queueMockResponses([{
          responseContent: {
            intent: 'create_task',  // Ensure this matches the expected intent
            confidence: 0.85,
            parameters: {
              task_title: 'implement user authentication',
              type: 'development'
            },
            context: {
              temporal: 'immediate',
              urgency: 'normal'
            },
            alternatives: []
          },
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'intent_recognition'
        }]);

        const startTime = Date.now();
        const result = await intentEngine.recognizeIntent(input);
        const duration = Date.now() - startTime;

        expect(result).toBeDefined();
        expect(result.intent).toBe('create_task');
        expect(result.confidence).toBeGreaterThan(0.5);
        expect(duration).toBeLessThan(1000); // Should complete within 1 second with mocks

        logger.info({
          input: input.substring(0, 50) + '...',
          intent: result.intent,
          confidence: result.confidence,
          duration
        }, 'Intent recognition successful (mocked)');
      }
    }, LLM_TIMEOUT);

    it('should recognize project management intents', async () => {
      // Clear previous mocks
      vi.clearAllMocks();

      // Set unique test ID for proper queue isolation
      const testId = `intent-project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setTestId(testId);

      // Set up ROBUST queue for all test cases in EXACT ORDER
      const testCases = [
        { input: 'Show me all tasks in the project', expectedIntent: 'list_tasks' },
        { input: 'Create a new project for mobile app', expectedIntent: 'create_project' },
        { input: 'Update project configuration', expectedIntent: 'update_project' }
      ];

      const intentRobustQueue = [
        // Responses for each test case in EXACT ORDER
        {
          responseContent: {
            intent: 'list_tasks',
            confidence: 0.75,
            parameters: {},
            context: {},
            alternatives: []
          },
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'intent_recognition'
        },
        {
          responseContent: {
            intent: 'create_project',
            confidence: 0.75,
            parameters: {},
            context: {},
            alternatives: []
          },
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'intent_recognition'
        },
        {
          responseContent: {
            intent: 'update_project',
            confidence: 0.75,
            parameters: {},
            context: {},
            alternatives: []
          },
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'intent_recognition'
        },
        // 20+ additional responses to handle any extra calls
        ...Array(20).fill(null).map(() => ({
          responseContent: {
            intent: 'create_task',
            confidence: 0.75,
            parameters: {},
            context: {},
            alternatives: []
          },
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'intent_recognition'
        }))
      ];

      queueMockResponses(intentRobustQueue);

      for (const testCase of testCases) {
        const result = await intentEngine.recognizeIntent(testCase.input);

        expect(result).toBeDefined();
        expect(result.intent).toBe(testCase.expectedIntent);
        expect(result.confidence).toBeGreaterThan(0.4);

        logger.info({
          input: testCase.input.substring(0, 30) + '...',
          expected: testCase.expectedIntent,
          actual: result.intent,
          confidence: result.confidence
        }, 'Project intent recognition verified (mocked)');
      }
    }, LLM_TIMEOUT);
  });

  describe.sequential('2. Task Decomposition with Mocked LLM', () => {
    it('should decompose complex tasks using mocked OpenRouter API', async () => {
      // Clear any previous mocks
      vi.clearAllMocks();

      // Set up ROBUST queue with sufficient responses to prevent exhaustion
      // Strategy: Provide 20+ responses to handle any recursive decomposition scenario
      const atomicDetectionResponse = {
        isAtomic: true,
        confidence: 0.98,  // HIGH CONFIDENCE to prevent recursion
        reasoning: 'Task is atomic and focused',
        estimatedHours: 0.1,
        complexityFactors: [],
        recommendations: []
      };

      const taskDecompositionResponse = {
        tasks: [
          {
            title: 'Create Email Input Component',
            description: 'Create the HTML email input field component',
            estimatedHours: 0.1,
            acceptanceCriteria: ['Email input field should be created'],
            priority: 'high',
            tags: ['frontend', 'component']
          },
          {
            title: 'Add Email Validation',
            description: 'Add client-side email format validation',
            estimatedHours: 0.08,
            acceptanceCriteria: ['Email validation should work correctly'],
            priority: 'high',
            tags: ['validation', 'frontend']
          }
        ]
      };

      // Create robust queue with 25 responses (mix of atomic detection and task decomposition)
      const robustQueue = [
        // Initial workflow responses
        { responseContent: { isAtomic: false, confidence: 0.9, reasoning: 'Task can be decomposed', estimatedHours: 0.18, complexityFactors: [], recommendations: [] }, model: /google\/gemini-2\.5-flash-preview/, operationType: 'atomic_detection' },
        { responseContent: taskDecompositionResponse, model: /google\/gemini-2\.5-flash-preview/, operationType: 'task_decomposition' },

        // 20+ atomic detection responses to handle any recursion
        ...Array(20).fill(null).map(() => ({
          responseContent: atomicDetectionResponse,
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'atomic_detection'
        })),

        // 3 additional task decomposition responses for edge cases
        ...Array(3).fill(null).map(() => ({
          responseContent: taskDecompositionResponse,
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'task_decomposition'
        }))
      ];

      queueMockResponses(robustQueue);

      const complexTask = createTestTask({
        id: 'llm-test-001',
        title: 'Add Email Field',
        description: 'Add an email input field to the login form with basic validation',
        priority: 'high',
        estimatedHours: 0.1, // Already atomic (6 minutes)
        acceptanceCriteria: ['Email field should validate format'], // Single criteria
        tags: ['authentication', 'frontend'],
        projectId: 'vibe-coder-mcp',
        epicId: 'auth-epic-001'
      });

      const startTime = Date.now();
      const result = await rddEngine.decomposeTask(complexTask, testProjectContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();
      expect(result.subTasks.length).toBeGreaterThanOrEqual(1);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds with mocks

      // Verify all subtasks are atomic (5-10 minutes, 1 acceptance criteria)
      for (const subtask of result.subTasks) {
        expect(subtask.id).toBeDefined();
        expect(subtask.title).toBeDefined();
        expect(subtask.description).toBeDefined();
        expect(subtask.estimatedHours).toBeGreaterThanOrEqual(0.08); // 5 minutes minimum
        expect(subtask.estimatedHours).toBeLessThanOrEqual(0.17); // 10 minutes maximum
        expect(subtask.acceptanceCriteria).toHaveLength(1); // Exactly 1 acceptance criteria
      }

      logger.info({
        originalTask: complexTask.title,
        subtaskCount: result.subTasks.length,
        duration,
        totalEstimatedHours: result.subTasks.reduce((sum, task) => sum + task.estimatedHours, 0),
        subtaskTitles: result.subTasks.map(t => t.title),
        isAtomic: result.isAtomic,
        enhancedValidationWorking: true,
        testOptimized: true,
        mocked: true
      }, 'Task decomposition successful with mocked LLM (fast testing)');
    }, DECOMPOSITION_TIMEOUT);

    it('should handle technical tasks with proper context awareness', async () => {
      // Clear any previous mocks
      vi.clearAllMocks();

      // Set up ROBUST queue for technical task decomposition
      const technicalAtomicResponse = {
        isAtomic: true,
        confidence: 0.98,  // HIGH CONFIDENCE to prevent recursion
        reasoning: 'Task is atomic and focused',
        estimatedHours: 0.08,
        complexityFactors: [],
        recommendations: []
      };

      const technicalDecompositionResponse = {
        tasks: [
          {
            title: 'Write Index Creation Script',
            description: 'Write SQL script to create index on users table email column',
            estimatedHours: 0.08,
            acceptanceCriteria: ['SQL script should create index correctly'],
            priority: 'medium',
            tags: ['database', 'sql']
          },
          {
            title: 'Test Index Performance',
            description: 'Test the created index for performance improvements',
            estimatedHours: 0.09,
            acceptanceCriteria: ['Index should improve query performance'],
            priority: 'medium',
            tags: ['database', 'testing']
          }
        ]
      };

      // Create robust queue with 25 responses
      const technicalRobustQueue = [
        // Initial workflow responses
        { responseContent: { isAtomic: false, confidence: 0.9, reasoning: 'SQL script task can be decomposed', estimatedHours: 0.15, complexityFactors: [], recommendations: [] }, model: /google\/gemini-2\.5-flash-preview/, operationType: 'atomic_detection' },
        { responseContent: technicalDecompositionResponse, model: /google\/gemini-2\.5-flash-preview/, operationType: 'task_decomposition' },

        // 20+ atomic detection responses to handle any recursion
        ...Array(20).fill(null).map(() => ({
          responseContent: technicalAtomicResponse,
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'atomic_detection'
        })),

        // 3 additional task decomposition responses for edge cases
        ...Array(3).fill(null).map(() => ({
          responseContent: technicalDecompositionResponse,
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'task_decomposition'
        }))
      ];

      queueMockResponses(technicalRobustQueue);

      // Use an already atomic technical task to avoid timeout
      const technicalTask = createTestTask({
        id: 'llm-test-002',
        title: 'Create Index Script',
        description: 'Write SQL script to create index on users table email column',
        priority: 'medium',
        estimatedHours: 0.1, // Already atomic (6 minutes)
        acceptanceCriteria: ['SQL script should create index correctly'], // Single criteria
        tags: ['database', 'performance'],
        projectId: 'vibe-coder-mcp',
        epicId: 'performance-epic-001'
      });

      const startTime = Date.now();
      const result = await rddEngine.decomposeTask(technicalTask, testProjectContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();

      // With our mock setup, should decompose into 2 subtasks
      expect(result.subTasks.length).toBe(2);
      expect(result.subTasks[0].title).toBe('Write Index Creation Script');
      expect(result.subTasks[1].title).toBe('Test Index Performance');

      // Verify all subtasks have proper structure
      for (const subtask of result.subTasks) {
        expect(subtask.estimatedHours).toBeGreaterThan(0);
        expect(subtask.acceptanceCriteria).toBeDefined();
        expect(Array.isArray(subtask.acceptanceCriteria)).toBe(true);
      }

      // Verify performance - should be much faster with mocks
      expect(duration).toBeLessThan(2000); // Should complete in <2 seconds

      // Verify technical context is preserved (check original task or subtasks)
      const allTasks = result.subTasks.length > 0 ? result.subTasks : [technicalTask];
      const hasDbRelatedTasks = allTasks.some(task =>
        task.description.toLowerCase().includes('database') ||
        task.description.toLowerCase().includes('index') ||
        task.description.toLowerCase().includes('sql') ||
        task.description.toLowerCase().includes('script')
      );

      expect(hasDbRelatedTasks).toBe(true);

      logger.info({
        technicalTask: technicalTask.title,
        subtaskCount: result.subTasks.length,
        technicalTermsFound: hasDbRelatedTasks,
        contextAware: true,
        isAtomic: result.isAtomic,
        atomicValidationPassed: true,
        testOptimized: true
      }, 'Technical task decomposition verified with enhanced validation (optimized for testing)');
    }, DECOMPOSITION_TIMEOUT);
  });

  describe.sequential('3. Task Scheduling Algorithms', () => {
    let testTasks: AtomicTask[];

    beforeAll(() => {
      // Create test tasks with realistic complexity
      testTasks = [
        createTestTask({
          id: 'sched-001',
          title: 'Critical Security Fix',
          priority: 'critical',
          estimatedHours: 3,
          dependents: ['sched-002'],
          tags: ['security', 'bugfix'],
          projectId: 'test',
          epicId: 'security-epic',
          description: 'Fix critical security vulnerability in authentication'
        }),
        createTestTask({
          id: 'sched-002',
          title: 'Update Security Tests',
          priority: 'high',
          estimatedHours: 2,
          dependencies: ['sched-001'],
          tags: ['testing', 'security'],
          projectId: 'test',
          epicId: 'security-epic',
          description: 'Update security tests after vulnerability fix'
        }),
        createTestTask({
          id: 'sched-003',
          title: 'Documentation Update',
          priority: 'low',
          estimatedHours: 1,
          tags: ['docs'],
          projectId: 'test',
          epicId: 'docs-epic',
          description: 'Update API documentation'
        })
      ];
    });

    it('should execute all scheduling algorithms successfully', async () => {
      const algorithms = ['priority_first', 'earliest_deadline', 'critical_path', 'resource_balanced', 'shortest_job', 'hybrid_optimal'];
      
      for (const algorithm of algorithms) {
        const startTime = Date.now();
        
        try {
          // Create dependency graph
          const dependencyGraph = new OptimizedDependencyGraph();
          testTasks.forEach(task => dependencyGraph.addTask(task));
          
          // Set algorithm on scheduler
          (taskScheduler as unknown as { config: { algorithm: string } }).config.algorithm = algorithm;
          
          // Generate schedule
          const schedule = await taskScheduler.generateSchedule(testTasks, dependencyGraph, 'test-project');
          const duration = Date.now() - startTime;
          
          expect(schedule).toBeDefined();
          expect(schedule.scheduledTasks).toBeDefined();
          expect(schedule.scheduledTasks.size).toBe(testTasks.length);
          expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
          
          logger.info({ 
            algorithm, 
            taskCount: schedule.scheduledTasks.size, 
            duration,
            success: true
          }, `${algorithm} scheduling algorithm verified`);
          
        } catch (error) {
          logger.error({ algorithm, err: error }, `${algorithm} scheduling algorithm failed`);
          throw error;
        }
      }
    });
  });

  describe.sequential('4. End-to-End Workflow with Mocked LLM', () => {
    it('should execute complete workflow: intent → decomposition → scheduling', async () => {
      // Clear any previous mocks
      vi.clearAllMocks();

      // Set up ROBUST queue for end-to-end workflow
      const workflowAtomicResponse = {
        isAtomic: true,
        confidence: 0.98,  // HIGH CONFIDENCE to prevent recursion
        reasoning: 'Task is atomic and focused',
        estimatedHours: 0.1,
        complexityFactors: [],
        recommendations: []
      };

      const workflowDecompositionResponse = {
        tasks: [
          {
            title: 'Create Basic Template',
            description: 'Create a basic HTML email template with placeholder text',
            estimatedHours: 0.1,
            acceptanceCriteria: ['Template should render correctly'],
            priority: 'high',
            tags: ['email', 'templates']
          },
          {
            title: 'Implement Notification Queue',
            description: 'Implement basic notification queuing system',
            estimatedHours: 0.1,
            acceptanceCriteria: ['Queue should process notifications'],
            priority: 'high',
            tags: ['email', 'queuing']
          }
        ]
      };

      const workflowIntentResponse = {
        intent: 'create_task',
        confidence: 0.85,
        parameters: {
          task_title: 'implement email notification system',
          type: 'development'
        },
        context: {
          temporal: 'immediate',
          urgency: 'normal'
        },
        alternatives: []
      };

      // Create robust queue with proper sequence for complex workflow
      const workflowRobustQueue = [
        // Step 1: Intent recognition
        { responseContent: workflowIntentResponse, model: /google\/gemini-2\.5-flash-preview/, operationType: 'intent_recognition' },

        // Step 2: Main task atomic detection (should be non-atomic)
        { responseContent: { isAtomic: false, confidence: 0, reasoning: 'Email notification system can be decomposed', estimatedHours: 0.2, complexityFactors: [], recommendations: [] }, model: /google\/gemini-2\.5-flash-preview/, operationType: 'atomic_detection' },

        // Step 3: Main task decomposition
        { responseContent: workflowDecompositionResponse, model: /google\/gemini-2\.5-flash-preview/, operationType: 'task_decomposition' },

        // Step 4: First subtask atomic detection (should be atomic)
        { responseContent: workflowAtomicResponse, model: /google\/gemini-2\.5-flash-preview/, operationType: 'atomic_detection' },

        // Step 5: Second subtask atomic detection (should be atomic to prevent further decomposition)
        { responseContent: workflowAtomicResponse, model: /google\/gemini-2\.5-flash-preview/, operationType: 'atomic_detection' },

        // Additional responses to handle any extra calls (all atomic to prevent recursion)
        ...Array(40).fill(null).map(() => ({
          responseContent: workflowAtomicResponse,
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'atomic_detection'
        })),

        // Additional intent recognition responses for any extra calls
        ...Array(5).fill(null).map(() => ({
          responseContent: workflowIntentResponse,
          model: /google\/gemini-2\.5-flash-preview/,
          operationType: 'intent_recognition'
        }))
      ];

      queueMockResponses(workflowRobustQueue);

      const workflowStartTime = Date.now();

      // Step 1: Intent Recognition
      const userInput = 'Create a task to implement email notification system with templates and queuing';
      const intentResult = await intentEngine.recognizeIntent(userInput);
      
      expect(intentResult.intent).toBe('create_task');
      expect(intentResult.confidence).toBe(0.85); // Exact match from mock

      // Step 2: Create task for decomposition
      const mainTask = createTestTask({
        id: 'workflow-test-001',
        title: 'Implement Email Notification System',
        description: 'Create email notification system with templates and queuing',
        priority: 'high',
        estimatedHours: 0.2, // Will be decomposed
        acceptanceCriteria: ['System should send email notifications'],
        tags: ['email', 'notifications'],
        projectId: 'vibe-coder-mcp',
        epicId: 'notification-epic'
      });

      // Step 3: Decompose using mocked LLM
      const decompositionResult = await rddEngine.decomposeTask(mainTask, testProjectContext);

      expect(decompositionResult.success).toBe(true);
      expect(decompositionResult.subTasks.length).toBe(2); // Should decompose into 2 tasks

      // Verify the decomposed subtasks match our mock
      expect(decompositionResult.subTasks[0].title).toBe('Create Basic Template');
      expect(decompositionResult.subTasks[1].title).toBe('Implement Notification Queue');

      // Verify all subtasks are atomic
      for (const subtask of decompositionResult.subTasks) {
        expect(subtask.estimatedHours).toBe(0.1); // Exact match from mock
        expect(subtask.acceptanceCriteria).toHaveLength(1); // Exactly 1 acceptance criteria
      }

      // Step 4: Schedule the decomposed tasks
      const dependencyGraph = new OptimizedDependencyGraph();
      decompositionResult.subTasks.forEach(task => dependencyGraph.addTask(task));

      const schedule = await taskScheduler.generateSchedule(decompositionResult.subTasks, dependencyGraph, 'vibe-coder-mcp');

      expect(schedule.scheduledTasks.size).toBe(decompositionResult.subTasks.length);

      const workflowDuration = Date.now() - workflowStartTime;
      expect(workflowDuration).toBeLessThan(2000); // Should complete in <2 seconds with mocks

      logger.info({
        workflowSteps: 4,
        totalDuration: workflowDuration,
        intentConfidence: intentResult.confidence,
        originalTask: mainTask.title,
        subtaskCount: decompositionResult.subTasks.length,
        scheduledTaskCount: schedule.scheduledTasks.size,
        success: true,
        enhancedValidationWorking: true,
        performanceOptimized: true
      }, 'End-to-end workflow completed successfully with enhanced validation and performance optimization');
    }, 5000); // 5 second timeout (much faster with mocks)
  });
});
