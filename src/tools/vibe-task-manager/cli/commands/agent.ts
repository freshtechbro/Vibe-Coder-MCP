/**
 * Agent CLI Commands
 *
 * Implements CLI commands for agent interaction including task claiming,
 * completion reporting, help requests, and blocker reporting.
 */

import { Command } from 'commander';
import { AgentOrchestrator } from '../../services/agent-orchestrator.js';
import { TaskStreamer } from '../../services/task-streamer.js';
import { FeedbackProcessor } from '../../services/feedback-processor.js';
import { CLIUtils } from '../commands/index.js';
import { ValidationError } from '../../../../utils/errors.js';
import { AgentCapability } from '../../services/agent-orchestrator.js';
import logger from '../../../../logger.js';

/**
 * Create agent command group
 */
export function createAgentCommand(): Command {
  const agentCmd = new Command('agent');

  agentCmd
    .description('Agent interaction commands for task execution')
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str)
    });

  // Add subcommands
  agentCmd.addCommand(createRegisterCommand());
  agentCmd.addCommand(createClaimCommand());
  agentCmd.addCommand(createCompleteCommand());
  agentCmd.addCommand(createHelpCommand());
  agentCmd.addCommand(createBlockCommand());
  agentCmd.addCommand(createStatusCommand());
  agentCmd.addCommand(createListCommand());

  return agentCmd;
}

/**
 * Register agent command
 */
function createRegisterCommand(): Command {
  return new Command('register')
    .description('Register a new agent with the system')
    .requiredOption('-i, --id <id>', 'Unique agent identifier')
    .requiredOption('-n, --name <name>', 'Agent display name')
    .option('-c, --capabilities <capabilities>', 'Comma-separated list of capabilities', 'general')
    .option('-m, --max-tasks <number>', 'Maximum concurrent tasks', '3')
    .option('-v, --version <version>', 'Agent version', '1.0.0')
    .action(async (options) => {
      try {
        const orchestrator = AgentOrchestrator.getInstance();

        const capabilities = CLIUtils.parseTags(options.capabilities);
        const maxConcurrentTasks = parseInt(options.maxTasks, 10);

        if (isNaN(maxConcurrentTasks) || maxConcurrentTasks < 1) {
          CLIUtils.error('Max tasks must be a positive number');
        }

        await orchestrator.registerAgent({
          id: options.id,
          name: options.name,
          capabilities: capabilities as AgentCapability[],
          maxConcurrentTasks,
          currentTasks: [],
          status: 'available',
          metadata: {
            version: options.version,
            supportedProtocols: ['sentinel-1.0'],
            preferences: {}
          }
        });

        CLIUtils.success(`Agent '${options.name}' (${options.id}) registered successfully`);

        logger.info({
          agentId: options.id,
          capabilities,
          maxTasks: maxConcurrentTasks
        }, 'Agent registered via CLI');

      } catch (error) {
        logger.error({ err: error }, 'Agent registration failed');

        if (error instanceof ValidationError) {
          CLIUtils.error(error.message);
        } else {
          CLIUtils.error('Failed to register agent. Check logs for details.');
        }
      }
    });
}

/**
 * Claim task command
 */
function createClaimCommand(): Command {
  return new Command('claim')
    .description('Claim a task for execution')
    .requiredOption('-a, --agent-id <id>', 'Agent identifier')
    .option('-t, --task-id <id>', 'Specific task ID to claim')
    .option('-l, --limit <number>', 'Maximum number of tasks to claim', '1')
    .action(async (options) => {
      try {
        const streamer = TaskStreamer.getInstance();
        const limit = parseInt(options.limit, 10);

        if (options.taskId) {
          // Claim specific task
          const claim = await streamer.claimTask(options.taskId, options.agentId);

          if (claim) {
            CLIUtils.success(`Task ${options.taskId} claimed successfully`);
            console.log(`Claim expires at: ${CLIUtils.formatDate(claim.expiresAt)}`);
          } else {
            CLIUtils.warning(`Task ${options.taskId} could not be claimed (may be already claimed or not available)`);
          }
        } else {
          // Claim available tasks
          const readyTasks = await streamer.getReadyTasks(limit);

          if (readyTasks.length === 0) {
            CLIUtils.info('No tasks available for claiming');
            return;
          }

          let claimedCount = 0;
          for (const task of readyTasks) {
            const claim = await streamer.claimTask(task.id, options.agentId);
            if (claim) {
              claimedCount++;
              console.log(`✓ Claimed task: ${task.id} - ${task.title}`);
            }
          }

          if (claimedCount > 0) {
            CLIUtils.success(`Claimed ${claimedCount} task(s)`);
          } else {
            CLIUtils.warning('No tasks could be claimed');
          }
        }

        logger.info({
          agentId: options.agentId,
          taskId: options.taskId,
          limit
        }, 'Task claim attempted via CLI');

      } catch (error) {
        logger.error({ err: error }, 'Task claim failed');
        CLIUtils.error('Failed to claim task. Check logs for details.');
      }
    });
}

/**
 * Complete task command
 */
function createCompleteCommand(): Command {
  return new Command('complete')
    .description('Mark a task as completed')
    .requiredOption('-a, --agent-id <id>', 'Agent identifier')
    .requiredOption('-t, --task-id <id>', 'Task identifier')
    .option('-m, --message <message>', 'Completion message')
    .option('-f, --files <files>', 'Comma-separated list of modified files')
    .option('--tests-passed', 'Indicate that tests passed')
    .option('--build-successful', 'Indicate that build was successful')
    .action(async (options) => {
      try {
        const processor = FeedbackProcessor.getInstance();

        // Format completion response
        const completionMessage = [
          'VIBE_STATUS: DONE',
          options.message || 'Task completed successfully'
        ];

        if (options.files) {
          completionMessage.push(`Files modified: ${options.files}`);
        }

        if (options.testsPasssed) {
          completionMessage.push('Tests passed: true');
        }

        if (options.buildSuccessful) {
          completionMessage.push('Build successful: true');
        }

        const responseText = completionMessage.join('\n');

        await processor.processFeedback(responseText, options.agentId, options.taskId);

        // Release the task claim
        const streamer = TaskStreamer.getInstance();
        await streamer.releaseTask(options.taskId, options.agentId);

        CLIUtils.success(`Task ${options.taskId} marked as completed`);

        logger.info({
          agentId: options.agentId,
          taskId: options.taskId,
          message: options.message
        }, 'Task completion reported via CLI');

      } catch (error) {
        logger.error({ err: error }, 'Task completion failed');
        CLIUtils.error('Failed to mark task as completed. Check logs for details.');
      }
    });
}

/**
 * Request help command
 */
function createHelpCommand(): Command {
  return new Command('help-request')
    .description('Request help for a task')
    .requiredOption('-a, --agent-id <id>', 'Agent identifier')
    .requiredOption('-t, --task-id <id>', 'Task identifier')
    .requiredOption('-d, --description <description>', 'Issue description')
    .option('-s, --solutions <solutions>', 'Comma-separated list of attempted solutions')
    .option('-q, --questions <questions>', 'Comma-separated list of specific questions')
    .action(async (options) => {
      try {
        const processor = FeedbackProcessor.getInstance();

        // Format help request response
        const helpMessage = [
          'VIBE_STATUS: HELP',
          `Issue: ${options.description}`
        ];

        if (options.solutions) {
          const solutions = CLIUtils.parseTags(options.solutions);
          helpMessage.push(`Attempted solutions: ${solutions.join(', ')}`);
        }

        if (options.questions) {
          const questions = CLIUtils.parseTags(options.questions);
          helpMessage.push(`Questions: ${questions.join(', ')}`);
        }

        const responseText = helpMessage.join('\n');

        await processor.processFeedback(responseText, options.agentId, options.taskId);

        CLIUtils.info(`Help request submitted for task ${options.taskId}`);
        CLIUtils.info('A human operator will review your request and provide assistance.');

        logger.info({
          agentId: options.agentId,
          taskId: options.taskId,
          description: options.description
        }, 'Help request submitted via CLI');

      } catch (error) {
        logger.error({ err: error }, 'Help request failed');
        CLIUtils.error('Failed to submit help request. Check logs for details.');
      }
    });
}

/**
 * Report blocker command
 */
function createBlockCommand(): Command {
  return new Command('block')
    .description('Report a task blocker')
    .requiredOption('-a, --agent-id <id>', 'Agent identifier')
    .requiredOption('-t, --task-id <id>', 'Task identifier')
    .requiredOption('-d, --description <description>', 'Blocker description')
    .option('-T, --type <type>', 'Blocker type (dependency|resource|technical|clarification)', 'technical')
    .option('-r, --resolution <resolution>', 'Suggested resolution')
    .action(async (options) => {
      try {
        const processor = FeedbackProcessor.getInstance();

        // Validate blocker type
        const validTypes = ['dependency', 'resource', 'technical', 'clarification'];
        if (!validTypes.includes(options.type)) {
          CLIUtils.error(`Invalid blocker type. Must be one of: ${validTypes.join(', ')}`);
        }

        // Format blocker response
        const blockerMessage = [
          'VIBE_STATUS: BLOCKED',
          `Type: ${options.type}`,
          `Description: ${options.description}`
        ];

        if (options.resolution) {
          blockerMessage.push(`Suggested resolution: ${options.resolution}`);
        }

        const responseText = blockerMessage.join('\n');

        await processor.processFeedback(responseText, options.agentId, options.taskId);

        CLIUtils.warning(`Blocker reported for task ${options.taskId}`);
        CLIUtils.info('The blocker will be reviewed and addressed by the development team.');

        logger.warn({
          agentId: options.agentId,
          taskId: options.taskId,
          type: options.type,
          description: options.description
        }, 'Blocker reported via CLI');

      } catch (error) {
        logger.error({ err: error }, 'Blocker reporting failed');
        CLIUtils.error('Failed to report blocker. Check logs for details.');
      }
    });
}

/**
 * Agent status command
 */
function createStatusCommand(): Command {
  return new Command('status')
    .description('Show agent status and statistics')
    .option('-a, --agent-id <id>', 'Specific agent ID')
    .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
    .action(async (options) => {
      try {
        const orchestrator = AgentOrchestrator.getInstance();
        const processor = FeedbackProcessor.getInstance();

        if (options.agentId) {
          // Show specific agent status
          const agents = orchestrator.getAgents();
          const agent = agents.find(a => a.id === options.agentId);

          if (!agent) {
            CLIUtils.error(`Agent not found: ${options.agentId}`);
          }

          const performance = processor.getAgentPerformance(options.agentId);

          const agentStatus = {
            id: agent.id,
            name: agent.name,
            status: agent.status,
            capabilities: agent.capabilities.join(', '),
            currentTasks: agent.currentTasks.length,
            maxTasks: agent.maxConcurrentTasks,
            lastHeartbeat: CLIUtils.formatDate(agent.lastHeartbeat),
            tasksCompleted: performance?.tasksCompleted || 0,
            successRate: performance ? `${(performance.successRate * 100).toFixed(1)}%` : 'N/A',
            performanceScore: performance ? performance.performanceScore.toFixed(2) : 'N/A'
          };

          console.log(CLIUtils.formatOutput(agentStatus, options.format as 'table' | 'json' | 'yaml'));
        } else {
          // Show all agents status
          const agents = orchestrator.getAgents();
          const stats = orchestrator.getAgentStats();

          console.log('=== Agent System Status ===');
          console.log(`Total Agents: ${stats.totalAgents}`);
          console.log(`Available: ${stats.availableAgents}`);
          console.log(`Busy: ${stats.busyAgents}`);
          console.log(`Offline: ${stats.offlineAgents}`);
          console.log(`Active Assignments: ${stats.totalAssignments}`);
          console.log(`Queued Tasks: ${stats.queuedTasks}`);
          console.log('');

          if (agents.length > 0) {
            const agentList = agents.map(agent => ({
              id: agent.id,
              name: agent.name,
              status: agent.status,
              tasks: `${agent.currentTasks.length}/${agent.maxConcurrentTasks}`,
              capabilities: agent.capabilities.slice(0, 3).join(', ') + (agent.capabilities.length > 3 ? '...' : '')
            }));

            console.log('=== Registered Agents ===');
            console.log(CLIUtils.formatOutput(agentList, options.format as 'table' | 'json' | 'yaml'));
          }
        }

      } catch (error) {
        logger.error({ err: error }, 'Agent status retrieval failed');
        CLIUtils.error('Failed to retrieve agent status. Check logs for details.');
      }
    });
}

/**
 * List tasks command
 */
function createListCommand(): Command {
  return new Command('list')
    .description('List available tasks or agent assignments')
    .option('-a, --agent-id <id>', 'Show tasks for specific agent')
    .option('-s, --status <status>', 'Filter by status (ready|claimed|assigned)')
    .option('-l, --limit <number>', 'Maximum number of tasks to show', '10')
    .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
    .action(async (options) => {
      try {
        const streamer = TaskStreamer.getInstance();
        const orchestrator = AgentOrchestrator.getInstance();
        const limit = parseInt(options.limit, 10);

        if (options.agentId) {
          // Show tasks for specific agent
          const assignments = orchestrator.getAssignments()
            .filter(assignment => assignment.agentId === options.agentId)
            .slice(0, limit);

          if (assignments.length === 0) {
            CLIUtils.info(`No assignments found for agent ${options.agentId}`);
            return;
          }

          const taskList = assignments.map(assignment => ({
            taskId: assignment.taskId,
            status: assignment.status,
            assignedAt: CLIUtils.formatDate(assignment.assignedAt),
            expectedCompletion: CLIUtils.formatDate(assignment.expectedCompletionAt),
            attempts: assignment.attempts
          }));

          console.log(`=== Tasks for Agent ${options.agentId} ===`);
          console.log(CLIUtils.formatOutput(taskList, options.format as 'table' | 'json' | 'yaml'));

        } else {
          // Show available tasks
          const readyTasks = await streamer.getReadyTasks(limit);
          const queueInfo = streamer.getQueueInfo();

          console.log('=== Task Queue Status ===');
          console.log(`Total Tasks: ${queueInfo.totalTasks}`);
          console.log(`High Priority: ${queueInfo.highPriorityTasks}`);
          console.log(`Claimed Tasks: ${queueInfo.claimedTasks}`);
          console.log(`Oldest Task Age: ${Math.round(queueInfo.oldestTaskAge / 1000 / 60)} minutes`);
          console.log('');

          if (readyTasks.length > 0) {
            const taskList = readyTasks.map(task => ({
              id: task.id,
              title: CLIUtils.truncate(task.title, 40),
              type: task.type,
              priority: task.priority,
              estimatedHours: task.estimatedHours || 'N/A',
              dependencies: task.dependencies?.length || 0
            }));

            console.log('=== Ready Tasks ===');
            console.log(CLIUtils.formatOutput(taskList, options.format as 'table' | 'json' | 'yaml'));
          } else {
            CLIUtils.info('No tasks ready for execution');
          }
        }

      } catch (error) {
        logger.error({ err: error }, 'Task listing failed');
        CLIUtils.error('Failed to list tasks. Check logs for details.');
      }
    });
}

// Export the main command
export const agentCommand = createAgentCommand();
