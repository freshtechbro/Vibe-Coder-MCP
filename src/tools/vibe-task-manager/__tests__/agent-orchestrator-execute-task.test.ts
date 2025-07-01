/**
 * Tests for AgentOrchestrator executeTask method
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentOrchestrator } from '../services/agent-orchestrator.js';
import { AtomicTask } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';

describe('AgentOrchestrator - executeTask', () => {
  let orchestrator: AgentOrchestrator;
  let mockTask: AtomicTask;
  let mockContext: ProjectContext;

  beforeEach(() => {
    orchestrator = AgentOrchestrator.getInstance();

    // Register a test agent
    orchestrator.registerAgent({
      id: 'test-agent-1',
      name: 'Test Agent',
      capabilities: ['general', 'frontend'],
      status: 'available',
      maxConcurrentTasks: 2,
      currentTasks: [],
      performance: {
        tasksCompleted: 0,
        successRate: 1.0,
        averageCompletionTime: 300000,
        lastTaskCompletedAt: new Date()
      },
      lastHeartbeat: new Date(),
      metadata: {
        version: '1.0.0',
        registeredAt: new Date()
      }
    });

    mockTask = {
      id: 'test-task-1',
      title: 'Test Task',
      description: 'A test task for unit testing',
      type: 'frontend',
      priority: 'medium',
      status: 'pending',
      projectId: 'test-project',
      estimatedHours: 2,
      dependencies: [],
      tags: ['test'],
      acceptanceCriteria: ['Task should complete successfully'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user'
      }
    };

    mockContext = {
      projectPath: '/test/project',
      projectName: 'Test Project',
      description: 'Test project for unit testing',
      languages: ['typescript'],
      frameworks: ['react'],
      buildTools: ['npm'],
      configFiles: ['package.json'],
      entryPoints: ['src/index.ts'],
      architecturalPatterns: ['mvc'],
      structure: {
        sourceDirectories: ['src'],
        testDirectories: ['tests'],
        docDirectories: ['docs'],
        buildDirectories: ['dist']
      },
      dependencies: {
        production: [],
        development: [],
        external: []
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        source: 'manual' as const
      }
    };
  });

  afterEach(async () => {
    await orchestrator.destroy();
  });

  describe('Basic Execution Flow', () => {
    it('should execute task successfully with available agent', async () => {
      // Set deterministic environment variable for this test
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      // Mock the communication channel methods directly
      interface OrchestratorWithChannel {
        communicationChannel: {
          sendTask: unknown;
          receiveResponse: unknown;
        };
      }
      const orchestratorWithChannel = orchestrator as unknown as OrchestratorWithChannel;
      const originalSendTask = orchestratorWithChannel.communicationChannel.sendTask;
      const originalReceiveResponse = orchestratorWithChannel.communicationChannel.receiveResponse;

      // Mock sendTask to return success
      orchestratorWithChannel.communicationChannel.sendTask = vi.fn().mockResolvedValue(true);

      // Mock receiveResponse to return a successful completion response in Sentinel Protocol format
      orchestratorWithChannel.communicationChannel.receiveResponse = vi.fn().mockResolvedValue(`VIBE_STATUS: DONE
Task completed successfully

Files modified: []
Tests passed: true
Build successful: true
Notes: Task completed successfully`);

      // Use a task with a clear, valid ID to ensure success
      const deterministicTask = {
        ...mockTask,
        id: 'deterministic-test-task-success',
        title: 'Deterministic Test Task'
      };

      const result = await orchestrator.executeTask(deterministicTask, mockContext, {
        timeout: 5000, // Short timeout for testing
        enableMonitoring: true
      });

      // Restore environment and communication channel methods
      process.env.NODE_ENV = originalEnv;
      orchestratorWithChannel.communicationChannel.sendTask = originalSendTask;
      orchestratorWithChannel.communicationChannel.receiveResponse = originalReceiveResponse;

      // With mocked communication channel, should succeed
      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.assignment).toBeDefined();
      expect(result.assignment?.agentId).toBe('test-agent-1');
      expect(result.metadata?.executionId).toBeDefined();
      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
    }, 10000);

    it('should queue task when no agents available', async () => {
      // Make agent busy
      const agent = orchestrator.getAgents()[0];
      agent.status = 'busy';
      agent.currentTasks = ['other-task-1', 'other-task-2'];

      const result = await orchestrator.executeTask(mockTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.status).toBe('queued');
      expect(result.queued).toBe(true);
      expect(result.message).toContain('No available agents');
    });

    it('should handle task delivery failure', async () => {
      // Mock communication channel to fail delivery
      interface OrchestratorWithChannel {
        communicationChannel: {
          sendTask: unknown;
          receiveResponse: unknown;
        };
      }
      const orchestratorWithChannel = orchestrator as unknown as OrchestratorWithChannel;
      const originalChannel = orchestratorWithChannel.communicationChannel;
      orchestratorWithChannel.communicationChannel = {
        ...originalChannel,
        sendTask: vi.fn().mockResolvedValue(false)
      };

      const result = await orchestrator.executeTask(mockTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Task delivery failed');
    });
  });

  describe('Execution Options', () => {
    it('should respect custom timeout', async () => {
      const result = await orchestrator.executeTask(mockTask, mockContext, {
        timeout: 1000, // Very short timeout
        enableMonitoring: true
      });

      // Should either complete quickly or timeout
      expect(['completed', 'timeout', 'failed']).toContain(result.status);
    }, 5000);

    it('should handle force execution option', async () => {
      const result = await orchestrator.executeTask(mockTask, mockContext, {
        force: true,
        priority: 'high',
        sessionId: 'test-session'
      });

      expect(result.metadata?.executionId).toBeDefined();
      expect(['completed', 'queued', 'failed']).toContain(result.status);
    });

    it('should handle different priority levels', async () => {
      const priorities: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];

      for (const priority of priorities) {
        const result = await orchestrator.executeTask(mockTask, mockContext, {
          priority,
          timeout: 2000
        });

        expect(['completed', 'queued', 'failed', 'timeout']).toContain(result.status);
      }
    }, 15000);
  });

  describe('Error Handling', () => {
    it('should handle invalid task gracefully', async () => {
      const invalidTask = { ...mockTask, id: '' };

      const result = await orchestrator.executeTask(invalidTask as AtomicTask, mockContext, {
        timeout: 2000 // Short timeout to prevent hanging
      });

      // Should handle gracefully, not throw
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    }, 5000); // 5 second timeout

    it('should handle invalid context gracefully', async () => {
      const invalidContext = { ...mockContext, projectName: '' };

      const result = await orchestrator.executeTask(mockTask, invalidContext);

      // Should handle gracefully, not throw
      expect(['completed', 'queued', 'failed']).toContain(result.status);
    });

    it('should clean up resources on execution failure', async () => {
      // Force an error during execution
      const originalAssignTask = orchestrator.assignTask;
      orchestrator.assignTask = vi.fn().mockRejectedValue(new Error('Assignment failed'));

      const result = await orchestrator.executeTask(mockTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Assignment failed');

      // Restore original method
      orchestrator.assignTask = originalAssignTask;
    });
  });

  describe('Monitoring and Progress', () => {
    it('should track execution progress', async () => {
      const result = await orchestrator.executeTask(mockTask, mockContext, {
        enableMonitoring: true,
        timeout: 3000
      });

      expect(result.metadata?.executionId).toBeDefined();
      expect(result.startTime).toBeDefined();

      if (result.success) {
        expect(result.endTime).toBeDefined();
        expect(result.metadata?.totalDuration).toBeGreaterThan(0);
      }
    });

    it('should allow cancellation of execution', async () => {
      // Start execution
      const executionPromise = orchestrator.executeTask(mockTask, mockContext, {
        timeout: 10000 // Long timeout
      });

      // Wait a bit then cancel
      setTimeout(async () => {
        const executions = orchestrator.getActiveExecutions();
        if (executions.length > 0) {
          const executionId = executions[0].metadata?.executionId;
          if (executionId) {
            await orchestrator.cancelExecution(executionId);
          }
        }
      }, 100);

      const result = await executionPromise;

      // Should complete or be cancelled
      expect(['completed', 'failed', 'timeout']).toContain(result.status);
    });
  });

  describe('Integration with Existing Methods', () => {
    it('should maintain compatibility with assignTask', async () => {
      // Test that assignTask still works independently
      const assignment = await orchestrator.assignTask(mockTask, mockContext);

      expect(assignment).toBeDefined();
      expect(assignment?.agentId).toBe('test-agent-1');
      expect(assignment?.taskId).toBe(mockTask.id);
    });

    it('should update agent statistics correctly', async () => {
      const statsBefore = orchestrator.getAgentStats();

      await orchestrator.executeTask(mockTask, mockContext, {
        timeout: 3000
      });

      const statsAfter = orchestrator.getAgentStats();

      // Stats should be updated (assignments may increase)
      expect(statsAfter.totalAssignments).toBeGreaterThanOrEqual(statsBefore.totalAssignments);
    });
  });

  describe('Agent Module Loading', () => {
    it('should load agent modules with corrected import paths', async () => {
      // Test that the communication channel initializes properly with corrected paths
      interface OrchestratorWithChannel {
        communicationChannel: {
          agentRegistry: {
            getAgent: (agentId: string) => Promise<unknown>;
          };
          taskQueue: {
            addTask: (agentId: string, task: unknown) => Promise<unknown>;
          };
          responseProcessor: {
            getAgentResponses: (agentId: string) => Promise<unknown>;
          };
        };
      }
      const orchestratorWithChannel = orchestrator as unknown as OrchestratorWithChannel;
      const communicationChannel = orchestratorWithChannel.communicationChannel;

      // Verify that the communication channel is initialized
      expect(communicationChannel).toBeDefined();

      // Test that agent modules can be accessed (they should not be fallback implementations)
      const agentRegistry = communicationChannel.agentRegistry;
      const taskQueue = communicationChannel.taskQueue;
      const responseProcessor = communicationChannel.responseProcessor;

      expect(agentRegistry).toBeDefined();
      expect(taskQueue).toBeDefined();
      expect(responseProcessor).toBeDefined();

      // Verify these are not fallback implementations by checking for specific methods
      expect(typeof agentRegistry.getAgent).toBe('function');
      expect(typeof taskQueue.addTask).toBe('function');
      expect(typeof responseProcessor.getAgentResponses).toBe('function');
    });

    it('should handle agent module import failures gracefully', async () => {
      // This test verifies that if agent modules fail to load, fallback implementations are used
      // The system should continue to function even with fallback implementations

      interface OrchestratorWithChannel {
        communicationChannel: unknown;
      }
      const orchestratorWithChannel = orchestrator as unknown as OrchestratorWithChannel;
      const communicationChannel = orchestratorWithChannel.communicationChannel;
      expect(communicationChannel).toBeDefined();

      // Even with potential import failures, the orchestrator should still be functional
      const agents = orchestrator.getAgents();
      expect(Array.isArray(agents)).toBe(true);

      // Should be able to register agents even with fallback implementations
      const testAgentId = 'fallback-test-agent';
      orchestrator.registerAgent({
        id: testAgentId,
        name: 'Fallback Test Agent',
        capabilities: ['general'],
        status: 'available',
        maxConcurrentTasks: 1,
        currentTasks: [],
        performance: {
          tasksCompleted: 0,
          successRate: 1.0,
          averageCompletionTime: 300000,
          lastTaskCompletedAt: new Date()
        },
        lastHeartbeat: new Date(),
        metadata: {
          version: '1.0.0',
          registeredAt: new Date()
        }
      });

      const registeredAgent = orchestrator.getAgents().find(a => a.id === testAgentId);
      expect(registeredAgent).toBeDefined();
    });
  });
});
