/**
 * Type definitions for the Code-Map Generator tool.
 * This file contains interfaces for configuration, cache, and other shared types.
 */

import { SyntaxNode } from './parser.js';
import { FunctionInfo, ClassInfo, ImportInfo } from './codeMapModel.js';

/**
 * Interface for language-specific function detection handlers.
 */
export interface LanguageHandler {
  /**
   * Extracts functions from an AST node.
   * @param rootNode The root node to extract functions from.
   * @param sourceCode The source code string.
   * @param options Additional options for function extraction.
   * @returns Array of extracted function information.
   */
  extractFunctions(
    rootNode: SyntaxNode,
    sourceCode: string,
    options?: FunctionExtractionOptions
  ): FunctionInfo[];

  /**
   * Extracts classes from an AST node.
   * @param rootNode The root node to extract classes from.
   * @param sourceCode The source code string.
   * @param options Additional options for class extraction.
   * @returns Array of extracted class information.
   */
  extractClasses(
    rootNode: SyntaxNode,
    sourceCode: string,
    options?: ClassExtractionOptions
  ): ClassInfo[];

  /**
   * Extracts imports from an AST node.
   * @param rootNode The root node to extract imports from.
   * @param sourceCode The source code string.
   * @param options Additional options for import extraction.
   * @returns Array of extracted import information.
   */
  extractImports(
    rootNode: SyntaxNode,
    sourceCode: string,
    options?: ImportExtractionOptions
  ): ImportInfo[];

  /**
   * Detects the framework used in the source code.
   * @param sourceCode The source code string.
   * @returns The detected framework, if any.
   */
  detectFramework?(sourceCode: string): string | null;

  /**
   * Enhances import information using third-party resolvers.
   * @param filePath Path to the file
   * @param imports Original imports extracted by Tree-sitter
   * @param options Options for import resolution
   * @returns Enhanced import information
   */
  enhanceImportInfo?(
    filePath: string,
    imports: ImportInfo[],
    options: Record<string, unknown>
  ): Promise<ImportInfo[]>;
}

/**
 * Options for function extraction.
 */
export interface FunctionExtractionOptions {
  /**
   * Whether to extract methods within a class.
   */
  isMethodExtraction?: boolean;

  /**
   * The name of the parent class if extracting methods.
   */
  className?: string;

  /**
   * Maximum depth for nested function analysis.
   */
  maxNestedFunctionDepth?: number;

  /**
   * Whether to enable context analysis.
   */
  enableContextAnalysis?: boolean;

  /**
   * Whether to enable role detection.
   */
  enableRoleDetection?: boolean;

  /**
   * Whether to enable heuristic naming.
   */
  enableHeuristicNaming?: boolean;
}

/**
 * Options for class extraction.
 */
export interface ClassExtractionOptions {
  /**
   * Whether to extract nested classes.
   */
  extractNestedClasses?: boolean;

  /**
   * Whether to extract methods within classes.
   */
  extractMethods?: boolean;

  /**
   * Whether to extract properties within classes.
   */
  extractProperties?: boolean;

  /**
   * Maximum depth for nested class analysis.
   */
  maxNestedClassDepth?: number;
}

/**
 * Options for import extraction.
 */
export interface ImportExtractionOptions {
  /**
   * Whether to resolve import paths to absolute paths.
   */
  resolveImportPaths?: boolean;

  /**
   * Whether to extract comments for imports.
   */
  extractComments?: boolean;

  /**
   * Whether to use import resolution to resolve import paths.
   */
  useImportResolver?: boolean;

  /**
   * The file path of the file containing the import.
   * Required when useImportResolver is true.
   */
  filePath?: string;

  /**
   * The project root directory.
   * Required when useImportResolver is true.
   */
  projectRoot?: string;
}

/**
 * Context information for function extraction.
 */
export interface FunctionContext {
  /**
   * The type of context (e.g., 'class', 'function', 'object').
   */
  type: string;

  /**
   * The name of the context (e.g., class name, function name).
   */
  name?: string;

  /**
   * The parent context, if any.
   */
  parent?: FunctionContext;
}

/**
 * Debug configuration options.
 */
export interface DebugConfig {
  /**
   * Whether to show detailed information for unknown imports.
   * Default is false.
   */
  showDetailedImports?: boolean;

  /**
   * Whether to generate debug files with raw AST information.
   * Default is false.
   */
  generateASTDebugFiles?: boolean;
}

/**
 * Main configuration interface for the Code-Map Generator.
 */
export interface CodeMapGeneratorConfig {
  /**
   * Required absolute path to the directory that the code-map generator is allowed to scan.
   * This is a security boundary - the tool will not access files outside this directory.
   */
  allowedMappingDirectory: string;

  /**
   * Optional cache configuration for optimizing performance and memory usage.
   */
  cache?: CacheConfig;

  /**
   * Optional processing configuration for controlling batch sizes and memory usage.
   */
  processing?: ProcessingConfig;

  /**
   * Optional output configuration for controlling where and how output files are saved.
   */
  output?: OutputConfig;

  /**
   * Optional universal optimization configuration for cross-language optimization.
   */
  universalOptimization?: UniversalOptimizationConfig;

  /**
   * Maximum optimization level for quality-first approach.
   * Default: 'conservative'
   */
  maxOptimizationLevel?: 'conservative' | 'balanced' | 'aggressive' | 'maximum';

  /**
   * Quality thresholds for optimization validation.
   */
  qualityThresholds?: QualityThresholds;

  /**
   * Optional feature flags for enabling or disabling enhanced function detection features.
   */
  featureFlags?: FeatureFlagsConfig;

  /**
   * Optional import resolution configuration for resolving import paths.
   */
  importResolver?: ImportResolverConfig;

  /**
   * Debug configuration options.
   */
  debug?: DebugConfig;
}

/**
 * Configuration for the file-based cache system.
 */
export interface CacheConfig {
  /**
   * Whether the cache is enabled. Default is true.
   */
  enabled: boolean;

  /**
   * Maximum number of entries to keep in the cache. Default is 10000.
   */
  maxEntries?: number;

  /**
   * Maximum age of cache entries in milliseconds. Default is 24 hours.
   */
  maxAge?: number;

  /**
   * Cache directory path. This is used internally and should not be set directly.
   * @internal
   */
  cacheDir?: string;

  /**
   * Whether to use file-based source code access.
   * Default is true.
   */
  useFileBasedAccess?: boolean;

  /**
   * Maximum number of files to cache in memory.
   * Default is 100.
   */
  maxCachedFiles?: number;

  /**
   * Whether to use memory caching in tiered caches.
   * Default is false.
   */
  useMemoryCache?: boolean;

  /**
   * Maximum number of entries to keep in memory caches.
   * Default is 1000.
   */
  memoryMaxEntries?: number;

  /**
   * Maximum age of memory cache entries in milliseconds.
   * Default is 10 minutes.
   */
  memoryMaxAge?: number;

  /**
   * Memory usage threshold (percentage) at which to disable memory caching.
   * Default is 0.8 (80%).
   */
  memoryThreshold?: number;

  /**
   * Whether to use file hashes for change detection.
   * Default is true.
   */
  useFileHashes?: boolean;
}

/**
 * Configuration for processing options.
 */
export interface ProcessingConfig {
  /**
   * Number of files to process in each batch. Default is 100.
   */
  batchSize?: number;

  /**
   * Whether to log memory usage statistics during processing. Default is false.
   */
  logMemoryUsage?: boolean;

  /**
   * Maximum memory usage in MB before triggering garbage collection. Default is 1024 (1GB).
   */
  maxMemoryUsage?: number;

  /**
   * Whether to use incremental processing.
   * Default is true.
   */
  incremental?: boolean;

  /**
   * Whether to run periodic garbage collection.
   * Default is true.
   */
  periodicGC?: boolean;

  /**
   * Interval for periodic garbage collection in milliseconds.
   * Default is 5 minutes.
   */
  gcInterval?: number;

  /**
   * Configuration for incremental processing.
   */
  incrementalConfig?: IncrementalProcessingConfig;
}

/**
 * Configuration for incremental processing.
 */
export interface IncrementalProcessingConfig {
  /**
   * Whether to use file hashes for change detection.
   * Default is true.
   */
  useFileHashes?: boolean;

  /**
   * Whether to use file metadata (size, modification time) for change detection.
   * Default is true.
   */
  useFileMetadata?: boolean;

  /**
   * Maximum number of file hashes to cache.
   * Default is 10000.
   */
  maxCachedHashes?: number;

  /**
   * Maximum age of cached hashes in milliseconds.
   * Default is 24 hours.
   */
  maxHashAge?: number;

  /**
   * Path to the file containing the list of previously processed files.
   * If not specified, a default path will be used.
   */
  previousFilesListPath?: string;

  /**
   * Whether to save the list of processed files for the next run.
   * Default is true.
   */
  saveProcessedFilesList?: boolean;
}

/**
 * Configuration for universal optimization across all tech stacks.
 */
export interface UniversalOptimizationConfig {
  /**
   * Whether to eliminate verbose mermaid diagrams and replace with text summaries.
   * Default: false
   */
  eliminateVerboseDiagrams?: boolean;

  /**
   * Whether to reduce class details to public interfaces only.
   * Default: false
   */
  reduceClassDetails?: boolean;

  /**
   * Whether to consolidate repetitive content patterns.
   * Default: false
   */
  consolidateRepetitiveContent?: boolean;

  /**
   * Whether to focus on public interfaces and eliminate private implementation details.
   * Default: false
   */
  focusOnPublicInterfaces?: boolean;

  /**
   * Whether to enable adaptive optimization based on codebase characteristics.
   * Default: false
   */
  adaptiveOptimization?: boolean;
}

/**
 * Configuration for pattern-based consolidation.
 */
export interface PatternConsolidationConfig {
  /**
   * Whether pattern-based consolidation is enabled.
   * Default: false
   */
  enabled: boolean;

  /**
   * Maximum number of components to show in each pattern group.
   * Default: 6
   */
  maxComponentsShown: number;

  /**
   * Whether to group files by architectural patterns (services, handlers, etc.).
   * Default: true
   */
  groupArchitecturalPatterns: boolean;

  /**
   * Whether to group functions by common patterns (constructors, getInstance, etc.).
   * Default: true
   */
  groupFunctionPatterns: boolean;

  /**
   * Minimum number of items needed to form a consolidation group.
   * Default: 3
   */
  consolidationThreshold: number;
}

/**
 * Quality thresholds for optimization validation.
 */
export interface QualityThresholds {
  /**
   * Minimum semantic completeness percentage (90-98%).
   * Default: 95
   */
  minSemanticCompleteness: number;

  /**
   * Minimum architectural integrity percentage (95-99%).
   * Default: 98
   */
  minArchitecturalIntegrity: number;

  /**
   * Maximum information loss percentage (5-15%).
   * Default: 8
   */
  maxInformationLoss: number;
}

/**
 * Configuration for output options.
 */
export interface OutputConfig {
  /**
   * Directory where output files are saved. If not specified, defaults to
   * 'code-map-generator' within the VibeCoderOutput directory.
   */
  outputDir?: string;

  /**
   * Format for the output. Default is 'markdown'.
   */
  format?: 'markdown' | 'json';

  /**
   * Whether to split output into multiple files. Default is true.
   */
  splitOutput?: boolean;

  /**
   * Custom prefix for output filenames. Default is timestamp.
   */
  filePrefix?: string;

  /**
   * Maximum age of output files in milliseconds.
   * Default: 7 days
   */
  maxAge?: number;

  /**
   * Maximum number of output directories to keep.
   * Default: 10
   */
  maxOutputDirs?: number;

  /**
   * Whether to clean up old outputs automatically.
   * Default: true
   */
  cleanupOldOutputs?: boolean;
}

/**
 * Interface for directory structure paths.
 */
export interface DirectoryStructure {
  /**
   * Base output directory (VibeCoderOutput)
   */
  baseOutputDir: string;

  /**
   * Tool-specific output directory (VibeCoderOutput/code-map-generator)
   */
  outputDir: string;

  /**
   * Cache directory (VibeCoderOutput/code-map-generator/.cache)
   */
  cacheDir: string;

  /**
   * File info cache directory (VibeCoderOutput/code-map-generator/.cache/file-info)
   */
  fileInfoCacheDir: string;

  /**
   * Metadata cache directory (VibeCoderOutput/code-map-generator/.cache/metadata)
   */
  metadataCacheDir: string;

  /**
   * Temporary files directory (VibeCoderOutput/code-map-generator/.cache/temp)
   */
  tempDir: string;

  /**
   * Job-specific temporary directory (VibeCoderOutput/code-map-generator/.cache/temp/{jobId})
   */
  jobTempDir: string;
}

/**
 * Interface for path validation result.
 */
export interface PathValidationResult {
  /**
   * Whether the path is valid and within the allowed boundary.
   */
  isValid: boolean;

  /**
   * Error message if the path is invalid.
   */
  error?: string;

  /**
   * Normalized path if valid.
   */
  normalizedPath?: string;
}

/**
 * Configuration for feature flags.
 */
export interface FeatureFlagsConfig {
  /**
   * Whether to enable enhanced function detection.
   * This includes context-aware function naming, framework detection, and role identification.
   */
  enhancedFunctionDetection?: boolean;

  /**
   * Whether to enable context analysis for function detection.
   * This helps provide better names for anonymous functions based on their context.
   */
  contextAnalysis?: boolean;

  /**
   * Whether to enable framework detection.
   * This helps identify framework-specific patterns like React components, Express routes, etc.
   */
  frameworkDetection?: boolean;

  /**
   * Whether to enable role identification.
   * This helps identify function roles like event handlers, callbacks, etc.
   */
  roleIdentification?: boolean;

  /**
   * Whether to enable heuristic naming.
   * This helps provide better names for functions without explicit names.
   */
  heuristicNaming?: boolean;

  /**
   * Whether to enable memory optimization features.
   * This includes lazy grammar loading, AST caching, and incremental processing.
   */
  memoryOptimization?: boolean;
}

/**
 * Configuration for import resolution.
 */
export interface ImportResolverConfig {
  /**
   * Whether to enable import resolution.
   * Default is false.
   */
  enabled: boolean;

  /**
   * Maximum size of the import cache.
   * Default is 10000.
   */
  cacheSize?: number;

  /**
   * Whether to use the cache.
   * Default is true.
   */
  useCache?: boolean;

  /**
   * Extensions to try when resolving imports for each language.
   */
  extensions?: Record<string, string[]>;

  /**
   * Whether to generate import graphs.
   * Default is false.
   */
  generateImportGraph?: boolean;

  /**
   * Whether to temporarily expand the security boundary for import resolution.
   * When true, the import resolver will attempt to resolve imports outside the
   * allowed mapping directory, but will not access their content.
   * Default is true.
   */
  expandSecurityBoundary?: boolean;

  /**
   * Whether to enhance imports with third-party resolvers.
   * Default is false.
   */
  enhanceImports?: boolean;

  /**
   * Maximum depth for import resolution.
   * Default is 3.
   */
  importMaxDepth?: number;

  /**
   * Path to tsconfig.json for TypeScript projects.
   */
  tsConfig?: string;

  /**
   * Path to Python executable for Python projects.
   */
  pythonPath?: string;

  /**
   * Python version for Python projects.
   */
  pythonVersion?: string;

  /**
   * Path to virtual environment for Python projects.
   */
  venvPath?: string;

  /**
   * Path to Clangd executable for C/C++ projects.
   */
  clangdPath?: string;

  /**
   * Compile flags for C/C++ projects.
   */
  compileFlags?: string[];

  /**
   * Include paths for C/C++ projects.
   */
  includePaths?: string[];

  /**
   * Custom Semgrep patterns for import detection.
   */
  semgrepPatterns?: string[];

  /**
   * Timeout for Semgrep analysis (in seconds).
   */
  semgrepTimeout?: number;

  /**
   * Maximum memory for Semgrep analysis.
   */
  semgrepMaxMemory?: string;

  /**
   * Whether to disable Semgrep fallback for unsupported file types.
   */
  disableSemgrepFallback?: boolean;
}
