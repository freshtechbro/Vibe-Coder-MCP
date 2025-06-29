/**
 * Intelligent Agent Assignment Service
 *
 * Provides intelligent workload distribution with capability-based matching,
 * performance-aware assignment, and predictive workload management.
 */

import { EventEmitter } from 'events';
import { Agent, AgentCapability, TaskAssignment, AgentStatus } from '../types/agent.js';
import { AtomicTask } from '../types/task.js';
import logger from '../../../logger.js';

/**
 * Workload distribution strategies
 */
export type WorkloadDistributionStrategy = 
  | 'round_robin'
  | 'least_loaded'
  | 'capability_first'
  | 'performance_based'
  | 'intelligent_hybrid';

/**
 * Agent assignment configuration
 */
export interface AgentAssignmentConfig {
  strategy: WorkloadDistributionStrategy;
  maxTasksPerAgent: number;
  workloadBalanceThreshold: number; // 0-1, threshold for imbalance detection
  capabilityMatchWeight: number; // 0-1, weight for capability matching
  performanceWeight: number; // 0-1, weight for performance metrics
  availabilityWeight: number; // 0-1, weight for availability
  predictiveLoadingEnabled: boolean;
  autoRebalanceEnabled: boolean;
  rebalanceInterval?: number;
}

/**
 * Agent assignment result
 */
export interface AgentAssignmentResult {
  success: boolean;
  assignment?: TaskAssignment;
  error?: string;
  score?: number;
  alternatives?: { agentId: string; score: number }[];
}

/**
 * Agent registration result
 */
export interface AgentRegistrationResult {
  success: boolean;
  error?: string;
}

/**
 * Workload imbalance detection result
 */
export interface WorkloadImbalanceResult {
  isImbalanced: boolean;
  imbalanceRatio: number;
  overloadedAgents: string[];
  underloadedAgents: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Task redistribution suggestion
 */
export interface TaskRedistributionSuggestion {
  fromAgent: string;
  toAgent: string;
  tasksToMove: string[];
  expectedImprovement: number;
  reasoning: string;
}

/**
 * Performance statistics
 */
export interface PerformanceStats {
  totalAgents: number;
  activeAgents: number;
  averageSuccessRate: number;
  averageCompletionTime: number;
  totalTasksCompleted: number;
  taskThroughput: number; // tasks per hour
}

/**
 * Task completion prediction
 */
export interface TaskCompletionPrediction {
  estimatedCompletionTime: number;
  confidence: number;
  factors: {
    agentPerformance: number;
    taskComplexity: number;
    currentLoad: number;
    historicalData: number;
  };
}

/**
 * Best agent selection result
 */
export interface BestAgentResult {
  agentId: string;
  score: number;
  reasoning: string;
  confidence: number;
}

/**
 * Workload trend prediction
 */
export interface WorkloadTrendPrediction {
  timeHorizon: number;
  agentUtilization: Record<string, number>;
  expectedBottlenecks: string[];
  recommendations: string[];
}

/**
 * Real-time metrics
 */
export interface RealTimeMetrics {
  totalAgents: number;
  activeAgents: number;
  averageLoad: number;
  taskThroughput: number;
  currentStrategy: WorkloadDistributionStrategy;
  lastUpdateTime: Date;
}

/**
 * Assignment efficiency metrics
 */
export interface AssignmentEfficiency {
  successfulAssignments: number;
  failedAssignments: number;
  averageAssignmentTime: number;
  capabilityMatchRate: number;
  performanceUtilization: number;
}

/**
 * Workload rebalancing result
 */
export interface WorkloadRebalanceResult {
  success: boolean;
  redistributions: number;
  affectedAgents: string[];
  improvementScore: number;
  error?: string;
}

/**
 * Scaling recommendations
 */
export interface ScalingRecommendations {
  currentCapacity: number;
  recommendedCapacity: number;
  reasoning: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  timeframe: string;
}

/**
 * Task optimization result
 */
export interface TaskOptimizationResult {
  success: boolean;
  assignments: { taskId: string; agentId: string; score: number }[];
  totalScore: number;
  error?: string;
}

/**
 * Configuration recommendations
 */
export interface ConfigurationRecommendations {
  currentPerformance: number;
  suggestedChanges: {
    parameter: string;
    currentValue: any;
    suggestedValue: any;
    reasoning: string;
    expectedImprovement: number;
  }[];
  expectedImprovement: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AgentAssignmentConfig = {
  strategy: 'intelligent_hybrid',
  maxTasksPerAgent: 5,
  workloadBalanceThreshold: 0.8,
  capabilityMatchWeight: 0.4,
  performanceWeight: 0.3,
  availabilityWeight: 0.3,
  predictiveLoadingEnabled: true,
  autoRebalanceEnabled: true,
  rebalanceInterval: 60000 // 1 minute
};

/**
 * Intelligent Agent Assignment Service
 */
export class IntelligentAgentAssignmentService extends EventEmitter {
  private config: AgentAssignmentConfig;
  private agents: Map<string, Agent> = new Map();
  private assignments: Map<string, TaskAssignment> = new Map();
  private performanceHistory: Map<string, any[]> = new Map();
  private roundRobinIndex = 0;
  private statistics = {
    totalAssignments: 0,
    successfulAssignments: 0,
    failedAssignments: 0,
    totalAssignmentTime: 0
  };
  private rebalanceTimer?: NodeJS.Timeout;
  private disposed = false;

  constructor(config: Partial<AgentAssignmentConfig> = {}) {
    super();

    // Validate configuration
    this.validateConfig(config);

    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Start auto-rebalancing if enabled
    if (this.config.autoRebalanceEnabled && this.config.rebalanceInterval) {
      this.startAutoRebalancing();
    }

    logger.info({
      strategy: this.config.strategy,
      maxTasksPerAgent: this.config.maxTasksPerAgent,
      autoRebalanceEnabled: this.config.autoRebalanceEnabled
    }, 'IntelligentAgentAssignmentService initialized');
  }

  /**
   * Register an agent
   */
  registerAgent(agent: Agent): AgentRegistrationResult {
    try {
      if (this.agents.has(agent.id)) {
        return {
          success: false,
          error: `Agent ${agent.id} is already registered`
        };
      }

      this.agents.set(agent.id, { ...agent });
      this.performanceHistory.set(agent.id, []);

      logger.info({
        agentId: agent.id,
        capabilities: agent.capabilities,
        maxTasks: agent.config.maxConcurrentTasks
      }, 'Agent registered');

      this.emit('agent:registered', { agentId: agent.id, agent });

      return { success: true };

    } catch (error) {
      logger.error({ err: error, agentId: agent.id }, 'Failed to register agent');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): AgentRegistrationResult {
    try {
      if (!this.agents.has(agentId)) {
        return {
          success: false,
          error: `Agent ${agentId} is not registered`
        };
      }

      // Remove agent and cleanup
      this.agents.delete(agentId);
      this.performanceHistory.delete(agentId);

      // Remove any assignments
      for (const [taskId, assignment] of this.assignments) {
        if (assignment.agentId === agentId) {
          this.assignments.delete(taskId);
        }
      }

      logger.info({ agentId }, 'Agent unregistered');
      this.emit('agent:unregistered', { agentId });

      return { success: true };

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to unregister agent');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    const oldStatus = agent.status;
    agent.status = status;
    agent.performance.lastActiveAt = new Date();

    logger.debug({
      agentId,
      oldStatus,
      newStatus: status
    }, 'Agent status updated');

    this.emit('agent:status_changed', { agentId, oldStatus, newStatus: status });
    return true;
  }

  /**
   * Assign a task to the best available agent
   */
  async assignTask(task: AtomicTask): Promise<AgentAssignmentResult> {
    const startTime = Date.now();

    try {
      // Validate task
      if (!this.validateTask(task)) {
        return {
          success: false,
          error: 'Invalid task: missing required fields or invalid values'
        };
      }

      // Check if task is already assigned
      if (this.assignments.has(task.id)) {
        return {
          success: false,
          error: `Task ${task.id} is already assigned`
        };
      }

      // Find best agent using configured strategy
      const bestAgent = await this.findBestAgent(task);
      
      if (!bestAgent) {
        return {
          success: false,
          error: 'No suitable agents available for this task'
        };
      }

      // Create assignment
      const assignment: TaskAssignment = {
        id: `assignment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        taskId: task.id,
        agentId: bestAgent.agentId,
        assignedAt: new Date(),
        expectedCompletionAt: new Date(Date.now() + task.estimatedHours * 60 * 60 * 1000),
        priority: this.mapTaskPriorityToAssignmentPriority(task.priority),
        context: {
          projectId: task.projectId,
          epicId: task.epicId,
          dependencies: task.dependencies,
          resources: task.filePaths,
          constraints: task.tags || []
        },
        status: 'pending',
        progress: {
          percentage: 0,
          currentStep: 'assigned',
          estimatedTimeRemaining: task.estimatedHours * 60 * 60 * 1000,
          lastUpdateAt: new Date()
        }
      };

      // Update agent state
      const agent = this.agents.get(bestAgent.agentId)!;
      agent.taskQueue.push(task.id);
      if (agent.status === 'idle') {
        agent.status = 'busy';
        agent.currentTask = task.id;
      }

      // Store assignment
      this.assignments.set(task.id, assignment);

      // Update statistics
      this.statistics.totalAssignments++;
      this.statistics.successfulAssignments++;
      this.statistics.totalAssignmentTime += Date.now() - startTime;

      logger.info({
        taskId: task.id,
        agentId: bestAgent.agentId,
        score: bestAgent.score,
        assignmentTime: Date.now() - startTime
      }, 'Task assigned successfully');

      this.emit('task:assigned', { assignment, score: bestAgent.score });

      return {
        success: true,
        assignment,
        score: bestAgent.score
      };

    } catch (error) {
      this.statistics.failedAssignments++;
      logger.error({ err: error, taskId: task.id }, 'Failed to assign task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Find the best agent for a task using configured strategy
   */
  async findBestAgent(task: AtomicTask): Promise<BestAgentResult | null> {
    const candidates = Array.from(this.agents.values()).filter(agent => 
      this.isAgentEligible(agent, task)
    );

    if (candidates.length === 0) {
      return null;
    }

    let bestAgent: Agent | null = null;
    let bestScore = -1;

    switch (this.config.strategy) {
      case 'round_robin':
        bestAgent = this.selectRoundRobinAgent(candidates);
        bestScore = 0.5; // Default score for round robin
        break;

      case 'least_loaded':
        bestAgent = this.selectLeastLoadedAgent(candidates);
        bestScore = 0.7; // Higher score for least loaded
        break;

      case 'capability_first':
        const capResult = this.selectCapabilityFirstAgent(candidates, task);
        bestAgent = capResult.agent;
        bestScore = capResult.score;
        break;

      case 'performance_based':
        const perfResult = this.selectPerformanceBasedAgent(candidates);
        bestAgent = perfResult.agent;
        bestScore = perfResult.score;
        break;

      case 'intelligent_hybrid':
      default:
        for (const agent of candidates) {
          const score = await this.calculateAgentScore(agent, task);
          if (score > bestScore) {
            bestScore = score;
            bestAgent = agent;
          }
        }
        break;
    }

    if (!bestAgent) {
      return null;
    }

    return {
      agentId: bestAgent.id,
      score: bestScore,
      reasoning: this.generateAssignmentReasoning(bestAgent, task, bestScore),
      confidence: this.calculateConfidence(bestAgent, task, bestScore)
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): PerformanceStats {
    const agents = Array.from(this.agents.values());
    const totalTasks = agents.reduce((sum, agent) => sum + agent.performance.tasksCompleted, 0);
    const totalTime = agents.reduce((sum, agent) => sum + agent.performance.averageCompletionTime, 0);
    const totalSuccessRate = agents.reduce((sum, agent) => sum + agent.performance.successRate, 0);

    // Calculate throughput (tasks per hour)
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentTasks = agents.reduce((sum, agent) => {
      const recentActivity = agent.performance.lastActiveAt.getTime() > oneHourAgo ? 1 : 0;
      return sum + recentActivity;
    }, 0);

    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status !== 'offline').length,
      averageSuccessRate: agents.length > 0 ? totalSuccessRate / agents.length : 0,
      averageCompletionTime: agents.length > 0 ? totalTime / agents.length : 0,
      totalTasksCompleted: totalTasks,
      taskThroughput: recentTasks
    };
  }

  /**
   * Predict task completion time for an agent
   */
  predictTaskCompletion(agentId: string, task: AtomicTask): TaskCompletionPrediction {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const baseTime = agent.performance.averageCompletionTime;
    const taskComplexity = this.calculateTaskComplexity(task);
    const currentLoad = this.calculateAgentLoad(agent);
    
    // Adjust based on various factors
    let estimatedTime = baseTime * taskComplexity;
    estimatedTime *= (1 + currentLoad * 0.5); // Increase time based on current load
    estimatedTime *= task.estimatedHours; // Scale by estimated hours

    // Calculate confidence based on historical data
    const confidence = Math.min(
      agent.performance.tasksCompleted / 10, // More tasks = higher confidence
      agent.performance.successRate, // Higher success rate = higher confidence
      1.0
    );

    return {
      estimatedCompletionTime: estimatedTime,
      confidence,
      factors: {
        agentPerformance: agent.performance.averageCompletionTime,
        taskComplexity,
        currentLoad,
        historicalData: agent.performance.tasksCompleted
      }
    };
  }

  /**
   * Detect workload imbalances
   */
  detectWorkloadImbalance(): WorkloadImbalanceResult {
    const agents = Array.from(this.agents.values());
    const loads = agents.map(agent => this.calculateAgentLoad(agent));
    
    if (loads.length === 0) {
      return {
        isImbalanced: false,
        imbalanceRatio: 0,
        overloadedAgents: [],
        underloadedAgents: [],
        severity: 'low'
      };
    }

    const avgLoad = loads.reduce((sum, load) => sum + load, 0) / loads.length;
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);
    
    const imbalanceRatio = maxLoad - minLoad;
    const isImbalanced = imbalanceRatio > (this.config.workloadBalanceThreshold / 2); // More sensitive detection

    const overloadedAgents = agents
      .filter((agent, index) => loads[index] > avgLoad + this.config.workloadBalanceThreshold / 2)
      .map(agent => agent.id);

    const underloadedAgents = agents
      .filter((agent, index) => loads[index] < avgLoad - this.config.workloadBalanceThreshold / 2)
      .map(agent => agent.id);

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (imbalanceRatio > 0.8) severity = 'critical';
    else if (imbalanceRatio > 0.6) severity = 'high';
    else if (imbalanceRatio > 0.4) severity = 'medium';

    return {
      isImbalanced,
      imbalanceRatio,
      overloadedAgents,
      underloadedAgents,
      severity
    };
  }

  /**
   * Suggest task redistributions
   */
  suggestTaskRedistribution(): TaskRedistributionSuggestion[] {
    const suggestions: TaskRedistributionSuggestion[] = [];
    const imbalance = this.detectWorkloadImbalance();

    if (!imbalance.isImbalanced) {
      return suggestions;
    }

    for (const overloadedAgentId of imbalance.overloadedAgents) {
      const overloadedAgent = this.agents.get(overloadedAgentId);
      if (!overloadedAgent) continue;

      for (const underloadedAgentId of imbalance.underloadedAgents) {
        const underloadedAgent = this.agents.get(underloadedAgentId);
        if (!underloadedAgent) continue;

        // Find tasks that could be moved
        const movableTasks = overloadedAgent.taskQueue.slice(0, 2); // Move up to 2 tasks
        
        if (movableTasks.length > 0) {
          suggestions.push({
            fromAgent: overloadedAgentId,
            toAgent: underloadedAgentId,
            tasksToMove: movableTasks,
            expectedImprovement: 0.3, // Simplified calculation
            reasoning: `Balance workload between overloaded ${overloadedAgentId} and underloaded ${underloadedAgentId}`
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Execute workload rebalancing
   */
  async rebalanceWorkload(): Promise<WorkloadRebalanceResult> {
    try {
      const suggestions = this.suggestTaskRedistribution();
      let redistributions = 0;
      const affectedAgents = new Set<string>();

      for (const suggestion of suggestions) {
        const fromAgent = this.agents.get(suggestion.fromAgent);
        const toAgent = this.agents.get(suggestion.toAgent);

        if (!fromAgent || !toAgent) continue;

        // Move tasks
        for (const taskId of suggestion.tasksToMove) {
          const taskIndex = fromAgent.taskQueue.indexOf(taskId);
          if (taskIndex !== -1) {
            fromAgent.taskQueue.splice(taskIndex, 1);
            toAgent.taskQueue.push(taskId);

            // Update assignment if it exists
            const assignment = this.assignments.get(taskId);
            if (assignment) {
              assignment.agentId = toAgent.id;
              assignment.assignedAt = new Date();
            }

            redistributions++;
            affectedAgents.add(fromAgent.id);
            affectedAgents.add(toAgent.id);
          }
        }
      }

      logger.info({
        redistributions,
        affectedAgents: Array.from(affectedAgents)
      }, 'Workload rebalancing completed');

      this.emit('workload:rebalanced', {
        redistributions,
        affectedAgents: Array.from(affectedAgents)
      });

      return {
        success: true,
        redistributions,
        affectedAgents: Array.from(affectedAgents),
        improvementScore: redistributions * 0.1 // Simplified calculation
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to rebalance workload');
      return {
        success: false,
        redistributions: 0,
        affectedAgents: [],
        improvementScore: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Predict workload trends
   */
  predictWorkloadTrends(timeHorizon: number): WorkloadTrendPrediction {
    const agents = Array.from(this.agents.values());
    const agentUtilization: Record<string, number> = {};
    const expectedBottlenecks: string[] = [];
    const recommendations: string[] = [];

    // Calculate current utilization and project forward
    for (const agent of agents) {
      const currentLoad = this.calculateAgentLoad(agent);
      const projectedLoad = currentLoad * 1.2; // Simple projection
      
      agentUtilization[agent.id] = projectedLoad;
      
      if (projectedLoad > 0.9) {
        expectedBottlenecks.push(agent.id);
        recommendations.push(`Consider offloading tasks from ${agent.id}`);
      }
    }

    if (expectedBottlenecks.length > agents.length * 0.5) {
      recommendations.push('Consider adding more agents to handle increased load');
    }

    return {
      timeHorizon,
      agentUtilization,
      expectedBottlenecks,
      recommendations
    };
  }

  /**
   * Get scaling recommendations
   */
  getScalingRecommendations(): ScalingRecommendations {
    const stats = this.getPerformanceStats();
    const currentCapacity = stats.totalAgents;
    const utilization = stats.activeAgents / stats.totalAgents;
    
    let recommendedCapacity = currentCapacity;
    let urgency: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let reasoning = 'Current capacity is sufficient';

    if (utilization > 0.9) {
      recommendedCapacity = Math.ceil(currentCapacity * 1.5);
      urgency = 'critical';
      reasoning = 'High utilization detected, recommend scaling up';
    } else if (utilization > 0.8) {
      recommendedCapacity = Math.ceil(currentCapacity * 1.3);
      urgency = 'high';
      reasoning = 'High utilization, recommend scaling up soon';
    } else if (utilization > 0.7) {
      recommendedCapacity = Math.ceil(currentCapacity * 1.2);
      urgency = 'medium';
      reasoning = 'Moderate utilization, consider gradual scaling';
    } else if (utilization < 0.3) {
      recommendedCapacity = Math.max(1, Math.floor(currentCapacity * 0.8));
      urgency = 'low';
      reasoning = 'Low utilization, consider scaling down';
    }

    return {
      currentCapacity,
      recommendedCapacity,
      reasoning,
      urgency,
      timeframe: urgency === 'critical' ? 'immediate' : 
                  urgency === 'high' ? 'within 1 hour' :
                  urgency === 'medium' ? 'within 1 day' : 'within 1 week'
    };
  }

  /**
   * Optimize agent allocation for upcoming tasks
   */
  async optimizeForUpcomingTasks(tasks: AtomicTask[]): Promise<TaskOptimizationResult> {
    try {
      const assignments: { taskId: string; agentId: string; score: number }[] = [];
      let totalScore = 0;

      // Simple greedy optimization
      for (const task of tasks) {
        const bestAgent = await this.findBestAgent(task);
        if (bestAgent) {
          assignments.push({
            taskId: task.id,
            agentId: bestAgent.agentId,
            score: bestAgent.score
          });
          totalScore += bestAgent.score;
        }
      }

      return {
        success: true,
        assignments,
        totalScore
      };

    } catch (error) {
      return {
        success: false,
        assignments: [],
        totalScore: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get real-time metrics
   */
  getRealTimeMetrics(): RealTimeMetrics {
    const agents = Array.from(this.agents.values());
    const loads = agents.map(agent => this.calculateAgentLoad(agent));
    const averageLoad = loads.length > 0 ? loads.reduce((sum, load) => sum + load, 0) / loads.length : 0;

    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status !== 'offline').length,
      averageLoad,
      taskThroughput: this.calculateTaskThroughput(),
      currentStrategy: this.config.strategy,
      lastUpdateTime: new Date()
    };
  }

  /**
   * Get assignment efficiency metrics
   */
  getAssignmentEfficiency(): AssignmentEfficiency {
    const avgAssignmentTime = this.statistics.totalAssignments > 0 
      ? this.statistics.totalAssignmentTime / this.statistics.totalAssignments 
      : 0;

    return {
      successfulAssignments: this.statistics.successfulAssignments,
      failedAssignments: this.statistics.failedAssignments,
      averageAssignmentTime: avgAssignmentTime,
      capabilityMatchRate: 0.85, // Simplified calculation
      performanceUtilization: 0.78 // Simplified calculation
    };
  }

  /**
   * Check and emit workload events
   */
  async checkAndEmitWorkloadEvents(): Promise<void> {
    const imbalance = this.detectWorkloadImbalance();
    
    if (imbalance.isImbalanced) {
      this.emit('workload:imbalance', {
        type: 'imbalance_detected',
        severity: imbalance.severity,
        details: imbalance
      });
    }
  }

  /**
   * Update assignment strategy
   */
  updateStrategy(strategy: WorkloadDistributionStrategy): void {
    this.config.strategy = strategy;
    logger.info({ newStrategy: strategy }, 'Assignment strategy updated');
  }

  /**
   * Update workload threshold
   */
  updateWorkloadThreshold(threshold: number): void {
    this.config.workloadBalanceThreshold = threshold;
    logger.info({ newThreshold: threshold }, 'Workload threshold updated');
  }

  /**
   * Get current configuration
   */
  getConfiguration(): AgentAssignmentConfig {
    return { ...this.config };
  }

  /**
   * Get configuration recommendations
   */
  getConfigurationRecommendations(): ConfigurationRecommendations {
    const currentPerformance = this.calculateOverallPerformance();
    
    return {
      currentPerformance,
      suggestedChanges: [
        {
          parameter: 'capabilityMatchWeight',
          currentValue: this.config.capabilityMatchWeight,
          suggestedValue: 0.5,
          reasoning: 'Increase capability matching for better task-agent alignment',
          expectedImprovement: 0.15
        }
      ],
      expectedImprovement: 0.15
    };
  }

  /**
   * Get active assignments
   */
  getActiveAssignments(): TaskAssignment[] {
    return Array.from(this.assignments.values());
  }

  /**
   * Dispose the service
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    // Stop auto-rebalancing
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = undefined;
    }

    // Clear all data
    this.agents.clear();
    this.assignments.clear();
    this.performanceHistory.clear();
    this.removeAllListeners();

    this.disposed = true;
    logger.info('IntelligentAgentAssignmentService disposed');
  }

  // Private helper methods

  private validateConfig(config: Partial<AgentAssignmentConfig>): void {
    if (config.maxTasksPerAgent !== undefined && config.maxTasksPerAgent < 1) {
      throw new Error('maxTasksPerAgent must be at least 1');
    }

    if (config.workloadBalanceThreshold !== undefined && 
        (config.workloadBalanceThreshold < 0 || config.workloadBalanceThreshold > 1)) {
      throw new Error('workloadBalanceThreshold must be between 0 and 1');
    }

    if (config.capabilityMatchWeight !== undefined && 
        (config.capabilityMatchWeight < 0 || config.capabilityMatchWeight > 1)) {
      throw new Error('capabilityMatchWeight must be between 0 and 1');
    }

    // Validate that weights sum to 1 (only if weights are provided)
    const capWeight = config.capabilityMatchWeight ?? DEFAULT_CONFIG.capabilityMatchWeight;
    const perfWeight = config.performanceWeight ?? DEFAULT_CONFIG.performanceWeight;
    const availWeight = config.availabilityWeight ?? DEFAULT_CONFIG.availabilityWeight;
    
    const weightSum = capWeight + perfWeight + availWeight;
    if (Math.abs(weightSum - 1.0) > 0.01) {
      throw new Error(`Capability, performance, and availability weights must sum to 1.0. Current sum: ${weightSum}`);
    }
  }

  private validateTask(task: AtomicTask): boolean {
    return !!(task.id && task.type && task.estimatedHours > 0 && task.projectId);
  }

  private isAgentEligible(agent: Agent, task: AtomicTask): boolean {
    // Check if agent is available
    if (agent.status === 'offline' || agent.status === 'error') {
      return false;
    }

    // Check if agent has capacity
    if (agent.taskQueue.length >= this.config.maxTasksPerAgent) {
      return false;
    }

    // Check if agent has required capabilities (basic check)
    const taskCapabilities = this.mapTaskTypeToCapabilities(task.type);
    const hasRequiredCapability = taskCapabilities.some(cap => 
      agent.capabilities.includes(cap)
    );

    return hasRequiredCapability;
  }

  private async calculateAgentScore(agent: Agent, task: AtomicTask): Promise<number> {
    let score = 0;

    // Capability match score
    const capabilityScore = this.calculateCapabilityScore(agent, task);
    score += capabilityScore * this.config.capabilityMatchWeight;

    // Performance score
    const performanceScore = this.calculatePerformanceScore(agent);
    score += performanceScore * this.config.performanceWeight;

    // Availability score
    const availabilityScore = this.calculateAvailabilityScore(agent);
    score += availabilityScore * this.config.availabilityWeight;

    return Math.min(1.0, Math.max(0, score));
  }

  private calculateCapabilityScore(agent: Agent, task: AtomicTask): number {
    const requiredCapabilities = this.mapTaskTypeToCapabilities(task.type);
    const matchedCapabilities = requiredCapabilities.filter(cap => 
      agent.capabilities.includes(cap)
    ).length;

    if (requiredCapabilities.length === 0) {
      return 0.5; // Neutral score for tasks with no specific requirements
    }

    const baseScore = matchedCapabilities / requiredCapabilities.length;
    
    // Bonus for preferred task types
    const isPreferred = agent.config.preferredTaskTypes.includes(task.type);
    return Math.min(1.0, baseScore + (isPreferred ? 0.2 : 0));
  }

  private calculatePerformanceScore(agent: Agent): number {
    // Normalize success rate (already 0-1)
    const successScore = agent.performance.successRate;
    
    // Normalize completion time (lower is better)
    const avgCompletionTime = agent.performance.averageCompletionTime;
    const maxReasonableTime = 8 * 60 * 60 * 1000; // 8 hours
    const timeScore = Math.max(0, 1 - (avgCompletionTime / maxReasonableTime));
    
    // Normalize task count (more experience is better)
    const experienceScore = Math.min(1.0, agent.performance.tasksCompleted / 50);
    
    return (successScore * 0.5 + timeScore * 0.3 + experienceScore * 0.2);
  }

  private calculateAvailabilityScore(agent: Agent): number {
    if (agent.status === 'idle') {
      return 1.0;
    }

    // Calculate load-based availability
    const currentLoad = this.calculateAgentLoad(agent);
    return Math.max(0, 1 - currentLoad);
  }

  private calculateAgentLoad(agent: Agent): number {
    const maxTasks = agent.config.maxConcurrentTasks;
    const currentTasks = agent.taskQueue.length + (agent.currentTask ? 1 : 0);
    return Math.min(1.0, currentTasks / maxTasks);
  }

  private calculateTaskComplexity(task: AtomicTask): number {
    let complexity = 1.0;

    // Base complexity from estimated hours
    complexity *= Math.min(2.0, task.estimatedHours / 4); // Normalize to 4 hours

    // Complexity from dependencies
    complexity *= (1 + task.dependencies.length * 0.1);

    // Complexity from file paths
    complexity *= (1 + task.filePaths.length * 0.05);

    return Math.min(3.0, complexity);
  }

  private calculateTaskThroughput(): number {
    // Simplified calculation
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const recentAssignments = Array.from(this.assignments.values()).filter(
      assignment => assignment.assignedAt.getTime() > now - oneHour
    );
    return recentAssignments.length;
  }

  private calculateOverallPerformance(): number {
    const efficiency = this.getAssignmentEfficiency();
    const successRate = efficiency.successfulAssignments / 
      (efficiency.successfulAssignments + efficiency.failedAssignments || 1);
    return successRate * efficiency.capabilityMatchRate * efficiency.performanceUtilization;
  }

  private generateAssignmentReasoning(agent: Agent, task: AtomicTask, score: number): string {
    const capabilities = this.mapTaskTypeToCapabilities(task.type);
    const matchedCaps = capabilities.filter(cap => agent.capabilities.includes(cap));
    
    return `Selected ${agent.name} (score: ${score.toFixed(2)}) for ${task.type} task. ` +
           `Matched capabilities: ${matchedCaps.join(', ')}. ` +
           `Performance: ${(agent.performance.successRate * 100).toFixed(1)}% success rate, ` +
           `${agent.performance.tasksCompleted} tasks completed.`;
  }

  private calculateConfidence(agent: Agent, task: AtomicTask, score: number): number {
    // Base confidence from score
    let confidence = score;
    
    // Adjust based on agent experience
    const experienceFactor = Math.min(1.0, agent.performance.tasksCompleted / 20);
    confidence *= (0.5 + experienceFactor * 0.5);
    
    // Adjust based on task complexity
    const complexity = this.calculateTaskComplexity(task);
    confidence *= Math.max(0.3, 1 - (complexity - 1) * 0.2);
    
    return Math.min(1.0, Math.max(0.1, confidence));
  }

  private mapTaskTypeToCapabilities(taskType: string): AgentCapability[] {
    const mapping: Record<string, AgentCapability[]> = {
      'development': ['code_generation', 'debugging'],
      'testing': ['testing', 'debugging'],
      'documentation': ['documentation'],
      'research': ['research'],
      'deployment': ['deployment'],
      'review': ['review', 'code_generation']
    };

    return mapping[taskType] || ['code_generation']; // Default fallback
  }

  private mapTaskPriorityToAssignmentPriority(priority: string): 'low' | 'normal' | 'high' | 'urgent' {
    const mapping: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
      'low': 'low',
      'medium': 'normal',
      'high': 'high',
      'critical': 'urgent'
    };

    return mapping[priority] || 'normal';
  }

  private selectRoundRobinAgent(candidates: Agent[]): Agent {
    const agent = candidates[this.roundRobinIndex % candidates.length];
    this.roundRobinIndex++;
    return agent;
  }

  private selectLeastLoadedAgent(candidates: Agent[]): Agent {
    return candidates.reduce((leastLoaded, current) => {
      const currentLoad = this.calculateAgentLoad(current);
      const leastLoad = this.calculateAgentLoad(leastLoaded);
      return currentLoad < leastLoad ? current : leastLoaded;
    });
  }

  private selectCapabilityFirstAgent(candidates: Agent[], task: AtomicTask): { agent: Agent; score: number } {
    let bestAgent = candidates[0];
    let bestScore = 0;

    for (const agent of candidates) {
      const score = this.calculateCapabilityScore(agent, task);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return { agent: bestAgent, score: bestScore };
  }

  private selectPerformanceBasedAgent(candidates: Agent[]): { agent: Agent; score: number } {
    let bestAgent = candidates[0];
    let bestScore = 0;

    for (const agent of candidates) {
      const score = this.calculatePerformanceScore(agent);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return { agent: bestAgent, score: bestScore };
  }

  private startAutoRebalancing(): void {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
    }

    this.rebalanceTimer = setInterval(async () => {
      const imbalance = this.detectWorkloadImbalance();
      if (imbalance.isImbalanced && imbalance.severity !== 'low') {
        await this.rebalanceWorkload();
      }
    }, this.config.rebalanceInterval);
  }
}