import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptimizedDependencyGraph, ExtendedDependencyType } from '../../core/dependency-graph.js';
import { AtomicTask, TaskType, TaskPriority, TaskStatus } from '../../types/task.js';

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('OptimizedDependencyGraph', () => {
  let graph: OptimizedDependencyGraph;
  let mockTasks: AtomicTask[];

  beforeEach(() => {
    // Always create a completely new graph instance for each test
    graph = new OptimizedDependencyGraph('test-project');

    // Create mock tasks
    mockTasks = [
      createMockTask('T001', 'Setup Database', 4),
      createMockTask('T002', 'Create User Model', 2),
      createMockTask('T003', 'Implement Authentication', 6),
      createMockTask('T004', 'Create API Endpoints', 4),
      createMockTask('T005', 'Write Tests', 3),
      createMockTask('T006', 'Deploy Application', 2)
    ];
  });

  function createMockTask(id: string, title: string, estimatedHours: number): AtomicTask {
    return {
      id,
      title,
      description: `Description for ${title}`,
      status: 'pending' as TaskStatus,
      priority: 'medium' as TaskPriority,
      type: 'development' as TaskType,
      estimatedHours,
      actualHours: 0,
      epicId: 'E001',
      projectId: 'test-project',
      dependencies: [],
      dependents: [],
      filePaths: [],
      acceptanceCriteria: [],
      testingRequirements: {
        unitTests: [],
        integrationTests: [],
        performanceTests: [],
        coverageTarget: 80
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
      createdBy: 'test-user',
      tags: [],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: []
      }
    };
  }

  describe('Task Management', () => {
    it('should add tasks to the graph', () => {
      // Ensure clean graph for this test
      graph.reset();

      graph.addTask(mockTasks[0]);

      const nodes = graph.getNodes();
      expect(nodes.size).toBe(1);
      expect(nodes.has('T001')).toBe(true);

      const node = nodes.get('T001')!;
      expect(node.taskId).toBe('T001');
      expect(node.title).toBe('Setup Database');
      expect(node.estimatedHours).toBe(4);
    });

    it('should handle multiple tasks', () => {
      // Ensure clean graph for this test
      graph.reset();

      mockTasks.forEach(task => graph.addTask(task));

      const nodes = graph.getNodes();
      expect(nodes.size).toBe(6);

      const metrics = graph.getMetrics();
      expect(metrics.totalNodes).toBe(6);
      expect(metrics.totalEdges).toBe(0);
    });
  });

  describe('Dependency Management', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should add dependencies between tasks', () => {
      const success = graph.addDependency('T002', 'T001', 'task');
      expect(success).toBe(true);

      const edges = graph.getEdges();
      expect(edges.size).toBe(1);
      expect(edges.has('T002->T001')).toBe(true);

      const edge = edges.get('T002->T001')!;
      expect(edge.from).toBe('T002');
      expect(edge.to).toBe('T001');
      expect(edge.type).toBe('task');
    });

    it('should support different dependency types', () => {
      const types: ExtendedDependencyType[] = ['task', 'package', 'framework', 'tool', 'import', 'environment'];

      types.forEach((type, index) => {
        // Create dependencies between existing tasks (T001-T006)
        // We have 6 tasks, so we can create 5 dependencies: T001->T002, T002->T003, etc.
        if (index < 5) { // Only 5 valid combinations with 6 tasks (T001->T002, T002->T003, T003->T004, T004->T005, T005->T006)
          const success = graph.addDependency(`T00${index + 2}`, `T00${index + 1}`, type);
          expect(success).toBe(true);
        }
      });

      const edges = graph.getEdges();
      expect(edges.size).toBe(5); // 5 valid combinations with our 6 tasks
    });

    it('should prevent adding dependencies to non-existent tasks', () => {
      const success = graph.addDependency('T999', 'T001', 'task');
      expect(success).toBe(false);

      const edges = graph.getEdges();
      expect(edges.size).toBe(0);
    });

    it('should remove dependencies', () => {
      graph.addDependency('T002', 'T001', 'task');
      expect(graph.getEdges().size).toBe(1);

      const success = graph.removeDependency('T002', 'T001');
      expect(success).toBe(true);
      expect(graph.getEdges().size).toBe(0);
    });

    it('should update node dependency lists when adding edges', () => {
      graph.addDependency('T002', 'T001', 'task');

      const nodes = graph.getNodes();
      const t001 = nodes.get('T001')!;
      const t002 = nodes.get('T002')!;

      expect(t001.dependents).toContain('T002');
      expect(t002.dependencies).toContain('T001');
    });
  });

  describe('Cycle Detection', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should detect no cycles in acyclic graph', () => {
      // Create a simple chain: T001 -> T002 -> T003
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');

      const cycles = graph.detectCycles();
      expect(cycles).toHaveLength(0);
    });

    it('should prevent cycle creation', () => {
      // Create chain: T001 -> T002 -> T003
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');

      // Try to create cycle: T001 -> T003 (would create T001 -> T002 -> T003 -> T001)
      const success = graph.addDependency('T001', 'T003', 'task');
      expect(success).toBe(false);

      const cycles = graph.detectCycles();
      expect(cycles).toHaveLength(0);
    });

    it('should detect existing cycles', () => {
      // Create a fresh graph to avoid any state issues
      const testGraph = new OptimizedDependencyGraph('cycle-test');

      // Add tasks to the test graph
      mockTasks.forEach(task => testGraph.addTask(task));

      // Manually create a cycle by bypassing the prevention
      testGraph.addDependency('T001', 'T002', 'task'); // T001 depends on T002
      testGraph.addDependency('T002', 'T003', 'task'); // T002 depends on T003

      // Force add the cycle-creating edge: T003 depends on T001
      // This creates: T001 -> T002 -> T003 -> T001 (cycle)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const graphInternal = testGraph as any;
      graphInternal.adjacencyList.get('T001').add('T003'); // T001 points to T003 as dependent (T003 depends on T001)
      graphInternal.reverseIndex.get('T003').add('T001'); // T003 has T001 as dependency
      graphInternal.edges.set('T003->T001', {
        from: 'T003',
        to: 'T001',
        type: 'task',
        weight: 1,
        critical: false
      });

      const cycles = testGraph.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
    });
  });

  describe('Topological Ordering', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should return empty array for cyclic graph', () => {
      // Create a fresh graph to avoid any state issues
      const testGraph = new OptimizedDependencyGraph('topo-cycle-test');

      // Add tasks to the test graph
      mockTasks.forEach(task => testGraph.addTask(task));

      // Create a cycle
      testGraph.addDependency('T001', 'T002', 'task'); // T001 depends on T002
      testGraph.addDependency('T002', 'T003', 'task'); // T002 depends on T003

      // Force cycle: T003 depends on T001
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const graphInternal = testGraph as any;
      graphInternal.adjacencyList.get('T001').add('T003'); // T001 points to T003 as dependent (T003 depends on T001)
      graphInternal.reverseIndex.get('T003').add('T001'); // T003 has T001 as dependency

      const order = testGraph.getTopologicalOrder();
      expect(order).toHaveLength(0);
    });

    it('should return correct topological order for acyclic graph', () => {
      // Create dependencies: T001 -> T002 -> T003, T001 -> T004
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');
      graph.addDependency('T004', 'T001', 'task');

      const order = graph.getTopologicalOrder();
      expect(order).toHaveLength(6);

      // T001 should come before T002, T002 before T003, T001 before T004
      const t001Index = order.indexOf('T001');
      const t002Index = order.indexOf('T002');
      const t003Index = order.indexOf('T003');
      const t004Index = order.indexOf('T004');

      expect(t001Index).toBeLessThan(t002Index);
      expect(t002Index).toBeLessThan(t003Index);
      expect(t001Index).toBeLessThan(t004Index);
    });

    it('should cache topological order', () => {
      graph.addDependency('T002', 'T001', 'task');

      const order1 = graph.getTopologicalOrder();
      const order2 = graph.getTopologicalOrder();

      expect(order1).toEqual(order2);
      expect(order1).not.toBe(order2); // Should be different array instances
    });
  });

  describe('Ready Tasks', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should identify tasks with no dependencies as ready', () => {
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');

      const readyTasks = graph.getReadyTasks();

      // T001 has no dependencies, so it should be ready
      // T004, T005, T006 also have no dependencies
      expect(readyTasks).toContain('T001');
      expect(readyTasks).toContain('T004');
      expect(readyTasks).toContain('T005');
      expect(readyTasks).toContain('T006');
      expect(readyTasks).not.toContain('T002'); // depends on T001
      expect(readyTasks).not.toContain('T003'); // depends on T002
    });

    it('should not include completed tasks in ready tasks', () => {
      // Mark T001 as completed
      const nodes = graph.getNodes();
      const t001 = nodes.get('T001')!;
      t001.status = 'completed';

      const readyTasks = graph.getReadyTasks();
      expect(readyTasks).not.toContain('T001');
    });
  });

  describe('Critical Path', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should calculate critical path correctly', () => {
      // Create a dependency chain with different durations
      graph.addDependency('T002', 'T001', 'task'); // 2 hours depends on 4 hours
      graph.addDependency('T003', 'T002', 'task'); // 6 hours depends on 2 hours
      graph.addDependency('T004', 'T003', 'task'); // 4 hours depends on 6 hours

      const criticalPath = graph.getCriticalPath();

      // Should include the longest path
      expect(criticalPath).toContain('T001');
      expect(criticalPath).toContain('T002');
      expect(criticalPath).toContain('T003');
      expect(criticalPath).toContain('T004');
    });

    it('should mark critical path nodes', () => {
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');

      graph.getCriticalPath();

      const nodes = graph.getNodes();
      expect(nodes.get('T001')!.criticalPath).toBe(true);
      expect(nodes.get('T002')!.criticalPath).toBe(true);
      expect(nodes.get('T003')!.criticalPath).toBe(true);
    });
  });

  describe('Parallel Batches', () => {
    it('should identify parallel execution batches', () => {
      // Use a fresh graph to avoid state sharing
      const testGraph = new OptimizedDependencyGraph('parallel-test');
      mockTasks.forEach(task => testGraph.addTask(task));

      // Create dependencies: T002,T003 depend on T001; T004 depends on T002; T005 depends on T003
      testGraph.addDependency('T002', 'T001', 'task');
      testGraph.addDependency('T003', 'T001', 'task');
      testGraph.addDependency('T004', 'T002', 'task');
      testGraph.addDependency('T005', 'T003', 'task');

      const batches = testGraph.getParallelBatches();

      expect(batches.length).toBeGreaterThan(0);

      // First batch should contain T001 and T006 (no dependencies)
      const firstBatch = batches[0];
      expect(firstBatch.taskIds).toContain('T001');
      expect(firstBatch.taskIds).toContain('T006');

      // Second batch should contain T002 and T003 (depend on T001)
      const secondBatch = batches[1];
      expect(secondBatch.taskIds).toContain('T002');
      expect(secondBatch.taskIds).toContain('T003');
    });

    it('should calculate batch estimated duration', () => {
      // Use a fresh graph to avoid state sharing
      const testGraph = new OptimizedDependencyGraph('duration-test');
      mockTasks.forEach(task => testGraph.addTask(task));

      testGraph.addDependency('T002', 'T001', 'task'); // 2 hours depends on 4 hours
      testGraph.addDependency('T003', 'T001', 'task'); // 6 hours depends on 4 hours

      const batches = testGraph.getParallelBatches();
      const secondBatch = batches.find(b => b.taskIds.includes('T002') && b.taskIds.includes('T003'));

      // Duration should be the maximum of the tasks in the batch (6 hours)
      expect(secondBatch?.estimatedDuration).toBe(6);
    });
  });

  describe('Graph Metrics', () => {
    it('should calculate basic metrics', () => {
      // Use a fresh graph to avoid state sharing
      const testGraph = new OptimizedDependencyGraph('metrics-test');
      mockTasks.forEach(task => testGraph.addTask(task));

      testGraph.addDependency('T002', 'T001', 'task');
      testGraph.addDependency('T003', 'T002', 'task');

      const metrics = testGraph.getMetrics();

      expect(metrics.totalNodes).toBe(6);
      expect(metrics.totalEdges).toBe(2);
      expect(metrics.cycleCount).toBe(0);
    });

    it('should identify orphaned nodes', () => {
      // Use a fresh graph to avoid state sharing
      const testGraph = new OptimizedDependencyGraph('orphan-test');
      mockTasks.forEach(task => testGraph.addTask(task));

      testGraph.addDependency('T002', 'T001', 'task');

      const metrics = testGraph.getMetrics();

      // T003, T004, T005, T006 are orphaned (no dependencies or dependents)
      expect(metrics.orphanedNodes).toBe(4);
    });

    it('should calculate average degree', () => {
      // Use a fresh graph to avoid state sharing
      const testGraph = new OptimizedDependencyGraph('degree-test');
      mockTasks.forEach(task => testGraph.addTask(task));

      testGraph.addDependency('T002', 'T001', 'task');
      testGraph.addDependency('T003', 'T001', 'task');

      const metrics = testGraph.getMetrics();

      // T001 has 2 dependents, T002 and T003 each have 1 dependency
      // Total degree = 2 + 1 + 1 = 4, average = 4/6 ≈ 0.67
      expect(metrics.averageDegree).toBeCloseTo(0.67, 2);
    });
  });

  describe('Performance and Caching', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should cache expensive computations', () => {
      graph.addDependency('T002', 'T001', 'task');

      // First call should compute
      const order1 = graph.getTopologicalOrder();
      const path1 = graph.getCriticalPath();
      const batches1 = graph.getParallelBatches();

      // Second call should use cache
      const order2 = graph.getTopologicalOrder();
      const path2 = graph.getCriticalPath();
      const batches2 = graph.getParallelBatches();

      expect(order1).toEqual(order2);
      expect(path1).toEqual(path2);
      expect(batches1).toEqual(batches2);
    });

    it('should invalidate cache when graph changes', () => {
      // Use a fresh graph to avoid state sharing
      const testGraph = new OptimizedDependencyGraph('cache-test');
      mockTasks.forEach(task => testGraph.addTask(task));

      const order1 = testGraph.getTopologicalOrder();

      // Add dependency that will definitely change the order
      // T001 depends on T006 (reverse alphabetical order to ensure change)
      testGraph.addDependency('T001', 'T006', 'task');

      const order2 = testGraph.getTopologicalOrder();

      // Orders should be different due to new dependency
      expect(order1).not.toEqual(order2);
    });

    it('should clear cache manually', () => {
      // Use a fresh graph to avoid state sharing
      const testGraph = new OptimizedDependencyGraph('cache-clear-test');
      mockTasks.forEach(task => testGraph.addTask(task));

      testGraph.addDependency('T002', 'T001', 'task');
      testGraph.getTopologicalOrder(); // Populate cache

      testGraph.clearCache();

      // Should recompute after cache clear
      const order = testGraph.getTopologicalOrder();
      expect(order).toHaveLength(6);
    });
  });

  describe('Graph Size and Information', () => {
    it('should report correct graph size', () => {
      // Use a new graph for this specific test
      const testGraph = new OptimizedDependencyGraph('size-test');

      mockTasks.slice(0, 3).forEach(task => testGraph.addTask(task));
      testGraph.addDependency('T002', 'T001', 'task');

      const size = testGraph.getSize();
      expect(size.nodes).toBe(3);
      expect(size.edges).toBe(1);
    });

    it('should handle empty graph', () => {
      // Use a new graph for this specific test
      const testGraph = new OptimizedDependencyGraph('empty-test');

      const size = testGraph.getSize();
      expect(size.nodes).toBe(0);
      expect(size.edges).toBe(0);

      const metrics = testGraph.getMetrics();
      expect(metrics.totalNodes).toBe(0);
      expect(metrics.averageDegree).toBe(0);
    });
  });

  // ===== TASK 3.1.2: DEPENDENCY ANALYSIS ENGINE TESTS =====

  describe('Enhanced Critical Path Analysis', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should analyze critical path with resource weighting', () => {
      // Create a complex dependency structure
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');
      graph.addDependency('T004', 'T003', 'task');
      graph.addDependency('T005', 'T001', 'task'); // Parallel branch

      const analysis = graph.analyzeCriticalPath();

      expect(analysis.paths.length).toBeGreaterThan(0);
      expect(analysis.longestPath.length).toBeGreaterThan(0);
      expect(analysis.totalDuration).toBeGreaterThan(0);
      expect(analysis.resourceWeightedDuration).toBeGreaterThan(0);
    });

    it('should identify bottleneck tasks in critical paths', () => {
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T001', 'task'); // T001 is a bottleneck
      graph.addDependency('T004', 'T002', 'task');
      graph.addDependency('T005', 'T003', 'task');

      const analysis = graph.analyzeCriticalPath();

      expect(analysis.bottleneckTasks).toContain('T001');
    });

    it('should handle empty graph gracefully', () => {
      const emptyGraph = new OptimizedDependencyGraph('empty-project');
      const analysis = emptyGraph.analyzeCriticalPath();

      expect(analysis.paths).toHaveLength(0);
      expect(analysis.longestPath).toHaveLength(0);
      expect(analysis.totalDuration).toBe(0);
      expect(analysis.resourceWeightedDuration).toBe(0);
      expect(analysis.bottleneckTasks).toHaveLength(0);
    });
  });

  describe('Dependency Impact Analysis', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should analyze dependency impact for a task', () => {
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');
      graph.addDependency('T004', 'T003', 'task');

      const impact = graph.analyzeDependencyImpact('T001');

      expect(impact.taskId).toBe('T001');
      expect(impact.directDependents).toContain('T002');
      expect(impact.indirectDependents.length).toBeGreaterThanOrEqual(0);
      expect(impact.impactRadius).toBeGreaterThanOrEqual(0);
      expect(['low', 'medium', 'high', 'critical']).toContain(impact.riskLevel);
      expect(impact.propagationChain.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate correct impact radius', () => {
      // Create a chain: T001 -> T002 -> T003 -> T004
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');
      graph.addDependency('T004', 'T003', 'task');

      const impact = graph.analyzeDependencyImpact('T001');

      expect(impact.impactRadius).toBeGreaterThan(0);
      expect(impact.directDependents).toContain('T002');
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        graph.analyzeDependencyImpact('T999');
      }).toThrow('Task T999 not found in graph');
    });
  });

  describe('Bottleneck Detection', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should detect bottlenecks in the graph', () => {
      // Create a bottleneck scenario
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T001', 'task');
      graph.addDependency('T004', 'T001', 'task');
      graph.addDependency('T005', 'T001', 'task'); // T001 has many dependents

      const bottlenecks = graph.detectBottlenecks();

      expect(bottlenecks.length).toBeGreaterThan(0);

      const t001Bottleneck = bottlenecks.find(b => b.taskId === 'T001');
      expect(t001Bottleneck).toBeDefined();
      expect(t001Bottleneck?.severity).toBeGreaterThan(0.3);
      expect(t001Bottleneck?.bottleneckType).toBe('dependency');
      expect(t001Bottleneck?.recommendations.length).toBeGreaterThan(0);
    });

    it('should sort bottlenecks by severity', () => {
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T001', 'task');
      graph.addDependency('T004', 'T001', 'task');

      const bottlenecks = graph.detectBottlenecks();

      if (bottlenecks.length > 1) {
        for (let i = 0; i < bottlenecks.length - 1; i++) {
          expect(bottlenecks[i].severity).toBeGreaterThanOrEqual(bottlenecks[i + 1].severity);
        }
      }
    });
  });

  describe('Resource Allocation Optimization', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should optimize resource allocation', () => {
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T001', 'task');

      const optimization = graph.optimizeResourceAllocation();

      expect(optimization.optimalBatches.length).toBeGreaterThan(0);
      expect(optimization.resourceUtilization).toBeGreaterThanOrEqual(0);
      expect(optimization.resourceUtilization).toBeLessThanOrEqual(1);
      expect(optimization.timeReduction).toBeGreaterThanOrEqual(0);
      expect(optimization.parallelismOpportunities.length).toBeGreaterThanOrEqual(0);
    });

    it('should identify parallelism opportunities', () => {
      // Create independent tasks that can run in parallel
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T001', 'task');
      // T004, T005, T006 are independent

      const optimization = graph.optimizeResourceAllocation();

      expect(optimization.parallelismOpportunities.length).toBeGreaterThan(0);

      const opportunities = optimization.parallelismOpportunities;
      opportunities.forEach(opp => {
        expect(opp.taskId).toBeDefined();
        expect(opp.canRunWith.length).toBeGreaterThan(0);
        expect(opp.estimatedSavings).toBeGreaterThanOrEqual(0);
      });
    });

    it('should calculate time reduction from optimization', () => {
      graph.addDependency('T002', 'T001', 'task');

      const optimization = graph.optimizeResourceAllocation();

      expect(optimization.timeReduction).toBeGreaterThanOrEqual(0);
      expect(optimization.timeReduction).toBeLessThanOrEqual(1);
    });
  });

  // ===== TASK 3.1.3: DEPENDENCY VALIDATION SYSTEM TESTS =====

  describe('Dependency Validation System', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
    });

    it('should validate dependencies comprehensively', () => {
      // Add some dependencies
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'package');

      const validation = graph.validateDependencies();

      expect(validation).toBeDefined();
      expect(validation.isValid).toBeDefined();
      expect(validation.errors).toBeInstanceOf(Array);
      expect(validation.warnings).toBeInstanceOf(Array);
      expect(validation.suggestions).toBeInstanceOf(Array);
    });

    it('should detect dependency conflicts', () => {
      // Create a scenario with potential conflicts
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T001', 'task');
      graph.addDependency('T004', 'T001', 'task'); // T001 becomes a bottleneck

      const conflicts = graph.detectDependencyConflicts();

      expect(conflicts).toBeInstanceOf(Array);
      conflicts.forEach(conflict => {
        expect(conflict.conflictType).toBeDefined();
        expect(conflict.description).toBeDefined();
        expect(conflict.involvedTasks).toBeInstanceOf(Array);
        expect(conflict.severity).toBeDefined();
        expect(conflict.resolutionOptions).toBeInstanceOf(Array);
      });
    });

    it('should generate dependency suggestions', () => {
      // Add tasks with titles that should trigger suggestions
      const setupTask = {
        id: 'T007',
        title: 'Setup project configuration',
        description: 'Initial setup',
        status: 'pending' as const,
        estimatedHours: 2,
        priority: 'medium' as const
      };

      const implementTask = {
        id: 'T008',
        title: 'Implement main feature',
        description: 'Implementation work',
        status: 'pending' as const,
        estimatedHours: 8,
        priority: 'high' as const
      };

      graph.addTask(setupTask);
      graph.addTask(implementTask);

      const suggestions = graph.generateDependencySuggestions();

      expect(suggestions).toBeInstanceOf(Array);
      suggestions.forEach(suggestion => {
        expect(suggestion.type).toBeDefined();
        expect(suggestion.fromTaskId).toBeDefined();
        expect(suggestion.toTaskId).toBeDefined();
        expect(suggestion.dependencyType).toBeDefined();
        expect(suggestion.reason).toBeDefined();
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
        expect(['low', 'medium', 'high']).toContain(suggestion.impact);
      });
    });

    it('should validate dependency before adding', () => {
      // Test valid dependency
      const validResult = graph.validateDependencyBeforeAdd('T002', 'T001', 'task');
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      // Test invalid dependency (self-dependency)
      const invalidResult = graph.validateDependencyBeforeAdd('T001', 'T001', 'task');
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
      expect(invalidResult.errors[0].type).toBe('self-dependency');

      // Test dependency to non-existent task
      const missingResult = graph.validateDependencyBeforeAdd('T001', 'T999', 'task');
      expect(missingResult.isValid).toBe(false);
      expect(missingResult.errors.length).toBeGreaterThan(0);
      expect(missingResult.errors[0].type).toBe('missing-task');
    });

    it('should detect circular dependency in validation', () => {
      // Create a potential cycle
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'task');

      // Try to add dependency that would create cycle
      const result = graph.validateDependencyBeforeAdd('T001', 'T003', 'task');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('cycle');
    });

    it('should validate dependency types', () => {
      // Test valid types
      const validTypes = ['task', 'package', 'framework', 'tool', 'import', 'environment'];
      validTypes.forEach(type => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = graph.validateDependencyBeforeAdd('T002', 'T001', type as any);
        expect(result.errors.filter(e => e.type === 'invalid-type')).toHaveLength(0);
      });

      // Test invalid type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invalidResult = graph.validateDependencyBeforeAdd('T002', 'T001', 'invalid-type' as any);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.some(e => e.type === 'invalid-type')).toBe(true);
    });

    it('should detect redundant dependencies', () => {
      // Add the same dependency twice (if possible through internal manipulation)
      graph.addDependency('T002', 'T001', 'task');

      // Try to add again
      const result = graph.validateDependencyBeforeAdd('T002', 'T001', 'task');
      expect(result.warnings.some(w => w.type === 'redundant')).toBe(true);
    });

    it('should suggest missing dependencies based on task patterns', () => {
      // Add tasks with specific patterns
      const testTask = {
        id: 'T007',
        title: 'Test main component',
        description: 'Unit tests',
        status: 'pending' as const,
        estimatedHours: 3,
        priority: 'medium' as const
      };

      const implementTask = {
        id: 'T008',
        title: 'Implement main component',
        description: 'Implementation',
        status: 'pending' as const,
        estimatedHours: 6,
        priority: 'high' as const
      };

      graph.addTask(testTask);
      graph.addTask(implementTask);

      const suggestions = graph.generateDependencySuggestions();

      // Should suggest that test depends on implementation
      const testDependencySuggestion = suggestions.find(s =>
        s.fromTaskId === 'T007' && s.toTaskId === 'T008' && s.type === 'add'
      );

      expect(testDependencySuggestion).toBeDefined();
      if (testDependencySuggestion) {
        expect(testDependencySuggestion.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should suggest dependency type improvements', () => {
      // Add a dependency with generic 'task' type that could be more specific
      const packageTask = {
        id: 'T007',
        title: 'Install npm packages',
        description: 'Package installation',
        status: 'pending' as const,
        estimatedHours: 1,
        priority: 'medium' as const
      };

      graph.addTask(packageTask);
      graph.addDependency('T002', 'T007', 'task'); // Generic type

      const suggestions = graph.generateDependencySuggestions();

      // Should suggest changing type to 'package'
      const typeSuggestion = suggestions.find(s =>
        s.type === 'modify' && s.dependencyType === 'package'
      );

      expect(typeSuggestion).toBeDefined();
    });

    it('should handle empty graph validation gracefully', () => {
      const emptyGraph = new OptimizedDependencyGraph('empty-test');

      const validation = emptyGraph.validateDependencies();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings).toHaveLength(0);
      expect(validation.suggestions).toHaveLength(0);

      const conflicts = emptyGraph.detectDependencyConflicts();
      expect(conflicts).toHaveLength(0);

      const suggestions = emptyGraph.generateDependencySuggestions();
      expect(suggestions).toHaveLength(0);
    });
  });

  // ===== TASK 3.1.4: GRAPH PERSISTENCE AND RECOVERY TESTS =====

  describe('Graph Persistence and Recovery', () => {
    beforeEach(() => {
      mockTasks.forEach(task => graph.addTask(task));
      // Add some dependencies to make the graph more interesting
      graph.addDependency('T002', 'T001', 'task');
      graph.addDependency('T003', 'T002', 'package');
      graph.addDependency('T004', 'T001', 'framework');
    });

    it('should serialize graph to JSON format', () => {
      const serialized = graph.serializeToJSON();

      expect(serialized).toBeDefined();
      expect(serialized.version).toBe('1.0.0');
      expect(serialized.projectId).toBe('test-project');
      expect(serialized.format).toBe('json');
      expect(serialized.checksum).toBeDefined();
      expect(serialized.timestamp).toBeDefined();

      // Check structure
      expect(serialized.nodes).toBeDefined();
      expect(serialized.edges).toBeDefined();
      expect(serialized.adjacencyList).toBeDefined();
      expect(serialized.reverseIndex).toBeDefined();
      expect(serialized.metadata).toBeDefined();

      // Check metadata
      expect(serialized.metadata.totalNodes).toBe(6);
      expect(serialized.metadata.totalEdges).toBe(3);
      expect(serialized.metadata.topologicalOrder).toBeInstanceOf(Array);
      expect(serialized.metadata.criticalPath).toBeInstanceOf(Array);
      expect(serialized.metadata.parallelBatches).toBeInstanceOf(Array);
      expect(serialized.metadata.metrics).toBeDefined();
    });

    it('should serialize graph to YAML format', () => {
      const serialized = graph.serializeToYAML();

      expect(serialized).toBeDefined();
      expect(serialized.version).toBe('1.0.0');
      expect(serialized.projectId).toBe('test-project');
      expect(serialized.format).toBe('yaml');
      expect(serialized.checksum).toBeDefined();
      expect(serialized.timestamp).toBeDefined();

      // Structure should be the same as JSON
      expect(serialized.nodes).toBeDefined();
      expect(serialized.edges).toBeDefined();
      expect(serialized.adjacencyList).toBeDefined();
      expect(serialized.reverseIndex).toBeDefined();
      expect(serialized.metadata).toBeDefined();
    });

    it('should validate graph integrity correctly', () => {
      const serialized = graph.serializeToJSON();
      const integrityResult = graph.validateGraphIntegrity(serialized);

      expect(integrityResult.isValid).toBe(true);
      expect(integrityResult.errors).toHaveLength(0);
      expect(integrityResult.warnings).toBeInstanceOf(Array);
      expect(integrityResult.checksumValid).toBe(true);
      expect(integrityResult.structureValid).toBe(true);
      expect(integrityResult.dataConsistent).toBe(true);
    });

    it('should detect corrupted checksum', () => {
      const serialized = graph.serializeToJSON();

      // Corrupt the checksum
      const corruptedSerialized = {
        ...serialized,
        checksum: 'invalid-checksum'
      };

      const integrityResult = graph.validateGraphIntegrity(corruptedSerialized);

      expect(integrityResult.isValid).toBe(false);
      expect(integrityResult.checksumValid).toBe(false);
      expect(integrityResult.errors.length).toBeGreaterThan(0);
      expect(integrityResult.errors[0]).toContain('Checksum validation failed');
    });

    it('should detect invalid structure', () => {
      const serialized = graph.serializeToJSON();

      // Corrupt the structure
      const corruptedSerialized = {
        ...serialized,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: null as any
      };

      const integrityResult = graph.validateGraphIntegrity(corruptedSerialized);

      expect(integrityResult.isValid).toBe(false);
      expect(integrityResult.structureValid).toBe(false);
      expect(integrityResult.errors.some(e => e.includes('Invalid nodes structure'))).toBe(true);
    });

    it('should detect data inconsistencies', () => {
      const serialized = graph.serializeToJSON();

      // Create data inconsistency - edge pointing to non-existent node
      const corruptedSerialized = {
        ...serialized,
        edges: {
          ...serialized.edges,
          'T001->T999': {
            from: 'T001',
            to: 'T999', // Non-existent node
            type: 'task' as const,
            weight: 1,
            critical: false
          }
        }
      };

      const integrityResult = graph.validateGraphIntegrity(corruptedSerialized);

      expect(integrityResult.isValid).toBe(false);
      expect(integrityResult.dataConsistent).toBe(false);
      expect(integrityResult.errors.some(e => e.includes('references non-existent node: T999'))).toBe(true);
    });

    it('should create incremental updates', () => {
      const initialSerialized = graph.serializeToJSON();
      const initialChecksum = initialSerialized.checksum;

      // Make a change to the graph - ensure it's successful
      const dependencyAdded = graph.addDependency('T005', 'T004', 'tool');
      expect(dependencyAdded).toBe(true); // Verify the dependency was actually added

      // Create incremental update
      const update = graph.createIncrementalUpdate(initialChecksum);

      expect(update).not.toBeNull();
      expect(update).toBeDefined();
      if (update) {
        expect(update.checksum).not.toBe(initialChecksum);
        expect(update.edges).toBeDefined();
      }
    });

    it('should return null for incremental update when no changes', () => {
      const initialSerialized = graph.serializeToJSON();
      const initialChecksum = initialSerialized.checksum;

      // No changes made
      const update = graph.createIncrementalUpdate(initialChecksum);

      expect(update).toBeNull();
    });

    it('should apply incremental updates', () => {
      const initialSerialized = graph.serializeToJSON();

      // Create a new graph and apply the serialized data
      const newGraph = new OptimizedDependencyGraph('test-project-2');
      const success = newGraph.applyIncrementalUpdate(initialSerialized);

      expect(success).toBe(true);

      // Verify the data was applied correctly
      const newSerialized = newGraph.serializeToJSON();
      expect(newSerialized.metadata.totalNodes).toBe(initialSerialized.metadata.totalNodes);
      expect(newSerialized.metadata.totalEdges).toBe(initialSerialized.metadata.totalEdges);
    });

    it('should handle empty graph serialization', () => {
      const emptyGraph = new OptimizedDependencyGraph('empty-project');

      const serialized = emptyGraph.serializeToJSON();

      expect(serialized.metadata.totalNodes).toBe(0);
      expect(serialized.metadata.totalEdges).toBe(0);
      expect(serialized.nodes).toEqual({});
      expect(serialized.edges).toEqual({});
      expect(serialized.adjacencyList).toEqual({});
      expect(serialized.reverseIndex).toEqual({});
    });

    it('should validate empty graph integrity', () => {
      const emptyGraph = new OptimizedDependencyGraph('empty-project');
      const serialized = emptyGraph.serializeToJSON();
      const integrityResult = emptyGraph.validateGraphIntegrity(serialized);

      expect(integrityResult.isValid).toBe(true);
      expect(integrityResult.errors).toHaveLength(0);
      expect(integrityResult.checksumValid).toBe(true);
      expect(integrityResult.structureValid).toBe(true);
      expect(integrityResult.dataConsistent).toBe(true);
    });

    it('should generate consistent checksums for identical data', () => {
      const serialized1 = graph.serializeToJSON();
      const serialized2 = graph.serializeToJSON();

      expect(serialized1.checksum).toBe(serialized2.checksum);
    });

    it('should generate different checksums for different data', () => {
      const serialized1 = graph.serializeToJSON();

      // Make a change
      graph.addDependency('T006', 'T005', 'environment');

      const serialized2 = graph.serializeToJSON();

      expect(serialized1.checksum).not.toBe(serialized2.checksum);
    });

    it('should include all required metadata in serialization', () => {
      // Use a fresh graph to avoid state sharing from previous tests
      const testGraph = new OptimizedDependencyGraph('metadata-test');
      mockTasks.forEach(task => testGraph.addTask(task));

      // Add the same 3 dependencies as the beforeEach
      testGraph.addDependency('T002', 'T001', 'task');
      testGraph.addDependency('T003', 'T002', 'package');
      testGraph.addDependency('T004', 'T001', 'framework');

      const serialized = testGraph.serializeToJSON();

      expect(serialized.metadata.metrics).toBeDefined();
      expect(serialized.metadata.metrics.totalNodes).toBe(6);
      expect(serialized.metadata.metrics.totalEdges).toBe(3);
      expect(serialized.metadata.metrics.maxDepth).toBeGreaterThanOrEqual(0);
      expect(serialized.metadata.metrics.criticalPathLength).toBeGreaterThanOrEqual(0);
      expect(serialized.metadata.metrics.parallelBatches).toBeGreaterThanOrEqual(0);
      expect(serialized.metadata.metrics.cycleCount).toBe(0);
      expect(serialized.metadata.metrics.orphanedNodes).toBeGreaterThanOrEqual(0);
      expect(serialized.metadata.metrics.averageDegree).toBeGreaterThanOrEqual(0);
    });
  });
});
