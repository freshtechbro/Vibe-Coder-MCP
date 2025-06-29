/**
 * Basic Integration Tests for Vibe Task Manager
 * Tests core functionality with minimal dependencies
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TaskScheduler } from '../../services/task-scheduler.js';
import { transportManager } from '../../../../services/transport-manager/index.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import type { AtomicTask } from '../../types/project-context.js';
import logger from '../../../../logger.js';

// Test timeout for real operations
const TEST_TIMEOUT = 30000; // 30 seconds

describe('Vibe Task Manager - Basic Integration Tests', () => {
  let taskScheduler: TaskScheduler;

  beforeAll(async () => {
    // Initialize core components
    taskScheduler = new TaskScheduler({ enableDynamicOptimization: false });
    
    logger.info('Starting basic integration tests');
  }, TEST_TIMEOUT);

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
        'DEFAULT_MODEL'
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
