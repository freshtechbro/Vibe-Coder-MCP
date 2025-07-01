/**
 * File Discovery Prompt Templates for Context Curator
 * 
 * Provides comprehensive prompt templates for AI-assisted file discovery
 * based on intent analysis results and codebase context to identify
 * relevant files for development tasks.
 */

import { ContextCuratorLLMTask } from '../types/llm-tasks.js';
import { IntentAnalysisResult } from '../types/llm-tasks.js';

/**
 * System prompt for file discovery operations
 */
export const FILE_DISCOVERY_SYSTEM_PROMPT = `You are an expert software architect and codebase analyst specializing in intelligent file discovery for development tasks.

Your task is to analyze a development request and identify the most relevant files that need to be examined, modified, or referenced during implementation.

## DISCOVERY STRATEGIES

**Semantic Similarity**: 
- Use natural language understanding to identify files based on conceptual relevance
- Consider functional relationships and domain concepts
- Identify files that serve similar purposes or handle related functionality
- Look for files that would be conceptually impacted by the requested changes

**Keyword Matching**:
- Search for files containing specific keywords, function names, or class names
- Match file names, directory structures, and content patterns
- Identify files based on naming conventions and technical terminology
- Focus on exact matches and variations of key terms

**Semantic and Keyword Combined**:
- Leverage both semantic understanding and keyword matching
- Use semantic analysis to expand keyword searches with related concepts
- Apply contextual understanding to filter and prioritize keyword matches
- Balance precision of keywords with breadth of semantic understanding

**Structural Analysis**:
- Analyze architectural patterns and dependency relationships
- Identify files based on their role in the system architecture
- Consider import/export relationships and module dependencies
- Focus on structural impact and architectural significance

## FILE PRIORITIZATION CRITERIA

**High Priority**: Core files that will definitely need modification or are central to the task
**Medium Priority**: Supporting files that may need updates or provide important context
**Low Priority**: Reference files that provide background understanding but unlikely to change

## CONFIDENCE ASSESSMENT

Rate confidence (0.0 to 1.0) based on:
- Strength of relationship between file and task requirements
- Clarity of the file's role in the requested changes
- Quality of available information about the file's purpose
- Certainty about the file's relevance to the development task

## MODIFICATION LIKELIHOOD

Assess how likely each file is to be modified:
- **very_high**: File will almost certainly be modified
- **high**: File will likely be modified
- **medium**: File may be modified depending on implementation approach
- **low**: File unlikely to be modified but provides important context
- **very_low**: File provides background context only

## RESPONSE FORMAT

CRITICAL: Respond with a valid JSON object matching this exact structure:

{
  "relevantFiles": [
    {
      "path": "relative/path/to/file.ext",
      "priority": "high|medium|low",
      "reasoning": "Detailed explanation of why this file is relevant",
      "confidence": 0.0-1.0,
      "estimatedTokens": number,
      "modificationLikelihood": "very_high|high|medium|low|very_low"
    }
  ],
  "totalFilesAnalyzed": number,
  "processingTimeMs": number,
  "searchStrategy": "semantic_similarity|keyword_matching|semantic_and_keyword|structural_analysis",
  "coverageMetrics": {
    "totalTokens": number,
    "averageConfidence": 0.0-1.0
  }
}

## DISCOVERY GUIDELINES

1. **Be Comprehensive**: Include all files that could be relevant to the task
2. **Prioritize Effectively**: Rank files by their importance to the development task
3. **Provide Clear Reasoning**: Explain why each file is relevant and how it relates to the task
4. **Estimate Accurately**: Provide realistic token estimates and confidence scores
5. **Consider Dependencies**: Include files that are architecturally connected
6. **Balance Breadth and Focus**: Cover all relevant areas without including irrelevant files

## CRITICAL: ANTI-HALLUCINATION REQUIREMENTS

**MANDATORY**: Only recommend files that ACTUALLY EXIST in the provided codebase context. DO NOT:
- Suggest files that don't exist in the codebase summary
- Assume standard file structures (routes/, models/, controllers/) unless they're shown in the codebase
- Create hypothetical file paths based on general software patterns
- Recommend files from typical frameworks unless they exist in this specific project

**REQUIRED**: Every file path you suggest must be verifiable in the codebase context provided.
If you need to suggest new files, clearly indicate they are "NEW FILE SUGGESTIONS" and ensure they fit the existing project structure.
Base all recommendations on the ACTUAL architecture and file organization shown in the codebase summary.

Analyze the development request, intent analysis, and codebase context to identify the most relevant files for the task.`;

/**
 * Build user prompt for file discovery
 */
export function buildFileDiscoveryPrompt(
  originalPrompt: string,
  intentAnalysis: IntentAnalysisResult,
  codemapContent: string,
  searchStrategy: 'semantic_similarity' | 'keyword_matching' | 'semantic_and_keyword' | 'structural_analysis',
  additionalContext?: {
    filePatterns?: string[];
    excludePatterns?: string[];
    focusDirectories?: string[];
    maxFiles?: number;
    tokenBudget?: number;
  }
): string {
  let prompt = `DEVELOPMENT REQUEST:
${originalPrompt}

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

CODEBASE CONTEXT:
${codemapContent}

SEARCH STRATEGY: ${searchStrategy}`;

  if (additionalContext) {
    const contextItems: string[] = [];

    if (additionalContext.filePatterns && additionalContext.filePatterns.length > 0) {
      contextItems.push(`File Patterns: ${additionalContext.filePatterns.join(', ')}`);
    }

    if (additionalContext.excludePatterns && additionalContext.excludePatterns.length > 0) {
      contextItems.push(`Exclude Patterns: ${additionalContext.excludePatterns.join(', ')}`);
    }

    if (additionalContext.focusDirectories && additionalContext.focusDirectories.length > 0) {
      contextItems.push(`Focus Directories: ${additionalContext.focusDirectories.join(', ')}`);
    }

    if (additionalContext.maxFiles) {
      contextItems.push(`Maximum Files: ${additionalContext.maxFiles}`);
    }

    if (additionalContext.tokenBudget) {
      contextItems.push(`Token Budget: ${additionalContext.tokenBudget}`);
    }

    if (contextItems.length > 0) {
      prompt += '\n\nADDITIONAL CONSTRAINTS:\n' + contextItems.join('\n');
    }
  }

  prompt += `

CRITICAL REQUIREMENTS:
1. Return ONLY ACTUAL FILE PATHS from the codebase (e.g., "src/cli/cli-utils.ts", "src/handlers/command-gateway.ts")
2. File paths MUST exist in the provided codebase context above
3. DO NOT create abstract component names like "CLIUtils" or "CommandGateway"
4. Extract file paths directly from the codebase structure shown above
5. Focus on files that will need modification or are critical dependencies
6. Consider the search strategy when prioritizing files
7. Provide specific reasoning for each file's relevance

MANDATORY FILE PATH VALIDATION:
- Every "path" field MUST contain a relative file path from the project root
- For root-level files, use just the filename: "package.json", "README.md", "tsconfig.json"
- For nested files, use full relative path: "src/tools/vibe-task-manager/handlers/create-project-handler.ts"
- Every "path" field MUST contain a file extension (.ts, .js, .json, .md, etc.)
- Every "path" field MUST be extractable from the codebase context provided above
- Use forward slashes (/) for directory separators, never backslashes
- If you cannot find actual file paths, return an empty relevantFiles array

EXAMPLE CORRECT RESPONSES:
- "src/tools/vibe-task-manager/handlers/create-project-handler.ts" (nested file with full path)
- "src/services/error-handler.ts" (nested file with full path)
- "src/utils/progress-tracker.ts" (nested file with full path)
- "package.json" (root-level file, filename only)
- "README.md" (root-level file, filename only)
- "tsconfig.json" (root-level file, filename only)
- "mcp-config.json" (root-level file, filename only)

EXAMPLE INCORRECT RESPONSES (WILL CAUSE VALIDATION FAILURE):
- "CLIUtils" (abstract name - NOT ALLOWED)
- "CommandGateway" (abstract name - NOT ALLOWED)
- "ErrorHandler" (abstract name - NOT ALLOWED)
- "authentication module" (abstract description - NOT ALLOWED)
- "user interface components" (abstract description - NOT ALLOWED)

Using the ${searchStrategy} strategy, identify the most relevant files for this development task. Provide your response in the required JSON format with detailed reasoning for each file selection.`;

  return prompt;
}

/**
 * JSON schema for file discovery response validation
 */
export const FILE_DISCOVERY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    relevantFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            minLength: 1,
            description: 'Relative path to the file'
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Priority level of the file for the task'
          },
          reasoning: {
            type: 'string',
            minLength: 1,
            description: 'Detailed explanation of why this file is relevant'
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score from 0.0 to 1.0'
          },
          estimatedTokens: {
            type: 'number',
            minimum: 0,
            description: 'Estimated token count for the file'
          },
          modificationLikelihood: {
            type: 'string',
            enum: ['very_high', 'high', 'medium', 'low', 'very_low'],
            description: 'Likelihood that this file will be modified'
          }
        },
        required: ['path', 'priority', 'reasoning', 'confidence', 'estimatedTokens', 'modificationLikelihood'],
        additionalProperties: false
      },
      description: 'List of relevant files found'
    },
    totalFilesAnalyzed: {
      type: 'number',
      minimum: 0,
      description: 'Total number of files analyzed'
    },
    processingTimeMs: {
      type: 'number',
      minimum: 0,
      description: 'Processing time in milliseconds'
    },
    searchStrategy: {
      type: 'string',
      enum: ['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis'],
      description: 'Strategy used for file discovery'
    },
    coverageMetrics: {
      type: 'object',
      properties: {
        totalTokens: {
          type: 'number',
          minimum: 0,
          description: 'Total estimated tokens for all relevant files'
        },
        averageConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Average confidence score across all files'
        }
      },
      required: ['totalTokens', 'averageConfidence'],
      additionalProperties: false,
      description: 'Coverage metrics for the discovery results'
    }
  },
  required: [
    'relevantFiles',
    'totalFilesAnalyzed',
    'processingTimeMs',
    'searchStrategy',
    'coverageMetrics'
  ],
  additionalProperties: false
} as const;

/**
 * Example prompts for different file discovery scenarios
 */
export const FILE_DISCOVERY_EXAMPLES = {
  semantic_similarity_refactoring: {
    originalPrompt: 'Refactor the authentication module to use JWT tokens',
    searchStrategy: 'semantic_similarity' as const,
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
    expectedResponse: {
      relevantFiles: [
        {
          path: 'src/auth/authentication.ts',
          priority: 'high' as const,
          reasoning: 'Core authentication module that needs JWT token implementation',
          confidence: 0.95,
          estimatedTokens: 800,
          modificationLikelihood: 'very_high' as const
        },
        {
          path: 'src/auth/middleware/auth-middleware.ts',
          priority: 'high' as const,
          reasoning: 'Authentication middleware that validates tokens and needs JWT integration',
          confidence: 0.9,
          estimatedTokens: 600,
          modificationLikelihood: 'high' as const
        },
        {
          path: 'src/auth/types/auth-types.ts',
          priority: 'medium' as const,
          reasoning: 'Type definitions for authentication that may need JWT token types',
          confidence: 0.8,
          estimatedTokens: 300,
          modificationLikelihood: 'medium' as const
        }
      ],
      totalFilesAnalyzed: 150,
      processingTimeMs: 2500,
      searchStrategy: 'semantic_similarity' as const,
      coverageMetrics: {
        totalTokens: 1700,
        averageConfidence: 0.88
      }
    }
  },

  keyword_matching_feature: {
    originalPrompt: 'Add user dashboard with analytics charts',
    searchStrategy: 'keyword_matching' as const,
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
    expectedResponse: {
      relevantFiles: [
        {
          path: 'src/components/Dashboard.tsx',
          priority: 'high' as const,
          reasoning: 'Existing dashboard component that needs analytics integration',
          confidence: 0.9,
          estimatedTokens: 1200,
          modificationLikelihood: 'very_high' as const
        },
        {
          path: 'src/services/analytics-service.ts',
          priority: 'high' as const,
          reasoning: 'Analytics service for data processing and chart data preparation',
          confidence: 0.85,
          estimatedTokens: 900,
          modificationLikelihood: 'high' as const
        },
        {
          path: 'src/components/charts/ChartComponents.tsx',
          priority: 'medium' as const,
          reasoning: 'Chart components library for rendering analytics visualizations',
          confidence: 0.8,
          estimatedTokens: 700,
          modificationLikelihood: 'medium' as const
        }
      ],
      totalFilesAnalyzed: 200,
      processingTimeMs: 1800,
      searchStrategy: 'keyword_matching' as const,
      coverageMetrics: {
        totalTokens: 2800,
        averageConfidence: 0.85
      }
    }
  },

  semantic_and_keyword_bugfix: {
    originalPrompt: 'Fix memory leak in file upload component',
    searchStrategy: 'semantic_and_keyword' as const,
    intentAnalysis: {
      taskType: 'bug_fix' as const,
      confidence: 0.95,
      reasoning: ['Request explicitly mentions fixing a specific issue'],
      architecturalComponents: ['file-upload', 'memory-management', 'frontend'],
      scopeAssessment: {
        complexity: 'moderate' as const,
        estimatedFiles: 3,
        riskLevel: 'high' as const
      },
      suggestedFocusAreas: ['memory-profiling', 'resource-cleanup'],
      estimatedEffort: 'medium' as const
    },
    expectedResponse: {
      relevantFiles: [
        {
          path: 'src/components/FileUpload.tsx',
          priority: 'high' as const,
          reasoning: 'Main file upload component where memory leak is occurring',
          confidence: 0.98,
          estimatedTokens: 1000,
          modificationLikelihood: 'very_high' as const
        },
        {
          path: 'src/hooks/useFileUpload.ts',
          priority: 'high' as const,
          reasoning: 'Custom hook managing file upload state and potential memory leaks',
          confidence: 0.9,
          estimatedTokens: 600,
          modificationLikelihood: 'high' as const
        },
        {
          path: 'src/utils/file-utils.ts',
          priority: 'medium' as const,
          reasoning: 'File utility functions that may have resource cleanup issues',
          confidence: 0.75,
          estimatedTokens: 400,
          modificationLikelihood: 'medium' as const
        }
      ],
      totalFilesAnalyzed: 80,
      processingTimeMs: 1200,
      searchStrategy: 'semantic_and_keyword' as const,
      coverageMetrics: {
        totalTokens: 2000,
        averageConfidence: 0.88
      }
    }
  },

  structural_analysis_general: {
    originalPrompt: 'Update API documentation and add OpenAPI schema',
    searchStrategy: 'structural_analysis' as const,
    intentAnalysis: {
      taskType: 'general' as const,
      confidence: 0.85,
      reasoning: ['Request involves documentation and API schema updates'],
      architecturalComponents: ['documentation', 'api-schema', 'backend'],
      scopeAssessment: {
        complexity: 'simple' as const,
        estimatedFiles: 5,
        riskLevel: 'low' as const
      },
      suggestedFocusAreas: ['api-documentation', 'schema-validation'],
      estimatedEffort: 'low' as const
    },
    expectedResponse: {
      relevantFiles: [
        {
          path: 'docs/api/openapi.yaml',
          priority: 'high' as const,
          reasoning: 'Main OpenAPI schema file that needs updates and enhancements',
          confidence: 0.95,
          estimatedTokens: 1500,
          modificationLikelihood: 'very_high' as const
        },
        {
          path: 'src/routes/api-routes.ts',
          priority: 'medium' as const,
          reasoning: 'API route definitions that should align with OpenAPI schema',
          confidence: 0.8,
          estimatedTokens: 800,
          modificationLikelihood: 'low' as const
        },
        {
          path: 'docs/README.md',
          priority: 'medium' as const,
          reasoning: 'Main documentation file that may need API documentation links',
          confidence: 0.7,
          estimatedTokens: 600,
          modificationLikelihood: 'medium' as const
        }
      ],
      totalFilesAnalyzed: 120,
      processingTimeMs: 1500,
      searchStrategy: 'structural_analysis' as const,
      coverageMetrics: {
        totalTokens: 2900,
        averageConfidence: 0.82
      }
    }
  }
} as const;

/**
 * Get the LLM task identifier for file discovery
 * @param strategy Optional strategy to create unique task ID for concurrent execution
 */
export function getFileDiscoveryTaskId(strategy?: string): string {
  const baseTaskId = ContextCuratorLLMTask.FILE_DISCOVERY;
  if (strategy) {
    return `${baseTaskId}_${strategy}`;
  }
  return baseTaskId;
}

/**
 * Validate file discovery response against schema
 */
export function validateFileDiscoveryResponse(response: unknown): boolean {
  try {
    if (!response || typeof response !== 'object') {
      return false;
    }

    const obj = response as Record<string, unknown>;

    // Check required fields
    const requiredFields = [
      'relevantFiles',
      'totalFilesAnalyzed',
      'processingTimeMs',
      'searchStrategy',
      'coverageMetrics'
    ];

    for (const field of requiredFields) {
      if (!(field in obj)) {
        return false;
      }
    }

    // Validate relevantFiles array
    if (!Array.isArray(obj.relevantFiles)) {
      return false;
    }

    for (const file of obj.relevantFiles) {
      if (!file || typeof file !== 'object') {
        return false;
      }

      const fileObj = file as Record<string, unknown>;

      // Check required file fields
      const requiredFileFields = ['path', 'priority', 'reasoning', 'confidence', 'estimatedTokens', 'modificationLikelihood'];
      for (const field of requiredFileFields) {
        if (!(field in fileObj)) {
          return false;
        }
      }

      // Validate file field types and constraints
      if (typeof fileObj.path !== 'string' || fileObj.path.length === 0) {
        return false;
      }

      if (!['high', 'medium', 'low'].includes(fileObj.priority as string)) {
        return false;
      }

      if (typeof fileObj.reasoning !== 'string' || fileObj.reasoning.length === 0) {
        return false;
      }

      if (typeof fileObj.confidence !== 'number' || fileObj.confidence < 0 || fileObj.confidence > 1) {
        return false;
      }

      if (typeof fileObj.estimatedTokens !== 'number' || fileObj.estimatedTokens < 0) {
        return false;
      }

      if (!['very_high', 'high', 'medium', 'low', 'very_low'].includes(fileObj.modificationLikelihood as string)) {
        return false;
      }
    }

    // Validate numeric fields
    if (typeof obj.totalFilesAnalyzed !== 'number' || obj.totalFilesAnalyzed < 0) {
      return false;
    }

    if (typeof obj.processingTimeMs !== 'number' || obj.processingTimeMs < 0) {
      return false;
    }

    // Validate search strategy
    if (!['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis'].includes(obj.searchStrategy as string)) {
      return false;
    }

    // Validate coverage metrics
    if (!obj.coverageMetrics || typeof obj.coverageMetrics !== 'object') {
      return false;
    }

    const metrics = obj.coverageMetrics as Record<string, unknown>;
    if (typeof metrics.totalTokens !== 'number' || metrics.totalTokens < 0) {
      return false;
    }

    if (typeof metrics.averageConfidence !== 'number' || metrics.averageConfidence < 0 || metrics.averageConfidence > 1) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Calculate coverage metrics for file discovery results
 */
export function calculateCoverageMetrics(
  relevantFiles: Array<{
    estimatedTokens: number;
    confidence: number;
  }>
): {
  totalTokens: number;
  averageConfidence: number;
} {
  if (relevantFiles.length === 0) {
    return {
      totalTokens: 0,
      averageConfidence: 0
    };
  }

  const totalTokens = relevantFiles.reduce((sum, file) => sum + file.estimatedTokens, 0);
  const averageConfidence = relevantFiles.reduce((sum, file) => sum + file.confidence, 0) / relevantFiles.length;

  return {
    totalTokens,
    averageConfidence: Math.round(averageConfidence * 100) / 100
  };
}

/**
 * Filter files by priority level
 */
export function filterFilesByPriority(
  files: Array<{ priority: 'high' | 'medium' | 'low'; [key: string]: unknown }>,
  priority: 'high' | 'medium' | 'low'
): Array<{ priority: 'high' | 'medium' | 'low'; [key: string]: unknown }> {
  return files.filter(file => file.priority === priority);
}

/**
 * Sort files by confidence score (descending)
 */
export function sortFilesByConfidence<T extends { confidence: number }>(files: T[]): T[] {
  return [...files].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get search strategy recommendations based on task type
 */
export function getRecommendedSearchStrategy(taskType: string): 'semantic_similarity' | 'keyword_matching' | 'semantic_and_keyword' | 'structural_analysis' {
  switch (taskType) {
    case 'refactoring':
      return 'semantic_similarity'; // Best for understanding conceptual relationships
    case 'feature_addition':
      return 'semantic_and_keyword'; // Combines broad understanding with specific searches
    case 'bug_fix':
      return 'keyword_matching'; // Best for finding specific error-related files
    case 'general':
      return 'structural_analysis'; // Best for understanding overall architecture
    default:
      return 'semantic_and_keyword'; // Safe default that balances approaches
  }
}
