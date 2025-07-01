/**
 * Intent Analysis Prompt Templates for Context Curator
 * 
 * Provides comprehensive prompt templates for analyzing user development requests
 * and determining task types, architectural components, and scope assessments.
 */

import { ContextCuratorLLMTask } from '../types/llm-tasks.js';
import { intentAnalysisResultSchema, ProjectTypeAnalysisResult, LanguageAnalysisResult } from '../types/llm-tasks.js';

/**
 * System prompt for intent analysis operations
 */
export const INTENT_ANALYSIS_SYSTEM_PROMPT = `You are an expert software architect and development analyst specializing in understanding development requests within codebase contexts.

Your task is to analyze a user's development request against a provided codebase summary and determine:

1. **Task Type Classification**: Identify the primary type of development work being requested
2. **Architectural Impact**: Determine which components and systems will be affected
3. **Scope Assessment**: Evaluate complexity, effort, and risk levels
4. **Focus Areas**: Suggest specific areas that require attention
5. **Confidence Assessment**: Provide confidence levels for your analysis

## TASK TYPE DEFINITIONS

**refactoring**: Improving code structure, readability, or performance without changing functionality
- Code cleanup, optimization, restructuring
- Design pattern implementation
- Performance improvements
- Technical debt reduction

**feature_addition**: Adding new functionality or capabilities to the system
- New user features, API endpoints, UI components
- Integration with external services
- New business logic or workflows
- Extending existing functionality

**bug_fix**: Resolving defects, errors, or unexpected behavior
- Fixing crashes, errors, or incorrect behavior
- Resolving security vulnerabilities
- Correcting logic errors or edge cases
- Addressing performance issues

**general**: Broad development tasks that don't fit other categories
- Documentation updates, configuration changes
- Development environment setup
- Mixed tasks spanning multiple categories
- Exploratory or research tasks

## ARCHITECTURAL COMPONENTS

Identify relevant components such as:
- Frontend/UI layers (React, Vue, Angular components)
- Backend services (APIs, microservices, databases)
- Authentication/authorization systems
- Data models and persistence layers
- External integrations and APIs
- Infrastructure and deployment systems
- Testing and quality assurance systems

## SCOPE ASSESSMENT CRITERIA

**Complexity Levels:**
- **simple**: Straightforward implementation, minimal dependencies, low risk
- **moderate**: Some complexity, moderate dependencies, manageable risk
- **complex**: High complexity, many dependencies, significant risk

**Risk Levels:**
- **low**: Minimal impact, well-understood changes, low failure probability
- **medium**: Moderate impact, some unknowns, manageable failure scenarios
- **high**: Significant impact, many unknowns, potential for major issues

**Effort Estimation:**
- **low**: 1-3 days of development work
- **medium**: 1-2 weeks of development work
- **high**: 2-4 weeks of development work
- **very_high**: More than 4 weeks of development work

## RESPONSE FORMAT

CRITICAL: Respond with a valid JSON object matching this exact structure:

{
  "taskType": "refactoring" | "feature_addition" | "bug_fix" | "general",
  "confidence": 0.0-1.0,
  "reasoning": ["reason1", "reason2", "reason3"],
  "architecturalComponents": ["component1", "component2"],
  "scopeAssessment": {
    "complexity": "simple" | "moderate" | "complex",
    "estimatedFiles": number,
    "riskLevel": "low" | "medium" | "high"
  },
  "suggestedFocusAreas": ["area1", "area2"],
  "estimatedEffort": "low" | "medium" | "high" | "very_high"
}

## ANALYSIS GUIDELINES

1. **Be Specific**: Provide detailed reasoning for your classifications
2. **Consider Context**: Use the codebase summary to inform your analysis
3. **Be Conservative**: When uncertain, lean toward higher complexity/risk assessments
4. **Focus on Impact**: Consider both immediate and downstream effects
5. **Provide Value**: Suggest actionable focus areas for implementation

## CRITICAL: ANTI-HALLUCINATION REQUIREMENTS

**MANDATORY**: Base your analysis EXCLUSIVELY on the provided codebase summary. DO NOT:
- Suggest files that don't exist in the codebase
- Assume standard web application patterns (routes/, models/, middleware/) unless they exist
- Recommend architectural components not present in the actual project structure
- Use generic software development knowledge to fill gaps

**REQUIRED**: Your analysis must reflect the ACTUAL codebase architecture shown in the summary.
If the codebase doesn't follow typical patterns, adapt your recommendations accordingly.
Only suggest modifications to files that actually exist or new files that fit the existing architecture.

Analyze thoroughly but respond concisely with the required JSON structure.`;

/**
 * Build user prompt for intent analysis
 */
export function buildIntentAnalysisPrompt(
  userPrompt: string,
  codemapContent: string,
  additionalContext?: {
    projectType?: string;
    projectAnalysis?: ProjectTypeAnalysisResult;
    languageAnalysis?: LanguageAnalysisResult;
    existingPatterns?: string[];
    patternConfidence?: { [pattern: string]: number };
    patternEvidence?: { [pattern: string]: string[] };
    teamSize?: number;
    timeConstraints?: string;
    existingIssues?: string[];
    technicalConstraints?: string[];
  }
): string {
  let prompt = `DEVELOPMENT REQUEST:
${userPrompt}

COMPLETE CODEBASE CONTENT:
${codemapContent}`;

  if (additionalContext) {
    const contextItems: string[] = [];

    // Enhanced project analysis
    if (additionalContext.projectAnalysis) {
      const pa = additionalContext.projectAnalysis;
      contextItems.push(`Project Type: ${pa.projectType} (confidence: ${(pa.confidence * 100).toFixed(1)}%)`);

      if (pa.secondaryTypes && pa.secondaryTypes.length > 0) {
        contextItems.push(`Secondary Types: ${pa.secondaryTypes.join(', ')}`);
      }

      if (pa.frameworkStack && pa.frameworkStack.length > 0) {
        contextItems.push(`Framework Stack: ${pa.frameworkStack.join(', ')}`);
      }

      if (pa.architectureStyle && pa.architectureStyle.length > 0) {
        contextItems.push(`Architecture Style: ${pa.architectureStyle.join(', ')}`);
      }

      if (pa.developmentEnvironment && pa.developmentEnvironment.length > 0) {
        contextItems.push(`Development Environment: ${pa.developmentEnvironment.join(', ')}`);
      }
    } else if (additionalContext.projectType) {
      contextItems.push(`Project Type: ${additionalContext.projectType}`);
    }

    // Enhanced language analysis
    if (additionalContext.languageAnalysis) {
      const la = additionalContext.languageAnalysis;
      contextItems.push(`Primary Language: ${la.primaryLanguage}`);

      if (la.secondaryLanguages && la.secondaryLanguages.length > 0) {
        contextItems.push(`Secondary Languages: ${la.secondaryLanguages.join(', ')}`);
      }

      if (la.frameworkIndicators && la.frameworkIndicators.length > 0) {
        contextItems.push(`Detected Frameworks: ${la.frameworkIndicators.join(', ')}`);
      }

      if (la.buildSystemIndicators && la.buildSystemIndicators.length > 0) {
        contextItems.push(`Build Systems: ${la.buildSystemIndicators.join(', ')}`);
      }

      contextItems.push(`Total Files Analyzed: ${la.totalFilesAnalyzed}`);
    }

    // Enhanced architectural patterns
    if (additionalContext.existingPatterns && additionalContext.existingPatterns.length > 0) {
      let patternInfo = `Architectural Patterns: ${additionalContext.existingPatterns.join(', ')}`;

      if (additionalContext.patternConfidence) {
        const confidenceInfo = additionalContext.existingPatterns
          .map(pattern => `${pattern} (${(additionalContext.patternConfidence![pattern] * 100).toFixed(1)}%)`)
          .join(', ');
        patternInfo = `Architectural Patterns: ${confidenceInfo}`;
      }

      contextItems.push(patternInfo);

      if (additionalContext.patternEvidence) {
        const evidenceInfo = additionalContext.existingPatterns
          .map(pattern => {
            const evidence = additionalContext.patternEvidence![pattern];
            return evidence && evidence.length > 0
              ? `${pattern}: [${evidence.slice(0, 3).join(', ')}${evidence.length > 3 ? '...' : ''}]`
              : pattern;
          })
          .join(', ');
        contextItems.push(`Pattern Evidence: ${evidenceInfo}`);
      }
    }

    // Standard context items
    if (additionalContext.teamSize) {
      contextItems.push(`Team Size: ${additionalContext.teamSize} developers`);
    }

    if (additionalContext.timeConstraints) {
      contextItems.push(`Time Constraints: ${additionalContext.timeConstraints}`);
    }

    if (additionalContext.existingIssues && additionalContext.existingIssues.length > 0) {
      contextItems.push(`Known Issues: ${additionalContext.existingIssues.join(', ')}`);
    }

    if (additionalContext.technicalConstraints && additionalContext.technicalConstraints.length > 0) {
      contextItems.push(`Technical Constraints: ${additionalContext.technicalConstraints.join(', ')}`);
    }

    if (contextItems.length > 0) {
      prompt += '\n\nENHANCED PROJECT ANALYSIS:\n' + contextItems.join('\n');
    }
  }

  prompt += '\n\nAnalyze this development request against the codebase context and provide your assessment in the required JSON format.';

  return prompt;
}

/**
 * JSON schema for intent analysis response validation
 */
export const INTENT_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    taskType: {
      type: 'string',
      enum: ['refactoring', 'feature_addition', 'bug_fix', 'general'],
      description: 'The primary type of development task'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence level in the analysis (0.0 to 1.0)'
    },
    reasoning: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: 'Detailed reasoning for the task type classification'
    },
    architecturalComponents: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of architectural components that will be affected'
    },
    scopeAssessment: {
      type: 'object',
      properties: {
        complexity: {
          type: 'string',
          enum: ['simple', 'moderate', 'complex'],
          description: 'Overall complexity assessment'
        },
        estimatedFiles: {
          type: 'number',
          minimum: 0,
          description: 'Estimated number of files that will be modified'
        },
        riskLevel: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Risk level assessment for the changes'
        }
      },
      required: ['complexity', 'estimatedFiles', 'riskLevel'],
      description: 'Comprehensive scope assessment'
    },
    suggestedFocusAreas: {
      type: 'array',
      items: { type: 'string' },
      description: 'Suggested areas to focus on during implementation'
    },
    estimatedEffort: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'very_high'],
      description: 'Estimated effort level for completion'
    }
  },
  required: [
    'taskType',
    'confidence',
    'reasoning',
    'architecturalComponents',
    'scopeAssessment',
    'suggestedFocusAreas',
    'estimatedEffort'
  ],
  additionalProperties: false
} as const;

/**
 * Example prompts for different task types
 */
export const INTENT_ANALYSIS_EXAMPLES = {
  refactoring: {
    userPrompt: 'Refactor the authentication module to use a more secure token-based approach',
    expectedResponse: {
      taskType: 'refactoring' as const,
      confidence: 0.9,
      reasoning: [
        'Request explicitly mentions refactoring existing authentication',
        'Focus is on improving security rather than adding new features',
        'Involves restructuring existing code without changing core functionality'
      ],
      architecturalComponents: ['authentication', 'security', 'token-management'],
      scopeAssessment: {
        complexity: 'moderate' as const,
        estimatedFiles: 8,
        riskLevel: 'medium' as const
      },
      suggestedFocusAreas: ['security-patterns', 'token-validation', 'backward-compatibility'],
      estimatedEffort: 'medium' as const
    }
  },

  feature_addition: {
    userPrompt: 'Add a user dashboard with analytics and reporting capabilities',
    expectedResponse: {
      taskType: 'feature_addition' as const,
      confidence: 0.95,
      reasoning: [
        'Request is for adding new functionality (dashboard)',
        'Involves creating new user-facing features',
        'Requires new UI components and data visualization'
      ],
      architecturalComponents: ['frontend', 'ui-components', 'analytics', 'reporting', 'data-visualization'],
      scopeAssessment: {
        complexity: 'complex' as const,
        estimatedFiles: 15,
        riskLevel: 'medium' as const
      },
      suggestedFocusAreas: ['ui-design', 'data-aggregation', 'performance-optimization'],
      estimatedEffort: 'high' as const
    }
  },

  bug_fix: {
    userPrompt: 'Fix the memory leak in the file upload component that causes crashes',
    expectedResponse: {
      taskType: 'bug_fix' as const,
      confidence: 0.95,
      reasoning: [
        'Request explicitly mentions fixing a specific issue',
        'Addresses a defect causing system crashes',
        'Focus is on resolving existing problematic behavior'
      ],
      architecturalComponents: ['file-upload', 'memory-management', 'frontend'],
      scopeAssessment: {
        complexity: 'moderate' as const,
        estimatedFiles: 3,
        riskLevel: 'high' as const
      },
      suggestedFocusAreas: ['memory-profiling', 'resource-cleanup', 'error-handling'],
      estimatedEffort: 'medium' as const
    }
  },

  general: {
    userPrompt: 'Update documentation and add development environment setup instructions',
    expectedResponse: {
      taskType: 'general' as const,
      confidence: 0.85,
      reasoning: [
        'Request involves documentation updates',
        'Includes development environment configuration',
        'Does not involve code functionality changes'
      ],
      architecturalComponents: ['documentation', 'development-environment', 'setup-scripts'],
      scopeAssessment: {
        complexity: 'simple' as const,
        estimatedFiles: 5,
        riskLevel: 'low' as const
      },
      suggestedFocusAreas: ['documentation-clarity', 'setup-automation', 'developer-experience'],
      estimatedEffort: 'low' as const
    }
  }
} as const;

/**
 * Get the LLM task identifier for intent analysis
 */
export function getIntentAnalysisTaskId(): ContextCuratorLLMTask {
  return ContextCuratorLLMTask.INTENT_ANALYSIS;
}

/**
 * Validate intent analysis response against schema
 */
export function validateIntentAnalysisResponse(response: unknown): boolean {
  try {
    intentAnalysisResultSchema.parse(response);
    return true;
  } catch {
    return false;
  }
}
