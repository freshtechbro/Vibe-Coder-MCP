/**
 * LLM Integration Tests for Vibe Task Manager
 * Tests real LLM functionality with actual OpenRouter API calls
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IntentRecognitionEngine } from '../../nl/intent-recognizer.js';
import { RDDEngine } from '../../core/rdd-engine.js';
import { TaskScheduler } from '../../services/task-scheduler.js';
import { OptimizedDependencyGraph } from '../../core/dependency-graph.js';
import { transportManager } from '../../../../services/transport-manager/index.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import type { AtomicTask, ProjectContext } from '../../types/project-context.js';
import logger from '../../../../logger.js';

// Extended timeout for real LLM calls
const LLM_TIMEOUT = 120000; // 2 minutes

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

describe('Vibe Task Manager - LLM Integration Tests', () => {
  let intentEngine: IntentRecognitionEngine;
  let rddEngine: RDDEngine;
  let taskScheduler: TaskScheduler;
  let testProjectContext: ProjectContext;

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

  describe('1. Intent Recognition with Real LLM', () => {
    it('should recognize task creation intents using OpenRouter API', async () => {
      const testInputs = [
        'Create a new task to implement user authentication',
        'I need to add a login feature to the application',
        'Please create a task for database migration'
      ];

      for (const input of testInputs) {
        const startTime = Date.now();
        const result = await intentEngine.recognizeIntent(input);
        const duration = Date.now() - startTime;

        expect(result).toBeDefined();
        expect(result.intent).toBe('create_task');
        expect(result.confidence).toBeGreaterThan(0.5);
        expect(duration).toBeLessThan(60000); // Should complete within 60 seconds

        logger.info({ 
          input: input.substring(0, 50) + '...', 
          intent: result.intent, 
          confidence: result.confidence, 
          duration 
        }, 'Intent recognition successful');
      }
    }, LLM_TIMEOUT);

    it('should recognize project management intents', async () => {
      const testCases = [
        { input: 'Show me all tasks in the project', expectedIntent: 'list_tasks' },
        { input: 'Create a new project for mobile app', expectedIntent: 'create_project' },
        { input: 'Update project configuration', expectedIntent: 'update_project' }
      ];

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
        }, 'Project intent recognition verified');
      }
    }, LLM_TIMEOUT);
  });

  describe('2. Task Decomposition with Real LLM', () => {
    it('should decompose complex tasks using OpenRouter API', async () => {
      const complexTask = createTestTask({
        id: 'llm-test-001',
        title: 'Implement User Authentication System',
        description: 'Create a complete user authentication system with login, registration, password reset, and session management for a Node.js application',
        priority: 'high',
        estimatedHours: 16,
        tags: ['authentication', 'security', 'backend'],
        projectId: 'vibe-coder-mcp',
        epicId: 'auth-epic-001'
      });

      const startTime = Date.now();
      const result = await rddEngine.decomposeTask(complexTask, testProjectContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();
      expect(result.subTasks.length).toBeGreaterThan(1); // Should break into multiple subtasks
      expect(duration).toBeLessThan(90000); // Should complete within 90 seconds

      // Verify subtasks have proper structure
      for (const subtask of result.subTasks) {
        expect(subtask.id).toBeDefined();
        expect(subtask.title).toBeDefined();
        expect(subtask.description).toBeDefined();
        expect(subtask.estimatedHours).toBeGreaterThan(0);
        expect(subtask.estimatedHours).toBeLessThanOrEqual(complexTask.estimatedHours);
      }

      logger.info({
        originalTask: complexTask.title,
        subtaskCount: result.subTasks.length,
        duration,
        totalEstimatedHours: result.subTasks.reduce((sum, task) => sum + task.estimatedHours, 0),
        subtaskTitles: result.subTasks.map(t => t.title),
        isAtomic: result.isAtomic
      }, 'Task decomposition successful');
    }, LLM_TIMEOUT);

    it('should handle technical tasks with proper context awareness', async () => {
      const technicalTask = createTestTask({
        id: 'llm-test-002',
        title: 'Optimize Database Query Performance',
        description: 'Analyze and optimize slow database queries in the TypeScript/Node.js application, implement indexing strategies, and add query caching',
        priority: 'medium',
        estimatedHours: 8,
        tags: ['database', 'performance', 'optimization', 'typescript'],
        projectId: 'vibe-coder-mcp',
        epicId: 'performance-epic-001'
      });

      const result = await rddEngine.decomposeTask(technicalTask, testProjectContext);

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();

      // Verify technical context is preserved
      const subtasks = result.subTasks;
      const hasDbRelatedTasks = subtasks.some(task =>
        task.description.toLowerCase().includes('database') ||
        task.description.toLowerCase().includes('query') ||
        task.description.toLowerCase().includes('index') ||
        task.description.toLowerCase().includes('performance')
      );

      expect(hasDbRelatedTasks).toBe(true);

      logger.info({
        technicalTask: technicalTask.title,
        subtaskCount: subtasks.length,
        technicalTermsFound: hasDbRelatedTasks,
        contextAware: true,
        isAtomic: result.isAtomic
      }, 'Technical task decomposition verified');
    }, LLM_TIMEOUT);
  });

  describe('3. Task Scheduling Algorithms', () => {
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
          (taskScheduler as any).config.algorithm = algorithm;
          
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

  describe('4. End-to-End Workflow with Real LLM', () => {
    it('should execute complete workflow: intent → decomposition → scheduling', async () => {
      const workflowStartTime = Date.now();

      // Step 1: Intent Recognition
      const userInput = 'Create a task to implement email notification system with templates and queuing';
      const intentResult = await intentEngine.recognizeIntent(userInput);
      
      expect(intentResult.intent).toBe('create_task');
      expect(intentResult.confidence).toBeGreaterThan(0.5);

      // Step 2: Create task for decomposition
      const mainTask = createTestTask({
        id: 'workflow-test-001',
        title: 'Implement Email Notification System',
        description: 'Create a comprehensive email notification system with templates, queuing, and delivery tracking for the Node.js application',
        priority: 'high',
        estimatedHours: 12,
        tags: ['email', 'notifications', 'backend'],
        projectId: 'vibe-coder-mcp',
        epicId: 'notification-epic'
      });

      // Step 3: Decompose using real LLM
      const decompositionResult = await rddEngine.decomposeTask(mainTask, testProjectContext);

      expect(decompositionResult.success).toBe(true);
      expect(decompositionResult.subTasks.length).toBeGreaterThan(1);

      // Step 4: Schedule the decomposed tasks
      const dependencyGraph = new OptimizedDependencyGraph();
      decompositionResult.subTasks.forEach(task => dependencyGraph.addTask(task));

      const schedule = await taskScheduler.generateSchedule(decompositionResult.subTasks, dependencyGraph, 'vibe-coder-mcp');

      expect(schedule.scheduledTasks.size).toBe(decompositionResult.subTasks.length);

      const workflowDuration = Date.now() - workflowStartTime;
      expect(workflowDuration).toBeLessThan(180000); // Should complete within 3 minutes

      logger.info({ 
        workflowSteps: 4,
        totalDuration: workflowDuration,
        intentConfidence: intentResult.confidence,
        originalTask: mainTask.title,
        subtaskCount: decompositionResult.subTasks.length,
        scheduledTaskCount: schedule.scheduledTasks.size,
        success: true
      }, 'End-to-end workflow completed successfully');
    }, LLM_TIMEOUT * 1.5); // Extended timeout for full workflow
  });
});
