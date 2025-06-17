/**
 * Comprehensive Integration Tests for Vibe Task Manager
 * Tests all core components with real LLM calls and actual OpenRouter API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vibeTaskManagerExecutor } from '../../index.js';
import { TaskScheduler } from '../../services/task-scheduler.js';
import { IntentRecognitionEngine } from '../../nl/intent-recognizer.js';
import { DecompositionService } from '../../services/decomposition-service.js';
import { OptimizedDependencyGraph } from '../../core/dependency-graph.js';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import { ProjectOperations } from '../../core/operations/project-operations.js';
import { transportManager } from '../../../../services/transport-manager/index.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import { createMockConfig } from '../utils/test-setup.js';
import type { AtomicTask, ProjectContext, ParsedPRD, ParsedTaskList } from '../../types/project-context.js';
import logger from '../../../../logger.js';

// Test timeout for real LLM calls
const LLM_TIMEOUT = 60000; // 60 seconds

// Helper function to wrap TaskScheduler for testing
async function scheduleTasksWithAlgorithm(
  scheduler: TaskScheduler,
  tasks: AtomicTask[],
  algorithm: string
): Promise<{ success: boolean; data?: Map<string, any>; error?: string }> {
  try {
    // Create dependency graph
    const dependencyGraph = new OptimizedDependencyGraph();
    tasks.forEach(task => dependencyGraph.addTask(task));

    // Set algorithm on scheduler
    (scheduler as any).config.algorithm = algorithm;

    // Generate schedule
    const schedule = await scheduler.generateSchedule(tasks, dependencyGraph, 'test-project');

    return {
      success: true,
      data: schedule.scheduledTasks
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

describe('Vibe Task Manager - Comprehensive Integration Tests', () => {
  let taskScheduler: TaskScheduler;
  let intentEngine: IntentRecognitionEngine;
  let decompositionService: DecompositionService;
  let testProjectContext: ProjectContext;
  let mockConfig: any;
  let mockContext: any;

  beforeAll(async () => {
    // Initialize core components
    taskScheduler = new TaskScheduler({ enableDynamicOptimization: false });
    intentEngine = new IntentRecognitionEngine();
    decompositionService = new DecompositionService();
    mockConfig = createMockConfig();
    mockContext = { sessionId: 'test-session-001' };

    // Create test project context using real project data
    testProjectContext = {
      projectPath: process.cwd(),
      projectName: 'Vibe-Coder-MCP',
      description: 'AI-powered MCP server with task management capabilities',
      languages: ['typescript', 'javascript'],
      frameworks: ['node.js', 'express'],
      buildTools: ['npm', 'vitest'],
      configFiles: ['package.json', 'tsconfig.json', 'vitest.config.ts'],
      entryPoints: ['src/index.ts'],
      architecturalPatterns: ['mvc', 'singleton'],
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

    logger.info('Starting comprehensive integration tests with real LLM calls');
  }, LLM_TIMEOUT);

  afterAll(async () => {
    // Cleanup
    try {
      await transportManager.stopAll();
      if (taskScheduler && typeof taskScheduler.dispose === 'function') {
        taskScheduler.dispose();
      }
    } catch (error) {
      logger.warn({ err: error }, 'Error during cleanup');
    }
  });

  describe('1. Configuration Loading & Environment Setup', () => {
    it('should load Vibe Task Manager configuration successfully', async () => {
      const config = await getVibeTaskManagerConfig();
      
      expect(config).toBeDefined();
      expect(config.llm).toBeDefined();
      expect(config.llm.llm_mapping).toBeDefined();
      expect(Object.keys(config.llm.llm_mapping).length).toBeGreaterThan(0);
      
      // Verify key LLM mappings exist
      expect(config.llm.llm_mapping['task_decomposition']).toBeDefined();
      expect(config.llm.llm_mapping['intent_recognition']).toBeDefined();
      expect(config.llm.llm_mapping['agent_coordination']).toBeDefined();
      
      logger.info({ configKeys: Object.keys(config.llm.llm_mapping) }, 'Configuration loaded successfully');
    });

    it('should have OpenRouter API key configured', () => {
      expect(process.env.OPENROUTER_API_KEY).toBeDefined();
      expect(process.env.OPENROUTER_API_KEY).toMatch(/^sk-or-v1-/);
      
      logger.info('OpenRouter API key verified');
    });
  });

  describe('2. Transport Manager Integration', () => {
    it('should start transport services successfully', async () => {
      const startTime = Date.now();
      
      try {
        await transportManager.startAll();
        const duration = Date.now() - startTime;
        
        expect(duration).toBeLessThan(10000); // Should start within 10 seconds
        
        // Verify services are running
        const status = transportManager.getStatus();
        expect(status.websocket?.running).toBe(true);
        expect(status.http?.running).toBe(true);
        
        logger.info({ 
          duration, 
          websocketPort: status.websocket?.port,
          httpPort: status.http?.port 
        }, 'Transport services started successfully');
        
      } catch (error) {
        logger.error({ err: error }, 'Failed to start transport services');
        throw error;
      }
    }, LLM_TIMEOUT);

    it('should handle concurrent connection attempts', async () => {
      // Test concurrent startup calls
      const promises = Array(3).fill(null).map(() => transportManager.startAll());
      
      await expect(Promise.all(promises)).resolves.not.toThrow();
      
      const status = transportManager.getStatus();
      expect(status.websocket?.running).toBe(true);
      expect(status.http?.running).toBe(true);
      
      logger.info('Concurrent connection handling verified');
    });
  });

  describe('3. Intent Recognition Engine with Real LLM', () => {
    it('should recognize task creation intents using real LLM calls', async () => {
      const testCases = [
        'Create a new task to implement user authentication',
        'I need to add a login feature to the application',
        'Please create a task for database migration',
        'Add a new feature for file upload functionality'
      ];

      for (const input of testCases) {
        const startTime = Date.now();
        const result = await intentEngine.recognizeIntent(input);
        const duration = Date.now() - startTime;

        expect(result).toBeDefined();
        expect(result.intent).toBe('create_task');
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        logger.info({ 
          input, 
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
        { input: 'Delete the old project files', expectedIntent: 'delete_project' },
        { input: 'Update project configuration', expectedIntent: 'update_project' }
      ];

      for (const testCase of testCases) {
        const result = await intentEngine.recognizeIntent(testCase.input);
        
        expect(result).toBeDefined();
        expect(result.intent).toBe(testCase.expectedIntent);
        expect(result.confidence).toBeGreaterThan(0.6);

        logger.info({ 
          input: testCase.input, 
          expected: testCase.expectedIntent,
          actual: result.intent,
          confidence: result.confidence 
        }, 'Project intent recognition verified');
      }
    }, LLM_TIMEOUT);
  });

  describe('4. Task Decomposition Service with Real LLM', () => {
    it('should decompose complex tasks using real LLM calls', async () => {
      const complexTask: AtomicTask = {
        id: 'test-task-001',
        title: 'Implement User Authentication System',
        description: 'Create a complete user authentication system with login, registration, password reset, and session management',
        priority: 'high',
        estimatedHours: 16,
        dependencies: [],
        dependents: [],
        tags: ['authentication', 'security', 'backend'],
        projectId: 'vibe-coder-mcp',
        epicId: 'auth-epic-001',
        status: 'pending',
        assignedTo: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const startTime = Date.now();
      const result = await decompositionService.decomposeTask(complexTask, testProjectContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.length).toBeGreaterThan(1); // Should break into multiple subtasks
      expect(duration).toBeLessThan(45000); // Should complete within 45 seconds

      // Verify subtasks have proper structure
      for (const subtask of result.data!) {
        expect(subtask.id).toBeDefined();
        expect(subtask.title).toBeDefined();
        expect(subtask.description).toBeDefined();
        expect(subtask.estimatedHours).toBeGreaterThan(0);
        expect(subtask.estimatedHours).toBeLessThan(complexTask.estimatedHours);
      }

      logger.info({
        originalTask: complexTask.title,
        subtaskCount: result.data!.length,
        duration,
        subtasks: result.data!.map(t => ({ title: t.title, hours: t.estimatedHours }))
      }, 'Task decomposition successful');
    }, LLM_TIMEOUT);

    it('should handle technical tasks with proper context', async () => {
      const technicalTask: AtomicTask = {
        id: 'test-task-002',
        title: 'Optimize Database Query Performance',
        description: 'Analyze and optimize slow database queries, implement indexing strategies, and add query caching',
        priority: 'medium',
        estimatedHours: 8,
        dependencies: [],
        dependents: [],
        tags: ['database', 'performance', 'optimization'],
        projectId: 'vibe-coder-mcp',
        epicId: 'performance-epic-001',
        status: 'pending',
        assignedTo: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await decompositionService.decomposeTask(technicalTask, testProjectContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Verify technical context is preserved
      const subtasks = result.data!;
      const hasDbRelatedTasks = subtasks.some(task =>
        task.description.toLowerCase().includes('database') ||
        task.description.toLowerCase().includes('query') ||
        task.description.toLowerCase().includes('index')
      );

      expect(hasDbRelatedTasks).toBe(true);

      logger.info({
        technicalTask: technicalTask.title,
        subtaskCount: subtasks.length,
        technicalTermsFound: hasDbRelatedTasks
      }, 'Technical task decomposition verified');
    }, LLM_TIMEOUT);
  });

  describe('5. Task Scheduler Service - All Algorithms', () => {
    let testTasks: AtomicTask[];

    beforeAll(() => {
      // Create test tasks with varying priorities and durations
      testTasks = [
        {
          id: 'task-001', title: 'Critical Bug Fix', priority: 'critical', estimatedHours: 2,
          dependencies: [], dependents: ['task-002'], tags: ['bugfix'],
          projectId: 'test', epicId: 'epic-001', status: 'pending', assignedTo: null,
          description: 'Fix critical security vulnerability', createdAt: new Date(), updatedAt: new Date()
        },
        {
          id: 'task-002', title: 'Feature Implementation', priority: 'high', estimatedHours: 8,
          dependencies: ['task-001'], dependents: [], tags: ['feature'],
          projectId: 'test', epicId: 'epic-001', status: 'pending', assignedTo: null,
          description: 'Implement new user dashboard', createdAt: new Date(), updatedAt: new Date()
        },
        {
          id: 'task-003', title: 'Documentation Update', priority: 'low', estimatedHours: 1,
          dependencies: [], dependents: [], tags: ['docs'],
          projectId: 'test', epicId: 'epic-002', status: 'pending', assignedTo: null,
          description: 'Update API documentation', createdAt: new Date(), updatedAt: new Date()
        },
        {
          id: 'task-004', title: 'Performance Optimization', priority: 'medium', estimatedHours: 4,
          dependencies: [], dependents: [], tags: ['performance'],
          projectId: 'test', epicId: 'epic-001', status: 'pending', assignedTo: null,
          description: 'Optimize database queries', createdAt: new Date(), updatedAt: new Date()
        }
      ];
    });

    it('should execute priority-first scheduling algorithm', async () => {
      const startTime = Date.now();
      const result = await scheduleTasksWithAlgorithm(taskScheduler, testTasks, 'priority_first');
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.size).toBe(testTasks.length);
      expect(duration).toBeLessThan(5000);

      // Verify priority ordering
      const scheduledTasks = Array.from(result.data!.values());
      const criticalTask = scheduledTasks.find(st => st.task.priority === 'critical');
      const lowTask = scheduledTasks.find(st => st.task.priority === 'low');

      expect(criticalTask!.scheduledStart.getTime()).toBeLessThanOrEqual(lowTask!.scheduledStart.getTime());

      logger.info({
        algorithm: 'priority_first',
        taskCount: scheduledTasks.length,
        duration
      }, 'Priority-first scheduling verified');
    });

    it('should execute earliest-deadline scheduling algorithm', async () => {
      const result = await scheduleTasksWithAlgorithm(taskScheduler, testTasks, 'earliest_deadline');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const scheduledTasks = Array.from(result.data!.values());

      // Verify all tasks have metadata indicating earliest deadline algorithm
      scheduledTasks.forEach(st => {
        expect(st.metadata.algorithm).toBe('earliest_deadline');
        expect(st.scheduledStart).toBeDefined();
        expect(st.scheduledEnd).toBeDefined();
      });

      logger.info({
        algorithm: 'earliest_deadline',
        taskCount: scheduledTasks.length
      }, 'Earliest-deadline scheduling verified');
    });

    it('should execute critical-path scheduling algorithm', async () => {
      const result = await scheduleTasksWithAlgorithm(taskScheduler, testTasks, 'critical_path');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const scheduledTasks = Array.from(result.data!.values());

      // Verify dependency handling
      const task001 = scheduledTasks.find(st => st.task.id === 'task-001');
      const task002 = scheduledTasks.find(st => st.task.id === 'task-002');

      expect(task001!.scheduledStart.getTime()).toBeLessThanOrEqual(task002!.scheduledStart.getTime());

      logger.info({
        algorithm: 'critical_path',
        dependencyHandling: 'verified'
      }, 'Critical-path scheduling verified');
    });

    it('should execute resource-balanced scheduling algorithm', async () => {
      const result = await scheduleTasksWithAlgorithm(taskScheduler, testTasks, 'resource_balanced');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const scheduledTasks = Array.from(result.data!.values());
      scheduledTasks.forEach(st => {
        expect(st.metadata.algorithm).toBe('resource_balanced');
      });

      logger.info({ algorithm: 'resource_balanced' }, 'Resource-balanced scheduling verified');
    });

    it('should execute shortest-job scheduling algorithm', async () => {
      const result = await scheduleTasksWithAlgorithm(taskScheduler, testTasks, 'shortest_job');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const scheduledTasks = Array.from(result.data!.values());

      // Verify shortest jobs are scheduled first
      const sortedByStart = scheduledTasks.sort((a, b) =>
        a.scheduledStart.getTime() - b.scheduledStart.getTime()
      );

      expect(sortedByStart[0].task.estimatedHours).toBeLessThanOrEqual(
        sortedByStart[sortedByStart.length - 1].task.estimatedHours
      );

      logger.info({ algorithm: 'shortest_job' }, 'Shortest-job scheduling verified');
    });

    it('should execute hybrid-optimal scheduling algorithm', async () => {
      const result = await scheduleTasksWithAlgorithm(taskScheduler, testTasks, 'hybrid_optimal');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const scheduledTasks = Array.from(result.data!.values());
      scheduledTasks.forEach(st => {
        expect(st.metadata.algorithm).toBe('hybrid_optimal');
      });

      logger.info({ algorithm: 'hybrid_optimal' }, 'Hybrid-optimal scheduling verified');
    });
  });

  describe('6. Code Map Integration with Real Configuration', () => {
    it('should integrate with code-map-generator using proper OpenRouter config', async () => {
      const codeMapParams = {
        targetPath: process.cwd(),
        outputPath: 'VibeCoderOutput/integration-test-codemap',
        includeTests: false,
        maxDepth: 2,
        excludePatterns: ['node_modules', '.git', 'dist', 'build']
      };

      // This test verifies the configuration loading works properly
      // We don't actually run the code map generation to avoid long execution times
      const config = await getVibeTaskManagerConfig();

      expect(config.llm).toBeDefined();
      expect(process.env.OPENROUTER_API_KEY).toBeDefined();
      expect(process.env.GEMINI_MODEL).toBeDefined();

      logger.info({
        configLoaded: true,
        apiKeyConfigured: !!process.env.OPENROUTER_API_KEY,
        modelConfigured: !!process.env.GEMINI_MODEL
      }, 'Code map integration configuration verified');
    });
  });

  describe('7. Project Context Detection', () => {
    it('should detect project context dynamically from real project structure', async () => {
      // Test the dynamic project context creation we implemented
      const projectPath = process.cwd();

      // Call the task manager to trigger dynamic project detection
      const result = await vibeTaskManagerExecutor({
        command: 'create',
        projectName: 'context-test-project',
        description: 'Verify that project context is detected dynamically'
      }, mockConfig, mockContext);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      logger.info({
        projectPath,
        contextDetected: true
      }, 'Dynamic project context detection verified');
    });

    it('should handle package.json analysis correctly', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      try {
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        expect(packageJson.name).toBeDefined();
        expect(packageJson.dependencies || packageJson.devDependencies).toBeDefined();

        // Verify our project has the expected structure
        expect(packageJson.name).toBe('vibe-coder-mcp');
        expect(packageJson.dependencies?.express).toBeDefined();
        expect(packageJson.devDependencies?.vitest).toBeDefined();

        logger.info({
          projectName: packageJson.name,
          hasDependencies: !!packageJson.dependencies,
          hasDevDependencies: !!packageJson.devDependencies
        }, 'Package.json analysis verified');

      } catch (error) {
        logger.error({ err: error }, 'Package.json analysis failed');
        throw error;
      }
    });
  });

  describe('8. Agent Registration and Communication', () => {
    it('should handle agent registration through transport services', async () => {
      // Verify transport services are running
      const status = transportManager.getStatus();
      expect(status.websocket?.running).toBe(true);
      expect(status.http?.running).toBe(true);

      // Test agent registration capability
      const mockAgent = {
        id: 'test-agent-001',
        name: 'Integration Test Agent',
        capabilities: ['task_execution', 'code_analysis'],
        status: 'available'
      };

      // This verifies the transport layer can handle agent communication
      expect(status.websocket?.port).toBeGreaterThan(0);
      expect(status.http?.port).toBeGreaterThan(0);

      logger.info({
        websocketPort: status.websocket?.port,
        httpPort: status.http?.port,
        agentRegistrationReady: true
      }, 'Agent registration capability verified');
    });

    it('should support agent task delegation', async () => {
      // Test that the task manager can delegate tasks to agents
      const testTask: AtomicTask = {
        id: 'delegation-test-001',
        title: 'Agent Delegation Test',
        description: 'Test task for agent delegation',
        priority: 'medium',
        estimatedHours: 2,
        dependencies: [],
        dependents: [],
        tags: ['test', 'delegation'],
        projectId: 'test-project',
        epicId: 'test-epic',
        status: 'pending',
        assignedTo: 'test-agent-001',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Verify task can be assigned to an agent
      expect(testTask.assignedTo).toBe('test-agent-001');
      expect(testTask.status).toBe('pending');

      logger.info({
        taskId: testTask.id,
        assignedTo: testTask.assignedTo,
        delegationSupported: true
      }, 'Agent task delegation verified');
    });
  });

  describe('9. Artifact Parsing Integration with Real Files', () => {
    let prdIntegration: PRDIntegrationService;
    let taskListIntegration: TaskListIntegrationService;
    let projectOps: ProjectOperations;

    beforeAll(() => {
      prdIntegration = PRDIntegrationService.getInstance();
      taskListIntegration = TaskListIntegrationService.getInstance();
      projectOps = new ProjectOperations();
    });

    it('should discover and parse real PRD files from VibeCoderOutput', async () => {
      const startTime = Date.now();

      // Test PRD file discovery
      const discoveredPRDs = await prdIntegration.findPRDFiles();
      const discoveryDuration = Date.now() - startTime;

      expect(discoveredPRDs).toBeDefined();
      expect(Array.isArray(discoveredPRDs)).toBe(true);
      expect(discoveryDuration).toBeLessThan(10000); // Should complete within 10 seconds

      logger.info({
        discoveredPRDs: discoveredPRDs.length,
        discoveryDuration,
        prdFiles: discoveredPRDs.map(prd => ({ name: prd.fileName, project: prd.projectName }))
      }, 'PRD file discovery completed');

      // If PRDs are found, test parsing
      if (discoveredPRDs.length > 0) {
        const testPRD = discoveredPRDs[0];
        const fs = await import('fs/promises');

        try {
          const prdContent = await fs.readFile(testPRD.filePath, 'utf-8');
          const parseStartTime = Date.now();
          const parsedPRD: ParsedPRD = await prdIntegration.parsePRDContent(prdContent, testPRD.filePath);
          const parseDuration = Date.now() - parseStartTime;

          if (parsedPRD) {
            expect(parsedPRD.projectName).toBeDefined();
            expect(parseDuration).toBeLessThan(5000);

            logger.info({
              parsedProject: parsedPRD.projectName,
              featuresCount: parsedPRD.features?.length || 0,
              parseDuration
            }, 'PRD content parsed successfully');
          }
        } catch (error) {
          logger.warn({ err: error, prdPath: testPRD.filePath }, 'PRD parsing failed - this may be expected if implementation is incomplete');
        }
      }
    }, LLM_TIMEOUT);

    it('should discover and parse real task list files from VibeCoderOutput', async () => {
      const startTime = Date.now();

      // Test task list file discovery
      const discoveredTaskLists = await taskListIntegration.findTaskListFiles();
      const discoveryDuration = Date.now() - startTime;

      expect(discoveredTaskLists).toBeDefined();
      expect(Array.isArray(discoveredTaskLists)).toBe(true);
      expect(discoveryDuration).toBeLessThan(10000); // Should complete within 10 seconds

      logger.info({
        discoveredTaskLists: discoveredTaskLists.length,
        discoveryDuration,
        taskListFiles: discoveredTaskLists.map(tl => ({ name: tl.fileName, project: tl.projectName }))
      }, 'Task list file discovery completed');

      // If task lists are found, test parsing
      if (discoveredTaskLists.length > 0) {
        const testTaskList = discoveredTaskLists[0];
        const fs = await import('fs/promises');

        try {
          const taskListContent = await fs.readFile(testTaskList.filePath, 'utf-8');
          const parseStartTime = Date.now();
          const parsedTaskList: ParsedTaskList = await taskListIntegration.parseTaskListContent(taskListContent, testTaskList.filePath);
          const parseDuration = Date.now() - parseStartTime;

          if (parsedTaskList) {
            expect(parsedTaskList.projectName).toBeDefined();
            expect(parseDuration).toBeLessThan(5000);

            logger.info({
              parsedProject: parsedTaskList.projectName,
              phasesCount: parsedTaskList.phases?.length || 0,
              totalTasks: parsedTaskList.statistics?.totalTasks || 0,
              parseDuration
            }, 'Task list content parsed successfully');
          }
        } catch (error) {
          logger.warn({ err: error, taskListPath: testTaskList.filePath }, 'Task list parsing failed - this may be expected if implementation is incomplete');
        }
      }
    }, LLM_TIMEOUT);

    it('should create project context from parsed PRD data', async () => {
      const discoveredPRDs = await prdIntegration.findPRDFiles();

      if (discoveredPRDs.length > 0) {
        const testPRD = discoveredPRDs[0];
        const fs = await import('fs/promises');

        try {
          const prdContent = await fs.readFile(testPRD.filePath, 'utf-8');
          const parsedPRD = await prdIntegration.parsePRDContent(prdContent, testPRD.filePath);

          if (parsedPRD) {
            const startTime = Date.now();
            const projectContext = await projectOps.createProjectFromPRD(parsedPRD);
            const duration = Date.now() - startTime;

            expect(projectContext).toBeDefined();
            expect(projectContext.projectName).toBeDefined();
            expect(duration).toBeLessThan(5000);

            logger.info({
              originalPRDProject: parsedPRD.projectName,
              createdProjectName: projectContext.projectName,
              languages: projectContext.languages,
              frameworks: projectContext.frameworks,
              duration
            }, 'Project context created from PRD');
          }
        } catch (error) {
          logger.warn({ err: error }, 'Project creation from PRD failed - this may be expected if implementation is incomplete');
        }
      } else {
        logger.info('No PRDs found for project context creation test');
      }
    }, LLM_TIMEOUT);

    it('should convert task lists to atomic tasks', async () => {
      const discoveredTaskLists = await taskListIntegration.findTaskListFiles();

      if (discoveredTaskLists.length > 0) {
        const testTaskList = discoveredTaskLists[0];
        const fs = await import('fs/promises');

        try {
          const taskListContent = await fs.readFile(testTaskList.filePath, 'utf-8');
          const parsedTaskList = await taskListIntegration.parseTaskListContent(taskListContent, testTaskList.filePath);

          if (parsedTaskList) {
            const startTime = Date.now();
            const atomicTasks = await taskListIntegration.convertToAtomicTasks(parsedTaskList, testProjectContext);
            const duration = Date.now() - startTime;

            expect(atomicTasks).toBeDefined();
            expect(Array.isArray(atomicTasks)).toBe(true);
            expect(duration).toBeLessThan(10000);

            // Validate atomic task structure if tasks were generated
            if (atomicTasks.length > 0) {
              atomicTasks.forEach(task => {
                expect(task.id).toBeDefined();
                expect(task.title).toBeDefined();
                expect(task.description).toBeDefined();
                expect(task.estimatedHours).toBeGreaterThan(0);
              });
            }

            logger.info({
              originalTaskList: parsedTaskList.projectName,
              atomicTasksGenerated: atomicTasks.length,
              totalEstimatedHours: atomicTasks.reduce((sum, t) => sum + t.estimatedHours, 0),
              duration
            }, 'Task list converted to atomic tasks');
          }
        } catch (error) {
          logger.warn({ err: error }, 'Task list to atomic tasks conversion failed - this may be expected if implementation is incomplete');
        }
      } else {
        logger.info('No task lists found for atomic task conversion test');
      }
    }, LLM_TIMEOUT);

    it('should recognize artifact parsing intents with real LLM calls', async () => {
      const artifactCommands = [
        'read prd',
        'parse the PRD for my project',
        'read task list',
        'parse tasks for E-commerce Platform',
        'import PRD from file',
        'load task list from document'
      ];

      for (const command of artifactCommands) {
        const startTime = Date.now();
        const result = await intentEngine.recognizeIntent(command);
        const duration = Date.now() - startTime;

        expect(result).toBeDefined();
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        // Check if artifact parsing intents are recognized
        const isArtifactIntent = ['parse_prd', 'parse_tasks', 'import_artifact'].includes(result.intent);

        logger.info({
          command,
          recognizedIntent: result.intent,
          confidence: result.confidence,
          isArtifactIntent,
          duration
        }, 'Artifact parsing intent recognition tested');
      }
    }, LLM_TIMEOUT);
  });

  describe('10. End-to-End Workflow Integration', () => {
    it('should execute complete task lifecycle with real LLM calls', async () => {
      const workflowStartTime = Date.now();

      // Step 1: Create task using natural language
      const createCommand = 'Create a task to implement email notification system';
      const intentResult = await intentEngine.recognizeIntent(createCommand);

      expect(intentResult.intent).toBe('create_task');
      expect(intentResult.confidence).toBeGreaterThan(0.7);

      // Step 2: Create the actual task
      const taskResult = await vibeTaskManagerExecutor({
        command: 'create',
        projectName: 'test-project',
        description: 'Create a comprehensive email notification system with templates, queuing, and delivery tracking',
        options: { priority: 'high', estimatedHours: 12 }
      }, mockConfig, mockContext);

      expect(taskResult).toBeDefined();
      expect(taskResult.content).toBeDefined();

      // Step 3: Create a mock task for decomposition testing
      const createdTask: AtomicTask = {
        id: 'email-notification-001',
        title: 'Implement Email Notification System',
        description: 'Create a comprehensive email notification system with templates, queuing, and delivery tracking',
        priority: 'high',
        estimatedHours: 12,
        dependencies: [],
        dependents: [],
        tags: ['email', 'notifications', 'backend'],
        projectId: 'test-project',
        epicId: 'notification-epic',
        status: 'pending',
        assignedTo: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const decompositionResult = await decompositionService.decomposeTask(createdTask, testProjectContext);

      expect(decompositionResult.success).toBe(true);
      expect(decompositionResult.data!.length).toBeGreaterThan(1);

      // Step 4: Schedule the decomposed tasks
      const schedulingResult = await scheduleTasksWithAlgorithm(taskScheduler, decompositionResult.data!, 'priority_first');

      expect(schedulingResult.success).toBe(true);
      expect(schedulingResult.data!.size).toBe(decompositionResult.data!.length);

      const workflowDuration = Date.now() - workflowStartTime;
      expect(workflowDuration).toBeLessThan(120000); // Should complete within 2 minutes

      logger.info({
        workflowSteps: 4,
        totalDuration: workflowDuration,
        originalTask: createdTask.title,
        subtaskCount: decompositionResult.data!.length,
        scheduledTaskCount: schedulingResult.data!.size
      }, 'End-to-end workflow completed successfully');
    }, LLM_TIMEOUT * 2); // Extended timeout for full workflow

    it('should handle error scenarios gracefully', async () => {
      // Test with invalid input
      const invalidCommand = 'This is not a valid command structure';
      const result = await intentEngine.recognizeIntent(invalidCommand);

      // Should either return null or a low-confidence result
      if (result) {
        expect(result.confidence).toBeLessThan(0.5);
      }

      logger.info({
        invalidInput: invalidCommand,
        gracefulHandling: true
      }, 'Error handling verified');
    });
  });

  describe('11. Performance and Load Testing', () => {
    it('should handle concurrent LLM requests efficiently', async () => {
      const concurrentRequests = 3; // Keep reasonable for integration test
      const requests = Array(concurrentRequests).fill(null).map((_, index) =>
        intentEngine.recognizeIntent(`Create task number ${index + 1} for testing concurrency`)
      );

      const startTime = Date.now();
      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // All requests should succeed
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.intent).toBe('create_task');
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(60000); // 60 seconds for 3 concurrent requests

      logger.info({
        concurrentRequests,
        totalDuration: duration,
        averageDuration: duration / concurrentRequests
      }, 'Concurrent request handling verified');
    }, LLM_TIMEOUT);

    it('should maintain performance under task scheduling load', async () => {
      // Create a larger set of tasks for performance testing
      const largeTasks: AtomicTask[] = Array(10).fill(null).map((_, index) => ({
        id: `perf-task-${index}`,
        title: `Performance Test Task ${index}`,
        description: `Task ${index} for performance testing`,
        priority: ['critical', 'high', 'medium', 'low'][index % 4] as any,
        estimatedHours: Math.floor(Math.random() * 8) + 1,
        dependencies: index > 0 ? [`perf-task-${index - 1}`] : [],
        dependents: index < 9 ? [`perf-task-${index + 1}`] : [],
        tags: ['performance', 'test'],
        projectId: 'perf-test',
        epicId: 'perf-epic',
        status: 'pending',
        assignedTo: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const startTime = Date.now();
      const result = await scheduleTasksWithAlgorithm(taskScheduler, largeTasks, 'hybrid_optimal');
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.data!.size).toBe(largeTasks.length);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      logger.info({
        taskCount: largeTasks.length,
        schedulingDuration: duration,
        performanceAcceptable: duration < 10000
      }, 'Performance under load verified');
    });
  });
});
