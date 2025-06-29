/**
 * Agent Task Polling System - Universal Task Assignment and Polling
 *
 * Supports both stdio polling and SSE real-time notifications
 * Part of the Unified Communication Protocol implementation
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AgentRegistry } from '../agent-registry/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { registerTool, ToolDefinition } from '../../services/routing/toolRegistry.js';
import { z } from 'zod';

// Unified task assignment interface (compatible with agent-orchestrator)
export interface TaskAssignment {
  /** Assignment ID */
  id?: string;

  /** Task ID being assigned */
  taskId: string;

  /** Agent ID receiving the assignment */
  agentId: string;

  /** Sentinel protocol payload for agent communication */
  sentinelPayload: string;

  /** Assignment timestamp (number for backward compatibility) */
  assignedAt: number;

  /** Assignment priority */
  priority: 'low' | 'normal' | 'high' | 'urgent';

  /** Estimated duration in milliseconds */
  estimatedDuration?: number;

  /** Assignment deadline */
  deadline?: number;

  /** Assignment metadata */
  metadata?: Record<string, any>;
}

// Task queue manager singleton
class AgentTaskQueue {
  private static instance: AgentTaskQueue;
  private static isInitializing = false; // Initialization guard to prevent circular initialization
  private queues = new Map<string, TaskAssignment[]>(); // agentId -> tasks
  private taskHistory = new Map<string, TaskAssignment>(); // taskId -> task
  private assignmentCounter = 0;

  static getInstance(): AgentTaskQueue {
    if (AgentTaskQueue.isInitializing) {
      console.warn('Circular initialization detected in AgentTaskQueue, using safe fallback');
      return AgentTaskQueue.createSafeFallback();
    }

    if (!AgentTaskQueue.instance) {
      AgentTaskQueue.isInitializing = true;
      try {
        AgentTaskQueue.instance = new AgentTaskQueue();
      } finally {
        AgentTaskQueue.isInitializing = false;
      }
    }
    return AgentTaskQueue.instance;
  }

  /**
   * Create safe fallback instance to prevent recursion
   */
  private static createSafeFallback(): AgentTaskQueue {
    const fallback = Object.create(AgentTaskQueue.prototype);

    // Initialize with minimal safe properties
    fallback.queues = new Map();
    fallback.taskHistory = new Map();
    fallback.assignmentCounter = 0;

    // Provide safe no-op methods
    fallback.assignTask = async () => {
      console.warn('AgentTaskQueue fallback: assignTask called during initialization');
      return null;
    };
    fallback.getTasks = async () => {
      console.warn('AgentTaskQueue fallback: getTasks called during initialization');
      return [];
    };
    fallback.getQueueLength = async () => {
      console.warn('AgentTaskQueue fallback: getQueueLength called during initialization');
      return 0;
    };

    return fallback;
  }

  async addTask(agentId: string, task: Omit<TaskAssignment, 'taskId' | 'assignedAt'>): Promise<string> {
    // Generate unique task ID
    const taskId = this.generateTaskId();

    // Create full task assignment
    const taskAssignment: TaskAssignment = {
      ...task,
      taskId,
      agentId,
      assignedAt: Date.now()
    };

    // Add to agent queue
    if (!this.queues.has(agentId)) {
      this.queues.set(agentId, []);
    }
    this.queues.get(agentId)!.push(taskAssignment);

    // Store in history
    this.taskHistory.set(taskId, taskAssignment);

    // Update agent status
    await this.updateAgentTaskCount(agentId);

    // Send SSE notification if agent uses SSE transport
    const agent = await AgentRegistry.getInstance().getAgent(agentId);
    if (agent?.transportType === 'sse') {
      await this.sendSSETaskNotification(agentId, taskAssignment);
    }

    console.log(`Task ${taskId} assigned to agent ${agentId} (${agent?.transportType || 'unknown'} transport)`);
    return taskId;
  }

  private generateTaskId(): string {
    this.assignmentCounter++;
    return `task-${Date.now()}-${this.assignmentCounter.toString().padStart(4, '0')}`;
  }

  async getTasks(agentId: string, maxTasks: number = 1): Promise<TaskAssignment[]> {
    const queue = this.queues.get(agentId) || [];
    const tasks = queue.splice(0, Math.min(maxTasks, queue.length));

    // Update agent last seen
    const agentRegistry = AgentRegistry.getInstance();
    const agent = await agentRegistry.getAgent(agentId);
    if (agent) {
      agent.lastSeen = Date.now();
      await this.updateAgentTaskCount(agentId);
    }

    return tasks;
  }

  async getQueueLength(agentId: string): Promise<number> {
    return (this.queues.get(agentId) || []).length;
  }

  async getAllQueueLengths(): Promise<Record<string, number>> {
    const lengths: Record<string, number> = {};
    for (const [agentId, queue] of this.queues.entries()) {
      lengths[agentId] = queue.length;
    }
    return lengths;
  }

  async removeTask(taskId: string): Promise<boolean> {
    const task = this.taskHistory.get(taskId);
    if (!task) return false;

    // Remove from agent queue
    const queue = this.queues.get(task.agentId);
    if (queue) {
      const index = queue.findIndex(t => t.taskId === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
        await this.updateAgentTaskCount(task.agentId);
        return true;
      }
    }

    return false;
  }

  async getTask(taskId: string): Promise<TaskAssignment | undefined> {
    return this.taskHistory.get(taskId);
  }

  private async updateAgentTaskCount(agentId: string): Promise<void> {
    const agentRegistry = AgentRegistry.getInstance();
    const agent = await agentRegistry.getAgent(agentId);
    if (agent) {
      const queueLength = await this.getQueueLength(agentId);
      agent.currentTasks = Array.from({ length: queueLength }, (_, i) => `pending-${i + 1}`);

      // Update status based on task load
      const maxTasks = agent.maxConcurrentTasks || 1;
      if (queueLength >= maxTasks) {
        await agentRegistry.updateAgentStatus(agentId, 'busy');
      } else if (agent.status === 'busy' && queueLength < maxTasks) {
        await agentRegistry.updateAgentStatus(agentId, 'online');
      }
    }
  }

  private async sendSSETaskNotification(agentId: string, task: TaskAssignment): Promise<void> {
    try {
      const agent = await AgentRegistry.getInstance().getAgent(agentId);

      if (agent?.sessionId) {
        // Send to specific agent session
        await sseNotifier.sendEvent(agent.sessionId, 'taskAssigned', {
          agentId,
          taskId: task.taskId,
          taskPayload: task.sentinelPayload,
          priority: task.priority,
          estimatedDuration: task.estimatedDuration,
          deadline: task.deadline,
          assignedAt: task.assignedAt,
          metadata: task.metadata
        });

        console.log(`SSE task notification sent to agent ${agentId} for task ${task.taskId}`);
      }

      // Also broadcast to all SSE clients for monitoring
      await sseNotifier.broadcastEvent('taskAssignmentUpdate', {
        agentId,
        taskId: task.taskId,
        priority: task.priority,
        assignedAt: task.assignedAt,
        queueLength: await this.getQueueLength(agentId)
      });

    } catch (error) {
      console.error('Failed to send SSE task notification:', error);
      // Don't throw - task assignment should succeed even if SSE notification fails
    }
  }

  // Find best available agent for a task
  async findBestAgent(requiredCapabilities: string[]): Promise<string | null> {
    const agentRegistry = AgentRegistry.getInstance();
    const onlineAgents = await agentRegistry.getOnlineAgents();

    // Filter agents by capabilities
    const capableAgents = onlineAgents.filter(agent =>
      requiredCapabilities.every(cap => agent.capabilities.includes(cap))
    );

    if (capableAgents.length === 0) {
      return null;
    }

    // Sort by current task load (ascending)
    const agentsWithLoad = await Promise.all(
      capableAgents.map(async agent => ({
        agent,
        queueLength: await this.getQueueLength(agent.agentId)
      }))
    );

    agentsWithLoad.sort((a, b) => a.queueLength - b.queueLength);

    // Return agent with lowest load that's not at capacity
    for (const { agent, queueLength } of agentsWithLoad) {
      if (queueLength < (agent.maxConcurrentTasks || 1)) {
        return agent.agentId;
      }
    }

    // If all agents are at capacity, return the one with the smallest queue
    return agentsWithLoad[0].agent.agentId;
  }

  // Clear all tasks for an agent (e.g., when agent disconnects)
  async clearAgentTasks(agentId: string): Promise<number> {
    const queue = this.queues.get(agentId) || [];
    const clearedCount = queue.length;

    // Remove tasks from history
    for (const task of queue) {
      this.taskHistory.delete(task.taskId);
    }

    // Clear queue
    this.queues.set(agentId, []);
    await this.updateAgentTaskCount(agentId);

    console.log(`Cleared ${clearedCount} tasks for agent ${agentId}`);
    return clearedCount;
  }
}

// MCP Tool Definition
export const getAgentTasksTool = {
  name: 'get-agent-tasks',
  description: 'Get pending tasks for an agent (stdio polling)',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'Agent identifier'
      },
      maxTasks: {
        type: 'number',
        default: 1,
        minimum: 1,
        maximum: 5,
        description: 'Maximum number of tasks to retrieve'
      }
    },
    required: ['agentId']
  }
};

// Tool Handler
export async function handleGetAgentTasks(args: any): Promise<CallToolResult> {
  try {
    const { agentId, maxTasks = 1 } = args;

    // Verify agent exists and is registered
    const agentRegistry = AgentRegistry.getInstance();
    const agent = await agentRegistry.getAgent(agentId);

    if (!agent) {
      return {
        content: [{
          type: 'text',
          text: `❌ Agent Not Found\n\nAgent ${agentId} is not registered.\n\n` +
                `Please register first using the 'register-agent' tool.`
        }],
        isError: true
      };
    }

    // Get tasks from queue
    const taskQueue = AgentTaskQueue.getInstance();
    const tasks = await taskQueue.getTasks(agentId, maxTasks);

    if (tasks.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `📭 No Tasks Available\n\n` +
                `Agent: ${agentId}\n` +
                `Status: ${agent.status}\n` +
                `Queue Length: 0\n\n` +
                `Continue polling for new task assignments.`
        }]
      };
    }

    // Format tasks for response
    const taskDetails = tasks.map(task =>
      `📋 Task ID: ${task.taskId}\n` +
      `Priority: ${task.priority.toUpperCase()}\n` +
      `Assigned: ${new Date(task.assignedAt).toISOString()}\n` +
      `${task.estimatedDuration ? `Estimated Duration: ${task.estimatedDuration}ms\n` : ''}` +
      `${task.deadline ? `Deadline: ${new Date(task.deadline).toISOString()}\n` : ''}` +
      `\n--- Sentinel Protocol Payload ---\n${task.sentinelPayload}\n--- End Payload ---`
    ).join('\n\n');

    const remainingTasks = await taskQueue.getQueueLength(agentId);

    return {
      content: [{
        type: 'text',
        text: `✅ Task Assignment Retrieved\n\n` +
              `Agent: ${agentId}\n` +
              `Tasks Retrieved: ${tasks.length}\n` +
              `Remaining in Queue: ${remainingTasks}\n\n` +
              `${taskDetails}\n\n` +
              `🔧 Next Steps:\n` +
              `1. Process the task(s) according to the Sentinel Protocol\n` +
              `2. Submit results using 'submit-task-response' tool\n` +
              `3. Continue polling for additional tasks`
      }]
    };

  } catch (error) {
    console.error('Get agent tasks failed:', error);
    return {
      content: [{
        type: 'text',
        text: `❌ Task Retrieval Failed\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
              `Please try again or contact support if the issue persists.`
      }],
      isError: true
    };
  }
}

// Export task queue instance for use by other modules
export { AgentTaskQueue };

// --- Tool Registration ---

// Define the input schema shape for Zod validation
const getAgentTasksInputSchemaShape = {
  agentId: z.string().min(1, { message: "Agent ID is required" }).describe("Agent identifier"),
  maxTasks: z.number().min(1).max(5).default(1).describe("Maximum number of tasks to retrieve")
};

// Tool definition for the agent tasks tool
const getAgentTasksToolDefinition: ToolDefinition = {
  name: "get-agent-tasks",
  description: "Get pending tasks for an agent (stdio polling). Supports both stdio and SSE transports for universal task assignment.",
  inputSchema: getAgentTasksInputSchemaShape,
  executor: handleGetAgentTasks
};

// Register the tool with the central registry
registerTool(getAgentTasksToolDefinition);
