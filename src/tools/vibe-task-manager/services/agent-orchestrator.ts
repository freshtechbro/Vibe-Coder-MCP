/**
 * Agent Orchestrator Service
 *
 * Manages agent communication, coordination, and task assignment.
 * Handles multi-agent scenarios with load balancing and conflict resolution.
 */

import { AtomicTask, TaskPriority } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';
import { SentinelProtocol, AgentResponse, AgentStatus } from '../cli/sentinel-protocol.js';
import {
  EnhancedError,
  AgentError,
  TaskExecutionError,
  ValidationError,
  TimeoutError,
  ResourceError,
  createErrorContext
} from '../utils/enhanced-errors.js';
import { AppError, ValidationError as BaseValidationError } from '../../../utils/errors.js';
import { MemoryManager } from '../../code-map-generator/cache/memoryManager.js';
import { transportManager } from '../../../services/transport-manager/index.js';
import { getTimeoutManager, TaskComplexity } from '../utils/timeout-manager.js';
import { AgentIntegrationBridge } from './agent-integration-bridge.js';
import { WorkflowAwareAgentManager } from './workflow-aware-agent-manager.js';
import { ImportCycleBreaker } from '../../../utils/import-cycle-breaker.js';
import { OperationCircuitBreaker } from '../../../utils/operation-circuit-breaker.js';
import { InitializationMonitor } from '../../../utils/initialization-monitor.js';
import logger from '../../../logger.js';

/**
 * Agent capability types
 */
export type AgentCapability =
  | 'frontend' | 'backend' | 'database' | 'testing' | 'devops'
  | 'documentation' | 'refactoring' | 'debugging' | 'general';

/**
 * Agent registration information
 */
export interface AgentInfo {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  maxConcurrentTasks: number;
  currentTasks: string[];
  status: 'available' | 'busy' | 'offline' | 'error';
  lastHeartbeat: Date;
  performance: {
    tasksCompleted: number;
    averageCompletionTime: number;
    successRate: number;
    lastTaskCompletedAt?: Date;
  };
  metadata: {
    version: string;
    supportedProtocols: string[];
    preferences: Record<string, any>;
  };
}

/**
 * Unified task assignment information
 * Consolidates all task assignment data across different systems
 */
export interface TaskAssignment {
  /** Assignment ID */
  id?: string;

  /** Task ID being assigned */
  taskId: string;

  /** Full task object for comprehensive access */
  task: AtomicTask;

  /** Agent ID receiving the assignment */
  agentId: string;

  /** Assignment timestamp */
  assignedAt: Date;

  /** Expected completion time */
  expectedCompletionAt: Date;

  /** Assignment status */
  status: 'assigned' | 'in_progress' | 'completed' | 'failed' | 'timeout';

  /** Number of assignment attempts */
  attempts: number;

  /** Last status update timestamp */
  lastStatusUpdate: Date;

  /** Assignment priority */
  priority: 'low' | 'normal' | 'high' | 'urgent';

  /** Estimated duration in milliseconds */
  estimatedDuration?: number;

  /** Assignment deadline */
  deadline?: Date;

  /** Sentinel protocol payload for agent communication */
  sentinelPayload?: string;

  /** Assignment context */
  context?: {
    projectId: string;
    epicId?: string;
    dependencies: string[];
    resources?: string[];
    constraints?: string[];
  };

  /** Assignment metadata */
  metadata?: {
    assignedBy?: string;
    assignedAt?: number;
    executionId?: string;
    retryCount?: number;
    maxRetries?: number;
    [key: string]: any;
  };
}

/**
 * Task execution options
 */
export interface ExecutionOptions {
  /** Force execution even if agent is busy */
  force?: boolean;
  /** Task priority override */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  /** Session ID for tracking */
  sessionId?: string;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Enable real-time progress monitoring */
  enableMonitoring?: boolean;
}

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Task assignment information */
  assignment?: TaskAssignment;
  /** Execution status */
  status: 'completed' | 'failed' | 'timeout' | 'queued' | 'in_progress';
  /** Result message */
  message: string;
  /** Execution start time */
  startTime?: Date;
  /** Execution end time */
  endTime?: Date;
  /** Agent response details */
  agentResponse?: AgentResponse;
  /** Error information if failed */
  error?: string;
  /** Whether task was queued for later execution */
  queued?: boolean;
  /** Execution metadata */
  metadata?: {
    executionId: string;
    attempts: number;
    totalDuration?: number;
    agentId?: string;
  };
}

/**
 * Agent communication channel interface
 */
export interface AgentCommunicationChannel {
  /** Send task to agent */
  sendTask(agentId: string, taskPayload: string): Promise<boolean>;
  /** Receive response from agent */
  receiveResponse(agentId: string, timeout?: number): Promise<string>;
  /** Check if agent is reachable */
  isAgentReachable(agentId: string): Promise<boolean>;
  /** Close communication channel */
  close(): Promise<void>;
}

/**
 * Agent orchestration configuration
 */
export interface OrchestratorConfig {
  heartbeatInterval: number;
  taskTimeout: number;
  maxRetries: number;
  loadBalancingStrategy: 'round_robin' | 'capability_based' | 'performance_based';
  enableHealthChecks: boolean;
  conflictResolutionStrategy: 'queue' | 'reassign' | 'parallel';
  heartbeatTimeoutMultiplier: number; // Multiplier for heartbeat timeout (default: 3)
  enableAdaptiveTimeouts: boolean; // Enable complexity-based timeout adjustment
  maxHeartbeatMisses: number; // Maximum missed heartbeats before marking offline
}

/**
 * Universal Agent Communication Channel
 * Supports stdio, SSE, WebSocket, and HTTP transports
 * Provides unified communication across all transport types
 */
class UniversalAgentCommunicationChannel implements AgentCommunicationChannel {
  private agentRegistry: any;
  private taskQueue: any;
  private responseProcessor: any;
  private websocketServer: any;
  private httpAgentAPI: any;
  private sseNotifier: any;
  private isInitialized: boolean = false;
  private dependenciesPromise: Promise<void> | null = null;

  constructor() {
    // Defer async initialization to prevent recursion during constructor
    this.scheduleAsyncInitialization();
  }

  /**
   * Schedule async initialization to prevent recursion during constructor
   */
  private scheduleAsyncInitialization(): void {
    process.nextTick(() => {
      this.dependenciesPromise = this.initializeDependencies().catch(error => {
        logger.error({ err: error }, 'Failed to initialize UniversalAgentCommunicationChannel dependencies');
      });
    });
  }

  /**
   * Ensure dependencies are ready before any operation
   */
  private async ensureDependencies(): Promise<void> {
    if (this.dependenciesPromise) {
      await this.dependenciesPromise;
    }
  }

  private async initializeDependencies(): Promise<void> {
    try {
      // Import transport services
      const { websocketServer } = await import('../../../services/websocket-server/index.js');
      const { httpAgentAPI } = await import('../../../services/http-agent-api/index.js');
      const { sseNotifier } = await import('../../../services/sse-notifier/index.js');

      this.websocketServer = websocketServer;
      this.httpAgentAPI = httpAgentAPI;
      this.sseNotifier = sseNotifier;

      // Ensure transport services are started via transport manager
      await this.ensureTransportServicesStarted();

      // Log transport endpoint information using dynamic port allocation
      this.logTransportEndpoints();

      // Try to import agent modules with safe imports to prevent circular dependencies
      try {
        const AgentRegistryModule = await ImportCycleBreaker.safeImport<{ AgentRegistry: any }>('../tools/agent-registry/index.js');
        const AgentTaskQueueModule = await ImportCycleBreaker.safeImport<{ AgentTaskQueue: any }>('../tools/agent-tasks/index.js');
        const AgentResponseProcessorModule = await ImportCycleBreaker.safeImport<{ AgentResponseProcessor: any }>('../tools/agent-response/index.js');

        // Extract classes from modules
        const AgentRegistry = AgentRegistryModule?.AgentRegistry;
        const AgentTaskQueue = AgentTaskQueueModule?.AgentTaskQueue;
        const AgentResponseProcessor = AgentResponseProcessorModule?.AgentResponseProcessor;

        if (AgentRegistry && AgentTaskQueue && AgentResponseProcessor) {
          this.agentRegistry = AgentRegistry.getInstance();
          this.taskQueue = AgentTaskQueue.getInstance();
          this.responseProcessor = AgentResponseProcessor.getInstance();

          logger.info('Universal agent communication channel initialized with all transports and agent modules');
        } else {
          logger.warn('Some agent modules could not be imported due to circular dependencies, using fallback implementations');

          // Use fallback implementations for missing modules
          this.agentRegistry = AgentRegistry ? AgentRegistry.getInstance() : this.createFallbackAgentRegistry();
          this.taskQueue = AgentTaskQueue ? AgentTaskQueue.getInstance() : this.createFallbackTaskQueue();
          this.responseProcessor = AgentResponseProcessor ? AgentResponseProcessor.getInstance() : this.createFallbackResponseProcessor();

          logger.info('Universal agent communication channel initialized with mixed agent modules and fallbacks');
        }
      } catch (agentModuleError) {
        logger.warn({ err: agentModuleError }, 'Agent modules not available, using fallback implementations');

        // Fallback implementations
        this.agentRegistry = this.createFallbackAgentRegistry();
        this.taskQueue = this.createFallbackTaskQueue();
        this.responseProcessor = this.createFallbackResponseProcessor();

        logger.info('Universal agent communication channel initialized with fallback agent modules');
      }

      this.isInitialized = true;

    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize universal communication channel');

      // Create minimal fallback implementations
      this.websocketServer = null;
      this.httpAgentAPI = null;
      this.sseNotifier = null;
      this.agentRegistry = this.createFallbackAgentRegistry();
      this.taskQueue = this.createFallbackTaskQueue();
      this.responseProcessor = this.createFallbackResponseProcessor();

      this.isInitialized = true;
      logger.warn('Universal agent communication channel initialized with minimal fallback implementations');
    }
  }

  /**
   * Create fallback agent registry
   */
  private createFallbackAgentRegistry(): any {
    return {
      getAgent: async (agentId: string) => {
        logger.debug({ agentId }, 'Fallback agent registry: getAgent called');
        return {
          id: agentId,
          transportType: 'stdio',
          status: 'online',
          lastSeen: Date.now(),
          httpEndpoint: null
        };
      },
      getInstance: () => this.agentRegistry
    };
  }

  /**
   * Create fallback task queue
   */
  private createFallbackTaskQueue(): any {
    const fallbackQueue = new Map<string, any[]>();

    return {
      addTask: async (agentId: string, taskAssignment: any) => {
        logger.debug({ agentId, taskAssignment }, 'Fallback task queue: addTask called');
        if (!fallbackQueue.has(agentId)) {
          fallbackQueue.set(agentId, []);
        }
        fallbackQueue.get(agentId)!.push(taskAssignment);
        return `task-${Date.now()}`;
      },
      getInstance: () => this.taskQueue
    };
  }

  /**
   * Create fallback response processor
   */
  private createFallbackResponseProcessor(): any {
    return {
      getAgentResponses: async (agentId: string) => {
        logger.debug({ agentId }, 'Fallback response processor: getAgentResponses called');
        return [];
      },
      getInstance: () => this.responseProcessor
    };
  }

  async sendTask(agentId: string, taskPayload: string): Promise<boolean> {
    try {
      // Ensure dependencies are ready before operation
      await this.ensureDependencies();

      // Verify agent exists and is registered
      const agent = await this.agentRegistry.getAgent(agentId);
      if (!agent) {
        logger.error({ agentId }, 'Agent not found - cannot send task');
        return false;
      }

      // Parse task ID from payload for tracking
      const taskId = this.extractTaskIdFromPayload(taskPayload);

      // Create task assignment
      const taskAssignment = {
        sentinelPayload: taskPayload,
        priority: 'normal' as const,
        estimatedDuration: 1800000, // 30 minutes default
        metadata: {
          assignedBy: 'agent-orchestrator',
          assignedAt: Date.now()
        }
      };

      // Route task based on transport type
      let success = false;
      switch (agent.transportType) {
        case 'stdio':
          // Add task to queue for polling
          await this.taskQueue.addTask(agentId, taskAssignment);
          success = true;
          break;

        case 'sse':
          // Add task to queue for polling AND send immediate SSE notification
          await this.taskQueue.addTask(agentId, taskAssignment);

          // Send immediate SSE notification if agent has active session
          const sessionId = agent.metadata?.preferences?.sessionId;
          if (this.sseNotifier && sessionId) {
            try {
              await this.sseNotifier.sendEvent(sessionId, 'taskAssigned', {
                agentId,
                taskId,
                taskPayload,
                priority: taskAssignment.priority,
                assignedAt: taskAssignment.metadata.assignedAt,
                deadline: taskAssignment.metadata.assignedAt + (24 * 60 * 60 * 1000), // Default 24 hour deadline
                metadata: taskAssignment.metadata
              });

              logger.info({ agentId, taskId, sessionId }, 'Task sent to agent via SSE notification');

              // Also broadcast task assignment update for monitoring
              await this.sseNotifier.broadcastEvent('taskAssignmentUpdate', {
                agentId,
                taskId,
                priority: taskAssignment.priority,
                assignedAt: taskAssignment.metadata.assignedAt,
                transportType: 'sse'
              });

            } catch (sseError) {
              logger.warn({ err: sseError, agentId, taskId }, 'SSE task notification failed, task still queued for polling');
            }
          } else {
            logger.debug({
              agentId,
              taskId,
              hasSSENotifier: !!this.sseNotifier,
              hasSessionId: !!sessionId
            }, 'SSE notification not available, task queued for polling only');
          }

          success = true;
          break;

        case 'websocket':
          // Send directly via WebSocket
          if (this.websocketServer && this.websocketServer.isAgentConnected(agentId)) {
            try {
              success = await this.websocketServer.sendTaskToAgent(agentId, {
                taskId,
                sentinelPayload: taskPayload,
                priority: taskAssignment.priority,
                assignedAt: taskAssignment.metadata.assignedAt
              });

              if (success) {
                logger.info({ agentId, taskId }, 'Task sent to agent via WebSocket');
              } else {
                logger.warn({ agentId, taskId }, 'WebSocket task delivery returned false, falling back to task queue');
                await this.taskQueue.addTask(agentId, taskAssignment);
                success = true;
              }
            } catch (error) {
              logger.warn({ err: error, agentId }, 'WebSocket task delivery failed, falling back to task queue');
              // Fallback to task queue for WebSocket failures
              await this.taskQueue.addTask(agentId, taskAssignment);
              success = true;
            }
          } else {
            logger.warn({
              agentId,
              hasWebSocketServer: !!this.websocketServer,
              isAgentConnected: this.websocketServer ? this.websocketServer.isAgentConnected(agentId) : false
            }, 'WebSocket server not available or agent not connected, falling back to task queue');
            // Fallback to task queue if WebSocket not available
            await this.taskQueue.addTask(agentId, taskAssignment);
            success = true;
          }
          break;

        case 'http':
          // Send to agent's HTTP endpoint
          if (this.httpAgentAPI && this.httpAgentAPI.deliverTaskToAgent && agent.httpEndpoint) {
            try {
              success = await this.httpAgentAPI.deliverTaskToAgent(agent, {
                agentId,
                taskId,
                taskPayload,
                priority: taskAssignment.priority
              });

              if (success) {
                logger.info({ agentId, taskId, httpEndpoint: agent.httpEndpoint }, 'Task sent to agent via HTTP');
              } else {
                logger.warn({ agentId, taskId, httpEndpoint: agent.httpEndpoint }, 'HTTP task delivery returned false, falling back to task queue');
                await this.taskQueue.addTask(agentId, taskAssignment);
                success = true;
              }
            } catch (error) {
              logger.warn({ err: error, agentId, httpEndpoint: agent.httpEndpoint }, 'HTTP task delivery failed, falling back to task queue');
              // Fallback to task queue for HTTP failures
              await this.taskQueue.addTask(agentId, taskAssignment);
              success = true;
            }
          } else {
            logger.warn({
              agentId,
              hasHttpAPI: !!this.httpAgentAPI,
              hasDeliverMethod: !!(this.httpAgentAPI && this.httpAgentAPI.deliverTaskToAgent),
              hasEndpoint: !!agent.httpEndpoint,
              httpEndpoint: agent.httpEndpoint
            }, 'HTTP API not available or agent has no endpoint, falling back to task queue');
            // Fallback to task queue if HTTP not available
            await this.taskQueue.addTask(agentId, taskAssignment);
            success = true;
          }
          break;

        default:
          logger.error({ agentId, transportType: agent.transportType }, 'Unknown transport type');
          return false;
      }

      if (success) {
        logger.info({
          agentId,
          taskId,
          transportType: agent.transportType,
          payloadLength: taskPayload.length
        }, 'Task sent to agent via universal communication channel');
      }

      return success;

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to send task to agent');
      return false;
    }
  }

  async receiveResponse(agentId: string, timeout: number = 30000): Promise<string> {
    try {
      // Ensure dependencies are ready before operation
      await this.ensureDependencies();

      const startTime = Date.now();

      // Poll for agent responses
      while (Date.now() - startTime < timeout) {
        const responses = await this.responseProcessor.getAgentResponses(agentId);

        // Find the most recent response
        if (responses.length > 0) {
          const latestResponse = responses[responses.length - 1];

          // Format response in expected format
          const formattedResponse = this.formatAgentResponse(latestResponse);

          logger.debug({
            agentId,
            taskId: latestResponse.taskId,
            status: latestResponse.status
          }, 'Agent response received');

          return formattedResponse;
        }

        // Wait 100ms before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      throw new Error(`Timeout waiting for response from agent ${agentId}`);

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to receive response from agent');
      throw error;
    }
  }

  async isAgentReachable(agentId: string): Promise<boolean> {
    try {
      // Ensure dependencies are ready before operation
      await this.ensureDependencies();

      const agent = await this.agentRegistry.getAgent(agentId);
      if (!agent) {
        return false;
      }

      // Transport-specific reachability checks
      let isReachable = false;
      const now = Date.now();
      const lastSeen = agent.lastSeen || 0;
      const maxInactivity = 5 * 60 * 1000; // 5 minutes

      switch (agent.transportType) {
        case 'stdio':
        case 'sse':
          // Check if agent is online and recently active
          isReachable = agent.status === 'online' && (now - lastSeen) < maxInactivity;
          break;

        case 'websocket':
          // Check WebSocket connection status
          if (this.websocketServer) {
            isReachable = this.websocketServer.isAgentConnected(agentId) &&
                         agent.status === 'online' &&
                         (now - lastSeen) < maxInactivity;
          }
          break;

        case 'http':
          // For HTTP agents, check last heartbeat/polling activity and endpoint availability
          const hasHttpEndpoint = !!(agent.httpEndpoint && this.httpAgentAPI);
          isReachable = agent.status === 'online' &&
                       (now - lastSeen) < maxInactivity &&
                       hasHttpEndpoint;

          if (!hasHttpEndpoint) {
            logger.debug({
              agentId,
              hasEndpoint: !!agent.httpEndpoint,
              hasHttpAPI: !!this.httpAgentAPI
            }, 'HTTP agent missing endpoint or API service');
          }
          break;

        default:
          isReachable = false;
      }

      logger.debug({
        agentId,
        transportType: agent.transportType,
        status: agent.status,
        lastSeen: new Date(lastSeen).toISOString(),
        isReachable
      }, 'Agent reachability check');

      return isReachable;

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to check agent reachability');
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      logger.info('Universal agent communication channel closed');
      // No cleanup needed for the universal channel
      // Individual components manage their own lifecycle
    } catch (error) {
      logger.error({ err: error }, 'Error closing universal communication channel');
    }
  }

  /**
   * Ensure transport services are started
   */
  private async ensureTransportServicesStarted(): Promise<void> {
    try {
      // Check if any transport services are running
      const hasRunningTransports = transportManager.isTransportRunning('websocket') ||
                                   transportManager.isTransportRunning('http') ||
                                   transportManager.isTransportRunning('sse') ||
                                   transportManager.isTransportRunning('stdio');

      if (!hasRunningTransports) {
        logger.info('No transport services running, starting transport services...');

        // Configure and start transport services
        transportManager.configure({
          websocket: { enabled: true, port: 8080, path: '/agent-ws' },
          http: { enabled: true, port: 3001, cors: true },
          sse: { enabled: true },
          stdio: { enabled: true }
        });

        await transportManager.startAll();
        logger.info('Transport services started successfully');
      } else {
        logger.debug('Transport services already running');
      }

      // Verify WebSocket and HTTP services are available
      const allocatedPorts = transportManager.getAllocatedPorts();

      if (!allocatedPorts.websocket && this.websocketServer) {
        logger.warn('WebSocket service not allocated port, may not be available');
      }

      if (!allocatedPorts.http && this.httpAgentAPI) {
        logger.warn('HTTP service not allocated port, may not be available');
      }

    } catch (error) {
      logger.warn({ err: error }, 'Failed to ensure transport services are started, continuing with fallback');
    }
  }

  /**
   * Log transport endpoint information using dynamic port allocation
   */
  private logTransportEndpoints(): void {
    try {
      const allocatedPorts = transportManager.getAllocatedPorts();
      const endpoints = transportManager.getServiceEndpoints();

      logger.info({
        allocatedPorts,
        endpoints,
        note: 'Agent orchestrator using dynamic port allocation'
      }, 'Transport endpoints available for agent communication');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to get transport endpoint information');
    }
  }

  /**
   * Get transport status for agent communication
   */
  getTransportStatus(): {
    websocket: { available: boolean; port?: number; endpoint?: string };
    http: { available: boolean; port?: number; endpoint?: string };
    sse: { available: boolean; port?: number; endpoint?: string };
    stdio: { available: boolean };
  } {
    try {
      const allocatedPorts = transportManager.getAllocatedPorts();
      const endpoints = transportManager.getServiceEndpoints();

      return {
        websocket: {
          available: !!allocatedPorts.websocket,
          port: allocatedPorts.websocket,
          endpoint: endpoints.websocket
        },
        http: {
          available: !!allocatedPorts.http,
          port: allocatedPorts.http,
          endpoint: endpoints.http
        },
        sse: {
          available: !!allocatedPorts.sse,
          port: allocatedPorts.sse,
          endpoint: endpoints.sse
        },
        stdio: {
          available: true // stdio is always available
        }
      };
    } catch (error) {
      logger.warn({ err: error }, 'Failed to get transport status');
      return {
        websocket: { available: false },
        http: { available: false },
        sse: { available: false },
        stdio: { available: true }
      };
    }
  }

  private extractTaskIdFromPayload(taskPayload: string): string {
    try {
      const lines = taskPayload.split('\n');
      const jsonStart = lines.findIndex(line => line.includes('{'));
      const jsonEnd = lines.findIndex(line => line.includes('### VIBE_TASK_END'));

      if (jsonStart === -1 || jsonEnd === -1) {
        return 'unknown';
      }

      const jsonPayload = lines.slice(jsonStart, jsonEnd).join('\n');
      const taskData = JSON.parse(jsonPayload);
      return taskData.metadata?.task_id || taskData.task?.id || 'unknown';

    } catch (error) {
      logger.debug({ err: error }, 'Failed to extract task ID from payload');
      return 'unknown';
    }
  }

  /**
   * Get agent responses through unified processor
   */
  async getAgentResponses(agentId: string): Promise<any[]> {
    try {
      // Import AgentResponseProcessor dynamically
      const { AgentResponseProcessor } = await import('../../agent-response/index.js');
      const responseProcessor = AgentResponseProcessor.getInstance();

      // Get responses for all tasks assigned to this agent
      const agentResponses: any[] = [];

      // Note: this.assignments is from the AgentOrchestrator class, not UniversalAgentCommunicationChannel
      // We need to access the orchestrator instance to get assignments
      const orchestrator = AgentOrchestrator.getInstance();

      for (const [taskId, assignment] of orchestrator.getAssignmentsMap().entries()) {
        if (assignment.agentId === agentId) {
          const response = await responseProcessor.getResponse(taskId);
          if (response) {
            agentResponses.push(response);
          }
        }
      }

      return agentResponses;

    } catch (error) {
      logger.warn({ err: error, agentId }, 'Failed to get agent responses through unified processor');
      return [];
    }
  }

  private formatAgentResponse(response: any): string {
    try {
      // Convert agent response to expected Sentinel Protocol format
      let formattedResponse = `VIBE_STATUS: ${response.status}\n`;

      if (response.response) {
        formattedResponse += response.response;
      }

      if (response.completionDetails) {
        const details = response.completionDetails;
        if (details.filesModified && details.filesModified.length > 0) {
          formattedResponse += `\nFiles modified: ${details.filesModified.join(', ')}`;
        }
        if (details.testsPass !== undefined) {
          formattedResponse += `\nTests passed: ${details.testsPass}`;
        }
        if (details.buildSuccessful !== undefined) {
          formattedResponse += `\nBuild successful: ${details.buildSuccessful}`;
        }
        if (details.executionTime) {
          formattedResponse += `\nExecution time: ${details.executionTime}ms`;
        }
        if (details.errorDetails) {
          formattedResponse += `\nError details: ${details.errorDetails}`;
        }
      }

      return formattedResponse;

    } catch (error) {
      logger.error({ err: error }, 'Failed to format agent response');
      return `VIBE_STATUS: ERROR\nFailed to format response: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

/**
 * Agent Orchestrator Service
 */
export class AgentOrchestrator {
  private static instance: AgentOrchestrator | null = null;
  private static isInitializing = false; // Initialization guard to prevent circular initialization

  private agents = new Map<string, AgentInfo>();
  private assignments = new Map<string, TaskAssignment>();
  private taskQueue: string[] = [];
  private sentinelProtocol: SentinelProtocol;
  private memoryManager: MemoryManager;
  private config: OrchestratorConfig;
  private heartbeatTimer?: NodeJS.Timeout;
  private agentHeartbeatMisses = new Map<string, number>(); // Track missed heartbeats per agent
  private integrationBridge: AgentIntegrationBridge;
  private workflowAwareManager: WorkflowAwareAgentManager;
  private isBridgeRegistration = false; // Flag to prevent circular registration

  // New execution tracking and communication
  private activeExecutions = new Map<string, TaskExecutionResult>();
  private communicationChannel: AgentCommunicationChannel;
  private executionMonitors = new Map<string, NodeJS.Timeout>();
  private sseNotifier: any;

  // Task completion callbacks
  private taskCompletionCallbacks = new Map<string, (taskId: string, success: boolean, details?: any) => Promise<void>>();

  private constructor(config?: Partial<OrchestratorConfig>) {
    // Get timeout manager for better defaults
    const timeoutManager = getTimeoutManager();

    this.config = {
      heartbeatInterval: 30000, // 30 seconds
      taskTimeout: timeoutManager.getTimeout('taskExecution'), // Use configurable timeout
      maxRetries: timeoutManager.getRetryConfig().maxRetries, // Use configurable retries
      loadBalancingStrategy: 'capability_based',
      enableHealthChecks: true,
      conflictResolutionStrategy: 'queue',
      heartbeatTimeoutMultiplier: 3, // 3 missed heartbeats = offline
      enableAdaptiveTimeouts: true, // Enable complexity-based timeouts
      maxHeartbeatMisses: 5, // Allow up to 5 missed heartbeats with exponential backoff
      ...config
    };

    this.sentinelProtocol = new SentinelProtocol({
      timeout_minutes: this.config.taskTimeout / 60000
    });

    this.memoryManager = new MemoryManager();
    this.communicationChannel = new UniversalAgentCommunicationChannel();
    this.integrationBridge = AgentIntegrationBridge.getInstance();
    this.workflowAwareManager = WorkflowAwareAgentManager.getInstance({
      baseHeartbeatInterval: this.config.heartbeatInterval,
      enableAdaptiveTimeouts: this.config.enableAdaptiveTimeouts,
      maxGracePeriods: this.config.maxHeartbeatMisses
    });

    // Initialize SSE notifier asynchronously
    this.initializeSSENotifier().catch(error => {
      logger.warn({ err: error }, 'Failed to initialize SSE notifier');
    });

    this.startHeartbeatMonitoring();

    // Start workflow-aware agent monitoring
    this.workflowAwareManager.startMonitoring().catch(error => {
      logger.warn({ err: error }, 'Failed to start workflow-aware agent monitoring');
    });

    // Start agent synchronization
    this.integrationBridge.startAutoSync(60000); // Sync every minute

    // Register scheduler callback for task completion notifications
    this.registerSchedulerCallback().catch(error => {
      logger.warn({ err: error }, 'Failed to register scheduler callback during initialization');
    });

    logger.info({ config: this.config }, 'Agent orchestrator initialized with integration bridge');
  }

  /**
   * Initialize SSE notifier
   */
  private async initializeSSENotifier(): Promise<void> {
    try {
      const { sseNotifier } = await import('../../../services/sse-notifier/index.js');
      this.sseNotifier = sseNotifier;
      logger.debug('SSE notifier initialized for agent orchestrator');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to initialize SSE notifier');
      this.sseNotifier = null;
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<OrchestratorConfig>): AgentOrchestrator {
    if (AgentOrchestrator.isInitializing) {
      logger.warn('Circular initialization detected in AgentOrchestrator, using safe fallback');
      return AgentOrchestrator.createSafeFallback();
    }

    if (!AgentOrchestrator.instance) {
      const monitor = InitializationMonitor.getInstance();
      monitor.startServiceInitialization('AgentOrchestrator', [
        'TransportManager',
        'MemoryManager',
        'AgentIntegrationBridge',
        'WorkflowAwareAgentManager'
      ], { config });

      AgentOrchestrator.isInitializing = true;
      try {
        monitor.startPhase('AgentOrchestrator', 'constructor');
        AgentOrchestrator.instance = new AgentOrchestrator(config);
        monitor.endPhase('AgentOrchestrator', 'constructor');

        monitor.endServiceInitialization('AgentOrchestrator');
      } catch (error) {
        monitor.endPhase('AgentOrchestrator', 'constructor', error as Error);
        monitor.endServiceInitialization('AgentOrchestrator', error as Error);
        throw error;
      } finally {
        AgentOrchestrator.isInitializing = false;
      }
    }
    return AgentOrchestrator.instance;
  }

  /**
   * Create safe fallback instance to prevent recursion
   */
  private static createSafeFallback(): AgentOrchestrator {
    const fallback = Object.create(AgentOrchestrator.prototype);

    // Initialize with minimal safe properties
    fallback.agents = new Map();
    fallback.assignments = new Map();
    fallback.taskQueue = [];
    fallback.agentHeartbeatMisses = new Map();
    fallback.isBridgeRegistration = false;

    // Provide safe no-op methods
    fallback.registerAgent = async () => {
      logger.warn('AgentOrchestrator fallback: registerAgent called during initialization');
    };
    fallback.assignTask = async () => {
      logger.warn('AgentOrchestrator fallback: assignTask called during initialization');
      return null;
    };
    fallback.getAgents = async () => {
      logger.warn('AgentOrchestrator fallback: getAgents called during initialization');
      return [];
    };

    return fallback;
  }

  /**
   * Register a new agent (enhanced with integration bridge)
   */
  async registerAgent(agentInfo: Omit<AgentInfo, 'lastHeartbeat' | 'performance'>): Promise<void> {
    const result = await OperationCircuitBreaker.safeExecute(
      `registerAgent_${agentInfo.id}`,
      async () => {
        const fullAgentInfo: AgentInfo = {
          ...agentInfo,
          lastHeartbeat: new Date(),
          performance: {
            tasksCompleted: 0,
            averageCompletionTime: 0,
            successRate: 1.0
          }
        };

        this.agents.set(agentInfo.id, fullAgentInfo);

        // Only trigger integration bridge if this is not already a bridge-initiated registration
        if (!this.isBridgeRegistration) {
          try {
            await this.integrationBridge.registerAgent({
              id: agentInfo.id,
              name: agentInfo.name,
              capabilities: agentInfo.capabilities.map(cap => cap.toString()),
              status: agentInfo.status === 'available' ? 'online' : agentInfo.status as any,
              maxConcurrentTasks: agentInfo.maxConcurrentTasks,
              currentTasks: agentInfo.currentTasks,
              transportType: agentInfo.metadata.preferences?.transportType || 'stdio',
              sessionId: agentInfo.metadata.preferences?.sessionId,
              pollingInterval: agentInfo.metadata.preferences?.pollingInterval,
              registeredAt: Date.now(),
              lastSeen: Date.now(),
              lastHeartbeat: fullAgentInfo.lastHeartbeat,
              performance: fullAgentInfo.performance,
              httpEndpoint: agentInfo.metadata.preferences?.httpEndpoint,
              httpAuthToken: agentInfo.metadata.preferences?.httpAuthToken,
              metadata: agentInfo.metadata
            });

            logger.info({
              agentId: agentInfo.id,
              capabilities: agentInfo.capabilities
            }, 'Agent registered in both orchestrator and registry via integration bridge');
          } catch (bridgeError) {
            logger.warn({ err: bridgeError, agentId: agentInfo.id }, 'Integration bridge registration failed, agent registered in orchestrator only');
          }
        }

        // Trigger memory cleanup if needed
        this.memoryManager.getMemoryStats();

        return true;
      },
      () => {
        logger.warn({ agentId: agentInfo.id }, 'Agent registration failed due to circuit breaker, using fallback (agent not registered)');
        return false;
      },
      {
        failureThreshold: 3,
        timeout: 30000,
        operationTimeout: 10000
      }
    );

    if (!result.success && result.error) {
      throw new AppError('Agent registration failed', { cause: result.error });
    }
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        const errorContext = createErrorContext('AgentOrchestrator', 'unassignTask')
          .agentId(agentId)
          .build();
        throw new ValidationError(
          `Agent not found: ${agentId}`,
          errorContext,
          {
            field: 'agentId',
            expectedFormat: 'Valid agent ID',
            actualValue: agentId
          }
        );
      }

      // Reassign any current tasks
      await this.reassignAgentTasks(agentId);

      this.agents.delete(agentId);

      logger.info({ agentId }, 'Agent unregistered');

    } catch (error) {
      logger.error({ err: error, agentId }, 'Failed to unregister agent');
      throw new AppError('Agent unregistration failed', { cause: error });
    }
  }

  /**
   * Update agent heartbeat (enhanced with workflow awareness)
   */
  updateAgentHeartbeat(agentId: string, status?: AgentInfo['status']): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      const oldStatus = agent.status;
      agent.lastHeartbeat = new Date();
      if (status) {
        agent.status = status;
      }

      // Reset missed heartbeat counter on successful heartbeat
      this.agentHeartbeatMisses.delete(agentId);

      // Update workflow-aware manager with heartbeat
      const agentState = this.workflowAwareManager.getAgentState(agentId);
      if (agentState) {
        // Update progress as heartbeat (maintains current activity)
        this.workflowAwareManager.updateAgentProgress(agentId, agentState.progressPercentage, {
          heartbeatUpdate: new Date(),
          orchestratorStatus: status
        }).catch(error => {
          logger.warn({ err: error, agentId }, 'Failed to update workflow-aware manager on heartbeat');
        });
      } else if (status === 'available') {
        // Register agent as idle if not already tracked
        this.workflowAwareManager.registerAgentActivity(agentId, 'idle', {
          metadata: { autoRegisteredOnHeartbeat: true }
        }).catch(error => {
          logger.warn({ err: error, agentId }, 'Failed to register agent activity on heartbeat');
        });
      }

      // Propagate status change if it changed
      if (status && status !== oldStatus) {
        this.integrationBridge.propagateStatusChange(agentId, status, 'orchestrator')
          .catch(error => {
            logger.warn({ err: error, agentId, status }, 'Failed to propagate status change from heartbeat update');
          });
      }

      logger.debug({ agentId, status }, 'Agent heartbeat updated with workflow awareness');
    }
  }

  /**
   * Get adaptive timeout for task based on complexity
   */
  getAdaptiveTaskTimeout(task: AtomicTask): number {
    if (!this.config.enableAdaptiveTimeouts) {
      return this.config.taskTimeout;
    }

    const timeoutManager = getTimeoutManager();

    // Determine task complexity based on task properties
    const complexity = this.determineTaskComplexity(task);

    // Get estimated hours from task
    const estimatedHours = task.estimatedHours || 1;

    return timeoutManager.getComplexityAdjustedTimeout('taskExecution', complexity, estimatedHours);
  }

  /**
   * Determine task complexity based on task properties
   */
  private determineTaskComplexity(task: AtomicTask): TaskComplexity {
    const estimatedHours = task.estimatedHours || 1;
    const priority = task.priority || 'medium';
    const dependencies = task.dependencies?.length || 0;

    // Complex scoring algorithm
    let complexityScore = 0;

    // Time-based scoring
    if (estimatedHours <= 1) complexityScore += 1;
    else if (estimatedHours <= 4) complexityScore += 2;
    else if (estimatedHours <= 8) complexityScore += 3;
    else complexityScore += 4;

    // Priority-based scoring
    if (priority === 'critical') complexityScore += 2;
    else if (priority === 'high') complexityScore += 1;

    // Dependency-based scoring
    if (dependencies > 5) complexityScore += 2;
    else if (dependencies > 2) complexityScore += 1;

    // Task type scoring (if available)
    if (task.type === 'development' || task.type === 'deployment') complexityScore += 2;
    else if (task.type === 'testing' || task.type === 'documentation') complexityScore -= 1;

    // Map score to complexity
    if (complexityScore <= 2) return 'simple';
    else if (complexityScore <= 4) return 'moderate';
    else if (complexityScore <= 6) return 'complex';
    else return 'critical';
  }

  /**
   * Assign task to best available agent
   */
  async assignTask(
    task: AtomicTask,
    context: ProjectContext,
    epicTitle?: string
  ): Promise<TaskAssignment | null> {
    const errorContext = createErrorContext('AgentOrchestrator', 'assignTask')
      .taskId(task.id)
      .metadata({
        taskType: task.type,
        taskPriority: task.priority,
        availableAgents: this.agents.size,
        queuedTasks: this.taskQueue.length
      })
      .build();

    try {
      // Validate task input
      if (!task.id || task.id.trim() === '') {
        throw new ValidationError(
          'Task ID is required for assignment',
          errorContext,
          {
            field: 'task.id',
            expectedFormat: 'Non-empty string',
            actualValue: task.id
          }
        );
      }

      if (!task.title || task.title.trim() === '') {
        throw new ValidationError(
          'Task title is required for assignment',
          errorContext,
          {
            field: 'task.title',
            expectedFormat: 'Non-empty string',
            actualValue: task.title
          }
        );
      }

      const availableAgent = this.selectBestAgent(task);

      if (!availableAgent) {
        // Check if we have any agents at all
        if (this.agents.size === 0) {
          throw new ResourceError(
            'No agents are registered in the system',
            errorContext,
            {
              resourceType: 'agents',
              availableAmount: 0,
              requiredAmount: 1
            }
          );
        }

        // All agents are busy - add to queue
        this.taskQueue.push(task.id);
        logger.info({ taskId: task.id }, 'Task queued - no available agents');
        return null;
      }

      // Validate agent capabilities match task requirements
      if (task.type && !this.isAgentCapableOfTask(availableAgent, task)) {
        throw new AgentError(
          `Agent ${availableAgent.id} lacks required capabilities for task type: ${task.type}`,
          errorContext,
          {
            agentType: availableAgent.capabilities.join(', '),
            agentStatus: availableAgent.status,
            capabilities: availableAgent.capabilities
          }
        );
      }

      // Create unified assignment
      const assignment: TaskAssignment = {
        id: `assignment_${task.id}_${Date.now()}`,
        taskId: task.id,
        task: task,
        agentId: availableAgent.id,
        assignedAt: new Date(),
        expectedCompletionAt: new Date(Date.now() + this.config.taskTimeout),
        status: 'assigned',
        attempts: 1,
        lastStatusUpdate: new Date(),
        priority: this.mapTaskPriorityToAssignmentPriority(task.priority),
        estimatedDuration: task.estimatedHours * 60 * 60 * 1000, // Convert hours to milliseconds
        deadline: new Date(Date.now() + this.config.taskTimeout),
        context: {
          projectId: task.projectId,
          epicId: task.epicId,
          dependencies: task.dependencies,
          resources: [],
          constraints: []
        },
        metadata: {
          assignedBy: 'agent-orchestrator',
          assignedAt: Date.now(),
          executionId: `exec_${task.id}_${Date.now()}`,
          retryCount: 0,
          maxRetries: this.config.maxRetries
        }
      };

      // Update agent status
      const oldStatus = availableAgent.status;
      availableAgent.currentTasks.push(task.id);
      if (availableAgent.currentTasks.length >= availableAgent.maxConcurrentTasks) {
        availableAgent.status = 'busy';
      }

      // Propagate status change if it changed
      if (availableAgent.status !== oldStatus) {
        this.integrationBridge.propagateStatusChange(availableAgent.id, availableAgent.status, 'orchestrator')
          .catch(error => {
            logger.warn({ err: error, agentId: availableAgent.id, status: availableAgent.status }, 'Failed to propagate status change from task assignment');
          });
      }

      // Propagate task assignment
      this.integrationBridge.propagateTaskStatusChange(availableAgent.id, task.id, 'assigned', 'orchestrator')
        .catch(error => {
          logger.warn({ err: error, agentId: availableAgent.id, taskId: task.id }, 'Failed to propagate task assignment');
        });

      // Store assignment
      this.assignments.set(task.id, assignment);

      // Register task execution activity in workflow-aware manager
      this.workflowAwareManager.registerAgentActivity(availableAgent.id, 'task_execution', {
        workflowId: task.projectId,
        sessionId: (context as any).sessionId || `session_${Date.now()}`,
        expectedDuration: assignment.estimatedDuration,
        isWorkflowCritical: false,
        metadata: {
          taskId: task.id,
          taskType: task.type,
          priority: task.priority,
          assignmentId: assignment.id
        }
      }).catch(error => {
        logger.warn({ err: error, agentId: availableAgent.id, taskId: task.id }, 'Failed to register task execution activity');
      });

      // Format task for agent
      try {
        const taskPayload = this.sentinelProtocol.formatTaskForAgent(task, context, epicTitle);

        logger.info({
          taskId: task.id,
          agentId: availableAgent.id,
          payload: taskPayload.substring(0, 200) + '...'
        }, 'Task assigned to agent with workflow awareness');

      } catch (formatError) {
        // Rollback assignment if formatting fails
        this.assignments.delete(task.id);
        availableAgent.currentTasks = availableAgent.currentTasks.filter(id => id !== task.id);
        if (availableAgent.currentTasks.length < availableAgent.maxConcurrentTasks) {
          availableAgent.status = 'available';
        }

        throw new TaskExecutionError(
          `Failed to format task for agent: ${formatError instanceof Error ? formatError.message : String(formatError)}`,
          errorContext,
          {
            cause: formatError instanceof Error ? formatError : undefined,
            agentCapabilities: availableAgent.capabilities,
            retryable: true
          }
        );
      }

      return assignment;

    } catch (error) {
      if (error instanceof EnhancedError) {
        throw error;
      }

      throw new AgentError(
        `Task assignment failed: ${error instanceof Error ? error.message : String(error)}`,
        errorContext,
        {
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }

  /**
   * Execute task with complete flow: assignment, delivery, monitoring, and result processing
   */
  async executeTask(
    task: AtomicTask,
    context: ProjectContext,
    options: ExecutionOptions = {}
  ): Promise<TaskExecutionResult> {
    const executionId = `exec_${task.id}_${Date.now()}`;
    const startTime = new Date();

    // Validate task inputs
    if (!task.id || task.id.trim() === '') {
      return {
        success: false,
        status: 'failed',
        message: 'Invalid task: Task ID is required',
        startTime,
        endTime: new Date(),
        error: 'Invalid task ID',
        metadata: {
          executionId,
          attempts: 0
        }
      };
    }

    if (!task.title || task.title.trim() === '') {
      return {
        success: false,
        status: 'failed',
        message: 'Invalid task: Task title is required',
        startTime,
        endTime: new Date(),
        error: 'Invalid task title',
        metadata: {
          executionId,
          attempts: 0
        }
      };
    }

    // Set default options
    const execOptions = {
      timeout: this.config.taskTimeout,
      maxRetries: this.config.maxRetries,
      enableMonitoring: true,
      ...options
    };

    logger.info({
      taskId: task.id,
      executionId,
      options: execOptions
    }, 'Starting task execution');

    try {
      // Step 1: Assign task to agent
      const assignment = await this.assignTask(task, context);

      if (!assignment) {
        // No agents available - queue for later execution
        const result: TaskExecutionResult = {
          success: false,
          status: 'queued',
          message: 'No available agents. Task queued for execution when agents become available.',
          startTime,
          queued: true,
          metadata: {
            executionId,
            attempts: 0
          }
        };

        this.activeExecutions.set(executionId, result);
        return result;
      }

      // Step 2: Deliver task to agent
      const taskPayload = this.sentinelProtocol.formatTaskForAgent(task, context);
      const deliverySuccess = await this.communicationChannel.sendTask(assignment.agentId, taskPayload);

      if (!deliverySuccess) {
        // Task delivery failed
        await this.handleExecutionFailure(assignment, 'Task delivery failed');

        return {
          success: false,
          status: 'failed',
          message: 'Failed to deliver task to agent',
          startTime,
          endTime: new Date(),
          assignment,
          error: 'Task delivery failed',
          metadata: {
            executionId,
            attempts: assignment.attempts,
            agentId: assignment.agentId
          }
        };
      }

      // Step 3: Monitor execution and wait for completion
      const result = await this.monitorTaskExecution(assignment, execOptions, executionId, startTime);

      // Step 4: Store and return result
      this.activeExecutions.set(executionId, result);

      logger.info({
        taskId: task.id,
        executionId,
        status: result.status,
        duration: result.endTime ? result.endTime.getTime() - startTime.getTime() : undefined
      }, 'Task execution completed');

      return result;

    } catch (error) {
      logger.error({ err: error, taskId: task.id, executionId }, 'Task execution failed with error');

      const result: TaskExecutionResult = {
        success: false,
        status: 'failed',
        message: `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        startTime,
        endTime: new Date(),
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionId,
          attempts: 1
        }
      };

      this.activeExecutions.set(executionId, result);
      return result;
    }
  }

  /**
   * Monitor task execution with real-time progress tracking
   */
  private async monitorTaskExecution(
    assignment: TaskAssignment,
    options: ExecutionOptions,
    executionId: string,
    startTime: Date
  ): Promise<TaskExecutionResult> {
    const timeout = options.timeout || this.config.taskTimeout;
    const maxRetries = options.maxRetries || this.config.maxRetries;

    return new Promise((resolve) => {
      let attempts = 0;
      let timeoutHandle: NodeJS.Timeout;
      let monitoringHandle: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (monitoringHandle) clearInterval(monitoringHandle);
        this.executionMonitors.delete(executionId);
      };

      const completeExecution = (result: TaskExecutionResult) => {
        cleanup();
        resolve(result);
      };

      // Set up timeout
      timeoutHandle = setTimeout(async () => {
        logger.warn({ taskId: assignment.taskId, executionId }, 'Task execution timeout');

        if (attempts < maxRetries) {
          attempts++;
          logger.info({ taskId: assignment.taskId, attempt: attempts }, 'Retrying task execution');

          // Retry execution
          try {
            const retryResult = await this.retryTaskExecution(assignment, options, executionId, startTime, attempts);
            completeExecution(retryResult);
          } catch (error) {
            completeExecution({
              success: false,
              status: 'failed',
              message: `Retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              startTime,
              endTime: new Date(),
              assignment,
              error: error instanceof Error ? error.message : String(error),
              metadata: {
                executionId,
                attempts,
                agentId: assignment.agentId
              }
            });
          }
        } else {
          completeExecution({
            success: false,
            status: 'timeout',
            message: `Task execution timed out after ${timeout}ms`,
            startTime,
            endTime: new Date(),
            assignment,
            error: 'Execution timeout',
            metadata: {
              executionId,
              attempts,
              totalDuration: Date.now() - startTime.getTime(),
              agentId: assignment.agentId
            }
          });
        }
      }, timeout);

      // Set up monitoring
      if (options.enableMonitoring) {
        monitoringHandle = setInterval(async () => {
          try {
            // Check for agent response
            const responseText = await this.communicationChannel.receiveResponse(assignment.agentId, 1000);

            if (responseText) {
              // Process the response
              const agentResponse = this.sentinelProtocol.parseAgentResponse(responseText, assignment.taskId);

              // Update assignment status based on response
              assignment.lastStatusUpdate = new Date();

              switch (agentResponse.status) {
                case 'DONE':
                  assignment.status = 'completed';
                  completeExecution({
                    success: true,
                    status: 'completed',
                    message: 'Task completed successfully',
                    startTime,
                    endTime: new Date(),
                    assignment,
                    agentResponse,
                    metadata: {
                      executionId,
                      attempts: attempts + 1,
                      totalDuration: Date.now() - startTime.getTime(),
                      agentId: assignment.agentId
                    }
                  });
                  break;

                case 'IN_PROGRESS':
                  assignment.status = 'in_progress';
                  logger.debug({
                    taskId: assignment.taskId,
                    progress: agentResponse.progress_percentage
                  }, 'Task progress update');
                  break;

                case 'FAILED':
                  assignment.status = 'failed';
                  completeExecution({
                    success: false,
                    status: 'failed',
                    message: agentResponse.message || 'Task failed',
                    startTime,
                    endTime: new Date(),
                    assignment,
                    agentResponse,
                    error: agentResponse.message,
                    metadata: {
                      executionId,
                      attempts: attempts + 1,
                      totalDuration: Date.now() - startTime.getTime(),
                      agentId: assignment.agentId
                    }
                  });
                  break;

                case 'HELP':
                case 'BLOCKED':
                  logger.warn({
                    taskId: assignment.taskId,
                    status: agentResponse.status,
                    details: agentResponse.help_request || agentResponse.blocker_details
                  }, 'Task requires intervention');

                  completeExecution({
                    success: false,
                    status: 'failed',
                    message: `Task ${agentResponse.status.toLowerCase()}: ${agentResponse.message}`,
                    startTime,
                    endTime: new Date(),
                    assignment,
                    agentResponse,
                    error: `Task ${agentResponse.status.toLowerCase()}`,
                    metadata: {
                      executionId,
                      attempts: attempts + 1,
                      totalDuration: Date.now() - startTime.getTime(),
                      agentId: assignment.agentId
                    }
                  });
                  break;
              }
            }
          } catch (error) {
            // No response yet, continue monitoring
            logger.debug({ taskId: assignment.taskId }, 'No agent response yet, continuing to monitor');
          }
        }, 2000); // Check every 2 seconds
      }

      // Store monitoring handle for cleanup if monitoring is enabled
      if (options.enableMonitoring && monitoringHandle) {
        this.executionMonitors.set(executionId, monitoringHandle);
      }
    });
  }

  /**
   * Unified response processing that integrates with AgentResponseProcessor
   */
  async processAgentResponse(responseText: string, agentId: string): Promise<void> {
    try {
      const response = this.sentinelProtocol.parseAgentResponse(responseText);
      const assignment = this.assignments.get(response.task_id);

      if (!assignment) {
        logger.warn({ taskId: response.task_id, agentId }, 'Received response for unknown task');
        return;
      }

      if (assignment.agentId !== agentId) {
        logger.warn({
          taskId: response.task_id,
          expectedAgent: assignment.agentId,
          actualAgent: agentId
        }, 'Response from unexpected agent');
        return;
      }

      // Process response through unified AgentResponseProcessor first
      await this.processResponseThroughUnifiedProcessor(response, agentId, assignment);

      // Update local assignment status
      assignment.lastStatusUpdate = new Date();

      // Handle orchestrator-specific response processing
      switch (response.status) {
        case 'DONE':
          await this.handleTaskCompletion(assignment, response);
          break;

        case 'HELP':
          await this.handleHelpRequest(assignment, response);
          break;

        case 'BLOCKED':
          await this.handleTaskBlocked(assignment, response);
          break;

        case 'IN_PROGRESS':
          assignment.status = 'in_progress';
          break;

        case 'FAILED':
          await this.handleTaskFailure(assignment, response);
          break;
      }

      logger.debug({
        taskId: response.task_id,
        agentId,
        status: response.status
      }, 'Agent response processed through unified handler');

    } catch (error) {
      logger.error({ err: error, agentId, responseText }, 'Failed to process agent response');
      throw new AppError('Agent response processing failed', { cause: error });
    }
  }

  /**
   * Process response through unified AgentResponseProcessor
   */
  private async processResponseThroughUnifiedProcessor(
    response: AgentResponse,
    agentId: string,
    assignment: TaskAssignment
  ): Promise<void> {
    try {
      // Import AgentResponseProcessor dynamically to avoid circular dependencies
      const { AgentResponseProcessor } = await import('../../agent-response/index.js');
      const responseProcessor = AgentResponseProcessor.getInstance();

      // Convert orchestrator response format to unified format
      const unifiedResponse = {
        agentId,
        taskId: response.task_id,
        status: this.mapResponseStatusToUnified(response.status),
        response: response.message || 'Task completed',
        completionDetails: this.extractCompletionDetails(response),
        receivedAt: Date.now()
      };

      // Process through unified processor
      await responseProcessor.processResponse(unifiedResponse);

      logger.debug({
        taskId: response.task_id,
        agentId,
        status: response.status
      }, 'Response processed through unified AgentResponseProcessor');

    } catch (error) {
      logger.warn({ err: error, taskId: response.task_id, agentId },
                  'Failed to process response through unified processor, continuing with local processing');
      // Don't throw - continue with local processing
    }
  }

  /**
   * Map orchestrator response status to unified format
   */
  private mapResponseStatusToUnified(status: string): 'DONE' | 'ERROR' | 'PARTIAL' {
    switch (status) {
      case 'DONE':
        return 'DONE';
      case 'FAILED':
      case 'BLOCKED':
        return 'ERROR';
      case 'IN_PROGRESS':
      case 'HELP':
        return 'PARTIAL';
      default:
        return 'PARTIAL';
    }
  }

  /**
   * Extract completion details from response
   */
  private extractCompletionDetails(response: AgentResponse): any {
    const completionDetails = response.completion_details;

    return {
      executionTime: 0, // Not available in current AgentResponse format
      filesModified: completionDetails?.files_modified || [],
      testsPass: completionDetails?.tests_passed !== false, // Default to true if not specified
      buildSuccessful: completionDetails?.build_successful !== false, // Default to true if not specified
      output: response.message,
      metadata: {
        originalStatus: response.status,
        helpRequest: response.help_request,
        blockerDetails: response.blocker_details,
        notes: completionDetails?.notes
      }
    };
  }

  /**
   * Register task completion callback
   */
  registerTaskCompletionCallback(
    taskId: string,
    callback: (taskId: string, success: boolean, details?: any) => Promise<void>
  ): void {
    this.taskCompletionCallbacks.set(taskId, callback);
    logger.debug({ taskId }, 'Task completion callback registered');
  }

  /**
   * Register scheduler callback for all tasks
   */
  async registerSchedulerCallback(): Promise<void> {
    try {
      // Import TaskScheduler dynamically to avoid circular dependencies
      const { TaskScheduler } = await import('./task-scheduler.js');

      // Create a callback that notifies the scheduler when tasks complete
      const schedulerCallback = async (taskId: string, success: boolean, details?: any) => {
        try {
          // Get the current scheduler instance (if any)
          const currentScheduler = TaskScheduler.getCurrentInstance();
          if (currentScheduler) {
            if (success) {
              await currentScheduler.markTaskCompleted(taskId);
              logger.info({ taskId }, 'Notified scheduler of task completion');
            } else {
              // Handle task failure - could add markTaskFailed method to scheduler
              logger.warn({ taskId, details }, 'Task failed - scheduler notification skipped');
            }
          } else {
            logger.debug({ taskId }, 'No active scheduler instance to notify');
          }
        } catch (error) {
          logger.error({ err: error, taskId }, 'Failed to notify scheduler of task completion');
        }
      };

      // Register this callback for all current assignments
      for (const taskId of this.assignments.keys()) {
        this.registerTaskCompletionCallback(taskId, schedulerCallback);
      }

      logger.info('Scheduler callback registered for all current tasks');

    } catch (error) {
      logger.warn({ err: error }, 'Failed to register scheduler callback');
    }
  }

  /**
   * Trigger task completion callbacks
   */
  private async triggerTaskCompletionCallbacks(
    taskId: string,
    success: boolean,
    details?: any
  ): Promise<void> {
    const callback = this.taskCompletionCallbacks.get(taskId);
    if (callback) {
      try {
        await callback(taskId, success, details);
        logger.debug({ taskId, success }, 'Task completion callback triggered');
      } catch (error) {
        logger.error({ err: error, taskId }, 'Task completion callback failed');
      } finally {
        // Clean up callback after use
        this.taskCompletionCallbacks.delete(taskId);
      }
    }
  }

  /**
   * Get current task assignments map (for unified response processing)
   */
  getAssignmentsMap(): Map<string, TaskAssignment> {
    return this.assignments;
  }

  /**
   * Get agent statistics
   */
  getAgentStats(): {
    totalAgents: number;
    availableAgents: number;
    busyAgents: number;
    offlineAgents: number;
    totalAssignments: number;
    queuedTasks: number;
  } {
    const agents = Array.from(this.agents.values());

    return {
      totalAgents: agents.length,
      availableAgents: agents.filter(a => a.status === 'available').length,
      busyAgents: agents.filter(a => a.status === 'busy').length,
      offlineAgents: agents.filter(a => a.status === 'offline').length,
      totalAssignments: this.assignments.size,
      queuedTasks: this.taskQueue.length
    };
  }

  /**
   * Get all registered agents
   */
  getAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get task assignments
   */
  getAssignments(): TaskAssignment[] {
    return Array.from(this.assignments.values());
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): TaskExecutionResult[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution result by ID
   */
  getExecutionResult(executionId: string): TaskExecutionResult | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Cancel task execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return false;
    }

    // Clean up monitoring
    const monitoringHandle = this.executionMonitors.get(executionId);
    if (monitoringHandle) {
      clearInterval(monitoringHandle);
      this.executionMonitors.delete(executionId);
    }

    // Update execution status
    execution.status = 'failed';
    execution.endTime = new Date();
    execution.error = 'Execution cancelled';
    execution.message = 'Task execution was cancelled';

    logger.info({ executionId }, 'Task execution cancelled');
    return true;
  }

  /**
   * Check if agent is capable of handling the task
   */
  private isAgentCapableOfTask(agent: AgentInfo, task: AtomicTask): boolean {
    // If task has no specific type, any agent can handle it
    if (!task.type) {
      return true;
    }

    // Map task types to required capabilities
    const taskTypeCapabilities: Record<string, string[]> = {
      'frontend': ['frontend', 'development', 'general'],
      'backend': ['backend', 'development', 'general'],
      'database': ['database', 'backend', 'development', 'general'],
      'testing': ['testing', 'general'],
      'deployment': ['devops', 'deployment', 'general'],
      'documentation': ['documentation', 'general'],
      'refactoring': ['refactoring', 'development', 'general'],
      'debugging': ['debugging', 'development', 'general'],
      'development': ['development', 'frontend', 'backend', 'general']
    };

    const requiredCapabilities = taskTypeCapabilities[task.type] || ['general'];

    // Check if agent has any of the required capabilities
    return requiredCapabilities.some(capability =>
      agent.capabilities.includes(capability as AgentCapability)
    );
  }

  /**
   * Map task priority to assignment priority
   */
  private mapTaskPriorityToAssignmentPriority(taskPriority: TaskPriority): 'low' | 'normal' | 'high' | 'urgent' {
    const priorityMap: Record<TaskPriority, 'low' | 'normal' | 'high' | 'urgent'> = {
      'low': 'low',
      'medium': 'normal',
      'high': 'high',
      'critical': 'urgent'
    };
    return priorityMap[taskPriority] || 'normal';
  }

  /**
   * Select best agent for task based on strategy
   */
  private selectBestAgent(task: AtomicTask): AgentInfo | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent =>
        agent.status === 'available' &&
        agent.currentTasks.length < agent.maxConcurrentTasks
      );

    if (availableAgents.length === 0) {
      return null;
    }

    switch (this.config.loadBalancingStrategy) {
      case 'capability_based':
        return this.selectByCapability(availableAgents, task);

      case 'performance_based':
        return this.selectByPerformance(availableAgents);

      case 'round_robin':
      default:
        return availableAgents[0]; // Simple round-robin
    }
  }

  /**
   * Enhanced agent selection by capability matching with load balancing
   */
  private selectByCapability(agents: AgentInfo[], task: AtomicTask): AgentInfo | null {
    // Enhanced capability mapping for different task types
    const taskCapabilityMap: Record<string, string[]> = {
      'frontend': ['frontend', 'development', 'general'],
      'backend': ['backend', 'development', 'general'],
      'database': ['database', 'backend', 'development', 'general'],
      'testing': ['testing', 'general'],
      'deployment': ['devops', 'deployment', 'general'],
      'documentation': ['documentation', 'general'],
      'refactoring': ['refactoring', 'development', 'general'],
      'debugging': ['debugging', 'development', 'general'],
      'development': ['development', 'frontend', 'backend', 'general']
    };

    const requiredCapabilities = taskCapabilityMap[task.type] || ['general'];

    // Find agents with matching capabilities using enhanced matching
    const capableAgents = agents.filter(agent =>
      this.isAgentCapableForTask(agent, task, requiredCapabilities)
    );

    if (capableAgents.length === 0) {
      // No exact capability match, use load balancing on all available agents
      return this.selectByLoadBalancing(agents);
    }

    if (capableAgents.length === 1) {
      return capableAgents[0];
    }

    // Multiple capable agents - use enhanced selection criteria
    return this.selectBestCapableAgent(capableAgents, task);
  }

  /**
   * Enhanced agent capability checking with task context
   */
  private isAgentCapableForTask(agent: AgentInfo, task: AtomicTask, requiredCapabilities: string[]): boolean {
    // Direct capability match
    const hasDirectMatch = requiredCapabilities.some(cap =>
      agent.capabilities.includes(cap as AgentCapability)
    );

    if (hasDirectMatch) {
      return true;
    }

    // Enhanced matching based on task characteristics
    const taskTags = task.tags || [];
    const taskDescription = task.description.toLowerCase();

    // Check for capability matches in tags and description
    for (const capability of agent.capabilities) {
      const capabilityStr = capability.toString();
      if (taskTags.includes(capabilityStr) || taskDescription.includes(capabilityStr)) {
        return true;
      }
    }

    // Special capability mappings for enhanced matching
    const capabilityMappings = new Map([
      ['frontend', ['ui', 'react', 'vue', 'angular', 'css', 'html', 'javascript']],
      ['backend', ['api', 'server', 'database', 'node', 'python', 'java']],
      ['devops', ['deploy', 'docker', 'kubernetes', 'ci/cd', 'pipeline']],
      ['testing', ['test', 'spec', 'unit', 'integration', 'e2e']],
      ['documentation', ['docs', 'readme', 'guide', 'manual']],
      ['research', ['investigate', 'analyze', 'study', 'explore']]
    ]);

    for (const capability of agent.capabilities) {
      const keywords = capabilityMappings.get(capability.toString()) || [];
      if (keywords.some(keyword =>
        taskDescription.includes(keyword) || taskTags.includes(keyword)
      )) {
        return true;
      }
    }

    return false;
  }

  /**
   * Select agent using load balancing criteria
   */
  private selectByLoadBalancing(agents: AgentInfo[]): AgentInfo {
    // Sort by current load (fewer current tasks = lower load)
    return agents.reduce((best, current) => {
      const bestLoad = best.currentTasks.length / best.maxConcurrentTasks;
      const currentLoad = current.currentTasks.length / current.maxConcurrentTasks;

      return currentLoad < bestLoad ? current : best;
    });
  }

  /**
   * Select the best agent from capable agents using multiple criteria
   */
  private selectBestCapableAgent(capableAgents: AgentInfo[], task: AtomicTask): AgentInfo {
    return capableAgents.reduce((best, current) => {
      const bestScore = this.calculateAgentScore(best, task);
      const currentScore = this.calculateAgentScore(current, task);

      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Calculate comprehensive agent score for task assignment
   */
  private calculateAgentScore(agent: AgentInfo, task: AtomicTask): number {
    // Load score (lower load is better)
    const loadRatio = agent.currentTasks.length / agent.maxConcurrentTasks;
    const loadScore = Math.max(0, 1 - loadRatio) * 40; // 40% weight

    // Performance score
    const performanceScore = (
      agent.performance.successRate * 0.6 +
      (1 / Math.max(1, agent.performance.averageCompletionTime / 3600)) * 0.4
    ) * 30; // 30% weight

    // Capability relevance score
    const capabilityScore = this.calculateCapabilityRelevance(agent, task) * 20; // 20% weight

    // Context score (same project/epic bonus)
    const contextScore = this.calculateContextScore(agent, task) * 10; // 10% weight

    return loadScore + performanceScore + capabilityScore + contextScore;
  }

  /**
   * Calculate how relevant an agent's capabilities are for the task
   */
  private calculateCapabilityRelevance(agent: AgentInfo, task: AtomicTask): number {
    const taskType = task.type;
    const taskTags = task.tags || [];
    const taskDescription = task.description.toLowerCase();

    let relevanceScore = 0;

    // Direct task type match
    if (agent.capabilities.some(cap => cap.toString() === taskType)) {
      relevanceScore += 50;
    }

    // Tag matches
    for (const tag of taskTags) {
      if (agent.capabilities.some(cap => cap.toString().includes(tag))) {
        relevanceScore += 10;
      }
    }

    // Description keyword matches
    const keywords = ['frontend', 'backend', 'api', 'database', 'test', 'deploy', 'docs'];
    for (const keyword of keywords) {
      if (taskDescription.includes(keyword)) {
        if (agent.capabilities.some(cap => cap.toString().includes(keyword))) {
          relevanceScore += 5;
        }
      }
    }

    return Math.min(100, relevanceScore); // Cap at 100
  }

  /**
   * Calculate context score based on agent's current work
   */
  private calculateContextScore(agent: AgentInfo, task: AtomicTask): number {
    let contextScore = 0;

    // Check if agent is already working on tasks from the same project/epic
    for (const currentTaskId of agent.currentTasks) {
      // In a real implementation, we would fetch the current task details
      // For now, we'll use a simplified scoring based on task ID patterns
      if (currentTaskId.includes(task.projectId)) {
        contextScore += 30; // Same project bonus
      }
      if (currentTaskId.includes(task.epicId)) {
        contextScore += 20; // Same epic bonus
      }
    }

    return Math.min(100, contextScore); // Cap at 100
  }

  /**
   * Select agent by performance metrics
   */
  private selectByPerformance(agents: AgentInfo[]): AgentInfo {
    return agents.reduce((best, current) => {
      const bestScore = best.performance.successRate * (1 / (best.performance.averageCompletionTime || 1));
      const currentScore = current.performance.successRate * (1 / (current.performance.averageCompletionTime || 1));

      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Handle execution failure
   */
  private async handleExecutionFailure(assignment: TaskAssignment, reason: string): Promise<void> {
    assignment.status = 'failed';
    assignment.lastStatusUpdate = new Date();

    const agent = this.agents.get(assignment.agentId);
    if (agent) {
      // Remove task from agent's current tasks
      agent.currentTasks = agent.currentTasks.filter(id => id !== assignment.taskId);

      // Update agent status if no longer busy
      if (agent.currentTasks.length < agent.maxConcurrentTasks) {
        agent.status = 'available';
      }
    }

    logger.error({
      taskId: assignment.taskId,
      agentId: assignment.agentId,
      reason
    }, 'Task execution failed');
  }

  /**
   * Retry task execution
   */
  private async retryTaskExecution(
    assignment: TaskAssignment,
    options: ExecutionOptions,
    executionId: string,
    startTime: Date,
    attempt: number
  ): Promise<TaskExecutionResult> {
    logger.info({
      taskId: assignment.taskId,
      attempt,
      maxRetries: options.maxRetries
    }, 'Retrying task execution');

    try {
      // Reset assignment status
      assignment.status = 'assigned';
      assignment.attempts = attempt;
      assignment.lastStatusUpdate = new Date();

      // Get task payload again
      const agent = this.agents.get(assignment.agentId);
      if (!agent) {
        throw new Error(`Agent ${assignment.agentId} not found for retry`);
      }

      // For retry, we need to reconstruct the task and context
      // In a full implementation, these would be stored with the assignment
      // For now, return failure since we don't have the original task/context

      return {
        success: false,
        status: 'failed',
        message: `Task retry failed: Original task and context not available for retry attempt ${attempt}`,
        startTime,
        endTime: new Date(),
        assignment,
        error: 'Task and context reconstruction not implemented for retries',
        metadata: {
          executionId,
          attempts: attempt,
          totalDuration: Date.now() - startTime.getTime(),
          agentId: assignment.agentId
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId: assignment.taskId, attempt }, 'Task retry failed');
      throw error;
    }
  }

  /**
   * Handle task completion
   */
  private async handleTaskCompletion(assignment: TaskAssignment, response: AgentResponse): Promise<void> {
    assignment.status = 'completed';

    // Update agent performance
    const agent = this.agents.get(assignment.agentId);
    if (agent) {
      const oldStatus = agent.status;
      agent.performance.tasksCompleted++;
      agent.performance.lastTaskCompletedAt = new Date();

      // Remove task from agent's current tasks
      agent.currentTasks = agent.currentTasks.filter(id => id !== assignment.taskId);

      // Update agent status if no longer busy
      if (agent.currentTasks.length < agent.maxConcurrentTasks) {
        agent.status = 'available';
      }

      // Propagate status change if it changed
      if (agent.status !== oldStatus) {
        this.integrationBridge.propagateStatusChange(agent.id, agent.status, 'orchestrator')
          .catch(error => {
            logger.warn({ err: error, agentId: agent.id, status: agent.status }, 'Failed to propagate status change from task completion');
          });
      }

      // Propagate task completion
      this.integrationBridge.propagateTaskStatusChange(agent.id, assignment.taskId, 'completed', 'orchestrator')
        .catch(error => {
          logger.warn({ err: error, agentId: agent.id, taskId: assignment.taskId }, 'Failed to propagate task completion');
        });

      // Send SSE notification for task completion (moved after completionDetails definition)
      // This will be added after completionDetails is defined
    }

    // Trigger task completion callbacks (notify scheduler)
    const completionDetails = {
      agentId: assignment.agentId,
      duration: Date.now() - assignment.assignedAt.getTime(),
      response: response.message,
      completionDetails: response.completion_details
    };

    await this.triggerTaskCompletionCallbacks(assignment.taskId, true, completionDetails);

    // Send SSE notification for task completion
    if (agent) {
      const sessionId = agent.metadata?.preferences?.sessionId;
      if (this.sseNotifier && sessionId) {
        this.sseNotifier.sendEvent(sessionId, 'taskCompleted', {
          agentId: agent.id,
          taskId: assignment.taskId,
          completedAt: new Date().toISOString(),
          duration: completionDetails.duration,
          response: completionDetails.response
        }).catch((error: any) => {
          logger.warn({ err: error, agentId: agent.id, taskId: assignment.taskId }, 'Failed to send SSE task completion notification');
        });

        // Broadcast task completion for monitoring
        this.sseNotifier.broadcastEvent('taskCompletionUpdate', {
          agentId: agent.id,
          taskId: assignment.taskId,
          status: 'completed',
          completedAt: new Date().toISOString(),
          duration: completionDetails.duration
        }).catch((error: any) => {
          logger.warn({ err: error }, 'Failed to broadcast SSE task completion update');
        });
      }
    }

    // Process next queued task if available
    await this.processTaskQueue();

    logger.info({
      taskId: assignment.taskId,
      agentId: assignment.agentId,
      duration: completionDetails.duration
    }, 'Task completed successfully and callbacks triggered');
  }

  /**
   * Handle help request
   */
  private async handleHelpRequest(assignment: TaskAssignment, response: AgentResponse): Promise<void> {
    logger.warn({
      taskId: assignment.taskId,
      agentId: assignment.agentId,
      helpRequest: response.help_request
    }, 'Agent requested help');

    // For now, just log the help request
    // In a full implementation, this could trigger human intervention
  }

  /**
   * Handle blocked task
   */
  private async handleTaskBlocked(assignment: TaskAssignment, response: AgentResponse): Promise<void> {
    logger.warn({
      taskId: assignment.taskId,
      agentId: assignment.agentId,
      blockerDetails: response.blocker_details
    }, 'Task blocked');

    // For now, just log the blocker
    // In a full implementation, this could trigger dependency resolution
  }

  /**
   * Handle task failure
   */
  private async handleTaskFailure(assignment: TaskAssignment, response: AgentResponse): Promise<void> {
    assignment.status = 'failed';
    assignment.attempts++;

    const agent = this.agents.get(assignment.agentId);
    if (agent) {
      // Remove task from agent's current tasks
      agent.currentTasks = agent.currentTasks.filter(id => id !== assignment.taskId);

      // Update agent status
      if (agent.currentTasks.length < agent.maxConcurrentTasks) {
        agent.status = 'available';
      }
    }

    // Retry if under max attempts
    if (assignment.attempts < this.config.maxRetries) {
      this.taskQueue.unshift(assignment.taskId); // Add to front of queue for retry
      logger.info({
        taskId: assignment.taskId,
        attempt: assignment.attempts
      }, 'Task queued for retry');
    } else {
      // Task failed permanently - trigger failure callbacks
      const failureDetails = {
        agentId: assignment.agentId,
        attempts: assignment.attempts,
        response: response.message,
        error: 'Task failed after max retries'
      };

      await this.triggerTaskCompletionCallbacks(assignment.taskId, false, failureDetails);

      logger.error({
        taskId: assignment.taskId,
        agentId: assignment.agentId,
        attempts: assignment.attempts
      }, 'Task failed after max retries and callbacks triggered');
    }
  }

  /**
   * Reassign tasks from an agent
   */
  private async reassignAgentTasks(agentId: string): Promise<void> {
    const agentAssignments = Array.from(this.assignments.values())
      .filter(assignment =>
        assignment.agentId === agentId &&
        ['assigned', 'in_progress'].includes(assignment.status)
      );

    for (const assignment of agentAssignments) {
      // Add back to queue for reassignment
      this.taskQueue.unshift(assignment.taskId);
      assignment.status = 'failed';

      logger.info({
        taskId: assignment.taskId,
        originalAgent: agentId
      }, 'Task queued for reassignment');
    }

    await this.processTaskQueue();
  }

  /**
   * Process queued tasks
   */
  private async processTaskQueue(): Promise<void> {
    while (this.taskQueue.length > 0) {
      const taskId = this.taskQueue[0];

      // Try to find an available agent
      const availableAgents = Array.from(this.agents.values())
        .filter(agent =>
          agent.status === 'available' &&
          agent.currentTasks.length < agent.maxConcurrentTasks
        );

      if (availableAgents.length === 0) {
        break; // No available agents, stop processing
      }

      // Remove from queue and process
      this.taskQueue.shift();

      // Note: In a full implementation, we'd need to retrieve the task and context
      // For now, just log that we're processing the queue
      logger.debug({ taskId }, 'Processing queued task');
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    if (!this.config.enableHealthChecks) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      this.checkAgentHealth();
    }, this.config.heartbeatInterval);
  }

  /**
   * Check agent health and mark offline if needed
   * Implements exponential backoff for heartbeat tolerance
   */
  private checkAgentHealth(): void {
    const now = new Date();
    const baseHeartbeatInterval = this.config.heartbeatInterval;

    for (const agent of this.agents.values()) {
      const timeSinceHeartbeat = now.getTime() - agent.lastHeartbeat.getTime();
      const agentId = agent.id;

      // Get current missed heartbeat count
      const missedCount = this.agentHeartbeatMisses.get(agentId) || 0;

      // Calculate adaptive timeout with exponential backoff
      const adaptiveTimeout = this.calculateAdaptiveHeartbeatTimeout(missedCount, baseHeartbeatInterval);

      if (timeSinceHeartbeat > adaptiveTimeout) {
        // Increment missed heartbeat count
        const newMissedCount = missedCount + 1;
        this.agentHeartbeatMisses.set(agentId, newMissedCount);

        if (newMissedCount >= this.config.maxHeartbeatMisses && agent.status !== 'offline') {
          // Mark agent as offline after maximum misses
          agent.status = 'offline';
          logger.warn({
            agentId,
            timeSinceHeartbeat,
            missedHeartbeats: newMissedCount,
            adaptiveTimeout
          }, 'Agent marked as offline due to excessive missed heartbeats');

          // Propagate offline status
          this.integrationBridge.propagateStatusChange(agentId, 'offline', 'orchestrator')
            .catch(error => {
              logger.warn({ err: error, agentId }, 'Failed to propagate offline status from health check');
            });

          // Reassign tasks from offline agent
          this.reassignAgentTasks(agentId).catch(error => {
            logger.error({ err: error, agentId }, 'Failed to reassign tasks from offline agent');
          });

          // Reset missed count after marking offline
          this.agentHeartbeatMisses.delete(agentId);
        } else if (newMissedCount < this.config.maxHeartbeatMisses) {
          // Log warning but don't mark offline yet
          logger.warn({
            agentId,
            timeSinceHeartbeat,
            missedHeartbeats: newMissedCount,
            maxMisses: this.config.maxHeartbeatMisses,
            adaptiveTimeout
          }, 'Agent missed heartbeat - applying exponential backoff tolerance');
        }
      }
    }
  }

  /**
   * Calculate adaptive heartbeat timeout with exponential backoff
   */
  private calculateAdaptiveHeartbeatTimeout(missedCount: number, baseInterval: number): number {
    if (missedCount === 0) {
      return baseInterval * this.config.heartbeatTimeoutMultiplier;
    }

    // Exponential backoff: each miss increases tolerance
    const backoffMultiplier = Math.pow(1.5, Math.min(missedCount, 5)); // Cap at 5 for reasonable limits
    return baseInterval * this.config.heartbeatTimeoutMultiplier * backoffMultiplier;
  }

  /**
   * Get transport status for agent communication using dynamic port allocation
   */
  getTransportStatus(): {
    websocket: { available: boolean; port?: number; endpoint?: string };
    http: { available: boolean; port?: number; endpoint?: string };
    sse: { available: boolean; port?: number; endpoint?: string };
    stdio: { available: boolean };
  } {
    if (this.communicationChannel && typeof (this.communicationChannel as any).getTransportStatus === 'function') {
      return (this.communicationChannel as any).getTransportStatus();
    }

    // Fallback: get transport status directly from Transport Manager
    try {
      const allocatedPorts = transportManager.getAllocatedPorts();
      const endpoints = transportManager.getServiceEndpoints();

      return {
        websocket: {
          available: !!allocatedPorts.websocket,
          port: allocatedPorts.websocket,
          endpoint: endpoints.websocket
        },
        http: {
          available: !!allocatedPorts.http,
          port: allocatedPorts.http,
          endpoint: endpoints.http
        },
        sse: {
          available: !!allocatedPorts.sse,
          port: allocatedPorts.sse,
          endpoint: endpoints.sse
        },
        stdio: {
          available: true // stdio is always available
        }
      };
    } catch (error) {
      logger.warn({ err: error }, 'Failed to get transport status from orchestrator');
      return {
        websocket: { available: false },
        http: { available: false },
        sse: { available: false },
        stdio: { available: true }
      };
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Clean up all execution monitors
    for (const [executionId, handle] of this.executionMonitors.entries()) {
      clearInterval(handle);
      logger.debug({ executionId }, 'Cleaned up execution monitor');
    }
    this.executionMonitors.clear();

    // Close communication channel
    if (this.communicationChannel && typeof this.communicationChannel.close === 'function') {
      await this.communicationChannel.close();
    }

    this.agents.clear();
    this.assignments.clear();
    this.activeExecutions.clear();
    this.taskQueue = [];

    AgentOrchestrator.instance = null;
    logger.info('Agent orchestrator destroyed');
  }
}
