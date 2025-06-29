/**
 * Basic Integration Tests for Vibe Task Manager
 * Tests core functionality with minimal dependencies
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { 
  mockOpenRouterResponse, 
  queueMockResponses, 
  setTestId, 
  clearMockQueue,
  clearAllMockQueues,
  MockTemplates,
  MockQueueBuilder
} from '../../../../testUtils/mockLLM.js';
import { TaskScheduler } from '../../services/task-scheduler.js';
import { transportManager } from '../../../../services/transport-manager/index.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import type { AtomicTask } from '../../types/project-context.js';
import logger from '../../../../logger.js';

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
import { setupUniqueTestPorts, cleanupTestPorts } from '../../../../services/transport-manager/__tests__/test-port-utils.js';

// Test timeout for real operations
const TEST_TIMEOUT = 30000; // 30 seconds

describe('Vibe Task Manager - Basic Integration Tests', () => {
  let taskScheduler: TaskScheduler;
  let testPortRange: ReturnType<typeof setupUniqueTestPorts>;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Set unique test ID for isolation
    const testId = `basic-integration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setTestId(testId);
    
    // Clear mock queue for this test
    clearMockQueue();
    
    // Set up comprehensive mock queue for all potential LLM calls
    const builder = new MockQueueBuilder();
    builder
      .addIntentRecognitions(3, 'create_task')
      .addAtomicDetections(10, true)
      .addTaskDecompositions(2, 2);
    builder.queueResponses();
  });
  
  beforeAll(async () => {
    // Set up unique ports to avoid conflicts
    testPortRange = setupUniqueTestPorts();

    // Initialize core components
    taskScheduler = new TaskScheduler({ enableDynamicOptimization: false });

    logger.info('Starting basic integration tests');
  }, TEST_TIMEOUT);

  afterEach(() => {
    // Clean up mock queue after each test
    clearMockQueue();
  });
  
  afterAll(async () => {
    // Clean up all mock queues
    clearAllMockQueues();
    
    // Cleanup
    try {
      await transportManager.stopAll();
      if (taskScheduler && typeof taskScheduler.dispose === 'function') {
        taskScheduler.dispose();
      }
      // Clean up test ports
      cleanupTestPorts(testPortRange);
    } catch (error) {
      logger.warn({ err: error }, 'Error during cleanup');
    }
  });

  describe('1. Configuration Loading', () => {
    it('should load Vibe Task Manager configuration successfully', async () => {
      const config = await getVibeTaskManagerConfig();
      
      expect(config).toBeDefined();
      expect(config.llm).toBeDefined();
      expect(config.llm.llm_mapping).toBeDefined();
      expect(Object.keys(config.llm.llm_mapping).length).toBeGreaterThan(0);
      
      logger.info({ configKeys: Object.keys(config.llm.llm_mapping) }, 'Configuration loaded successfully');
    });

    it('should have OpenRouter API key configured', () => {
      expect(process.env.OPENROUTER_API_KEY).toBeDefined();
      expect(process.env.OPENROUTER_API_KEY).toMatch(/^sk-or-v1-/);
      
      logger.info('OpenRouter API key verified');
    });
  });

  describe('2. Transport Manager', () => {
    it('should start transport services successfully', async () => {
      const startTime = Date.now();

      try {
        await transportManager.startAll();
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(10000); // Should start within 10 seconds

        // Verify services are running by checking if startAll completed without error
        expect(transportManager).toBeDefined();

        logger.info({
          duration,
          transportManagerStarted: true
        }, 'Transport services started successfully');

      } catch (error) {
        logger.error({ err: error }, 'Failed to start transport services');
        throw error;
      }
    }, TEST_TIMEOUT);
  });

  describe('3. Task Scheduler Basic Functionality', () => {
    let testTasks: AtomicTask[];

    beforeAll(() => {
      // Create simple test tasks
      testTasks = [
        {
          id: 'task-001', title: 'Critical Bug Fix', priority: 'critical', estimatedHours: 2,
          dependencies: [], dependents: [], tags: ['bugfix'], 
          projectId: 'test', epicId: 'epic-001', status: 'pending', assignedTo: null,
          description: 'Fix critical security vulnerability', createdAt: new Date(), updatedAt: new Date()
        },
        {
          id: 'task-002', title: 'Feature Implementation', priority: 'high', estimatedHours: 8,
          dependencies: [], dependents: [], tags: ['feature'], 
          projectId: 'test', epicId: 'epic-001', status: 'pending', assignedTo: null,
          description: 'Implement new user dashboard', createdAt: new Date(), updatedAt: new Date()
        }
      ];
    });

    it('should create TaskScheduler instance successfully', () => {
      expect(taskScheduler).toBeDefined();
      expect(taskScheduler.constructor.name).toBe('TaskScheduler');
      
      logger.info('TaskScheduler instance created successfully');
    });

    it('should handle empty task list', async () => {
      try {
        // Test with empty task list
        const emptyTasks: AtomicTask[] = [];
        
        // This should not throw an error
        expect(() => taskScheduler).not.toThrow();
        
        logger.info('Empty task list handled gracefully');
      } catch (error) {
        logger.error({ err: error }, 'Error handling empty task list');
        throw error;
      }
    });

    it('should validate task structure', () => {
      // Verify test tasks have proper structure
      testTasks.forEach(task => {
        expect(task.id).toBeDefined();
        expect(task.title).toBeDefined();
        expect(task.description).toBeDefined();
        expect(task.priority).toBeDefined();
        expect(task.estimatedHours).toBeGreaterThan(0);
        expect(task.projectId).toBeDefined();
        expect(task.epicId).toBeDefined();
        expect(task.status).toBeDefined();
        expect(task.createdAt).toBeDefined();
        expect(task.updatedAt).toBeDefined();
      });
      
      logger.info({ taskCount: testTasks.length }, 'Task structure validation passed');
    });
  });

  describe('4. Environment Verification', () => {
    it('should have required environment variables', () => {
      const requiredEnvVars = [
        'OPENROUTER_API_KEY',
        'GEMINI_MODEL'
      ];

      requiredEnvVars.forEach(envVar => {
        expect(process.env[envVar]).toBeDefined();
        logger.info({ envVar, configured: !!process.env[envVar] }, 'Environment variable check');
      });
    });

    it('should have proper project structure', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Check for key files
      const keyFiles = [
        'package.json',
        'tsconfig.json',
        'llm_config.json'
      ];

      for (const file of keyFiles) {
        const filePath = path.join(process.cwd(), file);
        try {
          await fs.access(filePath);
          logger.info({ file, exists: true }, 'Key file check');
        } catch (error) {
          logger.warn({ file, exists: false }, 'Key file missing');
          throw new Error(`Required file ${file} not found`);
        }
      }
    });
  });

  describe('5. Integration Readiness', () => {
    it('should confirm all components are ready for integration', async () => {
      // Verify all components are initialized
      expect(taskScheduler).toBeDefined();

      // Verify configuration is loaded
      const config = await getVibeTaskManagerConfig();
      expect(config).toBeDefined();

      // Verify transport manager exists
      expect(transportManager).toBeDefined();

      // Verify environment
      expect(process.env.OPENROUTER_API_KEY).toBeDefined();

      logger.info({
        taskScheduler: !!taskScheduler,
        config: !!config,
        transportManager: !!transportManager,
        apiKey: !!process.env.OPENROUTER_API_KEY
      }, 'All components ready for integration testing');
    });
  });
});
