/**
 * Relevance Scoring Prompt Templates for Context Curator
 * 
 * Provides comprehensive prompt templates for scoring file relevance
 * based on file discovery results, intent analysis, and refined prompts
 * to generate detailed relevance assessments for development tasks.
 */

import { ContextCuratorLLMTask } from '../types/llm-tasks.js';
import { IntentAnalysisResult, FileDiscoveryResult } from '../types/llm-tasks.js';

/**
 * System prompt for relevance scoring operations
 */
export const RELEVANCE_SCORING_SYSTEM_PROMPT = `You are an expert software architect and relevance analyst specializing in scoring file relevance for development tasks.

🚨 CRITICAL INSTRUCTION: You MUST score ALL files provided in the input. Never return a single file response. Always return a complete fileScores array with every file from the input list.

Your task is to analyze discovered files and assign detailed relevance scores based on their importance to the specific development request.

## SCORING STRATEGIES

**Semantic Similarity**: 
- Analyze conceptual relationships between files and task requirements
- Consider functional overlap and domain relevance
- Evaluate how files contribute to the overall system behavior
- Focus on meaning and purpose rather than surface-level matches

**Keyword Density**:
- Analyze frequency and importance of task-related keywords in file content
- Consider file names, function names, class names, and comments
- Weight keywords by their specificity and relevance to the task
- Factor in keyword context and usage patterns

**Structural Importance**:
- Evaluate files based on their architectural significance
- Consider dependency relationships and import/export patterns
- Assess impact on system structure and component interactions
- Factor in file size, complexity, and centrality in the codebase

**Hybrid**:
- Combine semantic, keyword, and structural analysis
- Weight different factors based on task type and context
- Provide balanced assessment considering multiple relevance dimensions
- Optimize for comprehensive understanding of file importance

## RELEVANCE SCORING CRITERIA

**Score Range**: 0.0 to 1.0
- **0.9-1.0**: Critical files that are central to the task
- **0.7-0.8**: Important files that will likely need modification
- **0.5-0.6**: Supporting files that provide necessary context
- **0.3-0.4**: Reference files that may be consulted
- **0.0-0.2**: Minimally relevant or background files

## CONFIDENCE ASSESSMENT

Rate confidence (0.0 to 1.0) based on:
- Quality and completeness of available file information
- Clarity of the relationship between file and task
- Consistency of relevance indicators across different analysis methods
- Certainty about the file's role in the development task

## RELEVANCE CATEGORIES

Assign files to relevant categories:
- **core**: Files central to the main functionality being developed/modified
- **integration**: Files that handle connections between components
- **configuration**: Files that control system behavior and settings
- **testing**: Files related to testing the functionality
- **documentation**: Files that document the functionality
- **utilities**: Helper files and utility functions
- **dependencies**: External or internal dependencies
- **infrastructure**: Build, deployment, and development infrastructure

## MODIFICATION LIKELIHOOD

Assess how likely each file is to be modified:
- **very_high**: File will almost certainly be modified
- **high**: File will likely be modified
- **medium**: File may be modified depending on implementation approach
- **low**: File unlikely to be modified but provides important context
- **very_low**: File provides background context only

## RESPONSE FORMAT

🚨 CRITICAL: You MUST score ALL files in the input list. Respond with a valid JSON object matching this exact structure with a fileScores array containing EVERY file:

{
  "fileScores": [
    {
      "filePath": "relative/path/to/file.ext",
      "relevanceScore": 0.0-1.0,
      "confidence": 0.0-1.0,
      "reasoning": "Detailed explanation of relevance assessment",
      "categories": ["category1", "category2"],
      "modificationLikelihood": "very_high|high|medium|low|very_low",
      "estimatedTokens": number
    }
  ],
  "overallMetrics": {
    "averageRelevance": 0.0-1.0,
    "totalFilesScored": number,
    "highRelevanceCount": number,
    "processingTimeMs": number
  },
  "scoringStrategy": "semantic_similarity|keyword_density|structural_importance|hybrid"
}

## SCORING GUIDELINES

1. **Be Precise**: Provide accurate relevance scores based on thorough analysis
2. **Be Comprehensive**: Consider all aspects of file relevance to the task
3. **Provide Clear Reasoning**: Explain the rationale behind each relevance score
4. **Categorize Appropriately**: Assign meaningful categories that reflect file roles
5. **Assess Realistically**: Provide honest confidence scores and modification likelihood
6. **Consider Context**: Factor in the specific development task and codebase context
7. **Preserve Token Estimates**: ALWAYS include the exact estimatedTokens value from the file discovery results for each file

IMPORTANT: For each file, you MUST preserve the exact estimatedTokens value provided in the file discovery results. Do not modify or recalculate these values.

Analyze the discovered files and development context to provide detailed relevance scoring for the task.`;

/**
 * Build user prompt for relevance scoring
 */
export function buildRelevanceScoringPrompt(
  originalPrompt: string,
  intentAnalysis: IntentAnalysisResult,
  refinedPrompt: string,
  fileDiscoveryResult: FileDiscoveryResult,
  scoringStrategy: 'semantic_similarity' | 'keyword_density' | 'structural_importance' | 'hybrid',
  additionalContext?: {
    codemapContent?: string;
    priorityWeights?: {
      semantic: number;
      keyword: number;
      structural: number;
    };
    categoryFilters?: string[];
    minRelevanceThreshold?: number;
  }
): string {
  let prompt = `DEVELOPMENT REQUEST:
${originalPrompt}

REFINED PROMPT:
${refinedPrompt}

INTENT ANALYSIS:
Task Type: ${intentAnalysis.taskType}
Confidence: ${intentAnalysis.confidence}
Complexity: ${intentAnalysis.scopeAssessment.complexity}
Risk Level: ${intentAnalysis.scopeAssessment.riskLevel}
Estimated Files: ${intentAnalysis.scopeAssessment.estimatedFiles}
Estimated Effort: ${intentAnalysis.estimatedEffort}

Reasoning: ${intentAnalysis.reasoning.join(', ')}
Architectural Components: ${intentAnalysis.architecturalComponents.join(', ')}
Suggested Focus Areas: ${intentAnalysis.suggestedFocusAreas.join(', ')}

DISCOVERED FILES:
Total Files Analyzed: ${fileDiscoveryResult.totalFilesAnalyzed}
Processing Time: ${fileDiscoveryResult.processingTimeMs}ms
Search Strategy Used: ${fileDiscoveryResult.searchStrategy}
Average Confidence: ${fileDiscoveryResult.coverageMetrics.averageConfidence}

Relevant Files Found:`;

  fileDiscoveryResult.relevantFiles.forEach((file, index) => {
    prompt += `
${index + 1}. ${file.path}
   Priority: ${file.priority}
   Confidence: ${file.confidence}
   Estimated Tokens: ${file.estimatedTokens}
   Modification Likelihood: ${file.modificationLikelihood}
   Reasoning: ${file.reasoning}`;
  });

  prompt += `\n\nSCORING STRATEGY: ${scoringStrategy}`;

  if (additionalContext) {
    const contextItems: string[] = [];

    if (additionalContext.codemapContent) {
      contextItems.push(`Complete Codebase Content: ${additionalContext.codemapContent}`);
    }

    if (additionalContext.priorityWeights) {
      const weights = additionalContext.priorityWeights;
      contextItems.push(`Priority Weights: Semantic=${weights.semantic}, Keyword=${weights.keyword}, Structural=${weights.structural}`);
    }

    if (additionalContext.categoryFilters && additionalContext.categoryFilters.length > 0) {
      contextItems.push(`Focus Categories: ${additionalContext.categoryFilters.join(', ')}`);
    }

    if (additionalContext.minRelevanceThreshold) {
      contextItems.push(`Minimum Relevance Threshold: ${additionalContext.minRelevanceThreshold}`);
    }

    if (contextItems.length > 0) {
      prompt += '\n\nADDITIONAL CONTEXT:\n' + contextItems.join('\n');
    }
  }

  const fileCount = fileDiscoveryResult.relevantFiles.length;

  prompt += `\n\nUsing the ${scoringStrategy} strategy, provide detailed relevance scoring for each discovered file. Focus on how each file relates to the development task and assign appropriate relevance scores, confidence levels, categories, and modification likelihood.

🚨 CRITICAL REQUIREMENTS - FAILURE TO FOLLOW WILL RESULT IN RETRY 🚨
- You must score ALL ${fileCount} files listed above
- Your fileScores array must contain exactly ${fileCount} entries
- Base your analysis on the actual codebase structure provided
- Do not make assumptions about project type - use only observable code patterns
- NEVER return a single file object - ALWAYS return the array format

RESPONSE VALIDATION CHECKLIST:
Before submitting your response, verify:
✓ fileScores array has exactly ${fileCount} entries
✓ Each file from the input list has a corresponding score entry
✓ overallMetrics.totalFilesScored equals ${fileCount}
✓ Response starts with { "fileScores": [
✓ Response ends with valid JSON structure

🚨 CRITICAL REQUIREMENT 🚨
YOU MUST SCORE EXACTLY ${fileCount} FILES - NOT 1, NOT 2, BUT ALL ${fileCount} FILES!
INCOMPLETE RESPONSES WILL BE AUTOMATICALLY RETRIED!

❌ WRONG - SINGLE FILE RESPONSE (WILL BE REJECTED AND RETRIED):
{
  "filePath": "single/file/path.ts",
  "relevanceScore": 0.98,
  "confidence": 0.95,
  "reasoning": "...",
  "categories": ["core"],
  "modificationLikelihood": "very_high",
  "estimatedTokens": 500
}

❌ WRONG - INCOMPLETE ARRAY (WILL BE REJECTED AND RETRIED):
{
  "fileScores": [
    { "filePath": "file1.ts", "relevanceScore": 0.98, ... },
    { "filePath": "file2.ts", "relevanceScore": 0.85, ... }
    // MISSING ${fileCount - 2} FILES - THIS WILL BE RETRIED!
  ]
}

✅ CORRECT - COMPLETE ARRAY WITH ALL ${fileCount} FILES:
{
  "fileScores": [
    { "filePath": "file1.ts", "relevanceScore": 0.98, "confidence": 0.95, "reasoning": "...", "categories": ["core"], "modificationLikelihood": "very_high", "estimatedTokens": 500 },
    { "filePath": "file2.ts", "relevanceScore": 0.85, "confidence": 0.90, "reasoning": "...", "categories": ["integration"], "modificationLikelihood": "high", "estimatedTokens": 300 },
    { "filePath": "file3.ts", "relevanceScore": 0.70, "confidence": 0.85, "reasoning": "...", "categories": ["utility"], "modificationLikelihood": "medium", "estimatedTokens": 200 },
    // ... CONTINUE FOR ALL ${fileCount} FILES - DO NOT STOP EARLY!
  ],
  "overallMetrics": {
    "averageRelevance": 0.0-1.0,
    "totalFilesScored": ${fileCount},
    "highRelevanceCount": number,
    "processingTimeMs": 0
  },
  "scoringStrategy": "${scoringStrategy}"
}

FINAL VALIDATION CHECKLIST - VERIFY BEFORE SUBMITTING:
☐ Does your response start with { "fileScores": [ ?
☐ Does your fileScores array have exactly ${fileCount} entries?
☐ Did you score every single file from the list above?
☐ Does your overallMetrics.totalFilesScored equal ${fileCount}?
☐ Is your response valid JSON?
☐ Did you avoid returning a single file object?

IF ANY CHECKBOX IS UNCHECKED, YOUR RESPONSE IS INVALID AND WILL BE RETRIED!

REQUIRED JSON STRUCTURE FOR ${fileCount} FILES:
{
  "fileScores": [
    // Exactly ${fileCount} entries here - one for each file listed above
    {
      "filePath": "exact path from the files list above",
      "relevanceScore": 0.0-1.0,
      "confidence": 0.0-1.0,
      "reasoning": "Based on codebase analysis: why this file is/isn't relevant",
      "categories": ["category1", "category2"],
      "modificationLikelihood": "very_high|high|medium|low|very_low",
      "estimatedTokens": number
    }
  ],
  "overallMetrics": {
    "averageRelevance": 0.0-1.0,
    "totalFilesScored": ${fileCount},
    "highRelevanceCount": number,
    "processingTimeMs": 0
  },
  "scoringStrategy": "${scoringStrategy}"
}

RESPONSE LENGTH EXPECTATION:
For ${fileCount} files, your response should be approximately ${Math.max(2000, fileCount * 150)} characters.
If your response is significantly shorter, you likely missed files.

SELF-VALIDATION BEFORE RESPONDING:
1. Count the entries in your fileScores array
2. Verify the count equals ${fileCount}
3. Check that you have an entry for each file path listed above
4. Ensure your JSON is valid and complete

IMPORTANT: Start your response with { and end with }. Do not include any text before or after the JSON object.`;

  return prompt;
}

/**
 * JSON schema for relevance scoring response validation
 */
export const RELEVANCE_SCORING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    fileScores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            minLength: 1,
            description: 'Relative path to the file'
          },
          relevanceScore: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Relevance score from 0.0 to 1.0'
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score from 0.0 to 1.0'
          },
          reasoning: {
            type: 'string',
            minLength: 1,
            description: 'Detailed explanation of relevance assessment'
          },
          categories: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Relevance categories for the file'
          },
          modificationLikelihood: {
            type: 'string',
            enum: ['very_high', 'high', 'medium', 'low', 'very_low'],
            description: 'Likelihood that this file will be modified'
          },
          estimatedTokens: {
            type: 'number',
            minimum: 0,
            description: 'Estimated token count for the file (preserve from file discovery)'
          }
        },
        required: ['filePath', 'relevanceScore', 'confidence', 'reasoning', 'categories', 'modificationLikelihood', 'estimatedTokens'],
        additionalProperties: false
      },
      description: 'Individual file relevance scores'
    },
    overallMetrics: {
      type: 'object',
      properties: {
        averageRelevance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Average relevance score across all files'
        },
        totalFilesScored: {
          type: 'number',
          minimum: 0,
          description: 'Total number of files scored'
        },
        highRelevanceCount: {
          type: 'number',
          minimum: 0,
          description: 'Number of files with high relevance (>= 0.7)'
        },
        processingTimeMs: {
          type: 'number',
          minimum: 0,
          description: 'Processing time in milliseconds'
        }
      },
      required: ['averageRelevance', 'totalFilesScored', 'highRelevanceCount', 'processingTimeMs'],
      additionalProperties: false,
      description: 'Overall scoring metrics'
    },
    scoringStrategy: {
      type: 'string',
      enum: ['semantic_similarity', 'keyword_density', 'structural_importance', 'hybrid'],
      description: 'Strategy used for relevance scoring'
    }
  },
  required: [
    'fileScores',
    'overallMetrics',
    'scoringStrategy'
  ],
  additionalProperties: false
} as const;

/**
 * Example prompts for different relevance scoring scenarios
 */
export const RELEVANCE_SCORING_EXAMPLES = {
  semantic_similarity_refactoring: {
    originalPrompt: 'Refactor the authentication module to use JWT tokens',
    scoringStrategy: 'semantic_similarity' as const,
    intentAnalysis: {
      taskType: 'refactoring' as const,
      confidence: 0.9,
      reasoning: ['Request explicitly mentions refactoring existing authentication'],
      architecturalComponents: ['authentication', 'security', 'token-management'],
      scopeAssessment: {
        complexity: 'moderate' as const,
        estimatedFiles: 8,
        riskLevel: 'medium' as const
      },
      suggestedFocusAreas: ['security-patterns', 'token-validation'],
      estimatedEffort: 'medium' as const
    },
    fileDiscoveryResult: {
      relevantFiles: [
        {
          path: 'src/auth/authentication.ts',
          priority: 'high' as const,
          reasoning: 'Core authentication module',
          confidence: 0.95,
          estimatedTokens: 800,
          modificationLikelihood: 'very_high' as const
        },
        {
          path: 'src/auth/middleware/auth-middleware.ts',
          priority: 'high' as const,
          reasoning: 'Authentication middleware',
          confidence: 0.9,
          estimatedTokens: 600,
          modificationLikelihood: 'high' as const
        }
      ],
      totalFilesAnalyzed: 150,
      processingTimeMs: 2500,
      searchStrategy: 'semantic_similarity' as const,
      coverageMetrics: {
        totalTokens: 1400,
        averageConfidence: 0.925
      }
    },
    expectedResponse: {
      fileScores: [
        {
          filePath: 'src/auth/authentication.ts',
          relevanceScore: 0.95,
          confidence: 0.9,
          reasoning: 'Core authentication module that directly handles user authentication logic and will be central to JWT token implementation',
          categories: ['core', 'authentication'],
          modificationLikelihood: 'very_high' as const
        },
        {
          filePath: 'src/auth/middleware/auth-middleware.ts',
          relevanceScore: 0.85,
          confidence: 0.85,
          reasoning: 'Authentication middleware that validates tokens and will need updates for JWT token validation',
          categories: ['integration', 'authentication'],
          modificationLikelihood: 'high' as const
        }
      ],
      overallMetrics: {
        averageRelevance: 0.9,
        totalFilesScored: 2,
        highRelevanceCount: 2,
        processingTimeMs: 1800
      },
      scoringStrategy: 'semantic_similarity' as const
    }
  },

  keyword_density_feature: {
    originalPrompt: 'Add user dashboard with analytics charts',
    scoringStrategy: 'keyword_density' as const,
    intentAnalysis: {
      taskType: 'feature_addition' as const,
      confidence: 0.95,
      reasoning: ['Request is for adding new dashboard functionality'],
      architecturalComponents: ['frontend', 'ui-components', 'analytics', 'data-visualization'],
      scopeAssessment: {
        complexity: 'complex' as const,
        estimatedFiles: 15,
        riskLevel: 'medium' as const
      },
      suggestedFocusAreas: ['ui-design', 'data-aggregation'],
      estimatedEffort: 'high' as const
    },
    fileDiscoveryResult: {
      relevantFiles: [
        {
          path: 'src/components/Dashboard.tsx',
          priority: 'high' as const,
          reasoning: 'Existing dashboard component',
          confidence: 0.9,
          estimatedTokens: 1200,
          modificationLikelihood: 'very_high' as const
        },
        {
          path: 'src/services/analytics-service.ts',
          priority: 'high' as const,
          reasoning: 'Analytics service for data processing',
          confidence: 0.85,
          estimatedTokens: 900,
          modificationLikelihood: 'high' as const
        }
      ],
      totalFilesAnalyzed: 200,
      processingTimeMs: 1800,
      searchStrategy: 'keyword_matching' as const,
      coverageMetrics: {
        totalTokens: 2100,
        averageConfidence: 0.875
      }
    },
    expectedResponse: {
      fileScores: [
        {
          filePath: 'src/components/Dashboard.tsx',
          relevanceScore: 0.92,
          confidence: 0.88,
          reasoning: 'Contains high density of dashboard-related keywords and will be the primary component for the new analytics dashboard',
          categories: ['core', 'ui-components'],
          modificationLikelihood: 'very_high' as const
        },
        {
          filePath: 'src/services/analytics-service.ts',
          relevanceScore: 0.88,
          confidence: 0.82,
          reasoning: 'High keyword density for analytics and data processing, essential for dashboard data aggregation',
          categories: ['core', 'integration'],
          modificationLikelihood: 'high' as const
        }
      ],
      overallMetrics: {
        averageRelevance: 0.9,
        totalFilesScored: 2,
        highRelevanceCount: 2,
        processingTimeMs: 1600
      },
      scoringStrategy: 'keyword_density' as const
    }
  }
} as const;

/**
 * Get the LLM task identifier for relevance scoring
 */
export function getRelevanceScoringTaskId(): ContextCuratorLLMTask {
  return ContextCuratorLLMTask.RELEVANCE_SCORING;
}

/**
 * Enhance relevance scoring response by adding missing required fields
 * and handling incomplete responses from LLM
 */
export function enhanceRelevanceScoringResponse(
  response: unknown,
  scoringStrategy: 'semantic_similarity' | 'keyword_density' | 'structural_importance' | 'hybrid',
  processingTimeMs: number,
  expectedFiles?: Array<{ path: string; estimatedTokens: number }>
): unknown {
  try {
    if (!response || typeof response !== 'object') {
      return response;
    }

    const obj = response as Record<string, unknown>;
    const enhanced = { ...obj };

    // NEW: Handle single file object case
    if ('filePath' in obj && 'relevanceScore' in obj && !('fileScores' in obj)) {
      console.warn('Context Curator: LLM returned single file, converting to array format');
      enhanced.fileScores = [obj];
      // Remove single file properties from top level
      delete enhanced.filePath;
      delete enhanced.relevanceScore;
      delete enhanced.confidence;
      delete enhanced.reasoning;
      delete enhanced.categories;
      delete enhanced.modificationLikelihood;
      delete enhanced.estimatedTokens;
    }

    // Ensure fileScores exists and is an array
    if (!Array.isArray(enhanced.fileScores)) {
      enhanced.fileScores = [];
    }

    // NEW: If we have expected files and the response is incomplete, add missing files with default scores
    if (expectedFiles && expectedFiles.length > 0 && Array.isArray(enhanced.fileScores)) {
      const fileScoresArray = enhanced.fileScores as Array<Record<string, unknown>>;
      const scoredPaths = new Set(fileScoresArray.map(f => f.filePath as string));
      const missingFiles = expectedFiles.filter(f => !scoredPaths.has(f.path));

      if (missingFiles.length > 0) {
        console.warn(`Context Curator: LLM only scored ${fileScoresArray.length}/${expectedFiles.length} files. Adding default scores for ${missingFiles.length} missing files.`);

        // Add missing files with conservative default scores
        for (const missingFile of missingFiles) {
          fileScoresArray.push({
            filePath: missingFile.path,
            relevanceScore: 0.3, // Conservative default
            confidence: 0.5, // Low confidence for auto-generated scores
            reasoning: 'Auto-generated score: LLM did not provide assessment for this file',
            categories: ['utility'], // Default category
            modificationLikelihood: 'low',
            estimatedTokens: missingFile.estimatedTokens
          });
        }
      }
    }

    // Add missing overallMetrics if not present
    if (!enhanced.overallMetrics || typeof enhanced.overallMetrics !== 'object') {
      enhanced.overallMetrics = calculateOverallMetrics(
        enhanced.fileScores as Array<{ relevanceScore: number }>,
        processingTimeMs
      );
    }

    // Add missing scoringStrategy if not present
    if (!enhanced.scoringStrategy) {
      enhanced.scoringStrategy = scoringStrategy;
    }

    return enhanced;
  } catch {
    // If enhancement fails, return original response
    return response;
  }
}

/**
 * Validate relevance scoring response against schema
 */
export function validateRelevanceScoringResponse(response: unknown): boolean {
  try {
    if (!response || typeof response !== 'object') {
      return false;
    }

    const obj = response as Record<string, unknown>;

    // Check required fields
    const requiredFields = ['fileScores', 'overallMetrics', 'scoringStrategy'];
    for (const field of requiredFields) {
      if (!(field in obj)) {
        return false;
      }
    }

    // Validate fileScores array
    if (!Array.isArray(obj.fileScores)) {
      return false;
    }

    for (const fileScore of obj.fileScores) {
      if (!fileScore || typeof fileScore !== 'object') {
        return false;
      }

      const scoreObj = fileScore as Record<string, unknown>;

      // Check required file score fields
      const requiredScoreFields = ['filePath', 'relevanceScore', 'confidence', 'reasoning', 'categories', 'modificationLikelihood', 'estimatedTokens'];
      for (const field of requiredScoreFields) {
        if (!(field in scoreObj)) {
          return false;
        }
      }

      // Validate file score field types and constraints
      if (typeof scoreObj.filePath !== 'string' || scoreObj.filePath.length === 0) {
        return false;
      }

      if (typeof scoreObj.relevanceScore !== 'number' || scoreObj.relevanceScore < 0 || scoreObj.relevanceScore > 1) {
        return false;
      }

      if (typeof scoreObj.confidence !== 'number' || scoreObj.confidence < 0 || scoreObj.confidence > 1) {
        return false;
      }

      if (typeof scoreObj.reasoning !== 'string' || scoreObj.reasoning.length === 0) {
        return false;
      }

      if (!Array.isArray(scoreObj.categories) || scoreObj.categories.length === 0) {
        return false;
      }

      for (const category of scoreObj.categories) {
        if (typeof category !== 'string') {
          return false;
        }
      }

      if (!['very_high', 'high', 'medium', 'low', 'very_low'].includes(scoreObj.modificationLikelihood as string)) {
        return false;
      }

      if (typeof scoreObj.estimatedTokens !== 'number' || scoreObj.estimatedTokens < 0) {
        return false;
      }
    }

    // Validate overallMetrics
    if (!obj.overallMetrics || typeof obj.overallMetrics !== 'object') {
      return false;
    }

    const metrics = obj.overallMetrics as Record<string, unknown>;
    const requiredMetricsFields = ['averageRelevance', 'totalFilesScored', 'highRelevanceCount', 'processingTimeMs'];

    for (const field of requiredMetricsFields) {
      if (!(field in metrics)) {
        return false;
      }
    }

    if (typeof metrics.averageRelevance !== 'number' || metrics.averageRelevance < 0 || metrics.averageRelevance > 1) {
      return false;
    }

    if (typeof metrics.totalFilesScored !== 'number' || metrics.totalFilesScored < 0) {
      return false;
    }

    if (typeof metrics.highRelevanceCount !== 'number' || metrics.highRelevanceCount < 0) {
      return false;
    }

    if (typeof metrics.processingTimeMs !== 'number' || metrics.processingTimeMs < 0) {
      return false;
    }

    // Validate scoring strategy
    if (!['semantic_similarity', 'keyword_density', 'structural_importance', 'hybrid'].includes(obj.scoringStrategy as string)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Calculate overall metrics for relevance scoring results
 */
export function calculateOverallMetrics(
  fileScores: Array<{
    relevanceScore: number;
  }>,
  processingTimeMs: number
): {
  averageRelevance: number;
  totalFilesScored: number;
  highRelevanceCount: number;
  processingTimeMs: number;
} {
  if (fileScores.length === 0) {
    return {
      averageRelevance: 0,
      totalFilesScored: 0,
      highRelevanceCount: 0,
      processingTimeMs
    };
  }

  const totalRelevance = fileScores.reduce((sum, file) => sum + file.relevanceScore, 0);
  const averageRelevance = totalRelevance / fileScores.length;
  const highRelevanceCount = fileScores.filter(file => file.relevanceScore >= 0.7).length;

  return {
    averageRelevance: Math.round(averageRelevance * 100) / 100,
    totalFilesScored: fileScores.length,
    highRelevanceCount,
    processingTimeMs
  };
}

/**
 * Filter files by relevance score threshold
 */
export function filterFilesByRelevance<T extends { relevanceScore: number }>(
  files: T[],
  minRelevance: number
): T[] {
  return files.filter(file => file.relevanceScore >= minRelevance);
}

/**
 * Sort files by relevance score (descending)
 */
export function sortFilesByRelevance<T extends { relevanceScore: number }>(files: T[]): T[] {
  return [...files].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Filter files by category
 */
export function filterFilesByCategory<T extends { categories: string[] }>(
  files: T[],
  targetCategory: string
): T[] {
  return files.filter(file => file.categories.includes(targetCategory));
}

/**
 * Get files with high relevance (>= 0.7)
 */
export function getHighRelevanceFiles<T extends { relevanceScore: number }>(files: T[]): T[] {
  return filterFilesByRelevance(files, 0.7);
}

/**
 * Get recommended scoring strategy based on task type and context
 */
export function getRecommendedScoringStrategy(
  taskType: string,
  fileCount: number,
  hasCodemap: boolean = false
): 'semantic_similarity' | 'keyword_density' | 'structural_importance' | 'hybrid' {
  // For small file sets, keyword density is often most effective
  if (fileCount <= 5) {
    return 'keyword_density';
  }

  // For large file sets with codebase context, structural analysis is valuable
  if (fileCount > 20 && hasCodemap) {
    return 'structural_importance';
  }

  // Task-specific recommendations
  switch (taskType) {
    case 'refactoring':
      return 'semantic_similarity'; // Best for understanding conceptual relationships
    case 'feature_addition':
      return 'hybrid'; // Combines multiple approaches for comprehensive analysis
    case 'bug_fix':
      return 'keyword_density'; // Best for finding specific error-related patterns
    case 'general':
      return 'structural_importance'; // Best for understanding overall architecture
    default:
      return 'hybrid'; // Safe default that balances all approaches
  }
}

/**
 * Calculate category distribution for file scores
 */
export function calculateCategoryDistribution(
  fileScores: Array<{ categories: string[] }>
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const fileScore of fileScores) {
    for (const category of fileScore.categories) {
      distribution[category] = (distribution[category] || 0) + 1;
    }
  }

  return distribution;
}

/**
 * Get relevance score statistics
 */
export function getRelevanceStatistics(
  fileScores: Array<{ relevanceScore: number }>
): {
  min: number;
  max: number;
  mean: number;
  median: number;
  standardDeviation: number;
} {
  if (fileScores.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      standardDeviation: 0
    };
  }

  const scores = fileScores.map(f => f.relevanceScore).sort((a, b) => a - b);
  const min = scores[0];
  const max = scores[scores.length - 1];
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const median = scores.length % 2 === 0
    ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
    : scores[Math.floor(scores.length / 2)];

  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const standardDeviation = Math.sqrt(variance);

  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    standardDeviation: Math.round(standardDeviation * 100) / 100
  };
}
