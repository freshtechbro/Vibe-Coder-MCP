/**
 * Core type definitions for the Context Curator tool.
 * This file contains Zod schemas and TypeScript interfaces for all Context Curator operations.
 */

import { z } from 'zod';

/**
 * Task type enumeration for different development scenarios
 */
export const taskTypeSchema = z.enum(['feature_addition', 'refactoring', 'bug_fix', 'performance_optimization', 'general'], {
  errorMap: () => ({ message: 'Task type must be one of: feature_addition, refactoring, bug_fix, performance_optimization, general' })
});

export type TaskType = z.infer<typeof taskTypeSchema>;

/**
 * Output format enumeration for different output types
 */
export const outputFormatSchema = z.enum(['xml', 'json', 'yaml'], {
  errorMap: () => ({ message: 'Output format must be one of: xml, json, yaml' })
});

export type OutputFormat = z.infer<typeof outputFormatSchema>;

/**
 * Relevance score with confidence and reasoning
 */
export const relevanceScoreSchema = z.object({
  /** Relevance score between 0.0 and 1.0 */
  score: z.number().min(0.0).max(1.0),
  /** Confidence in the score between 0.0 and 1.0 */
  confidence: z.number().min(0.0).max(1.0),
  /** Human-readable reasoning for the score */
  reasoning: z.string().min(1, 'Reasoning cannot be empty')
});

export type RelevanceScore = z.infer<typeof relevanceScoreSchema>;

/**
 * Individual file in the context package
 */
export const contextFileSchema = z.object({
  /** Relative path from project root */
  path: z.string().min(1, 'Path cannot be empty'),
  /** File content (null if optimized) */
  content: z.string().nullable(),
  /** File size in bytes */
  size: z.number().min(0),
  /** Last modification date */
  lastModified: z.date(),
  /** Programming language */
  language: z.string(),
  /** Whether content has been optimized/summarized */
  isOptimized: z.boolean(),
  /** Estimated token count */
  tokenCount: z.number().min(0),
  /** Summary for optimized files */
  optimizedSummary: z.string().optional()
}).refine(data => {
  // If optimized, must have summary
  if (data.isOptimized && data.content === null) {
    return data.optimizedSummary !== undefined && data.optimizedSummary.length > 0;
  }
  return true;
}, {
  message: 'Optimized files must have a non-empty optimizedSummary',
  path: ['optimizedSummary']
});

export type ContextFile = z.infer<typeof contextFileSchema>;

/**
 * File with relevance scoring and categorization
 */
export const fileRelevanceSchema = z.object({
  /** The file information */
  file: contextFileSchema,
  /** Relevance score for this file */
  relevanceScore: relevanceScoreSchema,
  /** Categories this file belongs to */
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  /** Keywords extracted from the file */
  extractedKeywords: z.array(z.string())
});

export type FileRelevance = z.infer<typeof fileRelevanceSchema>;

/**
 * File with priority classification for multi-strategy discovery
 */
export const prioritizedFileSchema = z.object({
  /** File path */
  path: z.string().min(1),
  /** Priority level based on confidence and strategy */
  priority: z.enum(['high', 'medium', 'low']),
  /** Reasoning for file relevance */
  reasoning: z.string().min(1),
  /** Confidence score from discovery strategy */
  confidence: z.number().min(0).max(1),
  /** Estimated tokens for this file */
  estimatedTokens: z.number().min(0),
  /** Likelihood of modification */
  modificationLikelihood: z.enum(['very_high', 'high', 'medium', 'low', 'very_low']),
  /** Strategy that discovered this file */
  strategy: z.enum(['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis']),
  /** Priority level classification */
  priorityLevel: z.enum(['high', 'medium', 'low']),
  /** Whether file content should be included */
  includeContent: z.boolean(),
  /** Actual file content (if included) */
  content: z.string().optional()
});

export type PrioritizedFile = z.infer<typeof prioritizedFileSchema>;

/**
 * Multi-strategy file discovery result with consolidated findings
 */
export const multiStrategyFileDiscoveryResultSchema = z.object({
  /** Search strategy identifier */
  searchStrategy: z.literal('multi_strategy'),
  /** Breakdown of results by individual strategy */
  strategyBreakdown: z.object({
    semantic_similarity: z.object({
      filesFound: z.number().min(0),
      averageConfidence: z.number().min(0).max(1),
      processingTimeMs: z.number().min(0)
    }),
    keyword_matching: z.object({
      filesFound: z.number().min(0),
      averageConfidence: z.number().min(0).max(1),
      processingTimeMs: z.number().min(0)
    }),
    semantic_and_keyword: z.object({
      filesFound: z.number().min(0),
      averageConfidence: z.number().min(0).max(1),
      processingTimeMs: z.number().min(0)
    }),
    structural_analysis: z.object({
      filesFound: z.number().min(0),
      averageConfidence: z.number().min(0).max(1),
      processingTimeMs: z.number().min(0)
    })
  }),
  /** Consolidated prioritized files */
  relevantFiles: z.array(prioritizedFileSchema),
  /** Total files analyzed across all strategies */
  totalFilesAnalyzed: z.number().min(0),
  /** Total processing time for all strategies */
  processingTimeMs: z.number().min(0),
  /** Coverage metrics for multi-strategy approach */
  coverageMetrics: z.object({
    totalTokens: z.number().min(0),
    averageConfidence: z.number().min(0).max(1),
    duplicatesRemoved: z.number().min(0),
    priorityDistribution: z.object({
      high: z.number().min(0),
      medium: z.number().min(0),
      low: z.number().min(0)
    }),
    contentInclusionStats: z.object({
      filesWithContent: z.number().min(0),
      filesPathOnly: z.number().min(0),
      totalContentTokens: z.number().min(0)
    })
  })
});

export type MultiStrategyFileDiscoveryResult = z.infer<typeof multiStrategyFileDiscoveryResultSchema>;

/**
 * Task decomposition structure for meta-prompts
 */
export const taskDecompositionSchema = z.object({
  epics: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    tasks: z.array(z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      subtasks: z.array(z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1)
      }))
    }))
  }))
});

export type TaskDecomposition = z.infer<typeof taskDecompositionSchema>;

/**
 * Meta-prompt for downstream AI agents
 */
export const metaPromptSchema = z.object({
  /** Type of development task */
  taskType: taskTypeSchema,
  /** System prompt for AI agents */
  systemPrompt: z.string().min(1, 'System prompt cannot be empty'),
  /** User prompt for AI agents */
  userPrompt: z.string().min(1, 'User prompt cannot be empty'),
  /** Summary of the codebase context */
  contextSummary: z.string().min(1, 'Context summary cannot be empty'),
  /** Structured task decomposition */
  taskDecomposition: taskDecompositionSchema,
  /** Development guidelines */
  guidelines: z.array(z.string()),
  /** Estimated complexity level */
  estimatedComplexity: z.enum(['low', 'medium', 'high', 'very_high']),
  /** AI Agent response format specification */
  aiAgentResponseFormat: z.object({
    /** Description of the response format */
    description: z.string().min(1),
    /** Structured format template */
    format: z.string().min(1),
    /** Rules for AI agents to follow */
    rules: z.array(z.string().min(1))
  }).optional()
});

export type MetaPrompt = z.infer<typeof metaPromptSchema>;

/**
 * Input parameters for Context Curator
 */
export const contextCuratorInputSchema = z.object({
  /** User's development prompt/request */
  userPrompt: z.string().min(1, 'User prompt cannot be empty'),
  /** Absolute path to the project directory */
  projectPath: z.string().min(1, 'Project path cannot be empty'),
  /** Type of development task */
  taskType: taskTypeSchema.default('general'),
  /** Maximum number of files to include */
  maxFiles: z.number().min(1).max(1000).default(100),
  /** File patterns to include */
  includePatterns: z.array(z.string()).default(['**/*']),
  /** File patterns to exclude */
  excludePatterns: z.array(z.string()).default(['node_modules/**', '.git/**', 'dist/**', 'build/**']),
  /** Specific areas to focus on */
  focusAreas: z.array(z.string()).default([]),
  /** Whether to use existing codemap cache */
  useCodeMapCache: z.boolean().default(true),
  /** Maximum age of cached codemap in minutes */
  codeMapCacheMaxAgeMinutes: z.number().min(1).max(1440).default(120),
  /** Maximum token budget for the context package */
  maxTokenBudget: z.number().min(1000).max(500000).default(250000)
});

export type ContextCuratorInput = z.infer<typeof contextCuratorInputSchema>;

/**
 * Configuration for Context Curator behavior
 */
export const contextCuratorConfigSchema = z.object({
  /** Content density and optimization settings */
  contentDensity: z.object({
    /** Maximum content length before optimization (inherits from Code-Map Generator) */
    maxContentLength: z.number().min(0).default(0),
    /** File size threshold for optimization (LOC) */
    optimizationThreshold: z.number().min(1).default(1000),
    /** Whether to preserve comments in optimized content */
    preserveComments: z.boolean().default(true),
    /** Whether to preserve type definitions */
    preserveTypes: z.boolean().default(true)
  }).default({}),
  
  /** Relevance scoring configuration */
  relevanceScoring: z.object({
    /** Weight for keyword matching */
    keywordWeight: z.number().min(0).max(1).default(0.3),
    /** Weight for semantic similarity */
    semanticWeight: z.number().min(0).max(1).default(0.4),
    /** Weight for structural importance */
    structuralWeight: z.number().min(0).max(1).default(0.3),
    /** Minimum relevance threshold for inclusion */
    minRelevanceThreshold: z.number().min(0).max(1).default(0.1)
  }).default({}),
  
  /** Output format configuration */
  outputFormat: z.object({
    /** Output format type */
    format: outputFormatSchema.default('xml'),
    /** Whether to include meta-prompt in output */
    includeMetaPrompt: z.boolean().default(true),
    /** Whether to include file content */
    includeFileContent: z.boolean().default(true),
    /** Whether to validate output format */
    validateOutput: z.boolean().default(true),
    /** Template customization options */
    templateOptions: z.object({
      /** Whether to include atomic task guidelines */
      includeAtomicGuidelines: z.boolean().default(true),
      /** Whether to include architectural patterns */
      includeArchitecturalPatterns: z.boolean().default(true),
      /** Custom template variables */
      customVariables: z.record(z.string()).default({})
    }).default({})
  }).default({}),
  
  /** LLM integration settings */
  llmIntegration: z.object({
    /** Maximum retry attempts for LLM calls */
    maxRetries: z.number().min(1).default(3),
    /** Timeout for LLM calls in milliseconds */
    timeoutMs: z.number().min(1000).default(30000),
    /** Fallback model if primary fails */
    fallbackModel: z.string().default('deepseek/deepseek-r1-0528-qwen3-8b:free')
  }).default({})
}).default({});

export type ContextCuratorConfig = z.infer<typeof contextCuratorConfigSchema>;

/**
 * Complete context package output
 */
export const contextPackageSchema = z.object({
  /** Unique identifier for this context package */
  id: z.string().min(1),
  /** Original user prompt */
  userPrompt: z.string(),
  /** Refined prompt after enhancement */
  refinedPrompt: z.string().optional(),
  /** Task type */
  taskType: taskTypeSchema,
  /** Project path */
  projectPath: z.string(),
  /** Path to the generated codemap file */
  codemapPath: z.string().optional(),
  /** Full codemap content for comprehensive analysis */
  codemapContent: z.string().optional(),
  /** Generation timestamp */
  generatedAt: z.date(),
  /** Relevance-ranked files */
  files: z.array(fileRelevanceSchema),
  /** Generated meta-prompt */
  metaPrompt: metaPromptSchema,
  /** Package statistics */
  statistics: z.object({
    /** Total number of files processed */
    totalFiles: z.number().min(0),
    /** Total token count */
    totalTokens: z.number().min(0),
    /** Average relevance score */
    averageRelevanceScore: z.number().min(0).max(1),
    /** Processing time in milliseconds */
    processingTimeMs: z.number().min(0),
    /** Cache hit rate */
    cacheHitRate: z.number().min(0).max(1)
  }),
  /** Package quality metrics (Phase 7 enhancement) */
  qualityMetrics: z.object({
    /** Overall quality score (0-1) */
    overallScore: z.number().min(0).max(1),
    /** Schema compliance score (0-1) */
    schemaCompliance: z.number().min(0).max(1),
    /** Content completeness score (0-1) */
    contentCompleteness: z.number().min(0).max(1),
    /** Meta-prompt quality score (0-1) */
    metaPromptQuality: z.number().min(0).max(1),
    /** File relevance score (0-1) */
    fileRelevance: z.number().min(0).max(1),
    /** Token efficiency score (0-1) */
    tokenEfficiency: z.number().min(0).max(1),
    /** Task decomposition quality (0-1) */
    taskDecompositionQuality: z.number().min(0).max(1)
  }).optional(),
  /** Compression metadata (Phase 7 enhancement) */
  compressionMetadata: z.object({
    /** Original size in bytes */
    originalSize: z.number().min(0),
    /** Compressed size in bytes */
    compressedSize: z.number().min(0),
    /** Compression ratio (compressed/original) */
    compressionRatio: z.number().min(0).max(1),
    /** Compression algorithm used */
    algorithm: z.string(),
    /** Compression level */
    compressionLevel: z.number().min(1).max(9),
    /** Time taken to compress in milliseconds */
    compressionTimeMs: z.number().min(0),
    /** Checksum for integrity verification */
    checksum: z.string()
  }).optional(),
  /** Cache metadata (Phase 7 enhancement) */
  cacheMetadata: z.object({
    /** Cache key for this package */
    cacheKey: z.string(),
    /** Whether this package was retrieved from cache */
    fromCache: z.boolean(),
    /** Timestamp when cached */
    cachedAt: z.date().optional(),
    /** Cache hit count */
    hitCount: z.number().min(0).optional(),
    /** Cache TTL in milliseconds */
    ttlMs: z.number().min(0).optional()
  }).optional(),
  /** Debug information for troubleshooting */
  debugInfo: z.object({
    /** Length of codemap content */
    codemapContentLength: z.number().min(0),
    /** Number of files with actual content */
    filesWithContent: z.number().min(0),
    /** Total files analyzed */
    totalFilesAnalyzed: z.number().min(0),
    /** Intent analysis confidence */
    intentAnalysisConfidence: z.number().min(0).max(1),
    /** Average file relevance score */
    averageFileRelevance: z.number().min(0).max(1)
  }).optional()
});

export type ContextPackage = z.infer<typeof contextPackageSchema>;

/**
 * Validation helper functions
 */
export const validateContextCuratorInput = (input: unknown): ContextCuratorInput => {
  return contextCuratorInputSchema.parse(input);
};

export const validateContextCuratorConfig = (config: unknown): ContextCuratorConfig => {
  return contextCuratorConfigSchema.parse(config);
};

export const validateContextPackage = (pkg: unknown): ContextPackage => {
  return contextPackageSchema.parse(pkg);
};

/**
 * Format-specific output validation schemas
 */
export const xmlOutputValidationSchema = z.object({
  /** XML declaration present */
  hasXmlDeclaration: z.boolean(),
  /** Well-formed XML structure */
  isWellFormed: z.boolean(),
  /** Schema compliance */
  schemaCompliant: z.boolean(),
  /** Character encoding validation */
  validEncoding: z.boolean()
});

export const jsonOutputValidationSchema = z.object({
  /** Valid JSON syntax */
  isValidJson: z.boolean(),
  /** Schema compliance */
  schemaCompliant: z.boolean(),
  /** Required fields present */
  hasRequiredFields: z.boolean()
});

export const yamlOutputValidationSchema = z.object({
  /** Valid YAML syntax */
  isValidYaml: z.boolean(),
  /** Schema compliance */
  schemaCompliant: z.boolean(),
  /** Required fields present */
  hasRequiredFields: z.boolean()
});

export type XmlOutputValidation = z.infer<typeof xmlOutputValidationSchema>;
export type JsonOutputValidation = z.infer<typeof jsonOutputValidationSchema>;
export type YamlOutputValidation = z.infer<typeof yamlOutputValidationSchema>;
