import path from 'path';
import fs from 'fs/promises';
import { ZodError } from 'zod';
import { ToolResult, ToolExecutionContext } from '../../types/tools.js';
import logger from '../../logger.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import {
  jobResultInputSchema,
  getCodeRefactorJobResult,
} from './job-result.js';
import { codeRefactorInputSchema, CodeRefactorInput } from './schema.js';
import { generateAsyncJobMessage } from '../../utils/jobMessages.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js';
import { toolRegistry } from '../../services/routing/toolRegistry.js';

// Uses ToolExecutionContext for compatibility with toolRegistry and handler infrastructure
async function generateRefactor(
  params: Record<string, unknown>,
  _config: OpenRouterConfig,
  _context: ToolExecutionContext
): Promise<ToolResult> {
  // Check for async flag
  if (params.async === true) {
    // Create a job and return jobId immediately
    const jobId = jobManager.createJob();
    // Optionally update job with toolName, params, etc. here
    // Start background processing
    setImmediate(async () => {
      try {
        jobManager.updateJobStatus(jobId, JobStatus.RUNNING);
        // Run the refactor logic as in the sync path
        // (copy-paste the main body of the synchronous logic here, minus validation)
        let validatedParams: CodeRefactorInput;
        try {
          validatedParams = codeRefactorInputSchema.parse(params);
        } catch (error) {
          jobManager.failJob(
            jobId,
            error instanceof Error ? error : new Error(String(error))
          );
          return;
        }
        // ... LLM/refactor logic here (reuse/refactor as needed)
        // For brevity, call the same logic as in the sync path, but catch errors and update job status
        let result;
        try {
          result = await runRefactor(validatedParams, _config, _context);
          if (result.isError) {
            jobManager.failJob(
              jobId,
              result.errorDetails instanceof Error 
                ? result.errorDetails 
                : new Error(String(result.errorDetails || 'Unknown error'))
            );
          } else {
            jobManager.completeJob(jobId, result.content);
          }
        } catch (err) {
          jobManager.failJob(
            jobId,
            err instanceof Error ? err : new Error(String(err))
          );
        }
        return;
      } catch (err) {
        jobManager.failJob(
          jobId,
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });
    // --- Use shared utility for async job message ---
    const message = generateAsyncJobMessage({
      jobId,
      toolName: 'code-refactor-generator',
    });
    return {
      isError: false,
      content: [{ type: 'text', text: message }],
      metadata: { jobId },
    };
  }
  // Validate input parameters
  let validatedParams: CodeRefactorInput;
  try {
    validatedParams = codeRefactorInputSchema.parse(params);
  } catch (error) {
    const err = error as ZodError;
    const msg = err.errors?.[0]?.message || 'Invalid input';
    logger.error({ params, error }, 'Invalid input to code-refactor-generator');
    return {
      isError: true,
      content: [{ type: 'text', text: msg }],
      errorDetails: new Error(msg),
    };
  }
  const {
    language,
    codeContent,
    refactoringInstructions,
    contextFilePath: _contextFilePath,
    outputFilePath,
  } = validatedParams;

  logger.info({ params }, 'Generating refactor suggestions');

  // SYNCHRONOUS PATH (unchanged)
  try {
    let prompt = codeContent;
    if (_contextFilePath) {
      try {
        const filePath = path.resolve(_contextFilePath);
        const context = await fs.readFile(filePath, 'utf-8');
        prompt = `${context}\n\n${codeContent}`;
      } catch (fsError) {
        logger.warn(
          { err: fsError },
          `Failed to read context file: ${_contextFilePath}`
        );
      }
    }
    const systemPrompt = `Refactor the following ${language} code to ${refactoringInstructions}`;
    const suggestions = await performDirectLlmCall(
      prompt,
      systemPrompt,
      _config,
      ''
    );
    if (!suggestions?.trim()) {
      const msg = 'Refactoring generation failed: empty response';
      return {
        isError: true,
        content: [{ type: 'text', text: msg }],
        errorDetails: new Error(msg),
      };
    }
    // Write to outputFilePath if specified
    if (outputFilePath) {
      try {
        const resolvedPath = path.resolve(outputFilePath);
        await fs.writeFile(resolvedPath, suggestions, 'utf-8');
        logger.info(
          { outputFilePath: resolvedPath },
          'Wrote refactored code to outputFilePath'
        );
      } catch (writeError) {
        const msg = `Failed to write refactored code to outputFilePath: ${outputFilePath}`;
        logger.error({ err: writeError }, msg);
        return {
          isError: true,
          content: [{ type: 'text', text: msg }],
          errorDetails: new Error(msg),
        };
      }
    }
    return {
      isError: false,
      content: [{ type: 'text', text: suggestions }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      isError: true,
      content: [{ type: 'text', text: msg }],
      errorDetails: new Error(msg),
    };
  }
}

// Helper to encapsulate the refactor logic for reuse in both sync and async paths
async function runRefactor(
  validatedParams: CodeRefactorInput,
  _config: OpenRouterConfig,
  _context: ToolExecutionContext
): Promise<ToolResult> {
  const {
    language,
    codeContent,
    refactoringInstructions,
    contextFilePath: _contextFilePath,
    outputFilePath,
  } = validatedParams;

  logger.info({ params: validatedParams }, 'Generating refactor suggestions');

  try {
    let prompt = codeContent;
    if (_contextFilePath) {
      try {
        const filePath = path.resolve(_contextFilePath);
        const context = await fs.readFile(filePath, 'utf-8');
        prompt = `${context}\n\n${codeContent}`;
      } catch (fsError) {
        logger.warn(
          { err: fsError },
          `Failed to read context file: ${_contextFilePath}`
        );
      }
    }
    const systemPrompt = `Refactor the following ${language} code to ${refactoringInstructions}`;
    const suggestions = await performDirectLlmCall(
      prompt,
      systemPrompt,
      _config,
      ''
    );
    if (!suggestions?.trim()) {
      const msg = 'Refactoring generation failed: empty response';
      return {
        isError: true,
        content: [{ type: 'text', text: msg }],
        errorDetails: new Error(msg),
      };
    }
    // Write to outputFilePath if specified
    if (outputFilePath) {
      try {
        const resolvedPath = path.resolve(outputFilePath);
        await fs.writeFile(resolvedPath, suggestions, 'utf-8');
        logger.info(
          { outputFilePath: resolvedPath },
          'Wrote refactored code to outputFilePath'
        );
      } catch (writeError) {
        const msg = `Failed to write refactored code to outputFilePath: ${outputFilePath}`;
        logger.error({ err: writeError }, msg);
        return {
          isError: true,
          content: [{ type: 'text', text: msg }],
          errorDetails: new Error(msg),
        };
      }
    }
    return {
      isError: false,
      content: [{ type: 'text', text: suggestions }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      isError: true,
      content: [{ type: 'text', text: msg }],
      errorDetails: new Error(msg),
    };
  }
}

// Register main code-refactor-generator tool
toolRegistry.registerTool<OpenRouterConfig>({
  name: 'code-refactor-generator',
  description: 'Suggests improvements for existing code.',
  inputSchema: codeRefactorInputSchema.shape,
  async execute(params, config, context) {
    return generateRefactor(params, config, context);
  },
});

// Register polling tool for code-refactor job status/result
// Allows Studio/Assistant or API clients to poll for async job status using toolRegistry
// Returns status/result/error in ToolResult format
// Usage: { jobId: string }
toolRegistry.registerTool({
  name: 'code-refactor-job-result',
  description: 'Retrieves the status/result of a code-refactor-generator async job by jobId.',
  inputSchema: jobResultInputSchema.shape,
  execute: getCodeRefactorJobResult,
});

// Export alias for tests
export { generateRefactor as generateRefactoring };

// Export a function to retrieve job status/result by job ID
export function getRefactorJobStatus(jobId: string) {
  const job = jobManager.getJob(jobId);
  if (!job) {
    return { status: 'not_found', result: null, error: 'Job not found' };
  }
  return {
    status: job.status,
    result: job.result ?? null,
    error: job.error ? job.error.message : null,
  };
}
