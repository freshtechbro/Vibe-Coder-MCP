import { z } from 'zod';

import logger from '../../logger.js';
import { jobManager } from '../../services/job-manager/index.js';
import {
  ToolExecutionContext,
  toolRegistry,
} from '../../services/routing/toolRegistry.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { ToolResult, ToolDefinition } from '../../types/tools.js';

import { TEMPLATES_DIR } from './config.js'; // Import the centralized template directory path
import { CommandExecutor } from './services/command-executor.js';
import { FileGenerator } from './services/file-generator.js';
import { Template, TemplateRegistry } from './templates/template-registry.js';
import { generateAsyncJobMessage } from '../../utils/jobMessages.js';

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface StarterKitParams {
  template: string;
  name: string;
  description: string;
  features: string[];
  outputDir: string;
  sessionId: string;
}

async function generateStarterKit(
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { sessionId } = context;
  const jobId = jobManager.createJob();

  // --- Use shared utility for async job message ---
  const message = generateAsyncJobMessage({
    jobId,
    toolName: 'fullstack-starter-kit-generator',
  });
  
  // Start the background job processing
  setImmediate(async () => {
    try {
      // Start job
      jobManager.startJob(jobId);
      sseNotifier.notify('job_status', {
        type: 'JOB_STARTED',
        jobId,
        message: 'Initializing starter kit generation...',
      });

      // Load template
      sseNotifier.notify('job_status', {
        type: 'JOB_PROGRESS',
        jobId,
        message: `Loading template: ${params.template}`,
      });

      // Generate files
      sseNotifier.notify('job_status', {
        type: 'JOB_PROGRESS',
        jobId,
        message: 'Generating starter kit using AI...',
      });

      // Get template
      const templateRegistry = TemplateRegistry.getInstance(TEMPLATES_DIR);
      const templateObject = await templateRegistry.getTemplate(
        params.template as string
      );
      if (!templateObject) {
        throw new Error(`Template "${params.template}" not found.`);
      }

      // Instantiate FileGenerator service
      const fileGenerator = new FileGenerator(
        { outputDir: params.outputDir as string },
        (progress) => {
          sseNotifier.notify('job_status', {
            type: 'JOB_PROGRESS',
            jobId,
            message: `File generation progress: ${progress.message}`,
          });
        }
      );

      // Map input parameters to data
      const templateData = {
        name: params.name as string,
        description: params.description as string,
        features: params.features as string[],
      };

      // Call FileGenerator.generateFiles(...)
      await fileGenerator.generateFiles(templateObject, templateData);

      // Instantiate CommandExecutor service (if needed for post-generation steps)
      const commandExecutor = new CommandExecutor({
        cwd: params.outputDir as string,
      });

      // Call CommandExecutor.execute(...) - Example: npm install
      sseNotifier.notify('job_status', {
        type: 'JOB_PROGRESS',
        jobId,
        message: 'Running post-generation commands (e.g., npm install)...',
      });
      await commandExecutor.execute('npm install');

      // Complete job
      const successResult = {
        content: [
          {
            type: 'success',
            text: 'Starter kit generated successfully',
          },
        ],
        isError: false,
        metadata: {
          jobId,
          template: params.template,
        },
      };

      jobManager.completeJob(jobId, successResult);
      sseNotifier.notify('job_status', {
        type: 'JOB_COMPLETED',
        jobId,
        message: 'Starter kit generated successfully',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorResult = {
        content: [
          {
            type: 'error',
            text: errorMessage,
          },
        ],
        isError: true,
        errorDetails: {
          code: 'GENERATION_ERROR',
          message: errorMessage,
          details: error,
        },
      };

      jobManager.failJob(
        jobId,
        error instanceof Error ? error : new Error(String(error))
      );
      sseNotifier.notify('job_status', {
        type: 'JOB_FAILED',
        jobId,
        message: errorMessage,
      });
    }
  });

  // Return jobId and interactive message immediately
  return {
    isError: false,
    content: [{ type: 'text', text: message }],
    metadata: { jobId },
  };
}

// Register the starter kit generator tool
toolRegistry.registerTool({
  name: 'fullstack-starter-kit-generator',
  description:
    'Sets up a new full-stack project from a template (runs in background).',
  inputSchema: {
    template: z.string(),
    name: z.string(),
    description: z.string(),
    features: z.array(z.string()),
    outputDir: z.string(),
    sessionId: z.string(),
  },
  execute: generateStarterKit,
});

// Export for test imports
export { generateStarterKit };
