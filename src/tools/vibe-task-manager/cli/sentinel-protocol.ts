/**
 * Sentinel Protocol Implementation
 *
 * Implements sentinel-based communication protocol for AI agents.
 * Uses structured markers and JSON payloads for efficient task delivery.
 */

import { AtomicTask } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';
import { AppError, ValidationError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Agent response status types
 */
export type AgentStatus = 'DONE' | 'HELP' | 'BLOCKED' | 'IN_PROGRESS' | 'FAILED';

/**
 * Task payload structure for agent communication
 */
export interface TaskPayload {
  task: AtomicTask;
  context: {
    project_name: string;
    epic_title: string;
    codebase_context: string;
    related_files: string[];
    dependencies: string[];
  };
  instructions: {
    implementation_guide: string;
    acceptance_criteria: string[];
    completion_signal: string;
    timeout_minutes: number;
  };
  metadata: {
    protocol_version: string;
    task_id: string;
    timestamp: string;
    priority: number;
  };
}

/**
 * Agent response structure
 */
export interface AgentResponse {
  status: AgentStatus;
  task_id: string;
  agent_id?: string;
  message?: string;
  progress_percentage?: number;
  completion_details?: {
    files_modified: string[];
    tests_passed: boolean;
    build_successful: boolean;
    notes: string;
  };
  help_request?: {
    issue_description: string;
    attempted_solutions: string[];
    specific_questions: string[];
  };
  blocker_details?: {
    blocker_type: 'dependency' | 'resource' | 'technical' | 'clarification';
    description: string;
    suggested_resolution: string;
  };
  timestamp: string;
}

/**
 * Protocol configuration
 */
export interface ProtocolConfig {
  version: string;
  timeout_minutes: number;
  max_retries: number;
  enable_compression: boolean;
  validate_responses: boolean;
}

/**
 * Sentinel Protocol Implementation
 */
export class SentinelProtocol {
  private static readonly PROTOCOL_VERSION = '1.0.0';
  private static readonly TASK_START_MARKER = '### VIBE_TASK_START';
  private static readonly TASK_END_MARKER = '### VIBE_TASK_END';
  private static readonly STATUS_PREFIX = 'VIBE_STATUS:';

  private config: ProtocolConfig;

  constructor(config?: Partial<ProtocolConfig>) {
    this.config = {
      version: SentinelProtocol.PROTOCOL_VERSION,
      timeout_minutes: 30,
      max_retries: 3,
      enable_compression: false,
      validate_responses: true,
      ...config
    };

    logger.debug({ config: this.config }, 'Sentinel protocol initialized');
  }

  /**
   * Format task for agent delivery
   */
  formatTaskForAgent(
    task: AtomicTask,
    context: ProjectContext,
    epicTitle?: string
  ): string {
    try {
      const payload: TaskPayload = {
        task,
        context: {
          project_name: context.projectName,
          epic_title: epicTitle || 'Unknown Epic',
          codebase_context: this.summarizeCodebaseContext(context),
          related_files: context.entryPoints || [],
          dependencies: task.dependencies || []
        },
        instructions: {
          implementation_guide: this.generateImplementationGuide(task),
          acceptance_criteria: task.acceptanceCriteria || [],
          completion_signal: `${SentinelProtocol.STATUS_PREFIX} DONE`,
          timeout_minutes: this.config.timeout_minutes
        },
        metadata: {
          protocol_version: this.config.version,
          task_id: task.id,
          timestamp: new Date().toISOString(),
          priority: this.mapPriorityToNumber(task.priority)
        }
      };

      const jsonPayload = JSON.stringify(payload, null, 2);

      return [
        SentinelProtocol.TASK_START_MARKER,
        jsonPayload,
        SentinelProtocol.TASK_END_MARKER,
        '',
        '**Instructions for AI Agent:**',
        '1. Read the task payload above carefully',
        '2. Implement the required functionality',
        '3. Follow the acceptance criteria exactly',
        '4. When complete, respond with: VIBE_STATUS: DONE',
        '5. If you need help, respond with: VIBE_STATUS: HELP',
        '6. If blocked, respond with: VIBE_STATUS: BLOCKED',
        '',
        '**Response Format:**',
        'VIBE_STATUS: [DONE|HELP|BLOCKED]',
        'Additional details can follow...'
      ].join('\n');

    } catch (error) {
      logger.error({ err: error, taskId: task.id }, 'Failed to format task for agent');
      throw new AppError('Failed to format task for agent delivery', { cause: error });
    }
  }

  /**
   * Parse agent response from text
   */
  parseAgentResponse(responseText: string, expectedTaskId?: string): AgentResponse {
    try {
      const lines = responseText.split('\n');
      let status: AgentStatus | null = null;
      let message = '';
      let taskId = expectedTaskId || '';

      // Find status line
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith(SentinelProtocol.STATUS_PREFIX)) {
          const statusPart = trimmedLine.substring(SentinelProtocol.STATUS_PREFIX.length).trim();
          status = this.parseStatus(statusPart);
          break;
        }
      }

      if (!status) {
        throw new ValidationError('No valid status found in agent response');
      }

      // Extract message (everything after status line)
      const statusLineIndex = lines.findIndex(line =>
        line.trim().startsWith(SentinelProtocol.STATUS_PREFIX)
      );

      if (statusLineIndex >= 0 && statusLineIndex < lines.length - 1) {
        message = lines.slice(statusLineIndex + 1).join('\n').trim();
      }

      const response: AgentResponse = {
        status,
        task_id: taskId,
        message,
        timestamp: new Date().toISOString()
      };

      // Parse additional details based on status
      if (status === 'DONE') {
        response.completion_details = this.parseCompletionDetails(message);
      } else if (status === 'HELP') {
        response.help_request = this.parseHelpRequest(message);
      } else if (status === 'BLOCKED') {
        response.blocker_details = this.parseBlockerDetails(message);
      }

      if (this.config.validate_responses) {
        this.validateResponse(response);
      }

      logger.debug({ response }, 'Parsed agent response');
      return response;

    } catch (error) {
      logger.error({ err: error, responseText }, 'Failed to parse agent response');
      throw new ValidationError('Invalid agent response format', undefined, { cause: error });
    }
  }

  /**
   * Validate agent response structure
   */
  validateResponse(response: AgentResponse): void {
    if (!response.status || !['DONE', 'HELP', 'BLOCKED', 'IN_PROGRESS', 'FAILED'].includes(response.status)) {
      throw new ValidationError(`Invalid agent status: ${response.status}`);
    }

    if (!response.task_id) {
      throw new ValidationError('Missing task_id in agent response');
    }

    if (!response.timestamp) {
      throw new ValidationError('Missing timestamp in agent response');
    }

    // Validate status-specific requirements
    if (response.status === 'DONE' && !response.completion_details) {
      logger.warn({ taskId: response.task_id }, 'DONE response missing completion details');
    }

    if (response.status === 'HELP' && !response.help_request) {
      logger.warn({ taskId: response.task_id }, 'HELP response missing help request details');
    }

    if (response.status === 'BLOCKED' && !response.blocker_details) {
      logger.warn({ taskId: response.task_id }, 'BLOCKED response missing blocker details');
    }
  }

  /**
   * Generate implementation guide for task
   */
  private generateImplementationGuide(task: AtomicTask): string {
    const guide = [
      `**Task: ${task.title}**`,
      '',
      `**Description:**`,
      task.description,
      '',
      `**Type:** ${task.type}`,
      `**Priority:** ${task.priority}`,
      `**Estimated Duration:** ${task.estimatedHours || 'Not specified'} hours`,
      ''
    ];

    if (task.dependencies && task.dependencies.length > 0) {
      guide.push('**Dependencies:**');
      task.dependencies.forEach(dep => guide.push(`- ${dep}`));
      guide.push('');
    }

    if (task.tags && task.tags.length > 0) {
      guide.push(`**Tags:** ${task.tags.join(', ')}`);
      guide.push('');
    }

    guide.push('**Implementation Notes:**');
    guide.push('- Follow existing code patterns and conventions');
    guide.push('- Write comprehensive tests for new functionality');
    guide.push('- Update documentation as needed');
    guide.push('- Ensure all acceptance criteria are met');

    return guide.join('\n');
  }

  /**
   * Summarize codebase context for agent
   */
  private summarizeCodebaseContext(context: ProjectContext): string {
    const summary = [
      `Project: ${context.projectName}`,
      `Architecture: ${context.architecturalPatterns?.join(', ') || 'Not specified'}`,
      `Tech Stack: ${context.frameworks?.join(', ') || 'Not specified'}`
    ];

    if (context.languages && context.languages.length > 0) {
      summary.push(`Languages: ${context.languages.join(', ')}`);
    }

    return summary.join('\n');
  }

  /**
   * Map task priority to numeric value
   */
  private mapPriorityToNumber(priority: string | undefined): number {
    const priorityMap: Record<string, number> = {
      'critical': 1,
      'high': 2,
      'medium': 3,
      'low': 4
    };

    if (!priority || typeof priority !== 'string') {
      return 3; // Default to medium priority
    }

    return priorityMap[priority.toLowerCase()] || 3;
  }

  /**
   * Parse status from status line
   */
  private parseStatus(statusText: string): AgentStatus {
    const status = statusText.toUpperCase().trim();

    if (['DONE', 'HELP', 'BLOCKED', 'IN_PROGRESS', 'FAILED'].includes(status)) {
      return status as AgentStatus;
    }

    throw new ValidationError(`Invalid agent status: ${status}`);
  }

  /**
   * Parse completion details from message
   */
  private parseCompletionDetails(message: string): TaskPayload['instructions'] & { files_modified: string[]; tests_passed: boolean; build_successful: boolean; notes: string } {
    // Simple parsing - could be enhanced with more sophisticated parsing
    return {
      files_modified: [],
      tests_passed: message.toLowerCase().includes('tests pass'),
      build_successful: message.toLowerCase().includes('build success'),
      notes: message,
      implementation_guide: '',
      acceptance_criteria: [],
      completion_signal: '',
      timeout_minutes: 0
    };
  }

  /**
   * Parse help request from message
   */
  private parseHelpRequest(message: string): AgentResponse['help_request'] {
    return {
      issue_description: message,
      attempted_solutions: [],
      specific_questions: []
    };
  }

  /**
   * Parse blocker details from message
   */
  private parseBlockerDetails(message: string): AgentResponse['blocker_details'] {
    return {
      blocker_type: 'technical',
      description: message,
      suggested_resolution: 'Manual intervention required'
    };
  }

  /**
   * Get protocol configuration
   */
  getConfig(): ProtocolConfig {
    return { ...this.config };
  }

  /**
   * Update protocol configuration
   */
  updateConfig(updates: Partial<ProtocolConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.debug({ config: this.config }, 'Protocol configuration updated');
  }
}
