/**
 * Intelligent Agent Assignment Service Tests
 *
 * Comprehensive test suite for the IntelligentAgentAssignmentService covering:
 * - Real-time workload tracking and distribution
 * - Capability-based matching with performance history
 * - Dynamic load balancing algorithms
 * - Performance-aware assignment strategies
 * - Predictive workload management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IntelligentAgentAssignmentService, AgentAssignmentConfig, WorkloadDistributionStrategy } from '../../services/intelligent-agent-assignment.js';
import { Agent, AgentCapability, TaskAssignment } from '../../types/agent.js';
import { AtomicTask, TaskStatus } from '../../types/task.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('IntelligentAgentAssignmentService', () => {
  let assignmentService: IntelligentAgentAssignmentService;
  let mockAgents: Agent[];
  let mockTasks: AtomicTask[];

  beforeEach(() => {
    const config: AgentAssignmentConfig = {
      strategy: 'intelligent_hybrid',
      maxTasksPerAgent: 5,
      workloadBalanceThreshold: 0.8,
      capabilityMatchWeight: 0.4,
      performanceWeight: 0.3,
      availabilityWeight: 0.3,
      predictiveLoadingEnabled: true,
      autoRebalanceEnabled: true,
      rebalanceInterval: 30000
    };

    assignmentService = new IntelligentAgentAssignmentService(config);

    // Create mock agents with different capabilities and performance
    mockAgents = [
      {
        id: 'agent_1',
        name: 'Development Specialist',
        description: 'Specialized in code generation and development tasks',
        status: 'idle',
        capabilities: ['code_generation', 'testing', 'debugging'],
        currentTask: undefined,
        taskQueue: [],
        performance: {
          tasksCompleted: 45,
          averageCompletionTime: 3600000, // 1 hour
          successRate: 0.95,
          lastActiveAt: new Date()
        },
        config: {
          maxConcurrentTasks: 3,
          preferredTaskTypes: ['development', 'testing']
        },
        communication: {
          protocol: 'direct',
          timeout: 30000
        },
        metadata: {
          createdAt: new Date(),
          lastUpdatedAt: new Date(),
          version: '1.0.0',
          tags: ['senior', 'fullstack']
        }
      },
      {
        id: 'agent_2',
        name: 'Research Expert',
        description: 'Specialized in research and documentation',
        status: 'busy',
        capabilities: ['research', 'documentation', 'optimization'],
        currentTask: 'T999',
        taskQueue: ['T998'],
        performance: {
          tasksCompleted: 32,
          averageCompletionTime: 2700000, // 45 minutes
          successRate: 0.88,
          lastActiveAt: new Date()
        },
        config: {
          maxConcurrentTasks: 2,
          preferredTaskTypes: ['research', 'documentation']
        },
        communication: {
          protocol: 'direct',
          timeout: 30000
        },
        metadata: {
          createdAt: new Date(),
          lastUpdatedAt: new Date(),
          version: '1.0.0',
          tags: ['specialist', 'analyst']
        }
      },
      {
        id: 'agent_3',
        name: 'Deployment Specialist',
        description: 'Specialized in deployment and operations',
        status: 'idle',
        capabilities: ['deployment', 'optimization', 'debugging'],
        currentTask: undefined,
        taskQueue: [],
        performance: {
          tasksCompleted: 28,
          averageCompletionTime: 4500000, // 1.25 hours
          successRate: 0.92,
          lastActiveAt: new Date()
        },
        config: {
          maxConcurrentTasks: 2,
          preferredTaskTypes: ['deployment']
        },
        communication: {
          protocol: 'direct',
          timeout: 30000
        },
        metadata: {
          createdAt: new Date(),
          lastUpdatedAt: new Date(),
          version: '1.0.0',
          tags: ['devops', 'senior']
        }
      }
    ];

    // Create mock tasks with different requirements
    mockTasks = [
      {
        id: 'T001',
        title: 'Implement authentication system',
        description: 'Build JWT-based authentication',
        status: 'pending',
        priority: 'high',
        type: 'development',
        estimatedHours: 4,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        dependents: [],
        filePaths: ['src/auth/'],
        acceptanceCriteria: ['JWT implementation', 'Security tests'],
        testingRequirements: {
          unitTests: ['auth.test.ts'],
          integrationTests: ['auth-integration.test.ts'],
          performanceTests: [],
          coverageTarget: 95
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: ['security'],
          documentation: ['api-docs'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['oauth'],
          patterns: ['jwt']
        },
        validationMethods: {
          automated: ['security-scan'],
          manual: ['security-review']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user',
        tags: ['security', 'critical'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user',
          tags: ['security', 'critical']
        }
      },
      {
        id: 'T002',
        title: 'Research authentication patterns',
        description: 'Research modern authentication patterns',
        status: 'pending',
        priority: 'medium',
        type: 'research',
        estimatedHours: 2,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        dependents: ['T001'],
        filePaths: ['docs/research/'],
        acceptanceCriteria: ['Pattern analysis', 'Recommendations'],
        testingRequirements: {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 0
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: [],
          documentation: ['research-report'],
          typeScript: false,
          eslint: false
        },
        integrationCriteria: {
          compatibility: [],
          patterns: []
        },
        validationMethods: {
          automated: [],
          manual: ['peer-review']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user',
        tags: ['research'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'user',
          tags: ['research']
        }
      }
    ];

    // Register agents
    for (const agent of mockAgents) {
      assignmentService.registerAgent(agent);
    }
  });

  afterEach(() => {
    assignmentService.dispose();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultService = new IntelligentAgentAssignmentService();
      expect(defaultService).toBeDefined();
      defaultService.dispose();
    });

    it('should initialize with custom configuration', () => {
      const customConfig: AgentAssignmentConfig = {
        strategy: 'capability_first',
        maxTasksPerAgent: 10,
        workloadBalanceThreshold: 0.9,
        capabilityMatchWeight: 0.5,
        performanceWeight: 0.3,
        availabilityWeight: 0.2,
        predictiveLoadingEnabled: false,
        autoRebalanceEnabled: false
      };

      const customService = new IntelligentAgentAssignmentService(customConfig);
      expect(customService).toBeDefined();
      customService.dispose();
    });

    it('should validate configuration parameters', () => {
      expect(() => new IntelligentAgentAssignmentService({ 
        maxTasksPerAgent: -1 
      })).toThrow();
      
      expect(() => new IntelligentAgentAssignmentService({ 
        workloadBalanceThreshold: 1.5 
      })).toThrow();
      
      expect(() => new IntelligentAgentAssignmentService({ 
        capabilityMatchWeight: -0.1 
      })).toThrow();
    });
  });

  describe('Agent Registration and Management', () => {
    it('should register agents successfully', () => {
      const newAgent: Agent = {
        ...mockAgents[0],
        id: 'agent_4',
        name: 'Test Agent'
      };

      const result = assignmentService.registerAgent(newAgent);
      expect(result.success).toBe(true);
      expect(assignmentService.getAgent('agent_4')).toBeDefined();
    });

    it('should prevent duplicate agent registration', () => {
      const result = assignmentService.registerAgent(mockAgents[0]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });

    it('should unregister agents successfully', () => {
      const result = assignmentService.unregisterAgent('agent_1');
      expect(result.success).toBe(true);
      expect(assignmentService.getAgent('agent_1')).toBeUndefined();
    });

    it('should update agent status and workload', () => {
      assignmentService.updateAgentStatus('agent_1', 'busy');
      const agent = assignmentService.getAgent('agent_1');
      expect(agent?.status).toBe('busy');
    });
  });

  describe('Intelligent Task Assignment', () => {
    it('should assign tasks based on capability matching', async () => {
      const assignment = await assignmentService.assignTask(mockTasks[0]); // Development task
      
      expect(assignment.success).toBe(true);
      expect(assignment.assignment?.agentId).toBe('agent_1'); // Development specialist
      expect(assignment.assignment?.taskId).toBe('T001');
    });

    it('should assign research tasks to research specialist', async () => {
      // First unassign the current task from agent_2 to make them available
      assignmentService.updateAgentStatus('agent_2', 'idle');
      const agent2 = assignmentService.getAgent('agent_2');
      if (agent2) {
        agent2.currentTask = undefined;
        agent2.taskQueue = [];
      }

      const assignment = await assignmentService.assignTask(mockTasks[1]); // Research task
      
      expect(assignment.success).toBe(true);
      expect(assignment.assignment?.agentId).toBe('agent_2'); // Research specialist
    });

    it('should consider agent performance in assignment decisions', async () => {
      // Create two agents with same capabilities but different performance
      const highPerfAgent: Agent = {
        ...mockAgents[0],
        id: 'agent_high_perf',
        performance: {
          tasksCompleted: 100,
          averageCompletionTime: 1800000, // 30 minutes
          successRate: 0.98,
          lastActiveAt: new Date()
        }
      };

      const lowPerfAgent: Agent = {
        ...mockAgents[0],
        id: 'agent_low_perf',
        performance: {
          tasksCompleted: 20,
          averageCompletionTime: 7200000, // 2 hours
          successRate: 0.75,
          lastActiveAt: new Date()
        }
      };

      assignmentService.registerAgent(highPerfAgent);
      assignmentService.registerAgent(lowPerfAgent);

      const assignment = await assignmentService.assignTask(mockTasks[0]);
      
      expect(assignment.success).toBe(true);
      // Should prefer high performance agent
      expect(['agent_1', 'agent_high_perf'].includes(assignment.assignment?.agentId || '')).toBe(true);
    });

    it('should handle workload balancing', async () => {
      // Overload agent_1
      const agent1 = assignmentService.getAgent('agent_1');
      if (agent1) {
        agent1.taskQueue = ['T100', 'T101', 'T102', 'T103', 'T104']; // Max capacity
        agent1.status = 'busy';
      }

      const assignment = await assignmentService.assignTask(mockTasks[0]);
      
      expect(assignment.success).toBe(true);
      // Should not assign to overloaded agent_1
      expect(assignment.assignment?.agentId).not.toBe('agent_1');
    });

    it('should reject assignment when no suitable agents available', async () => {
      // Mark all agents as offline
      for (const agent of mockAgents) {
        assignmentService.updateAgentStatus(agent.id, 'offline');
      }

      const assignment = await assignmentService.assignTask(mockTasks[0]);
      
      expect(assignment.success).toBe(false);
      expect(assignment.error).toContain('No suitable agents available');
    });
  });

  describe('Workload Distribution Strategies', () => {
    it('should implement round-robin distribution', async () => {
      const roundRobinService = new IntelligentAgentAssignmentService({
        strategy: 'round_robin'
      });

      // Register same agents
      for (const agent of mockAgents) {
        roundRobinService.registerAgent(agent);
      }

      const assignments: string[] = [];
      
      for (let i = 0; i < 3; i++) {
        const task = { ...mockTasks[0], id: `T_RR_${i}` };
        const assignment = await roundRobinService.assignTask(task);
        if (assignment.success && assignment.assignment) {
          assignments.push(assignment.assignment.agentId);
        }
      }

      // Should distribute across different agents
      const uniqueAgents = new Set(assignments);
      expect(uniqueAgents.size).toBeGreaterThan(1);
      
      roundRobinService.dispose();
    });

    it('should implement least-loaded distribution', async () => {
      const leastLoadedService = new IntelligentAgentAssignmentService({
        strategy: 'least_loaded'
      });

      // Register agents and load one heavily
      for (const agent of mockAgents) {
        leastLoadedService.registerAgent(agent);
      }

      // Load agent_1 heavily
      const agent1 = leastLoadedService.getAgent('agent_1');
      if (agent1) {
        agent1.taskQueue = ['T100', 'T101', 'T102'];
      }

      const assignment = await leastLoadedService.assignTask(mockTasks[0]);
      
      expect(assignment.success).toBe(true);
      // Should assign to less loaded agent
      expect(assignment.assignment?.agentId).not.toBe('agent_1');
      
      leastLoadedService.dispose();
    });

    it('should implement capability-first distribution', async () => {
      const capabilityService = new IntelligentAgentAssignmentService({
        strategy: 'capability_first',
        capabilityMatchWeight: 1.0,
        performanceWeight: 0.0,
        availabilityWeight: 0.0
      });

      for (const agent of mockAgents) {
        capabilityService.registerAgent(agent);
      }

      const assignment = await capabilityService.assignTask(mockTasks[1]); // Research task
      
      expect(assignment.success).toBe(true);
      // Should strongly prefer research specialist
      expect(assignment.assignment?.agentId).toBe('agent_2');
      
      capabilityService.dispose();
    });
  });

  describe('Performance-Aware Assignment', () => {
    it('should track and use performance metrics', async () => {
      const stats = assignmentService.getPerformanceStats();
      expect(stats.totalAgents).toBe(3);
      expect(stats.averageSuccessRate).toBeGreaterThan(0);
      expect(stats.averageCompletionTime).toBeGreaterThan(0);
    });

    it('should predict task completion times', () => {
      const prediction = assignmentService.predictTaskCompletion('agent_1', mockTasks[0]);
      
      expect(prediction.estimatedCompletionTime).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
    });

    it('should consider agent efficiency in assignments', async () => {
      // Agent 2 has better efficiency (45 min vs 1 hour average)
      const assignment = await assignmentService.findBestAgent(mockTasks[1]); // Research task
      
      expect(assignment.agentId).toBe('agent_2'); // Most efficient for research
      expect(assignment.score).toBeGreaterThan(0);
    });
  });

  describe('Dynamic Load Balancing', () => {
    it('should detect workload imbalances', () => {
      // Overload one agent
      const agent1 = assignmentService.getAgent('agent_1');
      if (agent1) {
        agent1.taskQueue = ['T100', 'T101', 'T102', 'T103'];
      }

      const imbalance = assignmentService.detectWorkloadImbalance();
      expect(imbalance.isImbalanced).toBe(true);
      expect(imbalance.overloadedAgents.length).toBeGreaterThan(0);
      expect(imbalance.underloadedAgents.length).toBeGreaterThan(0);
    });

    it('should suggest task redistributions', () => {
      // Create imbalance
      const agent1 = assignmentService.getAgent('agent_1');
      if (agent1) {
        agent1.taskQueue = ['T100', 'T101', 'T102', 'T103'];
      }

      const suggestions = assignmentService.suggestTaskRedistribution();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].fromAgent).toBe('agent_1');
      expect(suggestions[0].tasksToMove.length).toBeGreaterThan(0);
    });

    it('should execute task rebalancing', async () => {
      // Create imbalance
      const agent1 = assignmentService.getAgent('agent_1');
      if (agent1) {
        agent1.taskQueue = ['T100', 'T101', 'T102', 'T103'];
      }

      const result = await assignmentService.rebalanceWorkload();
      expect(result.success).toBe(true);
      expect(result.redistributions).toBeGreaterThan(0);
    });
  });

  describe('Predictive Workload Management', () => {
    it('should predict future workload patterns', () => {
      const prediction = assignmentService.predictWorkloadTrends(3600000); // 1 hour ahead
      
      expect(prediction.timeHorizon).toBe(3600000);
      expect(prediction.agentUtilization).toBeDefined();
      expect(prediction.expectedBottlenecks.length).toBeGreaterThanOrEqual(0);
    });

    it('should recommend proactive agent scaling', () => {
      const recommendations = assignmentService.getScalingRecommendations();
      
      expect(recommendations.currentCapacity).toBeGreaterThan(0);
      expect(recommendations.recommendedCapacity).toBeGreaterThan(0);
      expect(recommendations.reasoning).toBeDefined();
    });

    it('should optimize agent allocation for upcoming tasks', async () => {
      const upcomingTasks = [mockTasks[0], mockTasks[1]];
      const optimization = await assignmentService.optimizeForUpcomingTasks(upcomingTasks);
      
      expect(optimization.success).toBe(true);
      expect(optimization.assignments.length).toBe(upcomingTasks.length);
    });
  });

  describe('Real-time Monitoring and Metrics', () => {
    it('should provide real-time workload metrics', () => {
      const metrics = assignmentService.getRealTimeMetrics();
      
      expect(metrics.totalAgents).toBe(3);
      expect(metrics.activeAgents).toBeGreaterThanOrEqual(0);
      expect(metrics.averageLoad).toBeGreaterThanOrEqual(0);
      expect(metrics.taskThroughput).toBeGreaterThanOrEqual(0);
    });

    it('should track assignment efficiency', () => {
      const efficiency = assignmentService.getAssignmentEfficiency();
      
      expect(efficiency.successfulAssignments).toBeGreaterThanOrEqual(0);
      expect(efficiency.failedAssignments).toBeGreaterThanOrEqual(0);
      expect(efficiency.averageAssignmentTime).toBeGreaterThanOrEqual(0);
      expect(efficiency.capabilityMatchRate).toBeGreaterThanOrEqual(0);
    });

    it('should emit workload events', async () => {
      const events: any[] = [];
      
      assignmentService.on('workload:imbalance', (event) => {
        events.push(event);
      });

      // Trigger imbalance
      const agent1 = assignmentService.getAgent('agent_1');
      if (agent1) {
        agent1.taskQueue = ['T100', 'T101', 'T102', 'T103', 'T104'];
      }

      await assignmentService.checkAndEmitWorkloadEvents();
      
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('imbalance_detected');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle agent failures gracefully', async () => {
      // Mark agent as error state
      assignmentService.updateAgentStatus('agent_1', 'error');
      
      const assignment = await assignmentService.assignTask(mockTasks[0]);
      
      expect(assignment.success).toBe(true);
      // Should assign to another agent
      expect(assignment.assignment?.agentId).not.toBe('agent_1');
    });

    it('should handle task assignment conflicts', async () => {
      const task = mockTasks[0];
      
      // Try to assign same task twice
      const assignment1 = await assignmentService.assignTask(task);
      const assignment2 = await assignmentService.assignTask(task);
      
      expect(assignment1.success).toBe(true);
      expect(assignment2.success).toBe(false);
      expect(assignment2.error).toContain('already assigned');
    });

    it('should validate task requirements', async () => {
      const invalidTask = {
        ...mockTasks[0],
        estimatedHours: -1 // Invalid
      };
      
      const assignment = await assignmentService.assignTask(invalidTask);
      
      expect(assignment.success).toBe(false);
      expect(assignment.error).toContain('Invalid task');
    });
  });

  describe('Configuration and Tuning', () => {
    it('should update assignment strategy dynamically', () => {
      assignmentService.updateStrategy('capability_first');
      const metrics = assignmentService.getRealTimeMetrics();
      expect(metrics.currentStrategy).toBe('capability_first');
    });

    it('should adjust workload thresholds', () => {
      assignmentService.updateWorkloadThreshold(0.6);
      const config = assignmentService.getConfiguration();
      expect(config.workloadBalanceThreshold).toBe(0.6);
    });

    it('should provide configuration recommendations', () => {
      const recommendations = assignmentService.getConfigurationRecommendations();
      
      expect(recommendations.currentPerformance).toBeDefined();
      expect(recommendations.suggestedChanges.length).toBeGreaterThanOrEqual(0);
      expect(recommendations.expectedImprovement).toBeDefined();
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should dispose properly', () => {
      expect(() => assignmentService.dispose()).not.toThrow();
      
      // Should be safe to call multiple times
      expect(() => assignmentService.dispose()).not.toThrow();
    });

    it('should clear all assignments on disposal', async () => {
      await assignmentService.assignTask(mockTasks[0]);
      
      assignmentService.dispose();
      
      const assignments = assignmentService.getActiveAssignments();
      expect(assignments.length).toBe(0);
    });
  });
});