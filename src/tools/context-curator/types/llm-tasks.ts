/**
 * LLM task type definitions for the Context Curator tool.
 * This file contains enums, interfaces, and validation schemas for all LLM operations.
 */

import { z } from 'zod';
import { taskTypeSchema } from './context-curator.js';

/**
 * Enum for all Context Curator LLM tasks
 * Values must match exactly with llm_config.json task names
 */
export enum ContextCuratorLLMTask {
  INTENT_ANALYSIS = 'context_curator_intent_analysis',
  PROMPT_REFINEMENT = 'context_curator_prompt_refinement',
  FILE_DISCOVERY = 'context_curator_file_discovery',
  RELEVANCE_SCORING = 'context_curator_relevance_scoring',
  META_PROMPT_GENERATION = 'context_curator_meta_prompt_generation',
  ARCHITECTURAL_ANALYSIS = 'context_curator_architectural_analysis'
}

/**
 * Schema for intent analysis results
 */
export const intentAnalysisResultSchema = z.object({
  /** Detected task type */
  taskType: taskTypeSchema,
  /** Confidence in the analysis (0.0 to 1.0) */
  confidence: z.number().min(0).max(1),
  /** Reasoning for the analysis */
  reasoning: z.array(z.string()).min(1, 'At least one reasoning item is required'),
  /** Identified architectural components */
  architecturalComponents: z.array(z.string()),
  /** Scope assessment */
  scopeAssessment: z.object({
    complexity: z.enum(['simple', 'moderate', 'complex']),
    estimatedFiles: z.number().min(0),
    riskLevel: z.enum(['low', 'medium', 'high'])
  }),
  /** Suggested focus areas for analysis */
  suggestedFocusAreas: z.array(z.string()),
  /** Estimated effort level */
  estimatedEffort: z.enum(['low', 'medium', 'high', 'very_high'])
});

export type IntentAnalysisResult = z.infer<typeof intentAnalysisResultSchema> & {
  /** Enhanced project analysis data from Phase 2 */
  projectAnalysis?: ProjectTypeAnalysisResult;
  /** Enhanced language analysis data from Phase 2 */
  languageAnalysis?: LanguageAnalysisResult;
  /** Enhanced pattern analysis data from Phase 2 */
  patternAnalysis?: {
    patterns: string[];
    confidence: { [pattern: string]: number };
    evidence: { [pattern: string]: string[] };
  };
};

/**
 * Schema for file discovery results
 */
export const fileDiscoveryResultSchema = z.object({
  /** List of relevant files found */
  relevantFiles: z.array(z.object({
    path: z.string().min(1),
    priority: z.enum(['high', 'medium', 'low']),
    reasoning: z.string().min(1),
    confidence: z.number().min(0).max(1),
    estimatedTokens: z.number().min(0),
    modificationLikelihood: z.enum(['very_high', 'high', 'medium', 'low', 'very_low'])
  })),
  /** Total number of files analyzed */
  totalFilesAnalyzed: z.number().min(0),
  /** Processing time in milliseconds */
  processingTimeMs: z.number().min(0),
  /** Strategy used for file discovery */
  searchStrategy: z.enum(['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis', 'multi_strategy']),
  /** Coverage metrics */
  coverageMetrics: z.object({
    totalTokens: z.number().min(0),
    averageConfidence: z.number().min(0).max(1)
  })
});

export type FileDiscoveryResult = z.infer<typeof fileDiscoveryResultSchema>;

/**
 * Type for individual file discovery result
 */
export type FileDiscoveryFile = {
  path: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
  confidence: number;
  estimatedTokens: number;
  modificationLikelihood: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
};

/**
 * Schema for prompt refinement results
 */
export const promptRefinementResultSchema = z.object({
  /** The refined prompt */
  refinedPrompt: z.string().min(1, 'Refined prompt cannot be empty'),
  /** Reasoning for enhancements */
  enhancementReasoning: z.array(z.string()),
  /** Context that was added */
  addedContext: z.array(z.string()),
  /** Original prompt length */
  originalLength: z.number().min(0),
  /** Refined prompt length */
  refinedLength: z.number().min(0),
  /** Improvement score (0.0 to 1.0) */
  improvementScore: z.number().min(0).max(1),
  /** Types of contextual enhancements made */
  contextualEnhancements: z.array(z.string())
});

export type PromptRefinementResult = z.infer<typeof promptRefinementResultSchema>;

/**
 * Schema for relevance scoring results
 */
export const relevanceScoringResultSchema = z.object({
  /** Individual file scores */
  fileScores: z.array(z.object({
    filePath: z.string().min(1),
    relevanceScore: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(1),
    categories: z.array(z.string()).min(1, 'At least one category is required'),
    modificationLikelihood: z.enum(['very_high', 'high', 'medium', 'low', 'very_low']),
    estimatedTokens: z.number().min(0)
  })),
  /** Overall scoring metrics */
  overallMetrics: z.object({
    averageRelevance: z.number().min(0).max(1),
    totalFilesScored: z.number().min(0),
    highRelevanceCount: z.number().min(0),
    processingTimeMs: z.number().min(0)
  }),
  /** Strategy used for scoring */
  scoringStrategy: z.enum(['semantic_similarity', 'keyword_density', 'structural_importance', 'hybrid']),
  /** Optional chunking metadata for large file sets */
  chunkingUsed: z.boolean().optional(),
  /** Total number of chunks processed (only present when chunking is used) */
  totalChunks: z.number().min(1).optional(),
  /** Size of each chunk (only present when chunking is used) */
  chunkSize: z.number().min(1).optional()
});

export type RelevanceScoringResult = z.infer<typeof relevanceScoringResultSchema>;

/**
 * Schema for meta-prompt generation results
 */
export const metaPromptGenerationResultSchema = z.object({
  /** System prompt for AI agents */
  systemPrompt: z.string().min(1, 'System prompt cannot be empty'),
  /** User prompt for AI agents */
  userPrompt: z.string().min(1, 'User prompt cannot be empty'),
  /** Summary of the codebase context */
  contextSummary: z.string().min(1, 'Context summary cannot be empty'),
  /** Structured task decomposition */
  taskDecomposition: z.object({
    epics: z.array(z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      estimatedComplexity: z.enum(['low', 'medium', 'high', 'very_high']),
      tasks: z.array(z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        estimatedHours: z.number().min(0),
        dependencies: z.array(z.string()),
        subtasks: z.array(z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          description: z.string().min(1),
          estimatedMinutes: z.number().min(0)
        }))
      }))
    }))
  }),
  /** Development guidelines */
  guidelines: z.array(z.string()),
  /** Estimated overall complexity */
  estimatedComplexity: z.enum(['low', 'medium', 'high', 'very_high']),
  /** Quality score of the generated meta-prompt */
  qualityScore: z.number().min(0).max(1),
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

export type MetaPromptGenerationResult = z.infer<typeof metaPromptGenerationResultSchema>;

/**
 * Schema for architectural analysis results
 */
export const architecturalAnalysisResultSchema = z.object({
  /** Identified architectural patterns */
  architecturalPatterns: z.array(z.string()),
  /** Project dependencies */
  dependencies: z.array(z.object({
    name: z.string().min(1),
    version: z.string(),
    type: z.enum(['runtime', 'development', 'peer', 'optional']),
    importance: z.enum(['critical', 'important', 'optional', 'deprecated'])
  })),
  /** Code structure analysis */
  codeStructure: z.object({
    directories: z.array(z.string()),
    entryPoints: z.array(z.string()),
    configFiles: z.array(z.string())
  }),
  /** Architectural recommendations */
  recommendations: z.array(z.string()),
  /** Complexity assessment */
  complexityAssessment: z.object({
    overall: z.enum(['low', 'medium', 'high', 'very_high']),
    factors: z.array(z.string()),
    score: z.number().min(0).max(1)
  })
});

export type ArchitecturalAnalysisResult = z.infer<typeof architecturalAnalysisResultSchema>;

/**
 * Language analysis result with comprehensive language detection
 */
export interface LanguageAnalysisResult {
  /** Primary programming languages detected */
  languages: string[];
  /** File extensions found in the codebase */
  fileExtensions: string[];
  /** Grammar support status for each language */
  grammarSupport: { [language: string]: boolean };
  /** Distribution of languages by file count */
  languageDistribution: { [language: string]: number };
  /** Most prevalent language */
  primaryLanguage: string;
  /** Secondary languages (sorted by prevalence) */
  secondaryLanguages: string[];
  /** Framework indicators detected */
  frameworkIndicators: string[];
  /** Build system indicators detected */
  buildSystemIndicators: string[];
  /** Language confidence scores */
  languageConfidence: { [language: string]: number };
  /** Total files analyzed */
  totalFilesAnalyzed: number;
}

/**
 * Enhanced project type analysis result
 */
export interface ProjectTypeAnalysisResult {
  /** Primary project type */
  projectType: string;
  /** Secondary project types */
  secondaryTypes: string[];
  /** Confidence score for primary type */
  confidence: number;
  /** Evidence supporting the classification */
  evidence: string[];
  /** Framework stack detected */
  frameworkStack: string[];
  /** Architecture style indicators */
  architectureStyle: string[];
  /** Development environment indicators */
  developmentEnvironment: string[];
}

/**
 * Schema for LLM task errors
 */
export const llmTaskErrorSchema = z.object({
  /** The task that failed */
  task: z.nativeEnum(ContextCuratorLLMTask),
  /** Error message */
  message: z.string().min(1, 'Error message cannot be empty'),
  /** Error code */
  code: z.string().min(1),
  /** Additional error details */
  details: z.record(z.unknown()),
  /** Whether the error is recoverable */
  recoverable: z.boolean()
});

export type LLMTaskError = z.infer<typeof llmTaskErrorSchema>;

/**
 * Validation helper functions
 */
export const validateIntentAnalysisResult = (result: unknown): result is IntentAnalysisResult => {
  try {
    intentAnalysisResultSchema.parse(result);
    return true;
  } catch {
    return false;
  }
};

export const validateFileDiscoveryResult = (result: unknown): result is FileDiscoveryResult => {
  try {
    fileDiscoveryResultSchema.parse(result);
    return true;
  } catch {
    return false;
  }
};

export const validatePromptRefinementResult = (result: unknown): result is PromptRefinementResult => {
  try {
    promptRefinementResultSchema.parse(result);
    return true;
  } catch {
    return false;
  }
};

export const validateRelevanceScoringResult = (result: unknown): result is RelevanceScoringResult => {
  try {
    relevanceScoringResultSchema.parse(result);
    return true;
  } catch {
    return false;
  }
};

export const validateMetaPromptGenerationResult = (result: unknown): result is MetaPromptGenerationResult => {
  try {
    metaPromptGenerationResultSchema.parse(result);
    return true;
  } catch {
    return false;
  }
};

export const validateArchitecturalAnalysisResult = (result: unknown): result is ArchitecturalAnalysisResult => {
  try {
    architecturalAnalysisResultSchema.parse(result);
    return true;
  } catch {
    return false;
  }
};

/**
 * Helper function to get LLM task name from enum
 */
export const getLLMTaskName = (task: ContextCuratorLLMTask): string => {
  return task;
};

/**
 * Helper function to validate any LLM task result
 */
export const validateLLMTaskResult = (task: ContextCuratorLLMTask, result: unknown): boolean => {
  switch (task) {
    case ContextCuratorLLMTask.INTENT_ANALYSIS:
      return validateIntentAnalysisResult(result);
    case ContextCuratorLLMTask.FILE_DISCOVERY:
      return validateFileDiscoveryResult(result);
    case ContextCuratorLLMTask.PROMPT_REFINEMENT:
      return validatePromptRefinementResult(result);
    case ContextCuratorLLMTask.RELEVANCE_SCORING:
      return validateRelevanceScoringResult(result);
    case ContextCuratorLLMTask.META_PROMPT_GENERATION:
      return validateMetaPromptGenerationResult(result);
    case ContextCuratorLLMTask.ARCHITECTURAL_ANALYSIS:
      return validateArchitecturalAnalysisResult(result);
    default:
      return false;
  }
};
