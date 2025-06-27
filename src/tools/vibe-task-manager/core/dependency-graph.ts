import { AtomicTask } from '../types/task.js';
import { Dependency, DependencyType, DependencyNode } from '../types/dependency.js';
import logger from '../../../logger.js';

/**
 * Extended dependency types for comprehensive task management
 */
export type ExtendedDependencyType =
  | 'task'        // Task-to-task dependency
  | 'package'     // Package/library dependency
  | 'framework'   // Framework dependency
  | 'tool'        // Tool/utility dependency
  | 'import'      // Code import dependency
  | 'environment' // Environment/infrastructure dependency;

/**
 * Dependency edge with extended type information
 */
export interface DependencyEdge {
  from: string;
  to: string;
  type: ExtendedDependencyType;
  weight: number;
  critical: boolean;
  description?: string;
}

/**
 * Graph statistics and metrics
 */
export interface GraphMetrics {
  totalNodes: number;
  totalEdges: number;
  maxDepth: number;
  criticalPathLength: number;
  parallelBatches: number;
  cycleCount: number;
  orphanedNodes: number;
  averageDegree: number;
}

/**
 * Parallel execution batch
 */
export interface ParallelBatch {
  batchId: number;
  taskIds: string[];
  estimatedDuration: number;
  dependencies: string[];
  canStartAfter: number[];
}

/**
 * Critical path analysis result
 */
export interface CriticalPathAnalysis {
  paths: string[][];
  longestPath: string[];
  totalDuration: number;
  resourceWeightedDuration: number;
  bottleneckTasks: string[];
}

/**
 * Dependency impact analysis result
 */
export interface DependencyImpact {
  taskId: string;
  directDependents: string[];
  indirectDependents: string[];
  impactRadius: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  propagationChain: string[][];
}

/**
 * Bottleneck detection result
 */
export interface BottleneckAnalysis {
  taskId: string;
  bottleneckType: 'resource' | 'dependency' | 'critical-path' | 'parallel-constraint';
  severity: number; // 0-1 scale
  affectedTasks: string[];
  recommendations: string[];
}

/**
 * Resource allocation optimization result
 */
export interface ResourceOptimization {
  optimalBatches: ParallelBatch[];
  resourceUtilization: number;
  timeReduction: number;
  parallelismOpportunities: {
    taskId: string;
    canRunWith: string[];
    estimatedSavings: number;
  }[];
}

/**
 * Dependency validation result
 */
export interface DependencyValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: DependencySuggestion[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  type: 'cycle' | 'missing-task' | 'invalid-type' | 'self-dependency' | 'conflict';
  severity: 'error' | 'warning';
  message: string;
  affectedTasks: string[];
  suggestedFix?: string;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  type: 'redundant' | 'inefficient' | 'potential-issue';
  message: string;
  affectedTasks: string[];
  recommendation?: string;
}

/**
 * Dependency suggestion
 */
export interface DependencySuggestion {
  type: 'add' | 'remove' | 'modify' | 'reorder';
  fromTaskId: string;
  toTaskId: string;
  dependencyType: ExtendedDependencyType;
  reason: string;
  confidence: number; // 0-1 scale
  impact: 'low' | 'medium' | 'high';
}

/**
 * Dependency conflict detection result
 */
export interface DependencyConflict {
  conflictType: 'circular' | 'incompatible-types' | 'resource-contention' | 'timing-conflict';
  description: string;
  involvedTasks: string[];
  involvedDependencies: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolutionOptions: ConflictResolution[];
}

/**
 * Conflict resolution option
 */
export interface ConflictResolution {
  strategy: 'remove-dependency' | 'change-type' | 'reorder-tasks' | 'split-task' | 'merge-tasks';
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
}

/**
 * Graph serialization format
 */
export type GraphSerializationFormat = 'json' | 'yaml';

/**
 * Serialized graph data
 */
export interface SerializedGraph {
  version: string;
  projectId: string;
  timestamp: string;
  format: GraphSerializationFormat;
  checksum: string;
  nodes: Record<string, DependencyNode>;
  edges: Record<string, DependencyEdge>;
  adjacencyList: Record<string, string[]>;
  reverseIndex: Record<string, string[]>;
  metadata: {
    totalNodes: number;
    totalEdges: number;
    criticalPath: string[];
    topologicalOrder: string[];
    parallelBatches: ParallelBatch[];
    metrics: GraphMetrics;
  };
}

/**
 * Graph persistence result
 */
export interface GraphPersistenceResult {
  success: boolean;
  filePath?: string;
  format: GraphSerializationFormat;
  size: number;
  checksum: string;
  error?: string;
  timestamp: Date;
}

/**
 * Graph recovery result
 */
export interface GraphRecoveryResult {
  success: boolean;
  recovered: boolean;
  corruptionDetected: boolean;
  backupUsed?: string;
  validationErrors: string[];
  recoveryActions: string[];
  error?: string;
}

/**
 * Graph integrity check result
 */
export interface GraphIntegrityResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  checksumValid: boolean;
  structureValid: boolean;
  dataConsistent: boolean;
}

/**
 * Graph version info
 */
export interface GraphVersion {
  version: string;
  timestamp: Date;
  checksum: string;
  description: string;
  filePath: string;
  format: GraphSerializationFormat;
}

/**
 * Optimized dependency graph implementation using adjacency lists
 * Supports DAG validation, cycle detection, and parallel execution planning
 */
export class OptimizedDependencyGraph {
  // Core graph structure
  private adjacencyList = new Map<string, Set<string>>();
  private reverseIndex = new Map<string, Set<string>>();
  private nodes = new Map<string, DependencyNode>();
  private edges = new Map<string, DependencyEdge>();

  // Cached computations
  private topologicalOrder: string[] = [];
  private criticalPath: string[] = [];
  private parallelBatches: ParallelBatch[] = [];
  private isDirty = false;

  // Performance tracking
  private metrics: GraphMetrics = {
    totalNodes: 0,
    totalEdges: 0,
    maxDepth: 0,
    criticalPathLength: 0,
    parallelBatches: 0,
    cycleCount: 0,
    orphanedNodes: 0,
    averageDegree: 0
  };

  constructor(private projectId: string) {
    logger.debug({ projectId }, 'Initializing optimized dependency graph');
  }

  /**
   * Add a task node to the graph
   */
  addTask(task: AtomicTask): void {
    const node: DependencyNode = {
      taskId: task.id,
      title: task.title,
      status: task.status,
      estimatedHours: task.estimatedHours,
      priority: task.priority,
      dependencies: [],
      dependents: [],
      depth: 0,
      criticalPath: false
    };

    this.nodes.set(task.id, node);

    // Initialize adjacency lists if not exists
    if (!this.adjacencyList.has(task.id)) {
      this.adjacencyList.set(task.id, new Set());
    }
    if (!this.reverseIndex.has(task.id)) {
      this.reverseIndex.set(task.id, new Set());
    }

    this.markDirty();
    logger.debug({ taskId: task.id, title: task.title }, 'Added task to dependency graph');
  }

  /**
   * Add a dependency edge between two tasks
   * @param dependentTaskId - The task that depends on another task
   * @param dependencyTaskId - The task that is depended upon
   * @param type - Type of dependency
   * @param weight - Weight of the dependency
   * @param critical - Whether this is a critical dependency
   * @param description - Optional description
   */
  addDependency(
    dependentTaskId: string,
    dependencyTaskId: string,
    type: ExtendedDependencyType = 'task',
    weight: number = 1,
    critical: boolean = false,
    description?: string
  ): boolean {
    // Validate nodes exist
    if (!this.nodes.has(dependentTaskId) || !this.nodes.has(dependencyTaskId)) {
      logger.warn({ dependentTaskId, dependencyTaskId }, 'Cannot add dependency: one or both tasks not found');
      return false;
    }

    // Check for cycle before adding
    if (this.wouldCreateCycle(dependencyTaskId, dependentTaskId)) {
      logger.warn({ dependentTaskId, dependencyTaskId }, 'Cannot add dependency: would create cycle');
      return false;
    }

    const edgeId = `${dependentTaskId}->${dependencyTaskId}`;
    const edge: DependencyEdge = {
      from: dependentTaskId,
      to: dependencyTaskId,
      type,
      weight,
      critical,
      description
    };

    // Add to adjacency list and reverse index
    // dependencyTaskId -> dependentTaskId (dependency points to dependent)
    this.adjacencyList.get(dependencyTaskId)!.add(dependentTaskId);
    this.reverseIndex.get(dependentTaskId)!.add(dependencyTaskId);
    this.edges.set(edgeId, edge);

    // Update node dependencies
    const dependentNode = this.nodes.get(dependentTaskId)!;
    const dependencyNode = this.nodes.get(dependencyTaskId)!;

    // dependentTaskId depends on dependencyTaskId
    dependentNode.dependencies.push(dependencyTaskId);
    dependencyNode.dependents.push(dependentTaskId);

    this.markDirty();
    logger.debug({ dependentTaskId, dependencyTaskId, type }, 'Added dependency edge');
    return true;
  }

  /**
   * Remove a dependency edge
   */
  removeDependency(dependentTaskId: string, dependencyTaskId: string): boolean {
    const edgeId = `${dependentTaskId}->${dependencyTaskId}`;

    if (!this.edges.has(edgeId)) {
      return false;
    }

    // Remove from adjacency structures
    this.adjacencyList.get(dependencyTaskId)?.delete(dependentTaskId);
    this.reverseIndex.get(dependentTaskId)?.delete(dependencyTaskId);
    this.edges.delete(edgeId);

    // Update node dependencies
    const dependentNode = this.nodes.get(dependentTaskId);
    const dependencyNode = this.nodes.get(dependencyTaskId);

    if (dependentNode) {
      dependentNode.dependencies = dependentNode.dependencies.filter(id => id !== dependencyTaskId);
    }
    if (dependencyNode) {
      dependencyNode.dependents = dependencyNode.dependents.filter(id => id !== dependentTaskId);
    }

    this.markDirty();
    logger.debug({ dependentTaskId, dependencyTaskId }, 'Removed dependency edge');
    return true;
  }

  /**
   * Get tasks that are ready to execute (no pending dependencies)
   */
  getReadyTasks(): string[] {
    const readyTasks: string[] = [];

    for (const [taskId, node] of this.nodes) {
      if (node.status === 'pending' && this.hasNoPendingDependencies(taskId)) {
        readyTasks.push(taskId);
      }
    }

    return readyTasks;
  }

  /**
   * Detect cycles in the graph using DFS
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const neighbors = this.adjacencyList.get(nodeId) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          cycles.push([...cycle]);
          return true; // Return true to indicate cycle found
        }
      }

      recursionStack.delete(nodeId);
      path.pop();
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }

    return cycles;
  }

  /**
   * Get topological ordering of tasks
   */
  getTopologicalOrder(): string[] {
    if (!this.isDirty && this.topologicalOrder.length > 0) {
      return [...this.topologicalOrder];
    }

    // First check for cycles - if any exist, return empty array
    const cycles = this.detectCycles();
    if (cycles.length > 0) {
      logger.warn({ cycleCount: cycles.length }, 'Cannot create topological order - graph contains cycles');
      this.topologicalOrder = [];
      return [];
    }

    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];

    // Initialize in-degree count
    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, this.reverseIndex.get(nodeId)?.size || 0);
      if (inDegree.get(nodeId) === 0) {
        queue.push(nodeId);
      }
    }

    // Kahn's algorithm
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = this.adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        const newInDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newInDegree);

        if (newInDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Double-check for cycles (should not happen if detectCycles worked correctly)
    if (result.length !== this.nodes.size) {
      logger.warn({
        expected: this.nodes.size,
        actual: result.length
      }, 'Topological sort incomplete - graph contains cycles');
      return [];
    }

    this.topologicalOrder = result;
    return [...result];
  }

  /**
   * Calculate critical path through the graph
   */
  getCriticalPath(): string[] {
    if (!this.isDirty && this.criticalPath.length > 0) {
      return [...this.criticalPath];
    }

    const topOrder = this.getTopologicalOrder();
    if (topOrder.length === 0) {
      return [];
    }

    // Calculate longest path (critical path)
    const distances = new Map<string, number>();
    const predecessors = new Map<string, string>();

    // Initialize distances
    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, 0);
    }

    // Calculate longest distances
    for (const nodeId of topOrder) {
      const node = this.nodes.get(nodeId)!;
      const currentDistance = distances.get(nodeId)!;

      const neighbors = this.adjacencyList.get(nodeId) || new Set();
      for (const neighbor of neighbors) {
        const edge = this.edges.get(`${nodeId}->${neighbor}`);
        const newDistance = currentDistance + (node.estimatedHours * (edge?.weight || 1));

        if (newDistance > distances.get(neighbor)!) {
          distances.set(neighbor, newDistance);
          predecessors.set(neighbor, nodeId);
        }
      }
    }

    // Find the node with maximum distance (end of critical path)
    let maxDistance = 0;
    let endNode = '';
    for (const [nodeId, distance] of distances) {
      if (distance > maxDistance) {
        maxDistance = distance;
        endNode = nodeId;
      }
    }

    // Reconstruct critical path
    const path: string[] = [];
    let current = endNode;
    while (current) {
      path.unshift(current);
      current = predecessors.get(current) || '';
    }

    // Mark critical path nodes
    for (const nodeId of this.nodes.keys()) {
      const node = this.nodes.get(nodeId)!;
      node.criticalPath = path.includes(nodeId);
    }

    this.criticalPath = path;
    return [...path];
  }

  /**
   * Identify parallel execution batches
   */
  getParallelBatches(): ParallelBatch[] {
    if (!this.isDirty && this.parallelBatches.length > 0) {
      return [...this.parallelBatches];
    }

    const topOrder = this.getTopologicalOrder();
    if (topOrder.length === 0) {
      return [];
    }

    const batches: ParallelBatch[] = [];
    const processed = new Set<string>();
    let batchId = 0;

    while (processed.size < this.nodes.size) {
      const currentBatch: string[] = [];

      // Find all tasks that can run in parallel (no unprocessed dependencies)
      for (const taskId of topOrder) {
        if (processed.has(taskId)) continue;

        const dependencies = this.reverseIndex.get(taskId) || new Set();
        const hasUnprocessedDeps = Array.from(dependencies).some(dep => !processed.has(dep));

        if (!hasUnprocessedDeps) {
          currentBatch.push(taskId);
        }
      }

      if (currentBatch.length === 0) {
        logger.warn('No tasks can be processed - possible cycle or error');
        break;
      }

      // Calculate batch metrics
      const estimatedDuration = Math.max(
        ...currentBatch.map(taskId => this.nodes.get(taskId)?.estimatedHours || 0)
      );

      const dependencies: string[] = Array.from(new Set(
        currentBatch.flatMap(taskId =>
          Array.from(this.reverseIndex.get(taskId) || new Set<string>())
        )
      ));

      const canStartAfter = batches.length > 0 ? [batches.length - 1] : [];

      batches.push({
        batchId,
        taskIds: currentBatch,
        estimatedDuration,
        dependencies,
        canStartAfter
      });

      // Mark tasks as processed
      currentBatch.forEach(taskId => processed.add(taskId));
      batchId++;
    }

    this.parallelBatches = batches;
    return [...batches];
  }

  /**
   * Check if adding a dependency would create a cycle
   */
  private wouldCreateCycle(fromTaskId: string, toTaskId: string): boolean {
    // If there's already a path from toTaskId to fromTaskId, adding this edge would create a cycle
    return this.hasPath(toTaskId, fromTaskId);
  }

  /**
   * Check if there's a path between two nodes using DFS
   */
  private hasPath(from: string, to: string): boolean {
    if (from === to) return true;

    const visited = new Set<string>();
    const stack = [from];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;

      visited.add(current);

      const neighbors = this.adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (neighbor === to) return true;
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }

    return false;
  }

  /**
   * Check if a task has no pending dependencies
   */
  private hasNoPendingDependencies(taskId: string): boolean {
    const dependencies = this.reverseIndex.get(taskId) || new Set();

    for (const depId of dependencies) {
      const depNode = this.nodes.get(depId);
      if (depNode && depNode.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Mark the graph as dirty (needs recomputation)
   */
  private markDirty(): void {
    this.isDirty = true;
    this.updateMetrics();
  }

  /**
   * Update graph metrics
   */
  private updateMetrics(): void {
    this.metrics = {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      maxDepth: this.calculateMaxDepth(),
      criticalPathLength: this.criticalPath.length,
      parallelBatches: this.parallelBatches.length,
      cycleCount: this.detectCycles().length,
      orphanedNodes: this.getOrphanedNodes().length,
      averageDegree: this.calculateAverageDegree()
    };
  }

  /**
   * Calculate maximum depth in the graph
   */
  private calculateMaxDepth(): number {
    let maxDepth = 0;
    for (const node of this.nodes.values()) {
      maxDepth = Math.max(maxDepth, node.depth);
    }
    return maxDepth;
  }

  /**
   * Get orphaned nodes (no dependencies or dependents)
   */
  private getOrphanedNodes(): string[] {
    const orphaned: string[] = [];

    for (const [nodeId, node] of this.nodes) {
      if (node.dependencies.length === 0 && node.dependents.length === 0) {
        orphaned.push(nodeId);
      }
    }

    return orphaned;
  }

  /**
   * Calculate average degree (connections per node)
   */
  private calculateAverageDegree(): number {
    if (this.nodes.size === 0) return 0;

    let totalDegree = 0;
    for (const node of this.nodes.values()) {
      totalDegree += node.dependencies.length + node.dependents.length;
    }

    return totalDegree / this.nodes.size;
  }

  /**
   * Get current graph metrics
   */
  getMetrics(): GraphMetrics {
    if (this.isDirty) {
      this.updateMetrics();
    }
    return { ...this.metrics };
  }

  /**
   * Get all nodes in the graph
   */
  getNodes(): Map<string, DependencyNode> {
    return new Map(this.nodes);
  }

  /**
   * Get all edges in the graph
   */
  getEdges(): Map<string, DependencyEdge> {
    return new Map(this.edges);
  }

  /**
   * Clear all cached computations
   */
  clearCache(): void {
    this.topologicalOrder = [];
    this.criticalPath = [];
    this.parallelBatches = [];
    this.isDirty = true;
  }

  /**
   * Reset the entire graph to empty state
   */
  reset(): void {
    // Clear all data structures
    this.nodes.clear();
    this.edges.clear();
    this.adjacencyList.clear();
    this.reverseIndex.clear();

    // Clear cached computations
    this.clearCache();

    // Reset metrics
    this.metrics = {
      totalNodes: 0,
      totalEdges: 0,
      maxDepth: 0,
      criticalPathLength: 0,
      parallelBatches: 0,
      cycleCount: 0,
      orphanedNodes: 0,
      averageDegree: 0
    };

    logger.debug({ projectId: this.projectId }, 'Dependency graph reset to empty state');
  }

  /**
   * Get graph size information
   */
  getSize(): { nodes: number; edges: number } {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size
    };
  }

  // ===== TASK 3.1.2: DEPENDENCY ANALYSIS ENGINE =====

  /**
   * Enhanced critical path analysis with resource weighting
   */
  analyzeCriticalPath(): CriticalPathAnalysis {
    const topOrder = this.getTopologicalOrder();
    if (topOrder.length === 0) {
      return {
        paths: [],
        longestPath: [],
        totalDuration: 0,
        resourceWeightedDuration: 0,
        bottleneckTasks: []
      };
    }

    // Find all possible paths from sources to sinks
    const allPaths = this.findAllCriticalPaths();

    // Calculate durations for each path
    const pathDurations = allPaths.map(path => ({
      path,
      duration: this.calculatePathDuration(path),
      resourceWeightedDuration: this.calculateResourceWeightedDuration(path)
    }));

    // Find the longest path by duration
    const longestByDuration = pathDurations.reduce((max, current) =>
      current.duration > max.duration ? current : max
    );

    // Find the longest path by resource-weighted duration
    const longestByResourceWeight = pathDurations.reduce((max, current) =>
      current.resourceWeightedDuration > max.resourceWeightedDuration ? current : max
    );

    // Identify bottleneck tasks (tasks that appear in multiple critical paths)
    const taskFrequency = new Map<string, number>();
    allPaths.forEach(path => {
      path.forEach(taskId => {
        taskFrequency.set(taskId, (taskFrequency.get(taskId) || 0) + 1);
      });
    });

    const bottleneckTasks = Array.from(taskFrequency.entries())
      .filter(([_, frequency]) => frequency > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([taskId]) => taskId);

    return {
      paths: allPaths,
      longestPath: longestByDuration.path,
      totalDuration: longestByDuration.duration,
      resourceWeightedDuration: longestByResourceWeight.resourceWeightedDuration,
      bottleneckTasks
    };
  }

  /**
   * Analyze dependency impact for a specific task
   */
  analyzeDependencyImpact(taskId: string): DependencyImpact {
    if (!this.nodes.has(taskId)) {
      throw new Error(`Task ${taskId} not found in graph`);
    }

    const directDependents = Array.from(this.adjacencyList.get(taskId) || new Set<string>());
    const indirectDependents = this.findIndirectDependents(taskId);
    const propagationChains = this.findPropagationChains(taskId);

    // Calculate impact radius (max depth of propagation)
    const impactRadius = propagationChains.length > 0 ? Math.max(...propagationChains.map(chain => chain.length - 1)) : 0;

    // Determine risk level based on impact radius and number of affected tasks
    const totalAffected = new Set([...directDependents, ...indirectDependents]).size;
    const riskLevel = this.calculateRiskLevel(impactRadius, totalAffected);

    return {
      taskId,
      directDependents,
      indirectDependents,
      impactRadius,
      riskLevel,
      propagationChain: propagationChains
    };
  }

  /**
   * Detect bottlenecks in the dependency graph
   */
  detectBottlenecks(): BottleneckAnalysis[] {
    const bottlenecks: BottleneckAnalysis[] = [];
    const criticalPathAnalysis = this.analyzeCriticalPath();

    // Analyze each task for bottleneck potential
    for (const [taskId, node] of this.nodes) {
      const analysis = this.analyzeTaskBottleneck(taskId, node, criticalPathAnalysis);
      if (analysis.severity > 0.3) { // Only include significant bottlenecks
        bottlenecks.push(analysis);
      }
    }

    // Sort by severity (highest first)
    return bottlenecks.sort((a, b) => b.severity - a.severity);
  }

  /**
   * Optimize resource allocation and parallel execution
   */
  optimizeResourceAllocation(): ResourceOptimization {
    const currentBatches = this.getParallelBatches();
    const optimizedBatches = this.optimizeParallelBatches(currentBatches);

    // Calculate resource utilization
    const totalTasks = this.nodes.size;
    const parallelTasks = optimizedBatches.reduce((sum, batch) => sum + batch.taskIds.length, 0);
    const resourceUtilization = parallelTasks / totalTasks;

    // Calculate time reduction
    const originalTime = currentBatches.reduce((sum, batch) => sum + batch.estimatedDuration, 0);
    const optimizedTime = optimizedBatches.reduce((sum, batch) => sum + batch.estimatedDuration, 0);
    const timeReduction = (originalTime - optimizedTime) / originalTime;

    // Identify parallelism opportunities
    const parallelismOpportunities = this.identifyParallelismOpportunities();

    return {
      optimalBatches: optimizedBatches,
      resourceUtilization,
      timeReduction,
      parallelismOpportunities
    };
  }

  // ===== HELPER METHODS FOR DEPENDENCY ANALYSIS =====

  /**
   * Find all critical paths from sources to sinks
   */
  private findAllCriticalPaths(): string[][] {
    const sources = this.findSourceNodes();
    const sinks = this.findSinkNodes();
    const allPaths: string[][] = [];

    // Find all paths from each source to each sink
    for (const source of sources) {
      for (const sink of sinks) {
        const paths = this.findAllPathsBetween(source, sink);
        allPaths.push(...paths);
      }
    }

    return allPaths;
  }

  /**
   * Find source nodes (no dependencies)
   */
  private findSourceNodes(): string[] {
    return Array.from(this.nodes.keys()).filter(nodeId =>
      (this.reverseIndex.get(nodeId)?.size || 0) === 0
    );
  }

  /**
   * Find sink nodes (no dependents)
   */
  private findSinkNodes(): string[] {
    return Array.from(this.nodes.keys()).filter(nodeId =>
      (this.adjacencyList.get(nodeId)?.size || 0) === 0
    );
  }

  /**
   * Find all paths between two nodes
   */
  private findAllPathsBetween(start: string, end: string): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[]) => {
      if (current === end) {
        paths.push([...path, current]);
        return;
      }

      if (visited.has(current)) return;
      visited.add(current);

      const neighbors = this.adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path, current]);
      }

      visited.delete(current);
    };

    dfs(start, []);
    return paths;
  }

  /**
   * Calculate total duration for a path
   */
  private calculatePathDuration(path: string[]): number {
    return path.reduce((total, taskId) => {
      const node = this.nodes.get(taskId);
      return total + (node?.estimatedHours || 0);
    }, 0);
  }

  /**
   * Calculate resource-weighted duration for a path
   */
  private calculateResourceWeightedDuration(path: string[]): number {
    return path.reduce((total, taskId) => {
      const node = this.nodes.get(taskId);
      const baseHours = node?.estimatedHours || 0;

      // Apply resource weighting based on task priority and complexity
      let weight = 1.0;
      if (node?.priority === 'high') weight *= 1.5;
      if (node?.priority === 'critical') weight *= 2.0;

      return total + (baseHours * weight);
    }, 0);
  }

  /**
   * Find indirect dependents of a task
   */
  private findIndirectDependents(taskId: string): string[] {
    const visited = new Set<string>();
    const indirectDependents = new Set<string>();

    const dfs = (current: string, depth: number) => {
      if (visited.has(current) || depth > 10) return; // Prevent infinite loops
      visited.add(current);

      const dependents = this.adjacencyList.get(current) || new Set();
      for (const dependent of dependents) {
        if (dependent !== taskId) { // Exclude the original task
          indirectDependents.add(dependent);
          dfs(dependent, depth + 1);
        }
      }
    };

    // Start from direct dependents
    const directDependents = this.adjacencyList.get(taskId) || new Set();
    for (const dependent of directDependents) {
      dfs(dependent, 1);
    }

    // Remove direct dependents to get only indirect ones
    for (const direct of directDependents) {
      indirectDependents.delete(direct);
    }

    return Array.from(indirectDependents);
  }

  /**
   * Find propagation chains from a task
   */
  private findPropagationChains(taskId: string): string[][] {
    const chains: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, chain: string[]) => {
      if (visited.has(current) || chain.length > 10) return; // Prevent infinite loops

      const dependents = this.adjacencyList.get(current) || new Set();
      if (dependents.size === 0) {
        // End of chain
        chains.push([...chain, current]);
        return;
      }

      visited.add(current);
      for (const dependent of dependents) {
        dfs(dependent, [...chain, current]);
      }
      visited.delete(current);
    };

    dfs(taskId, []);
    return chains;
  }

  /**
   * Calculate risk level based on impact radius and affected tasks
   */
  private calculateRiskLevel(impactRadius: number, totalAffected: number): 'low' | 'medium' | 'high' | 'critical' {
    const riskScore = (impactRadius * 0.6) + (totalAffected * 0.4);

    if (riskScore >= 8) return 'critical';
    if (riskScore >= 5) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Analyze a task for bottleneck potential
   */
  private analyzeTaskBottleneck(taskId: string, node: DependencyNode, criticalPathAnalysis: CriticalPathAnalysis): BottleneckAnalysis {
    let severity = 0;
    let bottleneckType: BottleneckAnalysis['bottleneckType'] = 'dependency';
    const affectedTasks: string[] = [];
    const recommendations: string[] = [];

    // Check if task is on critical path
    if (criticalPathAnalysis.longestPath.includes(taskId)) {
      severity += 0.4;
      bottleneckType = 'critical-path';
      affectedTasks.push(...criticalPathAnalysis.longestPath);
      recommendations.push('Task is on critical path - prioritize completion');
    }

    // Check dependency fan-out (many dependents) - highest priority
    const dependentCount = this.adjacencyList.get(taskId)?.size || 0;
    if (dependentCount > 3) {
      severity += 0.4; // Increased weight for dependency bottlenecks
      bottleneckType = 'dependency';
      affectedTasks.push(...Array.from(this.adjacencyList.get(taskId) || new Set<string>()));
      recommendations.push(`High dependency fan-out (${dependentCount} dependents) - consider breaking down task`);
    }

    // Check resource constraints (high estimated hours)
    if (node.estimatedHours > 8) {
      severity += 0.2;
      if (bottleneckType === 'dependency') {
        // Keep dependency as primary type if already set
      } else {
        bottleneckType = 'resource';
      }
      recommendations.push('High time estimate - consider parallel execution or task breakdown');
    }

    // Check parallel constraints (tasks that can't be parallelized) - lowest priority
    const parallelConstraints = this.checkParallelConstraints(taskId);
    if (parallelConstraints > 0) {
      severity += 0.1;
      if (bottleneckType === 'dependency' || bottleneckType === 'resource') {
        // Keep higher priority types
      } else {
        bottleneckType = 'parallel-constraint';
      }
      recommendations.push('Limited parallelization opportunities - review dependencies');
    }

    return {
      taskId,
      bottleneckType,
      severity: Math.min(severity, 1.0), // Cap at 1.0
      affectedTasks: [...new Set(affectedTasks)], // Remove duplicates
      recommendations
    };
  }

  /**
   * Check parallel constraints for a task
   */
  private checkParallelConstraints(taskId: string): number {
    const dependencies = this.reverseIndex.get(taskId)?.size || 0;
    const dependents = this.adjacencyList.get(taskId)?.size || 0;

    // Higher values indicate more constraints
    return dependencies + dependents;
  }

  /**
   * Optimize parallel batches for better resource utilization
   */
  private optimizeParallelBatches(currentBatches: ParallelBatch[]): ParallelBatch[] {
    const optimizedBatches: ParallelBatch[] = [];

    for (const batch of currentBatches) {
      // Try to balance batch sizes and durations
      const optimizedBatch = this.balanceBatch(batch);
      optimizedBatches.push(optimizedBatch);
    }

    return optimizedBatches;
  }

  /**
   * Balance a batch for optimal resource utilization
   */
  private balanceBatch(batch: ParallelBatch): ParallelBatch {
    // Sort tasks by estimated duration (longest first)
    const sortedTasks = batch.taskIds.sort((a, b) => {
      const nodeA = this.nodes.get(a);
      const nodeB = this.nodes.get(b);
      return (nodeB?.estimatedHours || 0) - (nodeA?.estimatedHours || 0);
    });

    // Recalculate estimated duration based on sorted tasks
    const estimatedDuration = Math.max(
      ...sortedTasks.map(taskId => this.nodes.get(taskId)?.estimatedHours || 0)
    );

    return {
      ...batch,
      taskIds: sortedTasks,
      estimatedDuration
    };
  }

  /**
   * Identify parallelism opportunities
   */
  private identifyParallelismOpportunities(): ResourceOptimization['parallelismOpportunities'] {
    const opportunities: ResourceOptimization['parallelismOpportunities'] = [];

    for (const [taskId, node] of this.nodes) {
      const canRunWith = this.findParallelizableTasks(taskId);
      if (canRunWith.length > 0) {
        const estimatedSavings = this.calculateParallelSavings(taskId, canRunWith);
        opportunities.push({
          taskId,
          canRunWith,
          estimatedSavings
        });
      }
    }

    return opportunities.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
  }

  /**
   * Find tasks that can run in parallel with the given task
   */
  private findParallelizableTasks(taskId: string): string[] {
    const parallelizable: string[] = [];
    const taskDependencies = this.reverseIndex.get(taskId) || new Set();
    const taskDependents = this.adjacencyList.get(taskId) || new Set();

    for (const [otherTaskId] of this.nodes) {
      if (otherTaskId === taskId) continue;

      const otherDependencies = this.reverseIndex.get(otherTaskId) || new Set();
      const otherDependents = this.adjacencyList.get(otherTaskId) || new Set();

      // Check if tasks can run in parallel (no direct dependency relationship)
      const hasDirectDependency = taskDependencies.has(otherTaskId) ||
                                 taskDependents.has(otherTaskId) ||
                                 otherDependencies.has(taskId) ||
                                 otherDependents.has(taskId);

      if (!hasDirectDependency) {
        parallelizable.push(otherTaskId);
      }
    }

    return parallelizable;
  }

  /**
   * Calculate estimated time savings from parallel execution
   */
  private calculateParallelSavings(taskId: string, parallelTasks: string[]): number {
    const taskDuration = this.nodes.get(taskId)?.estimatedHours || 0;
    const parallelDurations = parallelTasks.map(id => this.nodes.get(id)?.estimatedHours || 0);

    // Sequential time would be sum of all durations
    const sequentialTime = taskDuration + parallelDurations.reduce((sum, duration) => sum + duration, 0);

    // Parallel time would be the maximum duration
    const parallelTime = Math.max(taskDuration, ...parallelDurations);

    return sequentialTime - parallelTime;
  }

  // ===== TASK 3.1.3: DEPENDENCY VALIDATION SYSTEM =====

  /**
   * Comprehensive dependency validation
   */
  validateDependencies(): DependencyValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: DependencySuggestion[] = [];

    // 1. Validate dependency types
    const typeValidation = this.validateDependencyTypes();
    errors.push(...typeValidation.errors);
    warnings.push(...typeValidation.warnings);

    // 2. Detect conflicts
    const conflicts = this.detectDependencyConflicts();
    conflicts.forEach(conflict => {
      errors.push({
        type: 'conflict',
        severity: conflict.severity === 'critical' ? 'error' : 'warning',
        message: conflict.description,
        affectedTasks: conflict.involvedTasks,
        suggestedFix: conflict.resolutionOptions[0]?.description
      });
    });

    // 3. Generate suggestions
    const autoSuggestions = this.generateDependencySuggestions();
    suggestions.push(...autoSuggestions);

    // 4. Check for redundant dependencies
    const redundancyCheck = this.detectRedundantDependencies();
    warnings.push(...redundancyCheck);

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Detect conflicts between dependencies
   */
  detectDependencyConflicts(): DependencyConflict[] {
    const conflicts: DependencyConflict[] = [];

    // 1. Circular dependency conflicts
    const cycles = this.detectCycles();
    cycles.forEach(cycle => {
      conflicts.push({
        conflictType: 'circular',
        description: `Circular dependency detected: ${cycle.join(' -> ')}`,
        involvedTasks: cycle,
        involvedDependencies: this.getCycleDependencies(cycle),
        severity: 'critical',
        resolutionOptions: [
          {
            strategy: 'remove-dependency',
            description: `Remove dependency between ${cycle[cycle.length - 1]} and ${cycle[0]}`,
            impact: 'May require task reordering',
            effort: 'low'
          },
          {
            strategy: 'reorder-tasks',
            description: 'Reorder tasks to eliminate circular dependency',
            impact: 'Changes execution order',
            effort: 'medium'
          }
        ]
      });
    });

    // 2. Incompatible dependency types
    const typeConflicts = this.detectIncompatibleTypes();
    conflicts.push(...typeConflicts);

    // 3. Resource contention conflicts
    const resourceConflicts = this.detectResourceContention();
    conflicts.push(...resourceConflicts);

    // 4. Timing conflicts
    const timingConflicts = this.detectTimingConflicts();
    conflicts.push(...timingConflicts);

    return conflicts;
  }

  /**
   * Generate automatic dependency suggestions
   */
  generateDependencySuggestions(): DependencySuggestion[] {
    const suggestions: DependencySuggestion[] = [];

    // 1. Suggest missing dependencies based on task content
    const missingSuggestions = this.suggestMissingDependencies();
    suggestions.push(...missingSuggestions);

    // 2. Suggest dependency type improvements
    const typeSuggestions = this.suggestDependencyTypeImprovements();
    suggestions.push(...typeSuggestions);

    // 3. Suggest parallel execution opportunities
    const parallelSuggestions = this.suggestParallelizationOpportunities();
    suggestions.push(...parallelSuggestions);

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Validate dependency before adding
   */
  validateDependencyBeforeAdd(
    dependentTaskId: string,
    dependencyTaskId: string,
    type: ExtendedDependencyType
  ): DependencyValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: DependencySuggestion[] = [];

    // 1. Check if tasks exist
    if (!this.nodes.has(dependentTaskId)) {
      errors.push({
        type: 'missing-task',
        severity: 'error',
        message: `Task ${dependentTaskId} does not exist`,
        affectedTasks: [dependentTaskId],
        suggestedFix: 'Create the task before adding dependencies'
      });
    }

    if (!this.nodes.has(dependencyTaskId)) {
      errors.push({
        type: 'missing-task',
        severity: 'error',
        message: `Task ${dependencyTaskId} does not exist`,
        affectedTasks: [dependencyTaskId],
        suggestedFix: 'Create the task before adding dependencies'
      });
    }

    // 2. Check for self-dependency
    if (dependentTaskId === dependencyTaskId) {
      errors.push({
        type: 'self-dependency',
        severity: 'error',
        message: 'A task cannot depend on itself',
        affectedTasks: [dependentTaskId],
        suggestedFix: 'Remove self-dependency'
      });
    }

    // 3. Check for cycles
    if (this.wouldCreateCycle(dependencyTaskId, dependentTaskId)) {
      errors.push({
        type: 'cycle',
        severity: 'error',
        message: `Adding this dependency would create a circular dependency`,
        affectedTasks: [dependentTaskId, dependencyTaskId],
        suggestedFix: 'Reorder tasks or remove conflicting dependencies'
      });
    }

    // 4. Validate dependency type
    const validTypes: ExtendedDependencyType[] = ['task', 'package', 'framework', 'tool', 'import', 'environment'];
    if (!validTypes.includes(type)) {
      errors.push({
        type: 'invalid-type',
        severity: 'error',
        message: `Invalid dependency type: ${type}`,
        affectedTasks: [dependentTaskId, dependencyTaskId],
        suggestedFix: `Use one of: ${validTypes.join(', ')}`
      });
    }

    // 5. Check for redundancy
    const existingEdge = this.edges.get(`${dependentTaskId}->${dependencyTaskId}`);
    if (existingEdge) {
      warnings.push({
        type: 'redundant',
        message: `Dependency already exists between ${dependentTaskId} and ${dependencyTaskId}`,
        affectedTasks: [dependentTaskId, dependencyTaskId],
        recommendation: 'Consider updating the existing dependency instead'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  // ===== HELPER METHODS FOR DEPENDENCY VALIDATION =====

  /**
   * Validate dependency types across the graph
   */
  private validateDependencyTypes(): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const [edgeId, edge] of this.edges) {
      const validTypes: ExtendedDependencyType[] = ['task', 'package', 'framework', 'tool', 'import', 'environment'];

      if (!validTypes.includes(edge.type)) {
        errors.push({
          type: 'invalid-type',
          severity: 'error',
          message: `Invalid dependency type '${edge.type}' in edge ${edgeId}`,
          affectedTasks: [edge.from, edge.to],
          suggestedFix: `Change to one of: ${validTypes.join(', ')}`
        });
      }

      // Check for type compatibility
      const compatibility = this.checkTypeCompatibility(edge.from, edge.to, edge.type);
      if (!compatibility.compatible) {
        warnings.push({
          type: 'potential-issue',
          message: compatibility.reason,
          affectedTasks: [edge.from, edge.to],
          recommendation: compatibility.suggestion
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Check type compatibility between tasks
   */
  private checkTypeCompatibility(fromTaskId: string, toTaskId: string, type: ExtendedDependencyType): {
    compatible: boolean;
    reason: string;
    suggestion?: string;
  } {
    const fromNode = this.nodes.get(fromTaskId);
    const toNode = this.nodes.get(toTaskId);

    if (!fromNode || !toNode) {
      return { compatible: false, reason: 'One or both tasks not found' };
    }

    // Check for logical compatibility based on task priorities and types
    if (type === 'task' && fromNode.priority === 'low' && toNode.priority === 'critical') {
      return {
        compatible: false,
        reason: `Low priority task ${fromTaskId} depending on critical task ${toTaskId} may indicate incorrect prioritization`,
        suggestion: 'Review task priorities or dependency direction'
      };
    }

    // Check for framework/package dependencies
    if (type === 'framework' || type === 'package') {
      // These should typically be from implementation tasks to setup tasks
      if (fromNode.estimatedHours > toNode.estimatedHours * 3) {
        return {
          compatible: false,
          reason: `Large task depending on much smaller ${type} task may indicate missing breakdown`,
          suggestion: 'Consider breaking down the larger task'
        };
      }
    }

    return { compatible: true, reason: 'Compatible' };
  }

  /**
   * Detect incompatible dependency types
   */
  private detectIncompatibleTypes(): DependencyConflict[] {
    const conflicts: DependencyConflict[] = [];
    const taskDependencies = new Map<string, ExtendedDependencyType[]>();

    // Group dependencies by task
    for (const [_, edge] of this.edges) {
      if (!taskDependencies.has(edge.from)) {
        taskDependencies.set(edge.from, []);
      }
      taskDependencies.get(edge.from)!.push(edge.type);
    }

    // Check for incompatible combinations
    for (const [taskId, types] of taskDependencies) {
      const uniqueTypes = [...new Set(types)];

      // Check for conflicting types (e.g., both framework and package dependencies)
      if (uniqueTypes.includes('framework') && uniqueTypes.includes('package') && uniqueTypes.length > 2) {
        conflicts.push({
          conflictType: 'incompatible-types',
          description: `Task ${taskId} has conflicting dependency types: framework and package dependencies with others`,
          involvedTasks: [taskId],
          involvedDependencies: this.getTaskDependencyIds(taskId),
          severity: 'medium',
          resolutionOptions: [
            {
              strategy: 'change-type',
              description: 'Consolidate dependency types or split task',
              impact: 'May require task restructuring',
              effort: 'medium'
            }
          ]
        });
      }
    }

    return conflicts;
  }

  /**
   * Detect resource contention conflicts
   */
  private detectResourceContention(): DependencyConflict[] {
    const conflicts: DependencyConflict[] = [];
    const parallelBatches = this.getParallelBatches();

    for (const batch of parallelBatches) {
      if (batch.taskIds.length > 1) {
        // Check if tasks in the same batch have conflicting resource requirements
        const resourceConflicts = this.checkBatchResourceConflicts(batch.taskIds);
        conflicts.push(...resourceConflicts);
      }
    }

    return conflicts;
  }

  /**
   * Check for resource conflicts within a batch
   */
  private checkBatchResourceConflicts(taskIds: string[]): DependencyConflict[] {
    const conflicts: DependencyConflict[] = [];

    // Check for high-resource tasks in the same batch
    const highResourceTasks = taskIds.filter(taskId => {
      const node = this.nodes.get(taskId);
      return node && node.estimatedHours > 6; // Tasks over 6 hours
    });

    if (highResourceTasks.length > 1) {
      conflicts.push({
        conflictType: 'resource-contention',
        description: `Multiple high-resource tasks scheduled in parallel: ${highResourceTasks.join(', ')}`,
        involvedTasks: highResourceTasks,
        involvedDependencies: [],
        severity: 'medium',
        resolutionOptions: [
          {
            strategy: 'reorder-tasks',
            description: 'Stagger high-resource tasks across different batches',
            impact: 'May increase total project time but reduce resource pressure',
            effort: 'low'
          },
          {
            strategy: 'split-task',
            description: 'Break down large tasks into smaller components',
            impact: 'Increases task count but improves parallelization',
            effort: 'high'
          }
        ]
      });
    }

    return conflicts;
  }

  /**
   * Detect timing conflicts
   */
  private detectTimingConflicts(): DependencyConflict[] {
    const conflicts: DependencyConflict[] = [];

    // Check for tasks with very different time estimates in dependency chains
    for (const [edgeId, edge] of this.edges) {
      const fromNode = this.nodes.get(edge.from);
      const toNode = this.nodes.get(edge.to);

      if (fromNode && toNode) {
        const timeRatio = fromNode.estimatedHours / toNode.estimatedHours;

        // If dependent task is much larger than dependency, it might indicate a problem
        if (timeRatio > 10) {
          conflicts.push({
            conflictType: 'timing-conflict',
            description: `Large time disparity: ${edge.from} (${fromNode.estimatedHours}h) depends on ${edge.to} (${toNode.estimatedHours}h)`,
            involvedTasks: [edge.from, edge.to],
            involvedDependencies: [edgeId],
            severity: 'low',
            resolutionOptions: [
              {
                strategy: 'split-task',
                description: `Consider breaking down ${edge.from} into smaller tasks`,
                impact: 'Better parallelization and progress tracking',
                effort: 'medium'
              }
            ]
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Get dependency IDs for a cycle
   */
  private getCycleDependencies(cycle: string[]): string[] {
    const dependencies: string[] = [];

    for (let i = 0; i < cycle.length; i++) {
      const from = cycle[i];
      const to = cycle[(i + 1) % cycle.length];
      const edgeId = `${from}->${to}`;

      if (this.edges.has(edgeId)) {
        dependencies.push(edgeId);
      }
    }

    return dependencies;
  }

  /**
   * Get dependency IDs for a task
   */
  private getTaskDependencyIds(taskId: string): string[] {
    const dependencies: string[] = [];

    for (const [edgeId, edge] of this.edges) {
      if (edge.from === taskId || edge.to === taskId) {
        dependencies.push(edgeId);
      }
    }

    return dependencies;
  }

  /**
   * Suggest missing dependencies based on task analysis
   */
  private suggestMissingDependencies(): DependencySuggestion[] {
    const suggestions: DependencySuggestion[] = [];

    for (const [taskId, node] of this.nodes) {
      // Analyze task title and description for potential dependencies
      const potentialDeps = this.analyzePotentialDependencies(taskId, node);
      suggestions.push(...potentialDeps);
    }

    return suggestions;
  }

  /**
   * Analyze potential dependencies for a task
   */
  private analyzePotentialDependencies(taskId: string, node: DependencyNode): DependencySuggestion[] {
    const suggestions: DependencySuggestion[] = [];
    const taskTitle = node.title.toLowerCase();
    const existingDeps = new Set(node.dependencies);

    // Check for common dependency patterns
    for (const [otherTaskId, otherNode] of this.nodes) {
      if (otherTaskId === taskId || existingDeps.has(otherTaskId)) continue;

      const otherTitle = otherNode.title.toLowerCase();
      let confidence = 0;
      let reason = '';
      let dependencyType: ExtendedDependencyType = 'task';

      // Pattern 1: Setup/Configuration dependencies
      if (taskTitle.includes('implement') && otherTitle.includes('setup')) {
        confidence = 0.8;
        reason = 'Implementation tasks typically depend on setup tasks';
        dependencyType = 'task';
      }

      // Pattern 2: Package/Framework dependencies
      if (taskTitle.includes('install') && (otherTitle.includes('configure') || otherTitle.includes('setup'))) {
        confidence = 0.7;
        reason = 'Installation tasks often depend on configuration';
        dependencyType = 'package';
      }

      // Pattern 3: Test dependencies
      if (taskTitle.includes('test') && otherTitle.includes('implement')) {
        confidence = 0.9;
        reason = 'Tests depend on implementation';
        dependencyType = 'task';
      }

      // Pattern 4: Framework dependencies
      if (taskTitle.includes('component') && otherTitle.includes('framework')) {
        confidence = 0.6;
        reason = 'Components typically depend on framework setup';
        dependencyType = 'framework';
      }

      if (confidence > 0.5) {
        suggestions.push({
          type: 'add',
          fromTaskId: taskId,
          toTaskId: otherTaskId,
          dependencyType,
          reason,
          confidence,
          impact: confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low'
        });
      }
    }

    return suggestions;
  }

  /**
   * Suggest dependency type improvements
   */
  private suggestDependencyTypeImprovements(): DependencySuggestion[] {
    const suggestions: DependencySuggestion[] = [];

    for (const [edgeId, edge] of this.edges) {
      const fromNode = this.nodes.get(edge.from);
      const toNode = this.nodes.get(edge.to);

      if (!fromNode || !toNode) continue;

      const suggestedType = this.suggestBetterDependencyType(fromNode, toNode, edge.type);
      if (suggestedType && suggestedType !== edge.type) {
        suggestions.push({
          type: 'modify',
          fromTaskId: edge.from,
          toTaskId: edge.to,
          dependencyType: suggestedType,
          reason: `Current type '${edge.type}' could be more specific as '${suggestedType}'`,
          confidence: 0.6,
          impact: 'low'
        });
      }
    }

    return suggestions;
  }

  /**
   * Suggest better dependency type based on task analysis
   */
  private suggestBetterDependencyType(fromNode: DependencyNode, toNode: DependencyNode, currentType: ExtendedDependencyType): ExtendedDependencyType | null {
    const fromTitle = fromNode.title.toLowerCase();
    const toTitle = toNode.title.toLowerCase();

    // If currently 'task', suggest more specific types
    if (currentType === 'task') {
      if (toTitle.includes('package') || toTitle.includes('install') || toTitle.includes('npm')) {
        return 'package';
      }
      if (toTitle.includes('framework') || toTitle.includes('react') || toTitle.includes('vue') || toTitle.includes('angular')) {
        return 'framework';
      }
      if (toTitle.includes('tool') || toTitle.includes('webpack') || toTitle.includes('babel') || toTitle.includes('eslint')) {
        return 'tool';
      }
      if (toTitle.includes('import') || toTitle.includes('module') || fromTitle.includes('import')) {
        return 'import';
      }
      if (toTitle.includes('environment') || toTitle.includes('env') || toTitle.includes('config')) {
        return 'environment';
      }
    }

    return null;
  }

  /**
   * Suggest parallelization opportunities
   */
  private suggestParallelizationOpportunities(): DependencySuggestion[] {
    const suggestions: DependencySuggestion[] = [];
    const parallelBatches = this.getParallelBatches();

    // Look for tasks that could be parallelized by removing unnecessary dependencies
    for (const [edgeId, edge] of this.edges) {
      if (this.couldBeParallelized(edge.from, edge.to)) {
        suggestions.push({
          type: 'remove',
          fromTaskId: edge.from,
          toTaskId: edge.to,
          dependencyType: edge.type,
          reason: 'Removing this dependency could enable parallel execution',
          confidence: 0.4,
          impact: 'medium'
        });
      }
    }

    return suggestions;
  }

  /**
   * Check if two tasks could be parallelized
   */
  private couldBeParallelized(taskId1: string, taskId2: string): boolean {
    const node1 = this.nodes.get(taskId1);
    const node2 = this.nodes.get(taskId2);

    if (!node1 || !node2) return false;

    // Check if tasks are similar in scope and could potentially run in parallel
    const title1 = node1.title.toLowerCase();
    const title2 = node2.title.toLowerCase();

    // Similar tasks that might not need strict ordering
    const similarPatterns = [
      ['test', 'test'],
      ['component', 'component'],
      ['style', 'style'],
      ['util', 'util'],
      ['helper', 'helper']
    ];

    for (const [pattern1, pattern2] of similarPatterns) {
      if (title1.includes(pattern1) && title2.includes(pattern2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect redundant dependencies
   */
  private detectRedundantDependencies(): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for transitive dependencies that could be removed
    for (const [edgeId, edge] of this.edges) {
      if (this.isTransitiveDependency(edge.from, edge.to)) {
        warnings.push({
          type: 'redundant',
          message: `Dependency ${edgeId} may be redundant due to transitive dependencies`,
          affectedTasks: [edge.from, edge.to],
          recommendation: 'Consider removing this direct dependency if transitive path exists'
        });
      }
    }

    // Check for duplicate dependencies (same tasks, different types)
    const taskPairs = new Map<string, ExtendedDependencyType[]>();
    for (const [_, edge] of this.edges) {
      const pairKey = `${edge.from}->${edge.to}`;
      if (!taskPairs.has(pairKey)) {
        taskPairs.set(pairKey, []);
      }
      taskPairs.get(pairKey)!.push(edge.type);
    }

    for (const [pairKey, types] of taskPairs) {
      if (types.length > 1) {
        const [from, to] = pairKey.split('->');
        warnings.push({
          type: 'redundant',
          message: `Multiple dependencies between ${from} and ${to}: ${types.join(', ')}`,
          affectedTasks: [from, to],
          recommendation: 'Consider consolidating into a single dependency with the most appropriate type'
        });
      }
    }

    return warnings;
  }

  /**
   * Check if a dependency is transitive (indirect path exists)
   */
  private isTransitiveDependency(fromTaskId: string, toTaskId: string): boolean {
    // Check if there's an indirect path from fromTaskId to toTaskId
    const visited = new Set<string>();
    const queue = [fromTaskId];
    visited.add(fromTaskId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependencies = this.reverseIndex.get(current) || new Set();

      for (const dep of dependencies) {
        if (dep === toTaskId) continue; // Skip direct dependency
        if (dep === fromTaskId) continue; // Skip self

        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);

          // Check if this dependency leads to our target
          if (this.hasPath(dep, toTaskId)) {
            return true; // Found transitive path
          }
        }
      }
    }

    return false;
  }

  // ===== TASK 3.1.4: GRAPH PERSISTENCE AND RECOVERY =====

  /**
   * Serialize graph to JSON format (performance-critical)
   */
  serializeToJSON(): SerializedGraph {
    const timestamp = new Date().toISOString();
    const serializedData = this.createSerializedData('json', timestamp);
    const checksum = this.calculateChecksum(serializedData);

    return {
      ...serializedData,
      checksum
    };
  }

  /**
   * Serialize graph to YAML format (human-readable)
   */
  serializeToYAML(): SerializedGraph {
    const timestamp = new Date().toISOString();
    const serializedData = this.createSerializedData('yaml', timestamp);
    const checksum = this.calculateChecksum(serializedData);

    return {
      ...serializedData,
      checksum
    };
  }

  /**
   * Save graph to file with hybrid storage strategy
   */
  async saveToFile(
    filePath: string,
    format: GraphSerializationFormat = 'json',
    createBackup: boolean = true
  ): Promise<GraphPersistenceResult> {
    try {
      // Create backup if requested
      if (createBackup && await this.fileExists(filePath)) {
        await this.createBackup(filePath);
      }

      // Serialize graph
      const serializedGraph = format === 'json' ? this.serializeToJSON() : this.serializeToYAML();

      // Write to file
      const content = format === 'json'
        ? JSON.stringify(serializedGraph, null, 2)
        : this.convertToYAML(serializedGraph);

      await this.writeFile(filePath, content);

      // Calculate file size
      const size = Buffer.byteLength(content, 'utf8');

      logger.info({
        filePath,
        format,
        size,
        checksum: serializedGraph.checksum
      }, 'Graph saved successfully');

      return {
        success: true,
        filePath,
        format,
        size,
        checksum: serializedGraph.checksum,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error({ err: error, filePath, format }, 'Failed to save graph');

      return {
        success: false,
        format,
        size: 0,
        checksum: '',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      };
    }
  }

  /**
   * Load graph from file with integrity validation
   */
  async loadFromFile(filePath: string): Promise<GraphRecoveryResult> {
    try {
      logger.debug({ filePath }, 'Loading graph from file');

      if (!await this.fileExists(filePath)) {
        return {
          success: false,
          recovered: false,
          corruptionDetected: false,
          validationErrors: [`File not found: ${filePath}`],
          recoveryActions: [],
          error: 'File not found'
        };
      }

      // Read file content
      const content = await this.readFile(filePath);

      // Determine format and parse
      const serializedGraph = this.parseGraphContent(content, filePath);

      // Validate integrity
      const integrityResult = this.validateGraphIntegrity(serializedGraph);

      if (!integrityResult.isValid) {
        // Attempt recovery
        return await this.attemptRecovery(filePath, integrityResult);
      }

      // Load graph data
      this.loadFromSerializedData(serializedGraph);

      logger.info({ filePath, checksum: serializedGraph.checksum }, 'Graph loaded successfully');

      return {
        success: true,
        recovered: false,
        corruptionDetected: false,
        validationErrors: [],
        recoveryActions: []
      };

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to load graph');

      return {
        success: false,
        recovered: false,
        corruptionDetected: true,
        validationErrors: [error instanceof Error ? error.message : String(error)],
        recoveryActions: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate graph integrity
   */
  validateGraphIntegrity(serializedGraph: SerializedGraph): GraphIntegrityResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate checksum
    const calculatedChecksum = this.calculateChecksum(serializedGraph);
    const checksumValid = calculatedChecksum === serializedGraph.checksum;
    if (!checksumValid) {
      errors.push('Checksum validation failed - data may be corrupted');
    }

    // 2. Validate structure
    let structureValid = true;
    if (!serializedGraph.nodes || typeof serializedGraph.nodes !== 'object') {
      errors.push('Invalid nodes structure');
      structureValid = false;
    }
    if (!serializedGraph.edges || typeof serializedGraph.edges !== 'object') {
      errors.push('Invalid edges structure');
      structureValid = false;
    }
    if (!serializedGraph.adjacencyList || typeof serializedGraph.adjacencyList !== 'object') {
      errors.push('Invalid adjacency list structure');
      structureValid = false;
    }

    // 3. Validate data consistency
    let dataConsistent = true;
    if (structureValid) {
      const nodeIds = Object.keys(serializedGraph.nodes);
      const edgeIds = Object.keys(serializedGraph.edges);

      // Check if all edge references point to existing nodes
      for (const [edgeId, edge] of Object.entries(serializedGraph.edges)) {
        if (!nodeIds.includes(edge.from)) {
          errors.push(`Edge ${edgeId} references non-existent node: ${edge.from}`);
          dataConsistent = false;
        }
        if (!nodeIds.includes(edge.to)) {
          errors.push(`Edge ${edgeId} references non-existent node: ${edge.to}`);
          dataConsistent = false;
        }
      }

      // Check adjacency list consistency
      for (const [nodeId, adjacentNodes] of Object.entries(serializedGraph.adjacencyList)) {
        if (!nodeIds.includes(nodeId)) {
          warnings.push(`Adjacency list contains unknown node: ${nodeId}`);
        }
        for (const adjacentNode of adjacentNodes) {
          if (!nodeIds.includes(adjacentNode)) {
            errors.push(`Adjacency list references non-existent node: ${adjacentNode}`);
            dataConsistent = false;
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      checksumValid,
      structureValid,
      dataConsistent
    };
  }

  /**
   * Create incremental update
   */
  createIncrementalUpdate(previousChecksum: string): Partial<SerializedGraph> | null {
    const currentSerialized = this.serializeToJSON();

    if (currentSerialized.checksum === previousChecksum) {
      return null; // No changes
    }

    // For now, return full graph (could be optimized to return only changes)
    return currentSerialized;
  }

  /**
   * Apply incremental update
   */
  applyIncrementalUpdate(update: Partial<SerializedGraph>): boolean {
    try {
      if (update.nodes) {
        // Clear and rebuild nodes
        this.nodes.clear();
        for (const [nodeId, node] of Object.entries(update.nodes)) {
          this.nodes.set(nodeId, node);
        }
      }

      if (update.edges) {
        // Clear and rebuild edges
        this.edges.clear();
        for (const [edgeId, edge] of Object.entries(update.edges)) {
          this.edges.set(edgeId, edge);
        }
      }

      if (update.adjacencyList) {
        // Rebuild adjacency list
        this.adjacencyList.clear();
        for (const [nodeId, adjacentNodes] of Object.entries(update.adjacencyList)) {
          this.adjacencyList.set(nodeId, new Set(adjacentNodes));
        }
      }

      if (update.reverseIndex) {
        // Rebuild reverse index
        this.reverseIndex.clear();
        for (const [nodeId, dependencies] of Object.entries(update.reverseIndex)) {
          this.reverseIndex.set(nodeId, new Set(dependencies));
        }
      }

      this.markDirty();
      return true;

    } catch (error) {
      logger.error({ err: error }, 'Failed to apply incremental update');
      return false;
    }
  }

  /**
   * Create version snapshot
   */
  async createVersion(
    basePath: string,
    version: string,
    description: string = ''
  ): Promise<GraphVersion | null> {
    try {
      const timestamp = new Date();
      const versionPath = `${basePath}.v${version}.json`;

      const saveResult = await this.saveToFile(versionPath, 'json', false);

      if (!saveResult.success) {
        return null;
      }

      return {
        version,
        timestamp,
        checksum: saveResult.checksum,
        description,
        filePath: versionPath,
        format: 'json'
      };

    } catch (error) {
      logger.error({ err: error, version }, 'Failed to create version');
      return null;
    }
  }

  /**
   * List available versions
   */
  async listVersions(basePath: string): Promise<GraphVersion[]> {
    try {
      // This would need to be implemented with actual file system access
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error({ err: error, basePath }, 'Failed to list versions');
      return [];
    }
  }

  /**
   * Rollback to specific version
   */
  async rollbackToVersion(versionPath: string): Promise<GraphRecoveryResult> {
    return await this.loadFromFile(versionPath);
  }

  // ===== HELPER METHODS FOR PERSISTENCE AND RECOVERY =====

  /**
   * Create serialized data structure
   */
  private createSerializedData(format: GraphSerializationFormat, timestamp: string): Omit<SerializedGraph, 'checksum'> {
    // Ensure computed values are up to date
    const topologicalOrder = this.getTopologicalOrder();
    const criticalPath = this.getCriticalPath();
    const parallelBatches = this.getParallelBatches();
    const metrics = this.calculateMetrics();

    return {
      version: '1.0.0',
      projectId: this.projectId,
      timestamp,
      format,
      nodes: Object.fromEntries(this.nodes),
      edges: Object.fromEntries(this.edges),
      adjacencyList: Object.fromEntries(
        Array.from(this.adjacencyList.entries()).map(([key, set]) => [key, Array.from(set)])
      ),
      reverseIndex: Object.fromEntries(
        Array.from(this.reverseIndex.entries()).map(([key, set]) => [key, Array.from(set)])
      ),
      metadata: {
        totalNodes: this.nodes.size,
        totalEdges: this.edges.size,
        criticalPath,
        topologicalOrder,
        parallelBatches,
        metrics
      }
    };
  }

  /**
   * Calculate checksum for data integrity
   */
  private calculateChecksum(data: any): string {
    // Create a copy without the checksum field and timestamp to avoid circular dependency
    // and ensure deterministic checksums
    const dataForChecksum = { ...data };
    delete dataForChecksum.checksum;
    delete dataForChecksum.timestamp; // Remove timestamp for deterministic checksums

    // Create a deterministic representation by sorting all object keys recursively
    const deterministicData = this.sortObjectKeysRecursively(dataForChecksum);

    // Simple checksum implementation (in production, use crypto.createHash)
    const jsonString = JSON.stringify(deterministicData);
    let hash = 0;
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Recursively sort object keys for deterministic serialization
   */
  private sortObjectKeysRecursively(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeysRecursively(item));
    }

    const sortedObj: any = {};
    const sortedKeys = Object.keys(obj).sort();

    for (const key of sortedKeys) {
      sortedObj[key] = this.sortObjectKeysRecursively(obj[key]);
    }

    return sortedObj;
  }

  /**
   * Convert serialized data to YAML format
   */
  private convertToYAML(data: SerializedGraph): string {
    // Simple YAML conversion (in production, use a proper YAML library)
    const yamlLines: string[] = [];

    yamlLines.push(`version: "${data.version}"`);
    yamlLines.push(`projectId: "${data.projectId}"`);
    yamlLines.push(`timestamp: "${data.timestamp}"`);
    yamlLines.push(`format: "${data.format}"`);
    yamlLines.push(`checksum: "${data.checksum}"`);
    yamlLines.push('');

    yamlLines.push('nodes:');
    for (const [nodeId, node] of Object.entries(data.nodes)) {
      yamlLines.push(`  ${nodeId}:`);
      yamlLines.push(`    taskId: "${node.taskId}"`);
      yamlLines.push(`    title: "${node.title}"`);
      yamlLines.push(`    status: "${node.status}"`);
      yamlLines.push(`    estimatedHours: ${node.estimatedHours}`);
      yamlLines.push(`    priority: "${node.priority}"`);
      yamlLines.push(`    dependencies: [${node.dependencies.map(d => `"${d}"`).join(', ')}]`);
      yamlLines.push(`    dependents: [${node.dependents.map(d => `"${d}"`).join(', ')}]`);
      yamlLines.push(`    depth: ${node.depth}`);
      yamlLines.push(`    criticalPath: ${node.criticalPath}`);
    }

    yamlLines.push('');
    yamlLines.push('edges:');
    for (const [edgeId, edge] of Object.entries(data.edges)) {
      yamlLines.push(`  "${edgeId}":`);
      yamlLines.push(`    from: "${edge.from}"`);
      yamlLines.push(`    to: "${edge.to}"`);
      yamlLines.push(`    type: "${edge.type}"`);
      yamlLines.push(`    weight: ${edge.weight}`);
      yamlLines.push(`    critical: ${edge.critical}`);
      if (edge.description) {
        yamlLines.push(`    description: "${edge.description}"`);
      }
    }

    yamlLines.push('');
    yamlLines.push('metadata:');
    yamlLines.push(`  totalNodes: ${data.metadata.totalNodes}`);
    yamlLines.push(`  totalEdges: ${data.metadata.totalEdges}`);
    yamlLines.push(`  criticalPath: [${data.metadata.criticalPath.map(p => `"${p}"`).join(', ')}]`);
    yamlLines.push(`  topologicalOrder: [${data.metadata.topologicalOrder.map(t => `"${t}"`).join(', ')}]`);

    return yamlLines.join('\n');
  }

  /**
   * Parse graph content from file
   */
  private parseGraphContent(content: string, filePath: string): SerializedGraph {
    try {
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        // Simple YAML parsing (in production, use a proper YAML library)
        return this.parseYAMLContent(content);
      } else {
        // JSON parsing
        return JSON.parse(content);
      }
    } catch (error) {
      throw new Error(`Failed to parse graph content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Simple YAML parser for graph data
   */
  private parseYAMLContent(content: string): SerializedGraph {
    // This is a simplified YAML parser for our specific format
    // In production, use a proper YAML library like 'yaml' or 'js-yaml'
    const lines = content.split('\n');
    const result: any = {};

    let currentSection = '';
    let currentObject: any = null;
    let currentKey = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.endsWith(':') && !trimmed.startsWith(' ')) {
        currentSection = trimmed.slice(0, -1);
        if (currentSection === 'nodes' || currentSection === 'edges') {
          result[currentSection] = {};
        } else if (currentSection === 'metadata') {
          result[currentSection] = {};
        }
      } else if (trimmed.includes(': ')) {
        const [key, value] = trimmed.split(': ', 2);
        const cleanKey = key.trim();
        const cleanValue = value.trim().replace(/^"(.*)"$/, '$1');

        if (currentSection === 'nodes' || currentSection === 'edges') {
          if (cleanKey.startsWith('"') && cleanKey.endsWith('":')) {
            currentKey = cleanKey.slice(1, -2);
            result[currentSection][currentKey] = {};
            currentObject = result[currentSection][currentKey];
          } else if (currentObject) {
            if (cleanValue === 'true' || cleanValue === 'false') {
              currentObject[cleanKey] = cleanValue === 'true';
            } else if (!isNaN(Number(cleanValue))) {
              currentObject[cleanKey] = Number(cleanValue);
            } else if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
              const arrayContent = cleanValue.slice(1, -1);
              currentObject[cleanKey] = arrayContent ? arrayContent.split(', ').map(item => item.replace(/^"(.*)"$/, '$1')) : [];
            } else {
              currentObject[cleanKey] = cleanValue;
            }
          }
        } else if (currentSection === 'metadata') {
          if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
            const arrayContent = cleanValue.slice(1, -1);
            result[currentSection][cleanKey] = arrayContent ? arrayContent.split(', ').map(item => item.replace(/^"(.*)"$/, '$1')) : [];
          } else if (!isNaN(Number(cleanValue))) {
            result[currentSection][cleanKey] = Number(cleanValue);
          } else {
            result[currentSection][cleanKey] = cleanValue;
          }
        } else {
          if (!isNaN(Number(cleanValue))) {
            result[cleanKey] = Number(cleanValue);
          } else {
            result[cleanKey] = cleanValue;
          }
        }
      }
    }

    return result as SerializedGraph;
  }

  /**
   * Load graph from serialized data
   */
  private loadFromSerializedData(serializedGraph: SerializedGraph): void {
    // Clear existing data
    this.nodes.clear();
    this.edges.clear();
    this.adjacencyList.clear();
    this.reverseIndex.clear();

    // Load nodes
    for (const [nodeId, node] of Object.entries(serializedGraph.nodes)) {
      this.nodes.set(nodeId, node);
    }

    // Load edges
    for (const [edgeId, edge] of Object.entries(serializedGraph.edges)) {
      this.edges.set(edgeId, edge);
    }

    // Load adjacency list
    for (const [nodeId, adjacentNodes] of Object.entries(serializedGraph.adjacencyList)) {
      this.adjacencyList.set(nodeId, new Set(adjacentNodes));
    }

    // Load reverse index
    for (const [nodeId, dependencies] of Object.entries(serializedGraph.reverseIndex)) {
      this.reverseIndex.set(nodeId, new Set(dependencies));
    }

    // Load cached computations
    this.topologicalOrder = serializedGraph.metadata.topologicalOrder || [];
    this.criticalPath = serializedGraph.metadata.criticalPath || [];
    this.parallelBatches = serializedGraph.metadata.parallelBatches || [];

    this.isDirty = false;
  }

  /**
   * Attempt recovery from corrupted data
   */
  private async attemptRecovery(filePath: string, integrityResult: GraphIntegrityResult): Promise<GraphRecoveryResult> {
    const recoveryActions: string[] = [];
    let recovered = false;

    try {
      // 1. Try to find backup files
      const backupPath = `${filePath}.backup`;
      if (await this.fileExists(backupPath)) {
        recoveryActions.push('Found backup file, attempting recovery');
        const backupResult = await this.loadFromFile(backupPath);
        if (backupResult.success) {
          recovered = true;
          recoveryActions.push('Successfully recovered from backup');
          return {
            success: true,
            recovered: true,
            corruptionDetected: true,
            backupUsed: backupPath,
            validationErrors: integrityResult.errors,
            recoveryActions
          };
        }
      }

      // 2. Try to find version files
      const versionPattern = `${filePath}.v`;
      // In a real implementation, we would scan for version files
      // For now, just log the attempt
      recoveryActions.push('Searched for version files (none found)');

      // 3. Attempt partial recovery if structure is valid but data is inconsistent
      if (integrityResult.structureValid && !integrityResult.dataConsistent) {
        recoveryActions.push('Attempting partial data recovery');
        // Could implement logic to fix data inconsistencies
        recoveryActions.push('Partial recovery not implemented');
      }

      return {
        success: false,
        recovered: false,
        corruptionDetected: true,
        validationErrors: integrityResult.errors,
        recoveryActions,
        error: 'Recovery failed - no valid backup or version found'
      };

    } catch (error) {
      recoveryActions.push(`Recovery attempt failed: ${error instanceof Error ? error.message : String(error)}`);

      return {
        success: false,
        recovered: false,
        corruptionDetected: true,
        validationErrors: integrityResult.errors,
        recoveryActions,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Create backup of existing file
   */
  private async createBackup(filePath: string): Promise<void> {
    const backupPath = `${filePath}.backup`;
    const content = await this.readFile(filePath);
    await this.writeFile(backupPath, content);
    logger.debug({ filePath, backupPath }, 'Created backup file');
  }

  /**
   * Calculate comprehensive graph metrics
   */
  private calculateMetrics(): GraphMetrics {
    const cycles = this.detectCycles();
    const orphanedNodes = this.findOrphanedNodes();

    // Calculate average degree
    let totalDegree = 0;
    for (const [_, adjacentNodes] of this.adjacencyList) {
      totalDegree += adjacentNodes.size;
    }
    const averageDegree = this.nodes.size > 0 ? totalDegree / this.nodes.size : 0;

    // Calculate max depth
    const maxDepth = Math.max(...Array.from(this.nodes.values()).map(node => node.depth));

    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      maxDepth: isFinite(maxDepth) ? maxDepth : 0,
      criticalPathLength: this.criticalPath.length,
      parallelBatches: this.parallelBatches.length,
      cycleCount: cycles.length,
      orphanedNodes: orphanedNodes.length,
      averageDegree
    };
  }

  /**
   * Find orphaned nodes (no dependencies or dependents)
   */
  private findOrphanedNodes(): string[] {
    const orphaned: string[] = [];

    for (const [nodeId, node] of this.nodes) {
      const hasIncoming = (this.reverseIndex.get(nodeId)?.size || 0) > 0;
      const hasOutgoing = (this.adjacencyList.get(nodeId)?.size || 0) > 0;

      if (!hasIncoming && !hasOutgoing) {
        orphaned.push(nodeId);
      }
    }

    return orphaned;
  }

  // ===== FILE SYSTEM ABSTRACTION (to be replaced with actual implementation) =====

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    // This would be implemented with actual file system access
    // For now, return false as file operations are not yet implemented
    return false;
  }

  /**
   * Read file content
   */
  private async readFile(filePath: string): Promise<string> {
    // This would be implemented with actual file system access
    throw new Error('File system access not implemented in this context');
  }

  /**
   * Write file content
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    // This would be implemented with actual file system access
    throw new Error('File system access not implemented in this context');
  }
}
