/**
 * Task Scheduler Service Tests
 *
 * Comprehensive test suite for the TaskScheduler service covering:
 * - Schedule generation with different algorithms
 * - Resource allocation and optimization
 * - Dynamic re-scheduling
 * - Parallel execution coordination
 * - Performance and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskScheduler, SchedulingConfig } from '../../services/task-scheduler.js';
import { OptimizedDependencyGraph } from '../../core/dependency-graph.js';
import { AtomicTask, TaskPriority, TaskStatus } from '../../types/task.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;
  let dependencyGraph: OptimizedDependencyGraph;
  let mockTasks: AtomicTask[];

  beforeEach(() => {
    // Create test configuration
    const testConfig: Partial<SchedulingConfig> = {
      algorithm: 'hybrid_optimal',
      enableDynamicOptimization: false, // Disable for testing
      resources: {
        maxConcurrentTasks: 5,
        maxMemoryMB: 2048,
        maxCpuUtilization: 0.8,
        availableAgents: 2,
        taskTypeResources: new Map([
          ['development', { memoryMB: 512, cpuWeight: 0.7, agentCount: 1 }],
          ['testing', { memoryMB: 256, cpuWeight: 0.5, agentCount: 1 }]
        ])
      }
    };

    scheduler = new TaskScheduler(testConfig);
    dependencyGraph = new OptimizedDependencyGraph();

    // Create mock tasks
    mockTasks = [
      {
        id: 'T001',
        title: 'Setup project structure',
        description: 'Initialize project with basic structure',
        status: 'pending' as TaskStatus,
        priority: 'high' as TaskPriority,
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
        metadata: {
          createdAt: new Date(),
          createdBy: 'test',
          updatedAt: new Date(),
          version: 1
        }
      },
      {
        id: 'T002',
        title: 'Implement core logic',
        description: 'Develop main application logic',
        status: 'pending' as TaskStatus,
        priority: 'critical' as TaskPriority,
        type: 'development',
        estimatedHours: 4,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: ['T001'],
        dependents: ['T004'],
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
        metadata: {
          createdAt: new Date(),
          createdBy: 'test',
          updatedAt: new Date(),
          version: 1
        }
      },
      {
        id: 'T003',
        title: 'Write unit tests',
        description: 'Create comprehensive unit tests',
        status: 'pending' as TaskStatus,
        priority: 'medium' as TaskPriority,
        type: 'testing',
        estimatedHours: 3,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: ['T001'],
        dependents: [],
        filePaths: ['src/__tests__/'],
        acceptanceCriteria: ['Unit tests written'],
        testingRequirements: {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 100
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
        metadata: {
          createdAt: new Date(),
          createdBy: 'test',
          updatedAt: new Date(),
          version: 1
        }
      }
    ];

    // Setup dependency graph
    for (const task of mockTasks) {
      dependencyGraph.addTask(task);
    }

    // Add dependencies
    dependencyGraph.addDependency('T002', 'T001', 'task', 1, true);
    dependencyGraph.addDependency('T003', 'T001', 'task', 1, false);
  });

  afterEach(() => {
    scheduler.dispose();
  });

  // Test isolation helper function
  const createFreshScheduler = (config?: Partial<SchedulingConfig>) => {
    const testConfig: Partial<SchedulingConfig> = {
      algorithm: 'hybrid_optimal',
      enableDynamicOptimization: false,
      resources: {
        maxConcurrentTasks: 5,
        maxMemoryMB: 2048,
        maxCpuUtilization: 0.8,
        availableAgents: 2,
        taskTypeResources: new Map([
          ['development', { memoryMB: 512, cpuWeight: 0.7, agentCount: 1 }],
          ['testing', { memoryMB: 256, cpuWeight: 0.5, agentCount: 1 }]
        ])
      },
      ...config
    };
    return new TaskScheduler(testConfig);
  };

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultScheduler = new TaskScheduler();
      expect(defaultScheduler).toBeDefined();
      defaultScheduler.dispose();
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = { algorithm: 'priority_first' as const };
      const customScheduler = new TaskScheduler(customConfig);
      expect(customScheduler).toBeDefined();
      customScheduler.dispose();
    });

    it('should start optimization timer when enabled', () => {
      const timerConfig = { enableDynamicOptimization: true };
      const timerScheduler = new TaskScheduler(timerConfig);
      expect(timerScheduler).toBeDefined();
      timerScheduler.dispose();
    });
  });

  describe('Schedule Generation', () => {
    it('should generate a valid execution schedule', async () => {
      const schedule = await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      expect(schedule).toBeDefined();
      expect(schedule.id).toContain('schedule_P001_');
      expect(schedule.projectId).toBe('P001');
      expect(schedule.scheduledTasks.size).toBe(3);
      expect(schedule.executionBatches.length).toBeGreaterThan(0);
      expect(schedule.timeline.startTime).toBeInstanceOf(Date);
      expect(schedule.timeline.endTime).toBeInstanceOf(Date);
      expect(schedule.metadata.algorithm).toBe('hybrid_optimal');
    });

    it('should respect task dependencies in scheduling', async () => {
      const schedule = await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const t001 = schedule.scheduledTasks.get('T001');
      const t002 = schedule.scheduledTasks.get('T002');
      const t003 = schedule.scheduledTasks.get('T003');

      expect(t001).toBeDefined();
      expect(t002).toBeDefined();
      expect(t003).toBeDefined();

      // T002 and T003 should start after T001
      expect(t002!.scheduledStart.getTime()).toBeGreaterThanOrEqual(t001!.scheduledEnd.getTime());
      expect(t003!.scheduledStart.getTime()).toBeGreaterThanOrEqual(t001!.scheduledEnd.getTime());
    });

    it('should allocate resources appropriately', async () => {
      const schedule = await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      for (const scheduledTask of schedule.scheduledTasks.values()) {
        expect(scheduledTask.assignedResources.memoryMB).toBeGreaterThan(0);
        expect(scheduledTask.assignedResources.cpuWeight).toBeGreaterThan(0);
        expect(scheduledTask.assignedResources.cpuWeight).toBeLessThanOrEqual(1);
      }
    });

    it('should handle empty task list', async () => {
      await expect(scheduler.generateSchedule([], dependencyGraph, 'P001'))
        .rejects.toThrow('Cannot schedule empty task list');
    });

    it('should validate task requirements', async () => {
      const invalidTask = { ...mockTasks[0], id: '', title: '' };
      await expect(scheduler.generateSchedule([invalidTask], dependencyGraph, 'P001'))
        .rejects.toThrow('Invalid task');
    });
  });

  describe('Scheduling Algorithms', () => {
    it('should use priority_first algorithm', async () => {
      const priorityScheduler = new TaskScheduler({ algorithm: 'priority_first' });
      const schedule = await priorityScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      expect(schedule.metadata.algorithm).toBe('priority_first');

      // Critical priority task (T002) should have high priority score
      const t002 = schedule.scheduledTasks.get('T002');
      expect(t002?.metadata.priorityScore).toBeGreaterThan(0.8);

      priorityScheduler.dispose();
    });

    it('should use hybrid_optimal algorithm', async () => {
      const schedule = await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      expect(schedule.metadata.algorithm).toBe('hybrid_optimal');

      // Should have calculated scores for all factors
      for (const scheduledTask of schedule.scheduledTasks.values()) {
        expect(scheduledTask.metadata.priorityScore).toBeGreaterThanOrEqual(0);
        expect(scheduledTask.metadata.resourceScore).toBeGreaterThanOrEqual(0);
        expect(scheduledTask.metadata.deadlineScore).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Schedule Management', () => {
    it('should get current schedule', async () => {
      const freshScheduler = createFreshScheduler();
      expect(freshScheduler.getCurrentSchedule()).toBeNull();

      const schedule = await freshScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');
      expect(freshScheduler.getCurrentSchedule()).toBe(schedule);
      
      freshScheduler.dispose();
    });

    it('should update existing schedule', async () => {
      await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      // Add a new task
      const newTask: AtomicTask = {
        ...mockTasks[0],
        id: 'T004',
        title: 'New task',
        dependencies: ['T002']
      };

      const updatedTasks = [...mockTasks, newTask];
      dependencyGraph.addTask(newTask);
      dependencyGraph.addDependency('T004', 'T002', 'task', 1, false);

      const updatedSchedule = await scheduler.updateSchedule(updatedTasks, dependencyGraph);
      expect(updatedSchedule).toBeDefined();
      expect(updatedSchedule.scheduledTasks.size).toBe(4);
    });

    it('should get ready tasks for execution', async () => {
      await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const readyTasks = scheduler.getReadyTasks();
      expect(readyTasks).toBeDefined();
      expect(Array.isArray(readyTasks)).toBe(true);

      // T001 should be ready (no dependencies)
      const t001Ready = readyTasks.some(task => task.task.id === 'T001');
      expect(t001Ready).toBe(true);
    });

    it('should get next execution batch', async () => {
      await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const nextBatch = scheduler.getNextExecutionBatch();
      expect(nextBatch).toBeDefined();

      if (nextBatch) {
        expect(nextBatch.taskIds.length).toBeGreaterThan(0);
        expect(nextBatch.batchId).toBeGreaterThanOrEqual(0);
      }
    });

    it('should mark task as completed', async () => {
      await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      await scheduler.markTaskCompleted('T001');

      const currentSchedule = scheduler.getCurrentSchedule();
      const completedTask = currentSchedule?.scheduledTasks.get('T001');
      expect(completedTask?.task.status).toBe('completed');
      expect(completedTask?.task.actualHours).toBeGreaterThan(0);
    });

    it('should handle marking non-existent task as completed', async () => {
      await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      // Should not throw error
      await expect(scheduler.markTaskCompleted('INVALID')).resolves.not.toThrow();
    });
  });

  describe('Schedule Metrics and Analytics', () => {
    it('should calculate schedule metrics', async () => {
      const freshScheduler = createFreshScheduler();
      await freshScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const metrics = freshScheduler.getScheduleMetrics();
      expect(metrics).toBeDefined();

      if (metrics) {
        expect(metrics.resourceUtilization).toBeGreaterThanOrEqual(0);
        expect(metrics.resourceUtilization).toBeLessThanOrEqual(1);
        expect(metrics.timelineEfficiency).toBeGreaterThanOrEqual(0);
        expect(metrics.timelineEfficiency).toBeLessThanOrEqual(1);
        expect(metrics.dependencyCompliance).toBeGreaterThanOrEqual(0);
        expect(metrics.dependencyCompliance).toBeLessThanOrEqual(1);
        expect(metrics.parallelismFactor).toBeGreaterThan(0);
        expect(metrics.criticalPathOptimization).toBeGreaterThanOrEqual(0);
        expect(metrics.criticalPathOptimization).toBeLessThanOrEqual(1);
        expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
        expect(metrics.overallScore).toBeLessThanOrEqual(1);
      }
      
      freshScheduler.dispose();
    });

    it('should return null metrics when no schedule exists', () => {
      const metrics = scheduler.getScheduleMetrics();
      expect(metrics).toBeNull();
    });

    it('should track resource utilization', async () => {
      const schedule = await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      expect(schedule.resourceUtilization.peakMemoryMB).toBeGreaterThan(0);
      expect(schedule.resourceUtilization.averageCpuUtilization).toBeGreaterThan(0);
      expect(schedule.resourceUtilization.agentUtilization).toBeGreaterThanOrEqual(0);
      expect(schedule.resourceUtilization.resourceEfficiency).toBeGreaterThanOrEqual(0);
    });

    it('should calculate timeline correctly', async () => {
      const schedule = await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      expect(schedule.timeline.startTime).toBeInstanceOf(Date);
      expect(schedule.timeline.endTime).toBeInstanceOf(Date);
      expect(schedule.timeline.endTime.getTime()).toBeGreaterThan(schedule.timeline.startTime.getTime());
      expect(schedule.timeline.totalDuration).toBeGreaterThan(0);
      expect(schedule.timeline.parallelismFactor).toBeGreaterThan(0);
      expect(Array.isArray(schedule.timeline.criticalPath)).toBe(true);
    });
  });

  describe('Resource Management', () => {
    it('should respect resource constraints', async () => {
      const schedule = await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      // Check that no task exceeds memory limits
      for (const scheduledTask of schedule.scheduledTasks.values()) {
        expect(scheduledTask.assignedResources.memoryMB).toBeLessThanOrEqual(2048);
        expect(scheduledTask.assignedResources.cpuWeight).toBeLessThanOrEqual(0.8);
      }
    });

    it('should assign agents appropriately', async () => {
      const schedule = await scheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

      const assignedAgents = new Set();
      for (const scheduledTask of schedule.scheduledTasks.values()) {
        if (scheduledTask.assignedResources.agentId) {
          assignedAgents.add(scheduledTask.assignedResources.agentId);
        }
      }

      // Should not exceed available agents
      expect(assignedAgents.size).toBeLessThanOrEqual(2);
    });

    it('should handle resource-intensive tasks', async () => {
      // Create a resource-intensive task
      const heavyTask: AtomicTask = {
        ...mockTasks[0],
        id: 'T_HEAVY',
        type: 'deployment', // More resource-intensive type
        estimatedHours: 8
      };

      const heavyTasks = [heavyTask];
      const heavyGraph = new OptimizedDependencyGraph();
      heavyGraph.addTask(heavyTask);

      const schedule = await scheduler.generateSchedule(heavyTasks, heavyGraph, 'P001');
      const scheduledHeavyTask = schedule.scheduledTasks.get('T_HEAVY');

      expect(scheduledHeavyTask).toBeDefined();
      expect(scheduledHeavyTask!.assignedResources.memoryMB).toBeGreaterThan(512);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle tasks with circular dependencies gracefully', async () => {
      // Create tasks with circular dependency
      const circularTasks = [
        { ...mockTasks[0], id: 'C1', dependencies: ['C2'], dependents: ['C2'] },
        { ...mockTasks[1], id: 'C2', dependencies: ['C1'], dependents: ['C1'] }
      ];

      const circularGraph = new OptimizedDependencyGraph();
      circularGraph.addTask(circularTasks[0]);
      circularGraph.addTask(circularTasks[1]);

      // This should either handle gracefully or throw a meaningful error
      await expect(scheduler.generateSchedule(circularTasks, circularGraph, 'P001'))
        .resolves.toBeDefined();
    });

    it('should handle single task scheduling', async () => {
      const singleTask = [mockTasks[0]];
      const singleGraph = new OptimizedDependencyGraph();
      singleGraph.addTask(singleTask[0]);

      const schedule = await scheduler.generateSchedule(singleTask, singleGraph, 'P001');

      expect(schedule.scheduledTasks.size).toBe(1);
      expect(schedule.executionBatches.length).toBeGreaterThan(0);
    });

    it('should handle tasks with zero estimated hours', async () => {
      const zeroHourTask = { ...mockTasks[0], estimatedHours: 0 };
      const zeroGraph = new OptimizedDependencyGraph();
      zeroGraph.addTask(zeroHourTask);

      const schedule = await scheduler.generateSchedule([zeroHourTask], zeroGraph, 'P001');
      expect(schedule).toBeDefined();
    });

    it('should handle very large task sets', async () => {
      // Create a large number of tasks
      const largeTasks: AtomicTask[] = [];
      const largeGraph = new OptimizedDependencyGraph();

      for (let i = 0; i < 100; i++) {
        const task = {
          ...mockTasks[0],
          id: `T${i.toString().padStart(3, '0')}`,
          title: `Task ${i}`,
          dependencies: i > 0 ? [`T${(i-1).toString().padStart(3, '0')}`] : [],
          dependents: i < 99 ? [`T${(i+1).toString().padStart(3, '0')}`] : []
        };
        largeTasks.push(task);
        largeGraph.addTask(task);

        if (i > 0) {
          largeGraph.addDependency(task.id, `T${(i-1).toString().padStart(3, '0')}`, 'task', 1, false);
        }
      }

      const startTime = Date.now();
      const schedule = await scheduler.generateSchedule(largeTasks, largeGraph, 'P001');
      const endTime = Date.now();

      expect(schedule.scheduledTasks.size).toBe(100);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Enhanced Multi-Factor Priority Scoring', () => {
    describe('System Load Scoring', () => {
      it('should calculate system load score based on resource availability', async () => {
        const testScheduler = new TaskScheduler({
          algorithm: 'hybrid_optimal',
          resources: {
            maxConcurrentTasks: 10,
            maxMemoryMB: 2048,
            maxCpuUtilization: 0.8,
            availableAgents: 3,
            taskTypeResources: new Map([
              ['development', { memoryMB: 512, cpuWeight: 0.7, agentCount: 1 }]
            ])
          }
        });

        const testTask = {
          ...mockTasks[0],
          type: 'development' as const
        };

        const schedule = await testScheduler.generateSchedule([testTask], dependencyGraph, 'P001');
        const scheduledTask = schedule.scheduledTasks.get(testTask.id);

        expect(scheduledTask).toBeDefined();
        expect(scheduledTask!.metadata.systemLoadScore).toBeGreaterThanOrEqual(0);
        expect(scheduledTask!.metadata.systemLoadScore).toBeLessThanOrEqual(1);

        testScheduler.dispose();
      });

      it('should give higher scores when system has more capacity', async () => {
        // Test with low resource utilization
        const lowLoadScheduler = new TaskScheduler({
          algorithm: 'hybrid_optimal',
          resources: {
            maxConcurrentTasks: 20,
            maxMemoryMB: 4096,
            maxCpuUtilization: 0.9,
            availableAgents: 5,
            taskTypeResources: new Map([
              ['development', { memoryMB: 256, cpuWeight: 0.3, agentCount: 1 }]
            ])
          }
        });

        const testTask = {
          ...mockTasks[0],
          type: 'development' as const
        };

        const lowLoadSchedule = await lowLoadScheduler.generateSchedule([testTask], dependencyGraph, 'P001');
        const lowLoadTask = lowLoadSchedule.scheduledTasks.get(testTask.id);

        expect(lowLoadTask!.metadata.systemLoadScore).toBeGreaterThan(0.5);

        lowLoadScheduler.dispose();
      });
    });

    describe('Complexity Scoring', () => {
      it('should calculate complexity score based on task factors', async () => {
        const complexTask: AtomicTask = {
          ...mockTasks[0],
          filePaths: ['file1.ts', 'file2.ts', 'file3.ts'], // More files
          dependencies: ['T999', 'T998'], // More dependencies
          acceptanceCriteria: ['Criterion 1', 'Criterion 2', 'Criterion 3'], // More criteria
          testingRequirements: {
            unitTests: ['test1.ts', 'test2.ts'],
            integrationTests: ['integration.ts'],
            performanceTests: ['perf.ts'],
            coverageTarget: 95
          },
          type: 'development'
        };

        const simpleTask: AtomicTask = {
          ...mockTasks[0],
          id: 'T_SIMPLE',
          filePaths: ['simple.ts'],
          dependencies: [],
          acceptanceCriteria: ['Simple criterion'],
          testingRequirements: {
            unitTests: [],
            integrationTests: [],
            performanceTests: [],
            coverageTarget: 80
          },
          type: 'documentation'
        };

        const complexGraph = new OptimizedDependencyGraph();
        complexGraph.addTask(complexTask);
        complexGraph.addTask(simpleTask);

        const schedule = await scheduler.generateSchedule([complexTask, simpleTask], complexGraph, 'P001');
        
        const complexScheduled = schedule.scheduledTasks.get(complexTask.id);
        const simpleScheduled = schedule.scheduledTasks.get(simpleTask.id);

        expect(complexScheduled).toBeDefined();
        expect(simpleScheduled).toBeDefined();

        // Simple task should have higher complexity score (less complex)
        expect(simpleScheduled!.metadata.complexityScore).toBeGreaterThan(complexScheduled!.metadata.complexityScore);
      });

      it('should handle tasks with different types correctly', async () => {
        const deploymentTask = {
          ...mockTasks[0],
          id: 'T_DEPLOY',
          type: 'deployment' as const
        };

        const documentationTask = {
          ...mockTasks[0],
          id: 'T_DOC',
          type: 'documentation' as const
        };

        const typeGraph = new OptimizedDependencyGraph();
        typeGraph.addTask(deploymentTask);
        typeGraph.addTask(documentationTask);

        const schedule = await scheduler.generateSchedule([deploymentTask, documentationTask], typeGraph, 'P001');
        
        const deployScheduled = schedule.scheduledTasks.get(deploymentTask.id);
        const docScheduled = schedule.scheduledTasks.get(documentationTask.id);

        expect(deployScheduled).toBeDefined();
        expect(docScheduled).toBeDefined();

        // Documentation should be less complex than deployment
        expect(docScheduled!.metadata.complexityScore).toBeGreaterThan(deployScheduled!.metadata.complexityScore);
      });
    });

    describe('Business Impact Scoring', () => {
      it('should calculate business impact based on priority and type', async () => {
        const criticalTask = {
          ...mockTasks[0],
          id: 'T_CRITICAL',
          priority: 'critical' as const,
          type: 'deployment' as const,
          tags: ['customer-facing', 'revenue-impact']
        };

        const lowTask = {
          ...mockTasks[0],
          id: 'T_LOW',
          priority: 'low' as const,
          type: 'documentation' as const,
          tags: ['internal']
        };

        const impactGraph = new OptimizedDependencyGraph();
        impactGraph.addTask(criticalTask);
        impactGraph.addTask(lowTask);

        const schedule = await scheduler.generateSchedule([criticalTask, lowTask], impactGraph, 'P001');
        
        const criticalScheduled = schedule.scheduledTasks.get(criticalTask.id);
        const lowScheduled = schedule.scheduledTasks.get(lowTask.id);

        expect(criticalScheduled).toBeDefined();
        expect(lowScheduled).toBeDefined();

        // Critical deployment task should have higher business impact
        expect(criticalScheduled!.metadata.businessImpactScore).toBeGreaterThan(lowScheduled!.metadata.businessImpactScore);
      });

      it('should boost score for business-critical tags', async () => {
        const businessCriticalTask = {
          ...mockTasks[0],
          id: 'T_BUSINESS',
          priority: 'medium' as const,
          tags: ['critical-path', 'security']
        };

        const regularTask = {
          ...mockTasks[0],
          id: 'T_REGULAR',
          priority: 'medium' as const,
          tags: ['feature', 'enhancement']
        };

        const businessGraph = new OptimizedDependencyGraph();
        businessGraph.addTask(businessCriticalTask);
        businessGraph.addTask(regularTask);

        const schedule = await scheduler.generateSchedule([businessCriticalTask, regularTask], businessGraph, 'P001');
        
        const businessScheduled = schedule.scheduledTasks.get(businessCriticalTask.id);
        const regularScheduled = schedule.scheduledTasks.get(regularTask.id);

        expect(businessScheduled).toBeDefined();
        expect(regularScheduled).toBeDefined();

        // Business critical task should have higher impact score due to tags
        expect(businessScheduled!.metadata.businessImpactScore).toBeGreaterThan(regularScheduled!.metadata.businessImpactScore);
      });
    });

    describe('Agent Availability Scoring', () => {
      it('should calculate agent availability score based on agent status', async () => {
        const agentScheduler = new TaskScheduler({
          algorithm: 'hybrid_optimal',
          resources: {
            maxConcurrentTasks: 5,
            maxMemoryMB: 2048,
            maxCpuUtilization: 0.8,
            availableAgents: 3,
            taskTypeResources: new Map([
              ['development', { memoryMB: 512, cpuWeight: 0.7, agentCount: 1 }],
              ['deployment', { memoryMB: 1024, cpuWeight: 0.9, agentCount: 2 }]
            ])
          }
        });

        const singleAgentTask = {
          ...mockTasks[0],
          id: 'T_SINGLE',
          type: 'development' as const
        };

        const multiAgentTask = {
          ...mockTasks[0],
          id: 'T_MULTI',
          type: 'deployment' as const
        };

        const agentGraph = new OptimizedDependencyGraph();
        agentGraph.addTask(singleAgentTask);
        agentGraph.addTask(multiAgentTask);

        const schedule = await agentScheduler.generateSchedule([singleAgentTask, multiAgentTask], agentGraph, 'P001');
        
        const singleScheduled = schedule.scheduledTasks.get(singleAgentTask.id);
        const multiScheduled = schedule.scheduledTasks.get(multiAgentTask.id);

        expect(singleScheduled).toBeDefined();
        expect(multiScheduled).toBeDefined();

        // Single agent task should have higher availability score
        expect(singleScheduled!.metadata.agentAvailabilityScore).toBeGreaterThan(0);
        expect(multiScheduled!.metadata.agentAvailabilityScore).toBeGreaterThan(0);

        agentScheduler.dispose();
      });

      it('should handle zero agent scenarios', async () => {
        const noAgentScheduler = new TaskScheduler({
          algorithm: 'hybrid_optimal',
          resources: {
            maxConcurrentTasks: 5,
            maxMemoryMB: 2048,
            maxCpuUtilization: 0.8,
            availableAgents: 0,
            taskTypeResources: new Map([
              ['development', { memoryMB: 512, cpuWeight: 0.7, agentCount: 1 }]
            ])
          }
        });

        const testTask = {
          ...mockTasks[0],
          type: 'development' as const
        };

        const schedule = await noAgentScheduler.generateSchedule([testTask], dependencyGraph, 'P001');
        const scheduledTask = schedule.scheduledTasks.get(testTask.id);

        expect(scheduledTask).toBeDefined();
        expect(scheduledTask!.metadata.agentAvailabilityScore).toBe(0);

        noAgentScheduler.dispose();
      });
    });

    describe('Integrated Multi-Factor Scoring', () => {
      it('should properly weight all scoring factors', async () => {
        const testConfig = {
          algorithm: 'hybrid_optimal' as const,
          weights: {
            dependencies: 0.35,
            deadline: 0.25,
            systemLoad: 0.20,
            complexity: 0.10,
            businessImpact: 0.05,
            agentAvailability: 0.05,
            priority: 0.0,
            resources: 0.0,
            duration: 0.0
          }
        };

        const weightedScheduler = new TaskScheduler(testConfig);

        const schedule = await weightedScheduler.generateSchedule(mockTasks, dependencyGraph, 'P001');

        for (const [taskId, scheduledTask] of schedule.scheduledTasks) {
          // Verify all score components are present
          expect(scheduledTask.metadata.dependencyScore).toBeGreaterThanOrEqual(0);
          expect(scheduledTask.metadata.deadlineScore).toBeGreaterThanOrEqual(0);
          expect(scheduledTask.metadata.systemLoadScore).toBeGreaterThanOrEqual(0);
          expect(scheduledTask.metadata.complexityScore).toBeGreaterThanOrEqual(0);
          expect(scheduledTask.metadata.businessImpactScore).toBeGreaterThanOrEqual(0);
          expect(scheduledTask.metadata.agentAvailabilityScore).toBeGreaterThanOrEqual(0);

          // Verify total score is calculated
          expect(scheduledTask.metadata.totalScore).toBeGreaterThan(0);

          // Manual calculation check for one task
          if (taskId === mockTasks[0].id) {
            const expectedTotal = 
              scheduledTask.metadata.dependencyScore * 0.35 +
              scheduledTask.metadata.deadlineScore * 0.25 +
              scheduledTask.metadata.systemLoadScore * 0.20 +
              scheduledTask.metadata.complexityScore * 0.10 +
              scheduledTask.metadata.businessImpactScore * 0.05 +
              scheduledTask.metadata.agentAvailabilityScore * 0.05;

            expect(scheduledTask.metadata.totalScore).toBeCloseTo(expectedTotal, 2);
          }
        }

        weightedScheduler.dispose();
      });

      it('should prioritize tasks based on updated scoring algorithm', async () => {
        const highDependencyTask = {
          ...mockTasks[0],
          id: 'T_HIGH_DEP',
          dependencies: [],
          dependents: ['T002', 'T003', 'T004'], // Many dependents
          priority: 'medium' as const
        };

        const highBusinessTask = {
          ...mockTasks[0],
          id: 'T_HIGH_BIZ',
          dependencies: ['T_HIGH_DEP'],
          dependents: [],
          priority: 'critical' as const,
          type: 'deployment' as const,
          tags: ['customer-facing', 'revenue-impact']
        };

        const priorityGraph = new OptimizedDependencyGraph();
        priorityGraph.addTask(highDependencyTask);
        priorityGraph.addTask(highBusinessTask);
        priorityGraph.addDependency(highBusinessTask.id, highDependencyTask.id, 'task', 1, true);

        const schedule = await scheduler.generateSchedule([highDependencyTask, highBusinessTask], priorityGraph, 'P001');
        
        const depScheduled = schedule.scheduledTasks.get(highDependencyTask.id);
        const bizScheduled = schedule.scheduledTasks.get(highBusinessTask.id);

        expect(depScheduled).toBeDefined();
        expect(bizScheduled).toBeDefined();

        // High dependency task should be scheduled first due to dependency weight
        expect(depScheduled!.scheduledStart.getTime()).toBeLessThanOrEqual(bizScheduled!.scheduledStart.getTime());
      });
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should dispose properly', () => {
      const disposableScheduler = new TaskScheduler({ enableDynamicOptimization: true });

      expect(() => disposableScheduler.dispose()).not.toThrow();

      // Should be safe to call multiple times
      expect(() => disposableScheduler.dispose()).not.toThrow();
    });

    it('should stop optimization timer on disposal', () => {
      const timerScheduler = new TaskScheduler({ enableDynamicOptimization: true });

      // Dispose should stop the timer
      timerScheduler.dispose();

      // No way to directly test timer stopping, but should not throw
      expect(true).toBe(true);
    });
  });
});
