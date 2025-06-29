/**
 * Task Lifecycle Service Tests
 *
 * Comprehensive test suite for the TaskLifecycleService covering:
 * - State transition validation
 * - Automated state changes based on conditions
 * - Dependency-based transitions
 * - State history tracking
 * - Event-driven lifecycle automation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskLifecycleService, TaskTransition, TaskLifecycleConfig } from '../../services/task-lifecycle.js';
import { AtomicTask, TaskStatus } from '../../types/task.js';
import { OptimizedDependencyGraph } from '../../core/dependency-graph.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock task operations
const mockTaskOperations = {
  getTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTask: vi.fn()
};

vi.mock('../../core/operations/task-operations.js', () => ({
  getTaskOperations: () => mockTaskOperations
}));

describe('TaskLifecycleService', () => {
  let lifecycleService: TaskLifecycleService;
  let dependencyGraph: OptimizedDependencyGraph;
  let mockTasks: AtomicTask[];

  beforeEach(() => {
    const config: TaskLifecycleConfig = {
      enableAutomation: true,
      transitionTimeout: 5000,
      maxRetries: 3,
      enableStateHistory: true,
      enableDependencyTracking: true
    };

    lifecycleService = new TaskLifecycleService(config);
    dependencyGraph = new OptimizedDependencyGraph();

    // Create mock tasks
    mockTasks = [
      {
        id: 'T001',
        title: 'Setup project structure',
        description: 'Initialize project with basic structure',
        status: 'pending',
        priority: 'high',
        type: 'development',
        estimatedHours: 2,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        dependents: ['T002', 'T003'],
        filePaths: ['src/index.ts'],
        acceptanceCriteria: ['Project structure created'],
        testingRequirements: {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 90
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: [],
          patterns: []
        },
        validationMethods: {
          automated: [],
          manual: []
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test',
        tags: [],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test',
          tags: []
        }
      },
      {
        id: 'T002',
        title: 'Implement core logic',
        description: 'Develop main application logic',
        status: 'pending',
        priority: 'critical',
        type: 'development',
        estimatedHours: 4,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: ['T001'],
        dependents: ['T003'],
        filePaths: ['src/core.ts'],
        acceptanceCriteria: ['Core logic implemented'],
        testingRequirements: {
          unitTests: ['core.test.ts'],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 95
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: [],
          patterns: []
        },
        validationMethods: {
          automated: [],
          manual: []
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test',
        tags: [],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test',
          tags: []
        }
      }
    ];

    // Setup dependency graph
    for (const task of mockTasks) {
      dependencyGraph.addTask(task);
    }
    dependencyGraph.addDependency('T002', 'T001', 'task', 1, true);
  });

  beforeEach(async () => {
    // Setup mock responses for each test
    mockTaskOperations.getTask.mockImplementation((taskId: string) => {
      const task = mockTasks.find(t => t.id === taskId);
      if (task) {
        return Promise.resolve({
          success: true,
          data: task,
          metadata: { filePath: 'test', operation: 'get_task', timestamp: new Date() }
        });
      } else {
        return Promise.resolve({
          success: false,
          error: `Task ${taskId} not found`,
          metadata: { filePath: 'test', operation: 'get_task', timestamp: new Date() }
        });
      }
    });

    mockTaskOperations.updateTaskStatus.mockImplementation((taskId: string, status: any) => {
      const task = mockTasks.find(t => t.id === taskId);
      if (task) {
        task.status = status;
        return Promise.resolve({
          success: true,
          data: task,
          metadata: { filePath: 'test', operation: 'update_task_status', timestamp: new Date() }
        });
      } else {
        return Promise.resolve({
          success: false,
          error: `Task ${taskId} not found`,
          metadata: { filePath: 'test', operation: 'update_task_status', timestamp: new Date() }
        });
      }
    });
  });

  afterEach(() => {
    lifecycleService.dispose();
    // Reset mock implementations
    mockTaskOperations.getTask.mockReset();
    mockTaskOperations.updateTaskStatus.mockReset();
    mockTaskOperations.updateTask.mockReset();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultService = new TaskLifecycleService();
      expect(defaultService).toBeDefined();
      defaultService.dispose();
    });

    it('should initialize with custom configuration', () => {
      const customConfig: TaskLifecycleConfig = {
        enableAutomation: false,
        transitionTimeout: 10000,
        maxRetries: 5,
        enableStateHistory: false,
        enableDependencyTracking: false
      };

      const customService = new TaskLifecycleService(customConfig);
      expect(customService).toBeDefined();
      customService.dispose();
    });
  });

  describe('State Transition Validation', () => {
    it('should validate allowed transitions', () => {
      // Valid transitions
      expect(lifecycleService.isValidTransition('pending', 'in_progress')).toBe(true);
      expect(lifecycleService.isValidTransition('in_progress', 'completed')).toBe(true);
      expect(lifecycleService.isValidTransition('in_progress', 'blocked')).toBe(true);
      expect(lifecycleService.isValidTransition('blocked', 'in_progress')).toBe(true);
      expect(lifecycleService.isValidTransition('in_progress', 'failed')).toBe(true);
      expect(lifecycleService.isValidTransition('failed', 'pending')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      // Invalid transitions
      expect(lifecycleService.isValidTransition('pending', 'completed')).toBe(false);
      expect(lifecycleService.isValidTransition('completed', 'pending')).toBe(false);
      expect(lifecycleService.isValidTransition('completed', 'in_progress')).toBe(false);
      expect(lifecycleService.isValidTransition('blocked', 'completed')).toBe(false);
    });

    it('should handle cancelled state transitions', () => {
      expect(lifecycleService.isValidTransition('pending', 'cancelled')).toBe(true);
      expect(lifecycleService.isValidTransition('in_progress', 'cancelled')).toBe(true);
      expect(lifecycleService.isValidTransition('blocked', 'cancelled')).toBe(true);
      expect(lifecycleService.isValidTransition('cancelled', 'pending')).toBe(true);
      expect(lifecycleService.isValidTransition('cancelled', 'completed')).toBe(false);
    });
  });

  describe('Manual State Transitions', () => {
    it('should successfully transition task status', async () => {
      const transition = await lifecycleService.transitionTask(
        'T001',
        'in_progress',
        {
          reason: 'Started development',
          triggeredBy: 'user',
          metadata: { startTime: new Date() }
        }
      );

      expect(transition.success).toBe(true);
      expect(transition.transition?.fromStatus).toBe('pending');
      expect(transition.transition?.toStatus).toBe('in_progress');
      expect(transition.transition?.reason).toBe('Started development');
      expect(transition.transition?.triggeredBy).toBe('user');
    });

    it('should reject invalid transitions', async () => {
      const transition = await lifecycleService.transitionTask(
        'T001',
        'completed'
      );

      expect(transition.success).toBe(false);
      expect(transition.error).toContain('Invalid transition');
    });

    it('should validate dependency requirements', async () => {
      // Try to start T002 when T001 is still pending
      const transition = await lifecycleService.transitionTask(
        'T002',
        'in_progress'
      );

      expect(transition.success).toBe(false);
      expect(transition.error).toContain('dependencies not completed');
    });
  });

  describe('Automated State Transitions', () => {
    it('should automatically transition ready tasks', async () => {
      const transitionedTasks = await lifecycleService.processAutomatedTransitions(
        mockTasks,
        dependencyGraph
      );

      // T001 should be ready to start (no dependencies)
      expect(transitionedTasks.some(t => t.taskId === 'T001')).toBe(true);
      
      // T002 should not be ready (depends on T001)
      expect(transitionedTasks.some(t => t.taskId === 'T002')).toBe(false);
    });

    it('should trigger dependent transitions when task completes', async () => {
      // Complete T001
      await lifecycleService.transitionTask('T001', 'in_progress');
      await lifecycleService.transitionTask('T001', 'completed');

      // Process automated transitions
      const transitionedTasks = await lifecycleService.processAutomatedTransitions(
        mockTasks,
        dependencyGraph
      );

      // T002 should now be ready to start
      expect(transitionedTasks.some(t => t.taskId === 'T002')).toBe(true);
    });

    it('should handle timeout-based transitions', async () => {
      const longRunningTask = { ...mockTasks[0], id: 'T_TIMEOUT' };
      
      // Start task and simulate timeout
      await lifecycleService.transitionTask('T_TIMEOUT', 'in_progress');
      
      // Mock timeout check
      const timeoutTransitions = await lifecycleService.checkTimeoutTransitions([longRunningTask]);
      
      expect(Array.isArray(timeoutTransitions)).toBe(true);
    });
  });

  describe('State History Tracking', () => {
    it('should track state history when enabled', async () => {
      await lifecycleService.transitionTask('T001', 'in_progress');
      await lifecycleService.transitionTask('T001', 'blocked', { reason: 'Waiting for API' });
      await lifecycleService.transitionTask('T001', 'in_progress');

      const history = lifecycleService.getTaskHistory('T001');
      expect(history).toBeDefined();
      expect(history.length).toBe(3);

      expect(history[0].toStatus).toBe('in_progress');
      expect(history[1].toStatus).toBe('blocked');
      expect(history[1].reason).toBe('Waiting for API');
      expect(history[2].toStatus).toBe('in_progress');
    });

    it('should not track history when disabled', async () => {
      const noHistoryService = new TaskLifecycleService({ enableStateHistory: false });
      
      await noHistoryService.transitionTask('T001', 'in_progress');
      const history = noHistoryService.getTaskHistory('T001');
      
      expect(history.length).toBe(0);
      noHistoryService.dispose();
    });
  });

  describe('Dependency-Based Automation', () => {
    it('should identify ready tasks based on dependencies', () => {
      const readyTasks = lifecycleService.getReadyTasks(mockTasks, dependencyGraph);
      
      // T001 has no dependencies, should be ready
      expect(readyTasks.some(t => t.id === 'T001')).toBe(true);
      
      // T002 depends on T001, should not be ready
      expect(readyTasks.some(t => t.id === 'T002')).toBe(false);
    });

    it('should identify blocked tasks', () => {
      const blockedTasks = lifecycleService.getBlockedTasks(mockTasks, dependencyGraph);
      
      // T002 is blocked by T001 
      expect(blockedTasks.some(t => t.id === 'T002')).toBe(true);
      
      // T001 is not blocked
      expect(blockedTasks.some(t => t.id === 'T001')).toBe(false);
    });

    it('should cascade transitions through dependency chain', async () => {
      // Complete T001 
      await lifecycleService.transitionTask('T001', 'in_progress');
      await lifecycleService.transitionTask('T001', 'completed');
      
      // Process cascade
      const cascadeResults = await lifecycleService.processDependencyCascade(
        'T001',
        mockTasks,
        dependencyGraph
      );
      
      expect(cascadeResults.length).toBeGreaterThan(0);
      expect(cascadeResults.some(r => r.taskId === 'T002')).toBe(true);
    });
  });

  describe('Event System', () => {
    it('should emit events on state transitions', async () => {
      const transitionEvents: any[] = [];
      
      lifecycleService.on('task:transition', (event) => {
        transitionEvents.push(event);
      });

      const result = await lifecycleService.transitionTask('T001', 'in_progress');
      expect(result.success).toBe(true);
      
      expect(transitionEvents.length).toBe(1);
      expect(transitionEvents[0].taskId).toBe('T001');
      expect(transitionEvents[0].transition.toStatus).toBe('in_progress');
    });

    it('should emit automation events', async () => {
      const automationEvents: any[] = [];
      
      lifecycleService.on('automation:processed', (event) => {
        automationEvents.push(event);
      });

      await lifecycleService.processAutomatedTransitions(mockTasks, dependencyGraph);
      
      expect(automationEvents.length).toBe(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-existent task gracefully', async () => {
      const result = await lifecycleService.transitionTask('INVALID', 'in_progress');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle concurrent transition attempts', async () => {
      const promises = [
        lifecycleService.transitionTask('T001', 'in_progress'),
        lifecycleService.transitionTask('T001', 'blocked')
      ];

      const results = await Promise.all(promises);
      
      // One should succeed, one should fail
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(1);
    });

    it('should validate configuration parameters', () => {
      expect(() => new TaskLifecycleService({ maxRetries: -1 })).toThrow();
      expect(() => new TaskLifecycleService({ transitionTimeout: 0 })).toThrow();
    });
  });

  describe('Performance and Statistics', () => {
    it('should calculate transition statistics', async () => {
      await lifecycleService.transitionTask('T001', 'in_progress');
      await lifecycleService.transitionTask('T001', 'completed');
      await lifecycleService.transitionTask('T002', 'in_progress');

      const stats = lifecycleService.getTransitionStatistics();
      
      expect(stats.totalTransitions).toBe(3);
      expect(stats.byStatus.in_progress).toBe(2);
      expect(stats.byStatus.completed).toBe(1);
      expect(stats.averageTransitionTime).toBeGreaterThanOrEqual(0);
    });

    it('should track automation performance', async () => {
      const startTime = Date.now();
      await lifecycleService.processAutomatedTransitions(mockTasks, dependencyGraph);
      const endTime = Date.now();

      const perf = lifecycleService.getAutomationMetrics();
      expect(perf.lastProcessingTime).toBeGreaterThanOrEqual(0);
      expect(perf.lastProcessingTime).toBeLessThan(endTime - startTime + 100); // Allow some tolerance
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should dispose properly', () => {
      expect(() => lifecycleService.dispose()).not.toThrow();
      
      // Should be safe to call multiple times
      expect(() => lifecycleService.dispose()).not.toThrow();
    });

    it('should clear history on disposal', async () => {
      await lifecycleService.transitionTask('T001', 'in_progress');
      
      lifecycleService.dispose();
      
      const history = lifecycleService.getTaskHistory('T001');
      expect(history.length).toBe(0);
    });
  });
});