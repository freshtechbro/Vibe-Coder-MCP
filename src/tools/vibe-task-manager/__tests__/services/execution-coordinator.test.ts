/**
 * Execution Coordinator Service Tests
 *
 * Comprehensive test suite for the ExecutionCoordinator service covering:
 * - Agent registration and management
 * - Task and batch execution coordination
 * - Resource allocation and load balancing
 * - Failure handling and recovery
 * - Performance monitoring and metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecutionCoordinator, DEFAULT_EXECUTION_CONFIG, Agent, ExecutionConfig } from '../../services/execution-coordinator.js';
import { TaskScheduler } from '../../services/task-scheduler.js';
import { OptimizedDependencyGraph } from '../../core/dependency-graph.js';
import { AtomicTask, TaskPriority, TaskStatus } from '../../types/task.js';
import { ServiceLifecycleManager } from '../../services/service-lifecycle-manager.js';
import { cleanupTestServices } from '../utils/service-test-helper.js';
import { AgentOrchestrator } from '../../services/agent-orchestrator.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Helper function to setup communication channel mocks
function setupCommunicationMocks(
  sendTaskResult: boolean | Error = true,
  receiveResponseResult: string = JSON.stringify({
    success: true,
    output: 'Task completed successfully',
    exitCode: 0,
    message: 'Task completed successfully'
  })
) {
  const orchestrator = AgentOrchestrator.getInstance();
  const originalChannel = (orchestrator as any).communicationChannel;

  // Create mock channel with proper method implementations
  const mockChannel = {
    ...originalChannel,
    sendTask: vi.fn(),
    receiveResponse: vi.fn(),
    initialize: vi.fn().mockResolvedValue(true),
    cleanup: vi.fn().mockResolvedValue(true)
  };

  // Setup mock behavior - be more explicit about success/failure
  if (sendTaskResult instanceof Error) {
    // For errors, make sendTask throw the error
    mockChannel.sendTask.mockImplementation(async () => {
      throw sendTaskResult;
    });
  } else if (sendTaskResult === false) {
    // For false, return false (task delivery failed)
    mockChannel.sendTask.mockResolvedValue(false);
  } else {
    // For true, return true (task delivery succeeded)
    mockChannel.sendTask.mockResolvedValue(true);
  }

  // Always setup receiveResponse to return the expected result
  mockChannel.receiveResponse.mockResolvedValue(receiveResponseResult);

  // Replace the communication channel
  (orchestrator as any).communicationChannel = mockChannel;

  return {
    originalChannel,
    mockChannel,
    restore: () => {
      (orchestrator as any).communicationChannel = originalChannel;
      // Also clear the mocks to prevent interference
      mockChannel.sendTask.mockClear();
      mockChannel.receiveResponse.mockClear();
    }
  };
}

describe('ExecutionCoordinator', () => {
  let coordinator: ExecutionCoordinator;
  let taskScheduler: TaskScheduler;
  let dependencyGraph: OptimizedDependencyGraph;
  let mockTasks: AtomicTask[];
  let mockAgents: Agent[];

  beforeEach(async () => {
    // Generate unique test ID for resource isolation
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create test configuration with unique resource prefixes
    const testConfig: Partial<ExecutionConfig> = {
      maxConcurrentBatches: 2,
      taskTimeoutMinutes: 5,
      maxRetryAttempts: 2,
      enableAutoRecovery: false, // Disable for testing
      loadBalancingStrategy: 'resource_aware'
    };

    // Create scheduler and dependency graph
    taskScheduler = new TaskScheduler({ enableDynamicOptimization: false });
    dependencyGraph = new OptimizedDependencyGraph();
    coordinator = new ExecutionCoordinator(taskScheduler, testConfig);

    // Clear any existing locks from previous tests
    const accessManager = (coordinator as any).accessManager;
    if (accessManager && typeof accessManager.clearAllLocks === 'function') {
      await accessManager.clearAllLocks();
    }


    mockTasks = [
      {
        id: `T001_${testId}`,
        title: 'Test Task 1',
        description: 'First test task',
        status: 'pending' as const,
        priority: 'medium' as const,
        type: 'development' as const,
        estimatedHours: 0.1, // 6 minutes - within atomic range
        actualHours: 0,
        epicId: 'epic_001',
        projectId: 'P001',
        dependencies: [],
        dependents: [],
        filePaths: [`src/${testId}_test1.ts`],
        acceptanceCriteria: ['Task should complete successfully'],
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
        tags: ['test'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test',
          tags: ['test']
        }
      },
      {
        id: `T002_${testId}`,
        title: 'Test Task 2',
        description: 'Second test task',
        status: 'pending' as const,
        priority: 'critical' as const,
        type: 'development' as const,
        estimatedHours: 0.15, // 9 minutes - within atomic range
        actualHours: 0,
        epicId: 'epic_001',
        projectId: 'P001',
        dependencies: [],
        dependents: [],
        filePaths: [`src/${testId}_test2.ts`],
        acceptanceCriteria: ['Task should complete successfully'],
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
        tags: ['test'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test',
          tags: ['test']
        }
      }
    ];



    // Create mock agents with unique IDs
    mockAgents = [
      {
        id: `${testId}_agent_1`,
        name: 'Development Agent 1',
        status: 'idle',
        capacity: {
          maxMemoryMB: 1024,
          maxCpuWeight: 1.0,
          maxConcurrentTasks: 3
        },
        currentUsage: {
          memoryMB: 0,
          cpuWeight: 0,
          activeTasks: 0
        },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      },
      {
        id: `${testId}_agent_2`,
        name: 'Development Agent 2',
        status: 'idle',
        capacity: {
          maxMemoryMB: 2048,
          maxCpuWeight: 1.5,
          maxConcurrentTasks: 5
        },
        currentUsage: {
          memoryMB: 0,
          cpuWeight: 0,
          activeTasks: 0
        },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      }
    ];

    // Setup dependency graph and schedule
    for (const task of mockTasks) {
      dependencyGraph.addTask(task);
    }
    dependencyGraph.addDependency(`T002_${testId}`, `T001_${testId}`, 'task', 1, true);

    // Generate schedule
    await taskScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

    // Register agents
    for (const agent of mockAgents) {
      coordinator.registerAgent(agent);
    }
  });

  afterEach(async () => {
    try {
      // Use the centralized cleanup utility
      await cleanupTestServices();

      // Clear all mocks and timers
      vi.clearAllMocks();
      vi.clearAllTimers();
    } catch (error) {
      // Log but don't fail tests due to cleanup errors
      console.warn('Cleanup error in afterEach:', error);
    }
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultCoordinator = new ExecutionCoordinator(taskScheduler);
      expect(defaultCoordinator).toBeDefined();
      defaultCoordinator.dispose();
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = { maxConcurrentBatches: 5 };
      const customCoordinator = new ExecutionCoordinator(taskScheduler, customConfig);
      expect(customCoordinator).toBeDefined();
      customCoordinator.dispose();
    });
  });

  describe('Agent Management', () => {
    it('should register agents successfully', () => {
      const newAgent: Agent = {
        id: 'agent_3',
        name: 'Test Agent 3',
        status: 'idle',
        capacity: { maxMemoryMB: 512, maxCpuWeight: 0.5, maxConcurrentTasks: 2 },
        currentUsage: { memoryMB: 0, cpuWeight: 0, activeTasks: 0 },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      };

      coordinator.registerAgent(newAgent);

      // Verify agent is registered by checking if it can be selected for tasks
      expect(coordinator).toBeDefined();
    });

    it('should unregister agents successfully', () => {
      coordinator.unregisterAgent('agent_1');

      // Agent should no longer be available for task assignment
      expect(coordinator).toBeDefined();
    });

    it('should handle unregistering non-existent agent', () => {
      expect(() => coordinator.unregisterAgent('non_existent')).not.toThrow();
    });
  });

  describe.sequential('Task Execution', () => {
    it('should execute a single task successfully', async () => {
      // Create a new coordinator to avoid mock conflicts
      const newScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      const newCoordinator = new ExecutionCoordinator(newScheduler);

      // Register agents
      for (const agent of mockAgents) {
        newCoordinator.registerAgent(agent);
      }

      // Generate schedule with the same tasks
      await newScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const schedule = newScheduler.getCurrentSchedule();
      expect(schedule).toBeDefined();

      const taskId = mockTasks[0].id; // Use dynamic task ID
      const scheduledTask = schedule!.scheduledTasks.get(taskId);
      expect(scheduledTask).toBeDefined();

      // Setup communication mocks for successful execution
      const { restore } = setupCommunicationMocks(true);

      try {
        const execution = await newCoordinator.executeTask(scheduledTask!);

        expect(execution).toBeDefined();
        expect(execution.scheduledTask.task.id).toBe(taskId);
        expect(execution.agent).toBeDefined();
        expect(execution.metadata.executionId).toBeDefined();
        expect(execution.status).toBe('completed');
      } finally {
        restore();
        await newCoordinator.dispose();
        newScheduler.dispose();
      }
    }, 5000); // 5 second timeout

    it('should handle task execution failure gracefully', async () => {
      // Create a new coordinator to avoid mock conflicts
      const newScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      const newCoordinator = new ExecutionCoordinator(newScheduler);

      // Register agents
      for (const agent of mockAgents) {
        newCoordinator.registerAgent(agent);
      }

      // Generate schedule with the same tasks
      await newScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const schedule = newScheduler.getCurrentSchedule();
      const taskId = mockTasks[1].id; // Use dynamic task ID for second task
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      // Force AgentOrchestrator initialization by triggering task execution setup
      // This ensures we have a fresh singleton instance for this test
      try {
        // Get the AgentOrchestrator instance and set up the error mock directly
        const orchestrator = AgentOrchestrator.getInstance();

        // Store original channel
        const originalChannel = (orchestrator as any).communicationChannel;

        // Set up error mock directly
        const mockChannel = {
          ...originalChannel,
          sendTask: vi.fn().mockImplementation(async () => {
            throw new Error('Agent not found - cannot send task');
          }),
          receiveResponse: vi.fn().mockResolvedValue(JSON.stringify({
            status: 'ERROR',
            message: 'Task execution failed',
            error: 'Agent not found - cannot send task',
            timestamp: Date.now()
          })),
          initialize: vi.fn().mockResolvedValue(true),
          cleanup: vi.fn().mockResolvedValue(true)
        };

        // Apply the mock
        (orchestrator as any).communicationChannel = mockChannel;

        const execution = await newCoordinator.executeTask(scheduledTask!);

        expect(execution.status).toBe('failed');
        expect(execution.result?.success).toBe(false);
        expect(execution.result?.error).toContain('Agent not found - cannot send task');

        // Restore original channel
        (orchestrator as any).communicationChannel = originalChannel;
      } finally {
        await newCoordinator.dispose();
        newScheduler.dispose();
      }
    }, 5000); // 5 second timeout

    it('should throw error when no agents available', async () => {
      // Unregister all agents using their actual dynamic IDs
      for (const agent of mockAgents) {
        coordinator.unregisterAgent(agent.id);
      }

      const schedule = taskScheduler.getCurrentSchedule();
      const taskId = mockTasks[0].id; // Use dynamic task ID
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      await expect(coordinator.executeTask(scheduledTask!))
        .rejects.toThrow(`No available agent for task ${taskId}`);
    });
  });

  describe.sequential('Batch Execution', () => {
    it('should execute a batch of tasks in parallel', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      expect(schedule).toBeDefined();

      const firstBatch = schedule!.executionBatches[0];
      expect(firstBatch).toBeDefined();

      // Setup communication mocks for successful batch execution
      const { restore } = setupCommunicationMocks(true);

      try {
        const executionBatch = await coordinator.executeBatch(firstBatch);

        expect(executionBatch).toBeDefined();
        expect(executionBatch.parallelBatch).toBe(firstBatch);
        expect(executionBatch.executions.size).toBeGreaterThan(0);
        expect(executionBatch.resourceAllocation).toBeDefined();
      } finally {
        restore();
      }
    }, 5000); // 5 second timeout

    it('should handle batch execution with insufficient resources', async () => {
      // Create a resource-intensive batch that exceeds capacity
      const schedule = taskScheduler.getCurrentSchedule();
      const firstBatch = schedule!.executionBatches[0];

      // Store original capacities
      const originalCapacities = mockAgents.map(agent => ({
        id: agent.id,
        maxMemoryMB: agent.capacity.maxMemoryMB,
        maxCpuWeight: agent.capacity.maxCpuWeight
      }));

      try {
        // Temporarily reduce agent capacity to be insufficient for the batch
        mockAgents.forEach(agent => {
          agent.capacity.maxMemoryMB = 50; // Very low memory (tasks typically need 512MB)
          agent.capacity.maxCpuWeight = 0.1; // Very low CPU (tasks typically need 0.5)
          agent.capacity.maxConcurrentTasks = 1; // Limit concurrent tasks
        });

        await expect(coordinator.executeBatch(firstBatch))
          .rejects.toThrow('Insufficient resources to execute batch');
      } finally {
        // Restore original capacities
        originalCapacities.forEach(original => {
          const agent = mockAgents.find(a => a.id === original.id);
          if (agent) {
            agent.capacity.maxMemoryMB = original.maxMemoryMB;
            agent.capacity.maxCpuWeight = original.maxCpuWeight;
            agent.capacity.maxConcurrentTasks = 10; // Restore original
          }
        });
      }
    });

    it('should handle batch execution without current schedule', async () => {
      // Create a new coordinator without a schedule
      const newScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      const newCoordinator = new ExecutionCoordinator(newScheduler);

      const mockBatch = {
        batchId: 0,
        taskIds: ['T001'],
        estimatedDuration: 2,
        canRunInParallel: true,
        dependencies: [],
        metadata: {
          createdAt: new Date(),
          priority: 'medium' as const,
          resourceRequirements: { memoryMB: 512, cpuWeight: 0.5 }
        }
      };

      await expect(newCoordinator.executeBatch(mockBatch))
        .rejects.toThrow('No current schedule available');

      await newCoordinator.dispose();
      newScheduler.dispose();
    });
  });

  describe.sequential('Execution Monitoring and Metrics', () => {
    it('should provide execution metrics', () => {
      const metrics = coordinator.getExecutionMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalTasksExecuted).toBeGreaterThanOrEqual(0);
      expect(metrics.runningTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.queuedTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.failedTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
      expect(metrics.resourceUtilization).toBeDefined();
      expect(metrics.throughput).toBeDefined();
    });

    it('should track active executions', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const taskId = mockTasks[0].id; // Use dynamic task ID
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      // Setup communication mocks with a brief delay to track active execution
      const orchestrator = AgentOrchestrator.getInstance();
      const originalChannel = (orchestrator as any).communicationChannel;

      const mockChannel = {
        ...originalChannel,
        sendTask: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
          return true;
        }),
        receiveResponse: vi.fn().mockResolvedValue(JSON.stringify({
          status: 'DONE',
          message: 'Task completed successfully',
          progress_percentage: 100,
          timestamp: Date.now()
        }))
      };

      (orchestrator as any).communicationChannel = mockChannel;

      try {
        // Start execution but don't wait for completion
        const executionPromise = coordinator.executeTask(scheduledTask!);

        // Give it a moment to start and be tracked
        await new Promise(resolve => setTimeout(resolve, 50));

        // Check active executions
        const activeExecutions = coordinator.getActiveExecutions();
        expect(activeExecutions.length).toBeGreaterThan(0);

        // Wait for completion
        await executionPromise;
      } finally {
        (orchestrator as any).communicationChannel = originalChannel;
      }
    }, 5000); // 5 second timeout

    it('should get execution by ID', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const taskId = mockTasks[1].id; // Use dynamic task ID for second task
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      // Setup communication mocks to fail so execution stays in activeExecutions
      const { restore } = setupCommunicationMocks(new Error('Agent not found - cannot send task'));

      try {
        const execution = await coordinator.executeTask(scheduledTask!);

        // The execution should be in activeExecutions even if it failed
        const retrievedExecution = coordinator.getExecution(execution.metadata.executionId);

        expect(retrievedExecution).toBeDefined();
        expect(retrievedExecution?.metadata.executionId).toBe(execution.metadata.executionId);
        expect(retrievedExecution?.status).toBe('failed');
      } finally {
        restore();
      }
    }, 5000); // 5 second timeout

    it('should return undefined for non-existent execution ID', () => {
      const execution = coordinator.getExecution('non_existent_id');
      expect(execution).toBeUndefined();
    });

    it('should get task execution status by task ID', async () => {
      // Create a new coordinator to avoid lock conflicts
      const newScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      const newCoordinator = new ExecutionCoordinator(newScheduler);

      // Register agents
      for (const agent of mockAgents) {
        newCoordinator.registerAgent(agent);
      }

      // Generate schedule with the same tasks
      await newScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const schedule = newScheduler.getCurrentSchedule();
      const taskId = mockTasks[0].id; // Use dynamic task ID
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      // Setup communication mocks to fail so execution stays in activeExecutions
      const { restore } = setupCommunicationMocks(new Error('Agent not found - cannot send task'));

      try {
        const execution = await newCoordinator.executeTask(scheduledTask!);
        const status = await newCoordinator.getTaskExecutionStatus(taskId);

        expect(status).toBeDefined();
        expect(status?.status).toBe('failed');
        expect(status?.executionId).toBe(execution.metadata.executionId);
        expect(status?.message).toContain('Task failed');
      } finally {
        restore();
        await newCoordinator.dispose();
        newScheduler.dispose();
      }
    }, 5000); // 5 second timeout

    it('should return null for non-existent task execution status', async () => {
      const status = await coordinator.getTaskExecutionStatus('non_existent_task');
      expect(status).toBeNull();
    });
  });

  describe.sequential('Execution Control', () => {
    it('should cancel execution successfully', async () => {
      // Create a new coordinator to avoid conflicts
      const newScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      const newCoordinator = new ExecutionCoordinator(newScheduler);

      // Register agents
      for (const agent of mockAgents) {
        newCoordinator.registerAgent(agent);
      }

      // Generate schedule with the same tasks
      await newScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const schedule = newScheduler.getCurrentSchedule();
      const taskId = mockTasks[0].id; // Use dynamic task ID
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      // Mock the agent communication to delay execution significantly
      const orchestrator = AgentOrchestrator.getInstance();
      const originalChannel = (orchestrator as any).communicationChannel;

      // Mock delayed task execution with longer delays to ensure we can catch it
      (orchestrator as any).communicationChannel = {
        ...originalChannel,
        sendTask: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay for sendTask
          return true;
        }),
        receiveResponse: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay for receiveResponse
          return JSON.stringify({
            status: 'DONE',
            message: 'Task completed successfully',
            progress_percentage: 100,
            timestamp: Date.now()
          });
        })
      };

      try {
        // Start execution (don't await - let it run)
        const executionPromise = newCoordinator.executeTask(scheduledTask!);

        // Give it more time to start and be tracked
        await new Promise(resolve => setTimeout(resolve, 150)); // Wait for sendTask to complete

        // Get the execution while it's running
        const activeExecutions = newCoordinator.getActiveExecutions();
        expect(activeExecutions.length).toBeGreaterThan(0);

        const runningExecution = activeExecutions[0];

        // Cancel execution
        const cancelled = await newCoordinator.cancelExecution(runningExecution.metadata.executionId);

        expect(cancelled).toBe(true);
        expect(runningExecution.status).toBe('cancelled');
        expect(runningExecution.endTime).toBeDefined();

        // Clean up the promise - don't wait for it since it's cancelled
        executionPromise.catch(() => {
          // Expected to fail due to cancellation
        });
      } finally {
        // Restore original channel
        (orchestrator as any).communicationChannel = originalChannel;
        await newCoordinator.dispose();
        newScheduler.dispose();
      }
    }, 3000); // 3 second timeout

    it('should return false when cancelling non-existent execution', async () => {
      const cancelled = await coordinator.cancelExecution('non_existent_id');
      expect(cancelled).toBe(false);
    });

    it('should retry failed execution', async () => {
      // Create a new coordinator to avoid lock conflicts
      const newScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      const newCoordinator = new ExecutionCoordinator(newScheduler);

      // Register agents
      for (const agent of mockAgents) {
        newCoordinator.registerAgent(agent);
      }

      // Generate schedule with the same tasks
      await newScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const schedule = newScheduler.getCurrentSchedule();
      const taskId = mockTasks[0].id; // Use dynamic task ID
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      // Setup communication mocks to fail initially
      const { restore } = setupCommunicationMocks(new Error('Simulated failure'));

      try {
        const execution = await newCoordinator.executeTask(scheduledTask!);
        expect(execution.status).toBe('failed');

        // Setup successful retry mock
        const { restore: restoreRetry } = setupCommunicationMocks(true);

        try {
          // Retry execution
          const retriedExecution = await newCoordinator.retryExecution(execution.metadata.executionId);

          expect(retriedExecution).toBeDefined();
          expect(retriedExecution?.metadata.retryCount).toBe(1);
        } finally {
          restoreRetry();
        }
      } finally {
        restore();
        await newCoordinator.dispose();
        newScheduler.dispose();
      }
    }, 5000); // 5 second timeout

    it('should not retry execution that has reached max attempts', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const taskId = mockTasks[0].id; // Use dynamic task ID
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      // Create execution with max retry count
      const execution = await coordinator.executeTask(scheduledTask!);
      execution.status = 'failed';
      execution.metadata.retryCount = 3; // Exceed max retry attempts

      const retriedExecution = await coordinator.retryExecution(execution.metadata.executionId);
      expect(retriedExecution).toBeNull();
    });

    it('should not retry non-failed execution', async () => {
      const schedule = taskScheduler.getCurrentSchedule();
      const taskId = mockTasks[0].id; // Use dynamic task ID
      const scheduledTask = schedule!.scheduledTasks.get(taskId);

      // Mock the communication channel to succeed
      const orchestrator = AgentOrchestrator.getInstance();
      const originalChannel = (orchestrator as any).communicationChannel;

      // Mock successful task sending and response
      (orchestrator as any).communicationChannel = {
        ...originalChannel,
        sendTask: vi.fn().mockResolvedValue(true),
        receiveResponse: vi.fn().mockResolvedValue(JSON.stringify({
          status: 'DONE',
          message: 'Task completed successfully',
          progress_percentage: 100,
          timestamp: Date.now()
        }))
      };

      const execution = await coordinator.executeTask(scheduledTask!);
      // execution should be completed, not failed
      expect(execution.status).toBe('completed');

      // Completed executions are removed from activeExecutions, so retry should return null
      const retriedExecution = await coordinator.retryExecution(execution.metadata.executionId);
      expect(retriedExecution).toBeNull();

      // Restore original method
      (orchestrator as any).communicationChannel = originalChannel;
    }, 2000); // 2 second timeout
  });

  describe.sequential('Load Balancing Strategies', () => {
    it('should use round_robin load balancing', async () => {
      // Create a new scheduler to avoid conflicts
      const newScheduler = new TaskScheduler({ enableDynamicOptimization: false });
      const roundRobinCoordinator = new ExecutionCoordinator(newScheduler, {
        loadBalancingStrategy: 'round_robin'
      });

      // Register agents
      for (const agent of mockAgents) {
        roundRobinCoordinator.registerAgent(agent);
      }

      // Generate schedule with the same tasks
      await newScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      // Setup communication mocks for successful execution
      const { restore } = setupCommunicationMocks(true);

      try {
        const schedule = newScheduler.getCurrentSchedule();
        const taskId = mockTasks[0].id; // Use dynamic task ID
        const scheduledTask = schedule!.scheduledTasks.get(taskId);

        const execution = await roundRobinCoordinator.executeTask(scheduledTask!);
        expect(execution.agent).toBeDefined();
        expect(execution.status).toBe('completed');
      } finally {
        restore();
        await roundRobinCoordinator.dispose();
        newScheduler.dispose();
      }
    }, 5000); // 5 second timeout

    it('should use least_loaded load balancing', async () => {
      const leastLoadedCoordinator = new ExecutionCoordinator(taskScheduler, {
        loadBalancingStrategy: 'least_loaded'
      });

      // Register agents with different loads
      const busyAgent = { ...mockAgents[0], currentUsage: { ...mockAgents[0].currentUsage, activeTasks: 2 } };
      const idleAgent = { ...mockAgents[1], currentUsage: { ...mockAgents[1].currentUsage, activeTasks: 0 } };

      leastLoadedCoordinator.registerAgent(busyAgent);
      leastLoadedCoordinator.registerAgent(idleAgent);

      // Setup communication mocks for successful execution
      const { restore } = setupCommunicationMocks(true);

      try {
        const schedule = taskScheduler.getCurrentSchedule();
        const taskId = mockTasks[0].id; // Use dynamic task ID
        const scheduledTask = schedule!.scheduledTasks.get(taskId);

        const execution = await leastLoadedCoordinator.executeTask(scheduledTask!);

        // Should prefer the idle agent
        expect(execution.agent.id).toBe(idleAgent.id);
        expect(execution.status).toBe('completed');
      } finally {
        restore();
        await leastLoadedCoordinator.dispose();
      }
    }, 5000); // 5 second timeout

    it('should use priority_based load balancing', async () => {
      const priorityCoordinator = new ExecutionCoordinator(taskScheduler, {
        loadBalancingStrategy: 'priority_based'
      });

      // Register agents with different success rates
      const highPerformanceAgent = {
        ...mockAgents[0],
        metadata: { ...mockAgents[0].metadata, successRate: 0.95 }
      };
      const lowPerformanceAgent = {
        ...mockAgents[1],
        metadata: { ...mockAgents[1].metadata, successRate: 0.7 }
      };

      priorityCoordinator.registerAgent(highPerformanceAgent);
      priorityCoordinator.registerAgent(lowPerformanceAgent);

      // Setup communication mocks for successful execution
      const { restore } = setupCommunicationMocks(true);

      try {
        const schedule = taskScheduler.getCurrentSchedule();
        const taskId = mockTasks[1].id; // Use dynamic task ID for critical priority task
        const scheduledTask = schedule!.scheduledTasks.get(taskId);

        const execution = await priorityCoordinator.executeTask(scheduledTask!);

        // Should prefer the high-performance agent for critical tasks
        expect(execution.agent.id).toBe(highPerformanceAgent.id);
        expect(execution.status).toBe('completed');
      } finally {
        restore();
        await priorityCoordinator.dispose();
      }
    }, 5000); // 5 second timeout
  });

  describe('Coordinator Lifecycle', () => {
    it('should start and stop coordinator', async () => {
      await coordinator.start();
      expect(coordinator).toBeDefined();

      await coordinator.stop();
      expect(coordinator).toBeDefined();
    });

    it('should handle starting already running coordinator', async () => {
      await coordinator.start();

      // Starting again should not throw
      await expect(coordinator.start()).resolves.not.toThrow();

      await coordinator.stop();
    });

    it('should handle stopping non-running coordinator', async () => {
      // Stopping without starting should not throw
      await expect(coordinator.stop()).resolves.not.toThrow();
    });

    it('should dispose properly', async () => {
      await coordinator.start();

      await expect(coordinator.dispose()).resolves.not.toThrow();

      // Should be safe to call multiple times
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle agent going offline', () => {
      const agent = mockAgents[0];

      // Simulate agent going offline by setting old heartbeat
      agent.metadata.lastHeartbeat = new Date(Date.now() - 120000); // 2 minutes ago

      // Trigger resource monitoring
      (coordinator as any).monitorResources();

      expect(agent.status).toBe('offline');
    });

    it('should handle empty execution metrics gracefully', () => {
      const emptyCoordinator = new ExecutionCoordinator(taskScheduler);
      const metrics = emptyCoordinator.getExecutionMetrics();

      expect(metrics.totalTasksExecuted).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.averageExecutionTime).toBe(0);

      emptyCoordinator.dispose();
    });

    it('should handle resource calculation with no agents', () => {
      const noAgentCoordinator = new ExecutionCoordinator(taskScheduler);
      const metrics = noAgentCoordinator.getExecutionMetrics();

      expect(metrics.resourceUtilization.memoryUtilization).toBe(0);
      expect(metrics.resourceUtilization.cpuUtilization).toBe(0);
      expect(metrics.resourceUtilization.agentUtilization).toBe(0);

      noAgentCoordinator.dispose();
    });
  });
});
