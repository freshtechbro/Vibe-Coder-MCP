/**
 * Context Curator Tool - Main Entry Point
 * 
 * Intelligently analyzes codebases and curates comprehensive context packages for AI-driven development tasks.
 * Generates refined prompts, relevance-ranked files, and meta-prompts for downstream AI agents.
 */

import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolDefinition, ToolExecutor, registerTool, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { validateContextCuratorInput } from './types/context-curator.js';
import { ContextCuratorService } from './services/context-curator-service.js';
import logger from '../../logger.js';
import fs from 'fs-extra';
import path from 'path';

// Helper function to get the base output directory
function getBaseOutputDir(): string {
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'VibeCoderOutput');
}

/**
 * Input schema shape for the Context Curator tool
 * Defines the parameters that users can provide when calling curate-context
 */
const contextCuratorInputSchemaShape = {
  /** The user's development task or request that needs context curation */
  prompt: z.string()
    .min(3, { message: "Prompt must be at least 3 characters long." })
    .describe("The user's development task or request that needs context curation"),
  
  /** Target directory to analyze (defaults to current working directory) */
  target_directory: z.string()
    .optional()
    .describe("Target directory to analyze (defaults to current working directory)"),
  
  /** Maximum token budget for the context package */
  max_token_budget: z.number()
    .min(1000, { message: "Token budget must be at least 1000 tokens." })
    .max(500000, { message: "Token budget cannot exceed 500000 tokens." })
    .optional()
    .describe("Maximum token budget for the context package (default: 250000)"),
  
  /** Type of development task being performed */
  task_type: z.enum(['feature_addition', 'refactoring', 'bug_fix', 'performance_optimization', 'auto_detect'])
    .optional()
    .default('auto_detect')
    .describe("Type of development task (auto_detect will analyze the prompt to determine the task type)"),
  
  /** Whether to include meta-prompt generation for downstream AI agents */
  include_meta_prompt: z.boolean()
    .optional()
    .default(true)
    .describe("Whether to include meta-prompt generation for downstream AI agents"),
  
  /** Output format for the context package */
  output_format: z.enum(['package', 'structured'])
    .optional()
    .default('package')
    .describe("Output format: 'package' for XML context package, 'structured' for JSON analysis")
};

/**
 * Context Curator tool executor function
 * Creates a background job for context curation and returns the job ID
 */
export const contextCuratorExecutor: ToolExecutor = async (
  params: Record<string, unknown>, 
  config: OpenRouterConfig, 
  context?: ToolExecutionContext
): Promise<CallToolResult> => {
  try {
    logger.info({ 
      sessionId: context?.sessionId, 
      conversationId: context?.conversationId,
      prompt: params.prompt 
    }, 'Context Curator tool execution initiated');

    // Map task_type parameter, handling auto_detect case
    let taskType = params.task_type as string || 'general';
    if (taskType === 'auto_detect') {
      // For now, default auto_detect to general - this could be enhanced with prompt analysis
      taskType = 'general';
    }

    // Validate input parameters using our type definitions
    const validatedParams = validateContextCuratorInput({
      userPrompt: params.prompt as string,
      projectPath: (params.target_directory as string === '/' || !params.target_directory) ? process.cwd() : params.target_directory as string,
      taskType: taskType as 'feature_addition' | 'refactoring' | 'bug_fix' | 'performance_optimization' | 'general',
      maxFiles: 100, // Default max files, separate from token budget
      includePatterns: ['**/*'],
      excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      focusAreas: [],
      useCodeMapCache: true,
      codeMapCacheMaxAgeMinutes: 120 // Default 2 hour cache
    });

    logger.debug({
      validatedParams: {
        ...validatedParams,
        userPrompt: validatedParams.userPrompt.substring(0, 100) + '...' // Truncate for logging
      }
    }, 'Input parameters validated successfully');

    // Create a background job for the context curation process
    // Store both original params and validated params for job processing
    const jobParams = {
      ...params,
      validatedParams
    };
    const jobId = jobManager.createJob('curate-context', jobParams);
    
    logger.info({
      jobId,
      sessionId: context?.sessionId,
      taskType: validatedParams.taskType,
      targetDirectory: validatedParams.projectPath
    }, 'Context curation job created successfully');

    // Update job status to indicate processing will begin
    jobManager.updateJobStatus(
      jobId,
      JobStatus.PENDING,
      'Context curation job created and queued for processing',
      0
    );

    // Start background processing
    processContextCurationJob(jobId, validatedParams, config).catch(error => {
      logger.error({ jobId, error: error.message }, 'Background context curation job failed');
      jobManager.updateJobStatus(
        jobId,
        JobStatus.FAILED,
        `Background processing failed: ${error.message}`,
        0
      );
    });

    // Return the job ID for the client to poll for results
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            jobId,
            status: 'initiated',
            message: 'Context curation job has been created. Use get-job-result to check progress and retrieve results.',
            estimatedProcessingTime: '2-5 minutes',
            pollingRecommendation: 'Poll every 10-15 seconds for optimal user experience'
          }, null, 2)
        }
      ],
      isError: false
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    logger.error({ 
      error: errorMessage,
      sessionId: context?.sessionId,
      params: {
        ...params,
        prompt: typeof params.prompt === 'string' ? params.prompt.substring(0, 100) + '...' : params.prompt
      }
    }, 'Context Curator tool execution failed');

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: 'Context curation failed',
            message: errorMessage,
            details: 'Please check your input parameters and try again'
          }, null, 2)
        }
      ],
      isError: true
    };
  }
};

/**
 * Background job processor for Context Curator
 * Executes the complete workflow asynchronously
 */
async function processContextCurationJob(
  jobId: string,
  input: ReturnType<typeof validateContextCuratorInput>,
  config: OpenRouterConfig
): Promise<void> {
  try {
    logger.info({ jobId }, 'Starting background Context Curator job processing');

    // Get the Context Curator service instance
    const contextCuratorService = ContextCuratorService.getInstance();

    // Execute the complete workflow
    const contextPackage = await contextCuratorService.executeWorkflow(jobId, input, config);

    // Set the final result
    const result: CallToolResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            jobId,
            contextPackage: {
              id: contextPackage.id,
              taskType: contextPackage.taskType,
              totalFiles: contextPackage.files.length,
              totalTokens: contextPackage.statistics.totalTokens,
              averageRelevanceScore: contextPackage.statistics.averageRelevanceScore,
              cacheHitRate: contextPackage.statistics.cacheHitRate,
              processingTimeMs: contextPackage.statistics.processingTimeMs,
              outputPath: `VibeCoderOutput/context-curator/context-package-${jobId}.xml`
            },
            message: 'Context curation completed successfully',
            files: contextPackage.files.map(file => ({
              path: file.file.path,
              relevanceScore: file.relevanceScore.score,
              categories: file.categories
            })),
            metaPrompt: {
              systemPrompt: contextPackage.metaPrompt.systemPrompt.substring(0, 200) + '...',
              userPrompt: contextPackage.metaPrompt.userPrompt.substring(0, 200) + '...',
              estimatedComplexity: contextPackage.metaPrompt.estimatedComplexity,
              epicsCount: contextPackage.metaPrompt.taskDecomposition.epics.length,
              guidelinesCount: contextPackage.metaPrompt.guidelines.length
            }
          }, null, 2)
        }
      ],
      isError: false
    };

    jobManager.setJobResult(jobId, result);
    logger.info({
      jobId,
      totalFiles: contextPackage.files.length,
      processingTime: contextPackage.statistics.processingTimeMs
    }, 'Context Curator job completed successfully');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ jobId, error: errorMessage }, 'Context Curator job failed');

    const errorResult: CallToolResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            jobId,
            error: 'Context curation failed',
            message: errorMessage,
            details: 'The context curation workflow encountered an error during processing'
          }, null, 2)
        }
      ],
      isError: true
    };

    jobManager.setJobResult(jobId, errorResult);
  }
}

/**
 * Tool definition for the Context Curator
 * Defines the tool's metadata, input schema, and executor function
 */
const contextCuratorToolDefinition: ToolDefinition = {
  name: "curate-context",
  description: "Intelligently analyzes codebases and curates comprehensive context packages for AI-driven development tasks. Generates refined prompts, relevance-ranked files, and meta-prompts for downstream AI agents. Supports automatic task type detection, file relevance scoring, content optimization, and XML output formatting for seamless integration with AI development workflows.",
  inputSchema: contextCuratorInputSchemaShape,
  executor: contextCuratorExecutor,
};

/**
 * Initialize directories for Context Curator output
 * Creates the necessary directory structure for storing context packages
 */
export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir);
    const toolDir = path.join(baseOutputDir, 'context-curator');
    await fs.ensureDir(toolDir);
    logger.debug(`Ensured context-curator directory exists: ${toolDir}`);
  } catch (error) {
    logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for context-curator.`);
  }
}

// Register the Context Curator tool with the tool registry
registerTool(contextCuratorToolDefinition);

logger.info('Context Curator tool registered successfully');

// Export the tool definition and executor for testing and integration
export { contextCuratorToolDefinition, contextCuratorInputSchemaShape };
