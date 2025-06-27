/**
 * Agent Response System - Universal Task Response Processing
 *
 * Handles task completion responses from agents across all transports
 * Part of the Unified Communication Protocol implementation
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { jobManager } from '../../services/job-manager/index.js';
import { getTaskOperations } from '../vibe-task-manager/core/operations/task-operations.js';
import { registerTool, ToolDefinition } from '../../services/routing/toolRegistry.js';
import { dependencyContainer } from '../../services/dependency-container.js';
import { z } from 'zod';

// Agent response interface
export interface AgentResponse {
  agentId: string;
  taskId: string;
  status: 'DONE' | 'ERROR' | 'PARTIAL';
  response: string;
  completionDetails?: {
    filesModified?: string[];
    testsPass?: boolean;
    buildSuccessful?: boolean;
    executionTime?: number;
    errorDetails?: string;
    partialProgress?: number;
  };
  receivedAt?: number;
  metadata?: Record<string, any>;
}

// Response processor singleton
class AgentResponseProcessor {
  private static instance: AgentResponseProcessor;
  private static isInitializing = false; // Initialization guard to prevent circular initialization
  private responseHistory = new Map<string, AgentResponse>(); // taskId -> response
  private agentRegistryCache: any = null; // Cache for safe agent registry access
  private agentTaskQueueCache: any = null; // Cache for safe agent task queue access

  static getInstance(): AgentResponseProcessor {
    if (AgentResponseProcessor.isInitializing) {
      console.warn('Circular initialization detected in AgentResponseProcessor, using safe fallback');
      return AgentResponseProcessor.createSafeFallback();
    }

    if (!AgentResponseProcessor.instance) {
      AgentResponseProcessor.isInitializing = true;
      try {
        AgentResponseProcessor.instance = new AgentResponseProcessor();
      } finally {
        AgentResponseProcessor.isInitializing = false;
      }
    }
    return AgentResponseProcessor.instance;
  }

  /**
   * Create safe fallback instance to prevent recursion
   */
  private static createSafeFallback(): AgentResponseProcessor {
    const fallback = Object.create(AgentResponseProcessor.prototype);

    // Initialize with minimal safe properties
    fallback.responseHistory = new Map();

    // Provide safe no-op methods
    fallback.processResponse = async () => {
      console.warn('AgentResponseProcessor fallback: processResponse called during initialization');
    };
    fallback.getResponse = async () => {
      console.warn('AgentResponseProcessor fallback: getResponse called during initialization');
      return undefined;
    };
    fallback.getAllResponses = async () => {
      console.warn('AgentResponseProcessor fallback: getAllResponses called during initialization');
      return [];
    };

    return fallback;
  }

  /**
   * Get AgentRegistry instance using dependency container
   */
  private async getAgentRegistry(): Promise<any | null> {
    if (!this.agentRegistryCache) {
      this.agentRegistryCache = await dependencyContainer.getAgentRegistry();
    }
    return this.agentRegistryCache;
  }

  /**
   * Get AgentTaskQueue instance using dependency container
   */
  private async getAgentTaskQueue(): Promise<any | null> {
    if (!this.agentTaskQueueCache) {
      this.agentTaskQueueCache = await dependencyContainer.getAgentTaskQueue();
    }
    return this.agentTaskQueueCache;
  }

  async processResponse(response: AgentResponse): Promise<void> {
    try {
      // Validate response
      await this.validateResponse(response);

      // Store response in history
      response.receivedAt = Date.now();
      this.responseHistory.set(response.taskId, response);

      // Update task status in storage
      await this.updateTaskStatus(response);

      // Update job status for client polling
      await this.updateJobStatus(response);

      // Update agent status
      await this.updateAgentStatus(response);

      // Send SSE notifications
      await this.broadcastTaskCompletion(response);

      console.log(`Task ${response.taskId} completed by agent ${response.agentId} with status: ${response.status}`);

    } catch (error) {
      console.error('Failed to process agent response:', error);
      throw error;
    }
  }

  private async validateResponse(response: AgentResponse): Promise<void> {
    // Verify agent exists
    const agentRegistry = await this.getAgentRegistry();
    const agent = agentRegistry ? await agentRegistry.getAgent(response.agentId) : null;
    if (!agent) {
      throw new Error(`Agent ${response.agentId} not found`);
    }

    // Verify task exists
    const taskQueue = await this.getAgentTaskQueue();
    const task = taskQueue ? await taskQueue.getTask(response.taskId) : null;
    if (!task) {
      throw new Error(`Task ${response.taskId} not found`);
    }

    // Verify task belongs to agent
    if (task.agentId !== response.agentId) {
      throw new Error(`Task ${response.taskId} is not assigned to agent ${response.agentId}`);
    }

    // Validate status
    if (!['DONE', 'ERROR', 'PARTIAL'].includes(response.status)) {
      throw new Error(`Invalid response status: ${response.status}`);
    }

    // Validate response content
    if (!response.response || response.response.trim() === '') {
      throw new Error('Response content is required');
    }
  }

  private async updateTaskStatus(response: AgentResponse): Promise<void> {
    try {
      const taskOps = getTaskOperations();

      // Map agent response status to task status
      let taskStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
      switch (response.status) {
        case 'DONE':
          taskStatus = 'completed';
          break;
        case 'ERROR':
          taskStatus = 'failed';
          break;
        case 'PARTIAL':
          taskStatus = 'in_progress';
          break;
        default:
          taskStatus = 'failed';
      }

      // Update task status
      await taskOps.updateTaskStatus(response.taskId, taskStatus, response.agentId);

      // Add response details as task metadata
      if (response.completionDetails) {
        await taskOps.updateTaskMetadata(response.taskId, {
          agentResponse: response.response,
          completionDetails: response.completionDetails,
          completedBy: response.agentId,
          completedAt: response.receivedAt,
          executionTime: response.completionDetails.executionTime,
          filesModified: response.completionDetails.filesModified,
          testsPass: response.completionDetails.testsPass,
          buildSuccessful: response.completionDetails.buildSuccessful
        }, response.agentId);
      }

    } catch (error) {
      console.error('Failed to update task status:', error);
      // Don't throw - response processing should continue
    }
  }

  private async updateJobStatus(response: AgentResponse): Promise<void> {
    try {
      // Complete the job with response data
      const result = {
        isError: response.status !== 'DONE',
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: response.status === 'DONE',
            result: response.response,
            details: response.completionDetails,
            completedBy: response.agentId,
            completedAt: response.receivedAt
          })
        }]
      };

      jobManager.setJobResult(response.taskId, result);

    } catch (error) {
      console.error('Failed to update job status:', error);
      // Don't throw - response processing should continue
    }
  }

  private async updateAgentStatus(response: AgentResponse): Promise<void> {
    try {
      const agentRegistry = await this.getAgentRegistry();
      const taskQueue = await this.getAgentTaskQueue();

      // Remove completed task from queue
      if (taskQueue) {
        await taskQueue.removeTask(response.taskId);
      }

      // Update agent last seen and task count
      const agent = agentRegistry ? await agentRegistry.getAgent(response.agentId) : null;
      if (agent && agentRegistry && taskQueue) {
        agent.lastSeen = Date.now();

        // Update current tasks list
        const queueLength = await taskQueue.getQueueLength(response.agentId);
        agent.currentTasks = Array.from({ length: queueLength }, (_, i) => `pending-${i + 1}`);

        // Update status based on remaining task load
        const maxTasks = agent.maxConcurrentTasks || 1;
        if (queueLength < maxTasks && agent.status === 'busy') {
          await agentRegistry.updateAgentStatus(response.agentId, 'online');
        }
      }

    } catch (error) {
      console.error('Failed to update agent status:', error);
      // Don't throw - response processing should continue
    }
  }

  private async broadcastTaskCompletion(response: AgentResponse): Promise<void> {
    try {
      // Broadcast to all SSE clients
      await sseNotifier.broadcastEvent('taskCompleted', {
        agentId: response.agentId,
        taskId: response.taskId,
        status: response.status,
        completedAt: response.receivedAt,
        success: response.status === 'DONE',
        executionTime: response.completionDetails?.executionTime,
        filesModified: response.completionDetails?.filesModified?.length || 0
      });

      // Send specific notification to agent's session if SSE transport
      const agentRegistry = await this.getAgentRegistry();
      const agent = agentRegistry ? await agentRegistry.getAgent(response.agentId) : null;

      if (agent?.transportType === 'sse' && agent.sessionId) {
        await sseNotifier.sendEvent(agent.sessionId, 'responseReceived', {
          taskId: response.taskId,
          acknowledged: true,
          nextAction: 'ready_for_new_task',
          timestamp: response.receivedAt
        });
      }

    } catch (error) {
      console.error('Failed to broadcast task completion:', error);
      // Don't throw - response processing should continue
    }
  }

  async getResponse(taskId: string): Promise<AgentResponse | undefined> {
    return this.responseHistory.get(taskId);
  }

  async getAgentResponses(agentId: string): Promise<AgentResponse[]> {
    return Array.from(this.responseHistory.values())
      .filter(response => response.agentId === agentId);
  }

  async getResponseStats(): Promise<{
    total: number;
    successful: number;
    failed: number;
    partial: number;
    averageExecutionTime: number;
  }> {
    const responses = Array.from(this.responseHistory.values());
    const total = responses.length;
    const successful = responses.filter(r => r.status === 'DONE').length;
    const failed = responses.filter(r => r.status === 'ERROR').length;
    const partial = responses.filter(r => r.status === 'PARTIAL').length;

    const executionTimes = responses
      .map(r => r.completionDetails?.executionTime)
      .filter(time => typeof time === 'number') as number[];

    const averageExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
      : 0;

    return {
      total,
      successful,
      failed,
      partial,
      averageExecutionTime
    };
  }
}

// MCP Tool Definition
export const submitTaskResponseTool = {
  name: 'submit-task-response',
  description: 'Submit task completion response from agent',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'Agent identifier'
      },
      taskId: {
        type: 'string',
        description: 'Task identifier'
      },
      status: {
        type: 'string',
        enum: ['DONE', 'ERROR', 'PARTIAL'],
        description: 'Task completion status'
      },
      response: {
        type: 'string',
        description: 'Sentinel protocol response content'
      },
      completionDetails: {
        type: 'object',
        properties: {
          filesModified: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of files modified during task execution'
          },
          testsPass: {
            type: 'boolean',
            description: 'Whether all tests passed'
          },
          buildSuccessful: {
            type: 'boolean',
            description: 'Whether build was successful'
          },
          executionTime: {
            type: 'number',
            description: 'Task execution time in milliseconds'
          },
          errorDetails: {
            type: 'string',
            description: 'Error details if status is ERROR'
          },
          partialProgress: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Completion percentage if status is PARTIAL'
          }
        }
      }
    },
    required: ['agentId', 'taskId', 'status', 'response']
  }
};

// Tool Handler
export async function handleSubmitTaskResponse(args: any): Promise<CallToolResult> {
  try {
    const response: AgentResponse = {
      agentId: args.agentId,
      taskId: args.taskId,
      status: args.status,
      response: args.response,
      completionDetails: args.completionDetails
    };

    // Process the response
    const processor = AgentResponseProcessor.getInstance();
    await processor.processResponse(response);

    // Prepare success message
    const statusEmoji = response.status === 'DONE' ? '✅' :
                       response.status === 'ERROR' ? '❌' : '⏳';

    const completionInfo = response.completionDetails ? [
      response.completionDetails.filesModified ? `Files Modified: ${response.completionDetails.filesModified.length}` : '',
      response.completionDetails.testsPass !== undefined ? `Tests: ${response.completionDetails.testsPass ? 'PASS' : 'FAIL'}` : '',
      response.completionDetails.buildSuccessful !== undefined ? `Build: ${response.completionDetails.buildSuccessful ? 'SUCCESS' : 'FAIL'}` : '',
      response.completionDetails.executionTime ? `Execution Time: ${response.completionDetails.executionTime}ms` : '',
      response.completionDetails.partialProgress ? `Progress: ${response.completionDetails.partialProgress}%` : ''
    ].filter(info => info !== '').join('\n') : '';

    return {
      content: [{
        type: 'text',
        text: `${statusEmoji} Task Response Submitted Successfully\n\n` +
              `Agent: ${response.agentId}\n` +
              `Task: ${response.taskId}\n` +
              `Status: ${response.status}\n` +
              `Submitted: ${new Date().toISOString()}\n` +
              `${completionInfo ? `\n📊 Completion Details:\n${completionInfo}\n` : ''}` +
              `\n🔧 Next Steps:\n` +
              `- Task has been marked as ${response.status.toLowerCase()}\n` +
              `- Job status updated for client polling\n` +
              `- Continue polling for new task assignments\n` +
              `${response.status === 'PARTIAL' ? '- Submit additional responses as work progresses' : ''}`
      }]
    };

  } catch (error) {
    console.error('Submit task response failed:', error);
    return {
      content: [{
        type: 'text',
        text: `❌ Task Response Submission Failed\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
              `Please verify:\n` +
              `- Agent is registered and active\n` +
              `- Task ID is valid and assigned to this agent\n` +
              `- Response format follows Sentinel Protocol\n` +
              `- All required fields are provided`
      }],
      isError: true
    };
  }
}

// Export response processor instance for use by other modules
export { AgentResponseProcessor };

// --- Tool Registration ---

// Define the input schema shape for Zod validation
const submitTaskResponseInputSchemaShape = {
  agentId: z.string().min(1, { message: "Agent ID is required" }).describe("Agent identifier"),
  taskId: z.string().min(1, { message: "Task ID is required" }).describe("Task identifier"),
  status: z.enum(['DONE', 'ERROR', 'PARTIAL']).describe("Task completion status"),
  response: z.string().min(1, { message: "Response content is required" }).describe("Sentinel protocol response content"),
  completionDetails: z.object({
    filesModified: z.array(z.string()).optional().describe("List of files modified during task execution"),
    testsPass: z.boolean().optional().describe("Whether all tests passed"),
    buildSuccessful: z.boolean().optional().describe("Whether build was successful"),
    executionTime: z.number().optional().describe("Task execution time in milliseconds"),
    errorDetails: z.string().optional().describe("Error details if status is ERROR"),
    partialProgress: z.number().min(0).max(100).optional().describe("Completion percentage if status is PARTIAL")
  }).optional().describe("Additional completion details")
};

// Tool definition for the agent response tool
const submitTaskResponseToolDefinition: ToolDefinition = {
  name: "submit-task-response",
  description: "Submit task completion response from agent. Supports both stdio and SSE transports for universal agent communication.",
  inputSchema: submitTaskResponseInputSchemaShape,
  executor: handleSubmitTaskResponse
};

// Register the tool with the central registry
registerTool(submitTaskResponseToolDefinition);
