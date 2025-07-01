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
import { validateContextPackage, ProcessedFile, FileReference } from './types/output-package.js';
import logger from '../../logger.js';
import fs from 'fs-extra';
import path from 'path';

// Type-safe helper functions to extract properties from unknown context packages
function getPackageId(pkg: unknown): string | undefined {
  if (validateContextPackage(pkg)) {
    return pkg.metadata.targetDirectory;
  }
  if (typeof pkg === 'object' && pkg !== null && 'id' in pkg) {
    return typeof pkg.id === 'string' ? pkg.id : undefined;
  }
  return undefined;
}

function getTaskType(pkg: unknown): string {
  if (validateContextPackage(pkg)) {
    return pkg.metadata.taskType;
  }
  if (typeof pkg === 'object' && pkg !== null && 'metadata' in pkg) {
    const metadata = pkg.metadata;
    if (typeof metadata === 'object' && metadata !== null && 'taskType' in metadata) {
      return typeof metadata.taskType === 'string' ? metadata.taskType : 'general';
    }
  }
  return 'general';
}

function getTotalFiles(pkg: unknown): number {
  if (validateContextPackage(pkg)) {
    return pkg.highPriorityFiles.length + pkg.mediumPriorityFiles.length + pkg.lowPriorityFiles.length;
  }
  if (typeof pkg === 'object' && pkg !== null) {
    if ('files' in pkg && Array.isArray(pkg.files)) {
      return pkg.files.length;
    }
    let total = 0;
    if ('highPriorityFiles' in pkg && Array.isArray(pkg.highPriorityFiles)) total += pkg.highPriorityFiles.length;
    if ('mediumPriorityFiles' in pkg && Array.isArray(pkg.mediumPriorityFiles)) total += pkg.mediumPriorityFiles.length;
    if ('lowPriorityFiles' in pkg && Array.isArray(pkg.lowPriorityFiles)) total += pkg.lowPriorityFiles.length;
    return total;
  }
  return 0;
}

function getTotalTokens(pkg: unknown): number {
  if (validateContextPackage(pkg)) {
    return pkg.metadata.totalTokenEstimate;
  }
  if (typeof pkg === 'object' && pkg !== null) {
    if ('statistics' in pkg && typeof pkg.statistics === 'object' && pkg.statistics !== null && 'totalTokens' in pkg.statistics) {
      return typeof pkg.statistics.totalTokens === 'number' ? pkg.statistics.totalTokens : 0;
    }
    if ('metadata' in pkg && typeof pkg.metadata === 'object' && pkg.metadata !== null && 'totalTokenEstimate' in pkg.metadata) {
      return typeof pkg.metadata.totalTokenEstimate === 'number' ? pkg.metadata.totalTokenEstimate : 0;
    }
  }
  return 0;
}

function getAverageRelevanceScore(pkg: unknown): number {
  if (typeof pkg === 'object' && pkg !== null && 'statistics' in pkg) {
    const stats = pkg.statistics;
    if (typeof stats === 'object' && stats !== null && 'averageRelevanceScore' in stats) {
      return typeof stats.averageRelevanceScore === 'number' ? stats.averageRelevanceScore : 0;
    }
  }
  return 0;
}

function getCacheHitRate(pkg: unknown): number {
  if (typeof pkg === 'object' && pkg !== null && 'statistics' in pkg) {
    const stats = pkg.statistics;
    if (typeof stats === 'object' && stats !== null && 'cacheHitRate' in stats) {
      return typeof stats.cacheHitRate === 'number' ? stats.cacheHitRate : 0;
    }
  }
  return 0;
}

function getProcessingTimeMs(pkg: unknown): number {
  if (validateContextPackage(pkg)) {
    return pkg.metadata.processingTimeMs;
  }
  if (typeof pkg === 'object' && pkg !== null) {
    if ('statistics' in pkg && typeof pkg.statistics === 'object' && pkg.statistics !== null && 'processingTimeMs' in pkg.statistics) {
      return typeof pkg.statistics.processingTimeMs === 'number' ? pkg.statistics.processingTimeMs : 0;
    }
    if ('metadata' in pkg && typeof pkg.metadata === 'object' && pkg.metadata !== null && 'processingTimeMs' in pkg.metadata) {
      return typeof pkg.metadata.processingTimeMs === 'number' ? pkg.metadata.processingTimeMs : 0;
    }
  }
  return 0;
}

function getPackageFiles(pkg: unknown): Array<ProcessedFile | FileReference | unknown> {
  if (validateContextPackage(pkg)) {
    return [...pkg.highPriorityFiles, ...pkg.mediumPriorityFiles, ...pkg.lowPriorityFiles];
  }
  if (typeof pkg === 'object' && pkg !== null && 'files' in pkg && Array.isArray(pkg.files)) {
    return pkg.files;
  }
  return [];
}

function getFilePath(file: unknown): string {
  if (typeof file === 'object' && file !== null) {
    if ('path' in file && typeof file.path === 'string') return file.path;
    if ('file' in file && typeof file.file === 'object' && file.file !== null && 'path' in file.file && typeof file.file.path === 'string') {
      return file.file.path;
    }
  }
  return 'unknown';
}

function getFileRelevanceScore(file: unknown): number {
  if (typeof file === 'object' && file !== null) {
    if ('relevanceScore' in file) {
      if (typeof file.relevanceScore === 'number') return file.relevanceScore;
      if (typeof file.relevanceScore === 'object' && file.relevanceScore !== null && 'score' in file.relevanceScore) {
        return typeof file.relevanceScore.score === 'number' ? file.relevanceScore.score : 0;
      }
      if (typeof file.relevanceScore === 'object' && file.relevanceScore !== null && 'overall' in file.relevanceScore) {
        return typeof file.relevanceScore.overall === 'number' ? file.relevanceScore.overall : 0;
      }
    }
  }
  return 0;
}

function getFileCategories(file: unknown): string[] {
  if (typeof file === 'object' && file !== null && 'categories' in file && Array.isArray(file.categories)) {
    return file.categories.filter((cat): cat is string => typeof cat === 'string');
  }
  return [];
}

function getMetaPromptSystemPrompt(pkg: unknown): string {
  if (validateContextPackage(pkg) && pkg.metaPrompt) {
    return pkg.metaPrompt.substring(0, 200) + '...';
  }
  if (typeof pkg === 'object' && pkg !== null && 'metaPrompt' in pkg) {
    const metaPrompt = pkg.metaPrompt;
    if (typeof metaPrompt === 'string') {
      return metaPrompt.substring(0, 200) + '...';
    }
    if (typeof metaPrompt === 'object' && metaPrompt !== null && 'systemPrompt' in metaPrompt && typeof metaPrompt.systemPrompt === 'string') {
      return metaPrompt.systemPrompt.substring(0, 200) + '...';
    }
  }
  return 'No system prompt available';
}

function getMetaPromptUserPrompt(pkg: unknown): string {
  if (typeof pkg === 'object' && pkg !== null && 'metaPrompt' in pkg) {
    const metaPrompt = pkg.metaPrompt;
    if (typeof metaPrompt === 'object' && metaPrompt !== null && 'userPrompt' in metaPrompt && typeof metaPrompt.userPrompt === 'string') {
      return metaPrompt.userPrompt.substring(0, 200) + '...';
    }
  }
  return 'No user prompt available';
}

function getMetaPromptComplexity(pkg: unknown): string {
  if (typeof pkg === 'object' && pkg !== null && 'metaPrompt' in pkg) {
    const metaPrompt = pkg.metaPrompt;
    if (typeof metaPrompt === 'object' && metaPrompt !== null && 'estimatedComplexity' in metaPrompt && typeof metaPrompt.estimatedComplexity === 'string') {
      return metaPrompt.estimatedComplexity;
    }
  }
  return 'medium';
}

function getMetaPromptEpicsCount(pkg: unknown): number {
  if (typeof pkg === 'object' && pkg !== null && 'metaPrompt' in pkg) {
    const metaPrompt = pkg.metaPrompt;
    if (typeof metaPrompt === 'object' && metaPrompt !== null && 'taskDecomposition' in metaPrompt) {
      const taskDecomp = metaPrompt.taskDecomposition;
      if (typeof taskDecomp === 'object' && taskDecomp !== null && 'epics' in taskDecomp && Array.isArray(taskDecomp.epics)) {
        return taskDecomp.epics.length;
      }
    }
  }
  return 0;
}

function getMetaPromptGuidelinesCount(pkg: unknown): number {
  if (typeof pkg === 'object' && pkg !== null && 'metaPrompt' in pkg) {
    const metaPrompt = pkg.metaPrompt;
    if (typeof metaPrompt === 'object' && metaPrompt !== null && 'guidelines' in metaPrompt && Array.isArray(metaPrompt.guidelines)) {
      return metaPrompt.guidelines.length;
    }
  }
  return 0;
}

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
              id: getPackageId(contextPackage) || jobId,
              taskType: getTaskType(contextPackage),
              totalFiles: getTotalFiles(contextPackage),
              totalTokens: getTotalTokens(contextPackage),
              averageRelevanceScore: getAverageRelevanceScore(contextPackage),
              cacheHitRate: getCacheHitRate(contextPackage),
              processingTimeMs: getProcessingTimeMs(contextPackage),
              outputPath: `VibeCoderOutput/context-curator/context-package-${jobId}.xml`
            },
            message: 'Context curation completed successfully',
            files: getPackageFiles(contextPackage).map((file) => ({
              path: getFilePath(file),
              relevanceScore: getFileRelevanceScore(file),
              categories: getFileCategories(file)
            })),
            metaPrompt: {
              systemPrompt: getMetaPromptSystemPrompt(contextPackage),
              userPrompt: getMetaPromptUserPrompt(contextPackage),
              estimatedComplexity: getMetaPromptComplexity(contextPackage),
              epicsCount: getMetaPromptEpicsCount(contextPackage),
              guidelinesCount: getMetaPromptGuidelinesCount(contextPackage)
            }
          }, null, 2)
        }
      ],
      isError: false
    };

    jobManager.setJobResult(jobId, result);
    logger.info({
      jobId,
      totalFiles: getTotalFiles(contextPackage),
      processingTime: getProcessingTimeMs(contextPackage)
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
