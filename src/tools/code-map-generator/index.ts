import { z } from 'zod';
import { ToolDefinition, ToolExecutor, registerTool, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import logger from '../../logger.js';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';

import {
  initializeParser,
  readAndParseFile,
  clearCaches,
  getMemoryStats,
  languageConfigurations,
  initializeCaches,
  getSourceCodeFromCache,
  getMemoryManager
} from './parser.js';
import { takeMemorySample, generateMemoryUsageReport, clearMemoryUsageSamples } from './memoryMonitor.js';
import { initializeImportResolver, disposeImportResolver } from './utils/importResolverInitializer.js';

import { collectSourceFiles } from './fileScanner.js';
import { FileInfo, CodeMap } from './codeMapModel.js';
import { extractFunctions, extractClasses, extractImports, getNodeText, generateHeuristicComment } from './astAnalyzer.js';
import { buildFileDependencyGraph, buildClassInheritanceGraph, buildFunctionCallGraph } from './graphBuilder.js';
import { generateMermaidSequenceDiagram } from './diagramGenerator.js';
import { formatCodeMapToMarkdown, optimizeMarkdownOutput } from './outputFormatter.js';
import { CodeMapGeneratorConfig } from './types.js';
import { extractCodeMapConfig } from './configValidator.js';
import { getLanguageHandler } from './languageHandlers/registry.js';
import { createDirectoryStructure } from './directoryUtils.js';
import {
  processLanguageBasedBatches
} from './batchProcessor.js';
import { generateMarkdownOutput } from './outputGenerator.js';
import { createIncrementalProcessor } from './incrementalProcessor.js';
import { EnhancementConfigManager } from './config/enhancementConfig.js';
import { UniversalClassOptimizer } from './optimization/universalClassOptimizer.js';
import { UniversalDiagramOptimizer } from './optimization/universalDiagramOptimizer.js';
import { AdaptiveOptimizationEngine } from './optimization/adaptiveOptimizer.js';

// Cache for source code content, primarily for function call graph generation
const sourceCodeCache = new Map<string, string>();

/**
 * Filters out compiled/generated files when source equivalents exist
 */
function filterDuplicateFiles(files: string[], _projectRoot: string): string[] {
  const sourceFiles = new Set<string>();
  const compiledFiles = new Map<string, string[]>();

  // First pass: identify source files and potential compiled files
  files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    const baseName = file.replace(/\.[^.]+$/, '');

    // Source file extensions
    if (['.ts', '.py', '.java', '.c', '.cpp', '.cs', '.go'].includes(ext)) {
      sourceFiles.add(baseName);
    }

    // Compiled file extensions
    const compiledExts = ['.js', '.pyc', '.pyo', '.class', '.o', '.obj', '.dll', '.exe'];
    if (compiledExts.includes(ext)) {
      if (!compiledFiles.has(baseName)) {
        compiledFiles.set(baseName, []);
      }
      compiledFiles.get(baseName)!.push(file);
    }
  });

  // Second pass: filter out compiled files where source exists
  return files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    const baseName = file.replace(/\.[^.]+$/, '');

    // Always keep source files
    if (['.ts', '.py', '.java', '.c', '.cpp', '.cs', '.go'].includes(ext)) {
      return true;
    }

    // Filter compiled files
    if (['.js', '.pyc', '.pyo', '.class', '.o', '.obj', '.dll', '.exe'].includes(ext)) {
      return !sourceFiles.has(baseName);
    }

    // Always exclude .js.map and .d.ts files
    if (file.endsWith('.js.map') || file.endsWith('.d.ts')) {
      return false;
    }

    return true;
  });
}

/**
 * Filters out trivial files with minimal content
 */
async function filterTrivialFiles(files: string[], projectRoot: string): Promise<string[]> {
  const significantFiles: string[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('//')).length;

      // Keep files with substantial content
      if (lines >= 10) {
        significantFiles.push(file);
      }
    } catch {
      // Keep file if we can't read it (might be binary)
      significantFiles.push(file);
    }
  }

  return significantFiles;
}

// Functions for testing and cache management
export function clearCodeMapCaches(): void {
  sourceCodeCache.clear();
  clearCaches();
}

export function getCodeMapCacheSizes(): { sourceCodeCache: number } {
  return {
    sourceCodeCache: sourceCodeCache.size
  };
}

// No longer using user-authorized directories - only CWD is allowed

// Removed unused function: normalizePath

// Removed unused function: isPathWithin



// Removed unused functions: isDirectoryAllowed and findDirectoryByName





// Epic1-Task006: Define the input schema shape for the tool.
const codeMapInputSchemaShape = {
  ignored_files_patterns: z.array(z.string()).optional().describe("Optional array of glob patterns for files/directories to ignore."),
  output_format: z.enum(['markdown', 'json']).optional().default('markdown').describe("Format for the output (json not yet implemented)."),
};

// Epic1-Task007: Define the asynchronous executor function stub for the tool.
export const codeMapExecutor: ToolExecutor = async (params: Record<string, unknown>, _config: OpenRouterConfig, context?: ToolExecutionContext) => {
  // Get session ID from context
  const sessionId = context?.sessionId || 'unknown-session';
  const transportType = context?.transportType || 'unknown';
  logger.debug({ toolName: 'map-codebase', params, sessionId, transportType }, 'Code-Map Generator invoked.');

  // Create a job for tracking progress
  const jobId = jobManager.createJob('map-codebase', params);
  logger.info({ jobId, sessionId }, 'Created job for code-map-generator');

  // For long-running operations, return a job initiation response immediately
  // This allows the client to poll for updates using get-job-result
  if (transportType === 'stdio' || sessionId === 'stdio-session') {
    // For stdio transport, return a job initiation response
    const initiationResponse = formatBackgroundJobInitiationResponse(
      jobId,
      'map-codebase',
      'Code map generation started. Use get-job-result to check status and retrieve the final result.',
      { sessionId, transportType }
    );

    // Execute the actual work in the background
    setTimeout(() => {
      executeCodeMapGeneration(params, _config, context, jobId)
        .catch(error => {
          logger.error({ err: error, jobId }, 'Error in background code map generation');
          jobManager.updateJobStatus(jobId, JobStatus.FAILED, `Error: ${error instanceof Error ? error.message : String(error)}`);
          sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Error: ${error instanceof Error ? error.message : String(error)}`);
        });
    }, 0);

    return initiationResponse;
  }

  // For SSE transport, execute synchronously and send progress updates
  return executeCodeMapGeneration(params, _config, context, jobId);
};

// Extract the main logic to a separate function that can be called either synchronously or asynchronously
export async function executeCodeMapGeneration(
params: Record<string, unknown>,
_config: OpenRouterConfig,
context: ToolExecutionContext | undefined,
jobId: string
): Promise<CallToolResult> {
const sessionId = context?.sessionId || 'unknown-session';

// NEW: Clear memory samples at the start of execution
clearMemoryUsageSamples();

// NEW: Take initial memory sample
takeMemorySample('Initial');

// MAXIMUM AGGRESSIVE: Initialize universal optimization engines
const enhancementManager = EnhancementConfigManager.getInstance();
enhancementManager.enableAggressiveOptimizations(); // Enable maximum aggressive optimization by default

const classOptimizer = new UniversalClassOptimizer();
const diagramOptimizer = new UniversalDiagramOptimizer();
const adaptiveEngine = new AdaptiveOptimizationEngine();

try {
  try {
    // Send initial progress update
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting code map generation...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting code map generation...');

    // Register job with process lifecycle manager
    const { processLifecycleManager } = await import('./parser.js');
    if (processLifecycleManager) {
      processLifecycleManager.registerJob(jobId);
      logger.debug(`Registered job ${jobId} with process lifecycle manager`);
    }

    // Extract and validate configuration
    let config: CodeMapGeneratorConfig;
    try {
      config = await extractCodeMapConfig(_config);
      logger.info('Enhanced Code Map Generator initialized with maximum aggressive optimization');
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract configuration');

      // Update job status to failed
      jobManager.updateJobStatus(jobId, JobStatus.FAILED, `Configuration error: ${error instanceof Error ? error.message : String(error)}`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Configuration error: ${error instanceof Error ? error.message : String(error)}`);

      // Set job result
      const errorResult = {
        content: [{
          type: 'text' as const,
          text: `Configuration error: ${error instanceof Error ? error.message : String(error)}\n\nPlease ensure that 'allowedMappingDirectory' is configured in the tool configuration.`
        }],
        isError: true
      };

      jobManager.setJobResult(jobId, errorResult);
      return errorResult;
    }

    // Parse and validate the input parameters
    const validatedParams = z.object(codeMapInputSchemaShape).parse(params);

    // Set output format in config
    if (validatedParams.output_format) {
      config.output = {
        ...config.output,
        format: validatedParams.output_format
      };
      logger.info(`Using output format: ${validatedParams.output_format}`);
    }

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Initializing directory structure...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Initializing directory structure...', 5);

    // Create directory structure
    const directoryStructure = await createDirectoryStructure(config, jobId);
    logger.debug(`Created directory structure: ${JSON.stringify(directoryStructure)}`);

    // Initialize caches
    if (config.cache?.enabled !== false) {
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Initializing caches...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Initializing caches...', 10);

      await initializeCaches(config);
      logger.debug('Initialized file-based caches');
    } else {
      logger.debug('File-based caching is disabled');
    }

    // Verify the allowed mapping directory exists and is readable
    try {
      await fs.access(config.allowedMappingDirectory, fsSync.constants.R_OK);
      logger.debug(`Verified allowed mapping directory exists and is readable: ${config.allowedMappingDirectory}`);
    } catch (error) {
      logger.error(`Cannot access allowed mapping directory: ${config.allowedMappingDirectory}. Error: ${error instanceof Error ? error.message : String(error)}`);

      // Update job status to failed
      jobManager.updateJobStatus(jobId, JobStatus.FAILED, `Cannot access allowed mapping directory: ${config.allowedMappingDirectory}`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Cannot access allowed mapping directory: ${config.allowedMappingDirectory}`);

      // Set job result
      const errorResult = {
        content: [{
          type: 'text' as const,
          text: `Cannot access allowed mapping directory: ${config.allowedMappingDirectory}. Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };

      jobManager.setJobResult(jobId, errorResult);
      return errorResult;
    }

    // Use the allowed mapping directory as the project root
    const projectRoot = config.allowedMappingDirectory;

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Initializing parser...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Initializing parser...');

    await initializeParser(); // This now includes grammar manager initialization with preloading
    logger.info('Parser and memory management initialized.');

    // NEW: Take memory sample after initialization
    takeMemorySample('After initialization');

    // Initialize import resolver with expandSecurityBoundary set to true
    initializeImportResolver({
      ...config,
      importResolver: {
        ...config.importResolver,
        enabled: true,
        expandSecurityBoundary: true,
        enhanceImports: true
      }
    });
    logger.info('Import resolver initialized with expandSecurityBoundary enabled');

    // Log initial memory usage statistics
    const initialMemoryStats = getMemoryStats();
    logger.info({ initialMemoryStats }, 'Initial memory usage statistics');

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Preparing file scanning...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Preparing file scanning...');

    const supportedExtensions = Object.keys(languageConfigurations);

    // Enhanced ignoredPatterns
    // Convert glob patterns to valid RegExp patterns
    const userIgnoredPatterns = validatedParams.ignored_files_patterns?.map(pattern => {
      try {
        // Convert glob-like pattern to a valid regex pattern
        // Replace ** with a placeholder, escape regex special chars, then restore ** as .*
        const regexPattern = pattern
          .replace(/\*\*/g, '___DOUBLE_STAR___')
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/___DOUBLE_STAR___/g, '.*')
          .replace(/\*/g, '[^/]*');

        logger.debug(`Converted pattern "${pattern}" to regex: "${regexPattern}"`);
        return new RegExp(regexPattern, 'i');
      } catch (error) {
        logger.warn(`Invalid pattern "${pattern}" - skipping. Error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    }).filter(Boolean) || [];

    const defaultIgnoredPatterns = [
        /node_modules/i, /\.git/i, /dist/i, /build/i, /out/i, /coverage/i, /vendor/i,
        /\.(log|lock|env|bak|tmp|swp|DS_Store|map)$/i, /.*\/\..*/, /^\..*/,
        /(?:^|[/\\])__(tests|mocks|snapshots)__[/\\]/i, /(?:^|[/\\])(test|tests)[/\\]/i,
        // Enhanced test file exclusions
        /(?:^|[/\\])(spec|e2e)[/\\]/i,
        /\.spec\./i,
        /\.e2e\./i,
        /(?:^|[/\\])__(mocks|fixtures|snapshots)__[/\\]/i,
        /\.min\.(js|css)$/i, /package-lock\.json/i, /yarn\.lock/i,
        /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp3|mp4|webm|ogg|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz|rar|7z|exe|dll|bin|obj|o|iso|dmg|pdb|bak)$/i,
    ];

    // Ensure all patterns are RegExp objects (TypeScript type safety)
    const combinedIgnoredPatterns: RegExp[] = [...defaultIgnoredPatterns, ...userIgnoredPatterns as RegExp[]];
    logger.debug(`Using ${combinedIgnoredPatterns.length} ignore patterns (${userIgnoredPatterns.length} user-defined, ${defaultIgnoredPatterns.length} default)`);

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Scanning for source files...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Scanning for source files...');

    logger.info(`Scanning for source files in: ${projectRoot}`);
    const filePathsResult = await collectSourceFiles(projectRoot, supportedExtensions, combinedIgnoredPatterns, config);

    // Ensure we have a flat array of strings
    let filePaths: string[] = Array.isArray(filePathsResult[0]) ? (filePathsResult as string[][]).flat() : filePathsResult as string[];

    // Apply Phase 1 optimizations: Filter duplicate and trivial files
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Filtering duplicate and trivial files...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Filtering duplicate and trivial files...', 25);

    const originalFileCount = filePaths.length;

    // Filter duplicate files (compiled when source exists)
    filePaths = filterDuplicateFiles(filePaths, projectRoot);
    const afterDuplicateFilter = filePaths.length;

    // Filter trivial files (minimal content)
    filePaths = await filterTrivialFiles(filePaths, projectRoot);
    const afterTrivialFilter = filePaths.length;

    logger.info(`File filtering results: ${originalFileCount} → ${afterDuplicateFilter} (after duplicate filter) → ${afterTrivialFilter} (after trivial filter)`);

    // Log memory usage after file scanning
    const postScanningMemoryStats = getMemoryStats();
    logger.info({ postScanningMemoryStats }, 'Memory usage after file scanning');

    if (filePaths.length === 0) {
      // Update job status to completed (but with no files)
      jobManager.updateJobStatus(jobId, JobStatus.COMPLETED, 'No files found');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'No files found');

      // Set job result
      const noFilesResult = {
        content: [{
          type: 'text' as const,
          text: 'No supported source files found to map in the specified path after applying ignore patterns.'
        }],
        isError: false
      };

      jobManager.setJobResult(jobId, noFilesResult);
      return noFilesResult;
    }

    // Update job status with file count
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Found ${filePaths.length} source files. Parsing files...`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Found ${filePaths.length} source files. Parsing files...`, 30);

    logger.info(`Found ${filePaths.length} source files to process.`);

    // NEW: Take memory sample after file scanning
    takeMemorySample('After file scanning');

    // Process files in batches using the new batch processor

    // Define the file processing function
    const processFile = async (filePath: string): Promise<FileInfo> => {
      const relativePath = path.relative(projectRoot, filePath);

      try {
        // Use the new readAndParseFile function
        const { tree, sourceCode } = await readAndParseFile(filePath, path.extname(filePath).toLowerCase(), config);

        // Store source code in cache for function call graph generation
        // Note: sourceCodeCache is now handled internally by the parser

        if (!tree) {
          logger.warn(`No parser or parsing failed for ${filePath}, creating basic FileInfo.`);
          return {
            filePath,
            relativePath,
            classes: [],
            functions: [],
            imports: [],
            comment: `File type ${path.extname(filePath).toLowerCase()} not fully supported for deep AST analysis.`,
          };
        }

        const languageId = path.extname(filePath).toLowerCase();
        const functions = extractFunctions(tree.rootNode, sourceCode, languageId);
        const classes = extractClasses(tree.rootNode, sourceCode, languageId);
        let imports = extractImports(tree.rootNode, sourceCode, languageId);

        // Enhance imports with third-party resolvers if enabled
        if (config.importResolver?.enhanceImports) {
          try {
            // Get the language handler
            const handler = getLanguageHandler(languageId);

            // Check if the handler supports enhancing imports
            if (handler.enhanceImportInfo) {
              // Enhance imports
              imports = await handler.enhanceImportInfo(
                filePath,
                imports,
                {
                  allowedDir: config.allowedMappingDirectory,
                  outputDir: config.output?.outputDir || path.join(process.env.VIBE_CODER_OUTPUT_DIR || '.', 'code-map-generator'),
                  maxDepth: config.importResolver.importMaxDepth || 3,
                  tsConfig: config.importResolver.tsConfig,
                  pythonPath: config.importResolver.pythonPath,
                  pythonVersion: config.importResolver.pythonVersion,
                  venvPath: config.importResolver.venvPath,
                  clangdPath: config.importResolver.clangdPath,
                  compileFlags: config.importResolver.compileFlags,
                  includePaths: config.importResolver.includePaths,
                  semgrepPatterns: config.importResolver.semgrepPatterns,
                  semgrepTimeout: config.importResolver.semgrepTimeout,
                  semgrepMaxMemory: config.importResolver.semgrepMaxMemory,
                  disableSemgrepFallback: config.importResolver.disableSemgrepFallback
                }
              );

              logger.debug({ filePath, importsCount: imports.length }, 'Enhanced imports with third-party resolver');
            }
          } catch (error) {
            logger.error({ err: error, filePath }, 'Error enhancing imports with third-party resolver');
          }
        }

        let fileLevelComment: string | undefined;
        const firstChildNode = tree.rootNode.firstChild;
        if (firstChildNode?.type === 'comment' && firstChildNode.text.startsWith('/**')) {
          fileLevelComment = getNodeText(firstChildNode, sourceCode).substring(3).split('*/')[0].trim().split('\n')[0];
        } else if (firstChildNode?.type === 'comment' && (firstChildNode.text.startsWith('//') || firstChildNode.text.startsWith('#'))) {
          fileLevelComment = getNodeText(firstChildNode, sourceCode).substring(firstChildNode.text.startsWith('//') ? 2 : 1).trim();
        }

        return {
          filePath,
          relativePath,
          classes,
          functions,
          imports,
          comment: fileLevelComment || generateHeuristicComment(path.basename(relativePath), 'file'),
        };
      } catch (error) {
        logger.error({ err: error, filePath }, `Failed to process file.`);
        return {
          filePath,
          relativePath,
          classes: [],
          functions: [],
          imports: [],
          comment: `Error processing file: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    };

    // Create file objects with path and extension
  interface FileObject {
    path: string;
    extension: string;
  }

  const fileObjects: FileObject[] = filePaths.map(filePath => {
    // Ensure filePath is a string
    const pathStr = Array.isArray(filePath) ? filePath[0] : filePath;
    return {
      path: pathStr,
      extension: path.extname(pathStr).toLowerCase()
    };
  });

    // Process files in language-based batches
    const allFileInfos = await processLanguageBasedBatches(
      fileObjects,
      async (fileObj) => processFile(fileObj.path),
      config,
      jobId,
      sessionId,
      'Parsing files',
      30,
      50
    );

    // Cleanup function for import resolution (defined but not used in current flow)
    // const cleanupImportResolution = async () => {
    //   // Clear source code cache
    //   sourceCodeCache.clear();
    //
    //   // Run garbage collection
    //   if (global.gc) {
    //     global.gc();
    //   }
    //
    //   // Log memory usage
    //   const memStats = getMemoryStats();
    //   logger.info({ memoryUsage: memStats.formatted }, 'Memory usage after import resolution cleanup');
    // };

    // Process imports in batches with memory checks
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Enhancing imports...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Enhancing imports...', 50);

    // Define the import enhancement function
    const enhanceImports = async (fileInfo: FileInfo): Promise<FileInfo> => {
      try {
        if (config.importResolver?.enhanceImports) {
          const languageId = path.extname(fileInfo.filePath).toLowerCase();
          const handler = getLanguageHandler(languageId);

          if (handler.enhanceImportInfo) {
            const enhancedImports = await handler.enhanceImportInfo(
              fileInfo.filePath,
              fileInfo.imports,
              {
                allowedDir: config.allowedMappingDirectory,
                outputDir: config.output?.outputDir || path.join(process.env.VIBE_CODER_OUTPUT_DIR || '.', 'code-map-generator'),
                maxDepth: config.importResolver.importMaxDepth || 3,
                tsConfig: config.importResolver.tsConfig,
                pythonPath: config.importResolver.pythonPath,
                pythonVersion: config.importResolver.pythonVersion,
                venvPath: config.importResolver.venvPath,
                clangdPath: config.importResolver.clangdPath,
                compileFlags: config.importResolver.compileFlags,
                includePaths: config.importResolver.includePaths,
                semgrepPatterns: config.importResolver.semgrepPatterns,
                semgrepTimeout: config.importResolver.semgrepTimeout,
                semgrepMaxMemory: config.importResolver.semgrepMaxMemory,
                disableSemgrepFallback: config.importResolver.disableSemgrepFallback
              }
            );

            // Create a new FileInfo object with the enhanced imports
            logger.debug({ filePath: fileInfo.filePath, importsCount: enhancedImports.length }, 'Enhanced imports with third-party resolver');

            return {
              ...fileInfo,
              imports: enhancedImports
            };
          }
        }
        return fileInfo;
      } catch (error) {
        logger.error({ err: error, filePath: fileInfo.filePath }, 'Error enhancing imports');
        return fileInfo;
      }
    };

    // Create file objects with path and extension for import resolution
    interface FileInfoObject {
      path: string;
      extension: string;
      fileInfo: FileInfo;
    }

    const fileInfoObjects: FileInfoObject[] = allFileInfos.map(fileInfo => ({
      path: fileInfo.filePath,
      extension: path.extname(fileInfo.filePath).toLowerCase(),
      fileInfo
    }));

    // Process files in language-based batches for import resolution
    const fileInfosWithEnhancedImports = await processLanguageBasedBatches(
      fileInfoObjects,
      async (fileObj) => enhanceImports(fileObj.fileInfo),
      config,
      jobId,
      sessionId,
      'Enhancing imports',
      50,
      70
    );

    // Log memory usage after parsing and symbol extraction
    const postParsingMemoryStats = getMemoryStats();
    logger.info({ postParsingMemoryStats }, 'Memory usage after parsing and symbol extraction');

    // NEW: Take memory sample after processing
    takeMemorySample('After processing');

    // Sort files by relative path
    fileInfosWithEnhancedImports.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    // Update job status for graph building
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Building dependency graphs...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Building dependency graphs...', 60);

    // Construct CodeMap object for the formatter
    const codeMapData: CodeMap = { projectPath: projectRoot, files: fileInfosWithEnhancedImports };

    // Build graphs with intermediate storage
    const fileDepGraph = await buildFileDependencyGraph(fileInfosWithEnhancedImports, config, jobId);
    const classInheritanceGraph = await buildClassInheritanceGraph(fileInfosWithEnhancedImports, config, jobId);

    // Create a temporary Map for sourceCodeCache to maintain compatibility
    const tempSourceCodeCache = new Map<string, string>();

    // Populate the temporary Map with source code from files
    for (const fileInfo of fileInfosWithEnhancedImports) {
      try {
        // First try to get source code from cache
        const cachedSourceCode = await getSourceCodeFromCache(fileInfo.filePath);
        if (cachedSourceCode) {
          tempSourceCodeCache.set(fileInfo.filePath, cachedSourceCode);
        } else {
          // If not in cache, read and parse the file
          const { sourceCode } = await readAndParseFile(fileInfo.filePath, path.extname(fileInfo.filePath).toLowerCase(), config);
          if (sourceCode) {
            tempSourceCodeCache.set(fileInfo.filePath, sourceCode);
          }
        }
      } catch (error) {
        logger.warn(`Could not read source code for ${fileInfo.filePath}: ${error}`);
      }
    }

    const functionCallGraph = await buildFunctionCallGraph(fileInfosWithEnhancedImports, tempSourceCodeCache, config, jobId);

    const fileDepNodes = fileDepGraph.nodes;
    const fileDepEdges = fileDepGraph.edges;
    const classInheritanceNodes = classInheritanceGraph.nodes;
    const classInheritanceEdges = classInheritanceGraph.edges;
    const funcCallNodes = functionCallGraph.nodes;
    const funcCallEdges = functionCallGraph.edges;

    // Log memory usage after graph building
    const postGraphBuildingMemoryStats = getMemoryStats();
    logger.info({ postGraphBuildingMemoryStats }, 'Memory usage after graph building');

    // NEW: Take memory sample after graph building
    takeMemorySample('After graph building');

    // Update job status for diagram generation
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating diagrams...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating diagrams...', 70);

    // MAXIMUM AGGRESSIVE: Generate optimized diagrams (text summaries instead of verbose mermaid)
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating optimized architecture overview...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating optimized architecture overview...', 70);

    // Get enhancement configuration
    const enhancementConfig = EnhancementConfigManager.getInstance().getConfig();

    // ALWAYS use optimized diagrams (maximum aggressive by default)
    const fileDepDiagramMd = diagramOptimizer.optimizeDependencyDiagram(fileDepNodes, fileDepEdges, enhancementConfig.universalOptimization);

    // Generate optimized class overview
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating optimized class overview...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating optimized class overview...', 75);

    // ALWAYS use optimized diagrams (maximum aggressive by default)
    const classDiagramMd = diagramOptimizer.optimizeDependencyDiagram(classInheritanceNodes, classInheritanceEdges, enhancementConfig.universalOptimization);

    // Generate optimized function call overview
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating optimized function overview...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating optimized function overview...', 80);

    // ALWAYS use optimized diagrams (maximum aggressive by default)
    const funcCallDiagramMd = diagramOptimizer.optimizeDependencyDiagram(funcCallNodes, funcCallEdges, enhancementConfig.universalOptimization);

    // Generate sequence diagram
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating sequence diagram...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating sequence diagram...', 85);
    // Use the same function call graph nodes and edges for sequence diagram
    // The sequence diagram generator uses the same nodes and edges as the function call graph
    const sequenceDiagramMd = generateMermaidSequenceDiagram(funcCallNodes, funcCallEdges);

    // Log memory usage after diagram generation
    const postDiagramGenerationMemoryStats = getMemoryStats();
    logger.info({ postDiagramGenerationMemoryStats }, 'Memory usage after diagram generation');

    // Update job status for output generation
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating output...');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating output...', 80);

    // Generate output using the new output generator
    const outputPath = await generateMarkdownOutput(
      fileInfosWithEnhancedImports,
      fileDepGraph,
      classInheritanceGraph,
      functionCallGraph,
      config,
      jobId
    );

    // Log memory usage after output generation
    const postOutputGenerationMemoryStats = getMemoryStats();
    logger.info({ postOutputGenerationMemoryStats }, 'Memory usage after output generation');

    // NEW: Take memory sample after output generation
    takeMemorySample('After output generation');

    // NEW: Generate and log memory usage report
    const memoryReport = generateMemoryUsageReport();
    logger.info(memoryReport);

    // For backward compatibility, also generate the old-style output
    // Call formatCodeMapToMarkdown
    const textualCodeMapMd = formatCodeMapToMarkdown(codeMapData, projectRoot);

    // Assemble final Markdown output
    const successfullyProcessedCount = fileInfosWithEnhancedImports.filter(fi => !(fi.comment && fi.comment.startsWith("Error processing file"))).length;
    const filesWithErrorsCount = fileInfosWithEnhancedImports.length - successfullyProcessedCount;

    let finalMarkdownOutput = `## Codebase Overview for ${path.basename(projectRoot)}\n\n`;
    finalMarkdownOutput += `**Summary:** Processed ${fileInfosWithEnhancedImports.length} files. Successfully analyzed: ${successfullyProcessedCount}. Files with errors/skipped: ${filesWithErrorsCount}.\n\n`;
    finalMarkdownOutput += `**Output saved to:** ${outputPath}\n\n`;

    // MAXIMUM AGGRESSIVE: Use optimized text summaries instead of mermaid diagrams
    if (fileDepEdges.length > 0 || fileDepNodes.length > 0) {
      if (enhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
        finalMarkdownOutput += `### File Dependencies\n\n${fileDepDiagramMd}\n\n`;
      } else {
        finalMarkdownOutput += `### File Dependency Graph\n\n\`\`\`mermaid\n${fileDepDiagramMd}\n\`\`\`\n\n`;
      }
    }
    if (classInheritanceEdges.length > 0 || classInheritanceNodes.length > 0) {
      if (enhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
        finalMarkdownOutput += `### Class Inheritance\n\n${classDiagramMd}\n\n`;
      } else {
        finalMarkdownOutput += `### Class Inheritance Diagram\n\n\`\`\`mermaid\n${classDiagramMd}\n\`\`\`\n\n`;
      }
    }
    if (funcCallEdges.length > 0 || funcCallNodes.length > 0) {
      if (enhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
        finalMarkdownOutput += `### Function Calls\n\n${funcCallDiagramMd}\n\n`;
      } else {
        finalMarkdownOutput += `### Function Call Map (Heuristic)\n\n\`\`\`mermaid\n${funcCallDiagramMd}\n\`\`\`\n\n`;
      }

      // Add sequence diagram (only if not eliminating diagrams)
      if (!enhancementConfig.universalOptimization.eliminateVerboseDiagrams) {
        finalMarkdownOutput += `### Method Call Sequence Diagram\n\n\`\`\`mermaid\n${sequenceDiagramMd}\n\`\`\`\n\n`;
      }
    }
    finalMarkdownOutput += `## Detailed Code Structure\n\n${textualCodeMapMd}`;

    // Log memory usage after output formatting
    const postOutputFormattingMemoryStats = getMemoryStats();
    logger.info({ postOutputFormattingMemoryStats }, 'Memory usage after output formatting');

    // MAXIMUM AGGRESSIVE: Apply adaptive optimization for maximum token reduction
    let optimizedOutput = finalMarkdownOutput;

    if (enhancementConfig.enableOptimizations) {
      // Apply adaptive optimization based on codebase characteristics
      const optimizationResult = adaptiveEngine.optimizeBasedOnCodebase(codeMapData, enhancementConfig.universalOptimization);

      // Log optimization results
      logger.info({
        reductionAchieved: optimizationResult.reductionAchieved,
        qualityMetrics: optimizationResult.qualityMetrics,
        strategy: optimizationResult.strategy
      }, 'Applied adaptive optimization');

      // Apply class optimization to the detailed code structure
      if (enhancementConfig.universalOptimization.reduceClassDetails) {
        let optimizedClassContent = '';
        fileInfosWithEnhancedImports.forEach(fileInfo => {
          fileInfo.classes.forEach(cls => {
            optimizedClassContent += classOptimizer.optimizeClassInfo(cls, enhancementConfig.universalOptimization);
          });
        });

        // Replace detailed code structure with optimized version
        if (optimizedClassContent) {
          const detailedStructureStart = optimizedOutput.indexOf('## Detailed Code Structure');
          if (detailedStructureStart !== -1) {
            optimizedOutput = optimizedOutput.substring(0, detailedStructureStart) +
              '## Optimized Code Structure\n\n' + optimizedClassContent;
          }
        }
      }

      // Apply final markdown optimization
      optimizedOutput = optimizeMarkdownOutput(optimizedOutput);

      logger.info('Applied maximum aggressive optimization for AI agent consumption');
    } else {
      // Fallback to standard optimization
      optimizedOutput = optimizeMarkdownOutput(finalMarkdownOutput);
    }

    // Update job status to completed
    jobManager.updateJobStatus(jobId, JobStatus.COMPLETED, 'Code map generation complete');
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Code map generation complete', 100);

    // Log final memory usage statistics
    const finalMemoryStats = getMemoryStats();
    logger.info({ finalMemoryStats }, 'Final memory usage statistics');

    logger.info({ toolName: 'map-codebase', path: projectRoot, sessionId, successfullyProcessedCount, filesWithErrorsCount }, "Code map generated.");

    // Set job result
    const result = {
      content: [{ type: 'text' as const, text: optimizedOutput }],
      isError: false,
    };

    jobManager.setJobResult(jobId, result);
    return result;
  } catch (error) {
    // Update job status to failed
    jobManager.updateJobStatus(jobId, JobStatus.FAILED, `Error: ${error instanceof Error ? error.message : String(error)}`);
    sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Error: ${error instanceof Error ? error.message : String(error)}`);

    // Log memory usage statistics on error
    try {
      const errorMemoryStats = getMemoryStats();
      logger.info({ errorMemoryStats }, 'Memory usage statistics at error');
    } catch (memoryError) {
      logger.warn(`Failed to get memory statistics: ${memoryError instanceof Error ? memoryError.message : String(memoryError)}`);
    }

    logger.error({ err: error, toolName: 'map-codebase', params, sessionId, jobId }, 'Error in Code-Map Generator');
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Set job result
    const errorResult = {
      content: [{ type: 'text' as const, text: `Error generating code map: ${errorMessage}` }],
      isError: true,
    };

    jobManager.setJobResult(jobId, errorResult);
    return errorResult;
  }
} finally {
  // Clean up resources
  try {
    // Unregister job from process lifecycle manager
    const { processLifecycleManager } = await import('./parser.js');
    if (processLifecycleManager) {
      await processLifecycleManager.unregisterJob(jobId);
      logger.debug(`Unregistered job ${jobId} from process lifecycle manager`);
    }

    // Log memory usage statistics
    const memoryStats = getMemoryStats();
    logger.info({ memoryStats }, 'Memory usage statistics');

    // NEW: Take final memory sample
    takeMemorySample('Final');

    // Get memory manager for additional cleanup if needed
    const memManager = getMemoryManager();
    if (memManager) {
      logger.debug('Memory manager found, performing additional cleanup');
      // Additional cleanup can be performed here if needed
    }

    // Dispose import resolvers
    try {
      disposeImportResolver();
      logger.debug('Disposed import resolvers');
    } catch (importResolverError) {
      logger.warn(`Error disposing import resolvers: ${importResolverError instanceof Error ? importResolverError.message : String(importResolverError)}`);
    }

    // Close all caches
    await clearCaches();
    logger.debug('Closed all file-based caches');

    // Close incremental processor if it was created
    try {
      // Extract the validated config
      const validatedConfig = await extractCodeMapConfig(_config);
      if (validatedConfig?.processing?.incremental) {
        const incrementalProcessor = await createIncrementalProcessor(validatedConfig);
        if (incrementalProcessor) {
          await incrementalProcessor.close();
          logger.debug('Closed incremental processor');
        }
      }
    } catch (incrementalError) {
      logger.warn(`Error closing incremental processor: ${incrementalError instanceof Error ? incrementalError.message : String(incrementalError)}`);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logger.debug('Forced garbage collection');
    }
  } catch (error) {
    logger.warn(`Error closing caches: ${error instanceof Error ? error.message : String(error)}`);
  }
}
}

// Epic1-Task008: Define the ToolDefinition object for the "Code-Map Generator".
const codeMapToolDefinition: ToolDefinition = {
  name: "map-codebase", // Chosen name for CLI invocation and semantic routing
  description: "Indexes and maps a codebase structure, providing class/function maps, comments, and Mermaid diagrams for AI consumption. Captures doc-strings and inline comments for semantic context.",
  inputSchema: codeMapInputSchemaShape,
  executor: codeMapExecutor,
};

// Epic1-Task009: Call registerTool to register the tool definition.
registerTool(codeMapToolDefinition);

logger.info('Code-Map Generator tool registered.');