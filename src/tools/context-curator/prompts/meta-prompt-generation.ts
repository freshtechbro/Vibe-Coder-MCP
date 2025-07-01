/**
 * Meta-Prompt Generation Templates for Context Curator
 * 
 * Provides comprehensive prompt templates for generating meta-prompts
 * that include structured task decomposition, development guidelines,
 * and context summaries for downstream AI agents.
 */

import { ContextCuratorLLMTask } from '../types/llm-tasks.js';
import { IntentAnalysisResult, RelevanceScoringResult } from '../types/llm-tasks.js';

/**
 * System prompt for meta-prompt generation operations
 */
export const META_PROMPT_GENERATION_SYSTEM_PROMPT = `You are an expert prompt engineer and software architect specializing in creating comprehensive meta-prompts for AI-assisted software development.

Your task is to generate structured meta-prompts that provide downstream AI agents with complete context, clear task decomposition, and actionable development guidelines.

## META-PROMPT COMPONENTS

**System Prompt**: 
- Define the AI agent's role and expertise
- Establish development context and constraints
- Specify quality standards and best practices
- Include relevant architectural patterns and conventions

**User Prompt**:
- Present the refined development request with full context
- Include relevant file information and modification priorities
- Specify expected deliverables and success criteria
- Provide clear, actionable instructions

**Context Summary**:
- Synthesize codebase understanding from file analysis
- Highlight architectural patterns and dependencies
- Identify key components and their relationships
- Summarize technical constraints and opportunities

**Task Decomposition**:
- Break down complex requests into manageable epics
- Decompose epics into specific, actionable tasks
- Create atomic subtasks with clear completion criteria
- Establish dependencies and execution order

## TASK DECOMPOSITION PRINCIPLES

**Epics** (High-level features or changes):
- Represent major functional areas or components
- Estimated complexity: low, medium, high, very_high
- Should align with architectural boundaries
- Typically 3-8 epics per project

**Tasks** (Specific implementation work):
- Concrete, implementable units of work
- Estimated hours: realistic time estimates
- Clear dependencies on other tasks
- Typically 3-7 tasks per epic

**Subtasks** (Atomic work items):
- Single-focus, completable in 5-15 minutes
- Specific, measurable outcomes
- No dependencies within the subtask
- Typically 3-10 subtasks per task

## DEVELOPMENT GUIDELINES

Generate task-type specific guidelines:

**Refactoring**: Focus on code quality, maintainability, testing, and backward compatibility
**Feature Addition**: Emphasize design patterns, integration points, testing, and documentation
**Bug Fix**: Prioritize root cause analysis, testing, and regression prevention
**General**: Provide balanced guidance covering all development aspects

## QUALITY ASSESSMENT

Rate the meta-prompt quality (0.0 to 1.0) based on:
- Completeness of context and requirements
- Clarity and actionability of task decomposition
- Appropriateness of development guidelines
- Alignment with codebase architecture and patterns

## RESPONSE FORMAT

CRITICAL: You are generating a META-PROMPT, NOT a task decomposition.

DO NOT return an epic or task structure. Instead, return a meta-prompt that CONTAINS task decomposition within it.

Respond with a valid JSON object matching this EXACT structure:

{
  "systemPrompt": "Comprehensive system prompt for AI agents",
  "userPrompt": "Detailed user prompt with context and requirements",
  "contextSummary": "Synthesized codebase and architectural understanding",
  "taskDecomposition": {
    "epics": [
      {
        "id": "epic-1",
        "title": "Epic Title",
        "description": "Detailed epic description",
        "estimatedComplexity": "low|medium|high|very_high",
        "tasks": [
          {
            "id": "task-1-1",
            "title": "Task Title",
            "description": "Detailed task description",
            "estimatedHours": number,
            "dependencies": ["task-id-1", "task-id-2"],
            "subtasks": [
              {
                "id": "subtask-1-1-1",
                "title": "Subtask Title",
                "description": "Specific subtask description",
                "estimatedMinutes": number
              }
            ]
          }
        ]
      }
    ]
  },
  "guidelines": ["guideline1", "guideline2", "guideline3"],
  "estimatedComplexity": "low|medium|high|very_high",
  "qualityScore": 0.0-1.0,
  "aiAgentResponseFormat": {
    "description": "Structured response format for AI agents consuming this context package",
    "format": "EPIC_ID: [Unique identifier]\nEPIC_DESCRIPTION: [High-level feature or change description]\n\nTASK_ID: [Unique identifier within epic]\nTASK_DESCRIPTION: [Specific task description]\n\nSUBTASK_ID: [Unique identifier within task]\nSUBTASK_DESCRIPTION: [Single, atomic action description]\nIMPACTED_FILE: [Exactly one file path]\nOPERATION: [create file, edit file, delete file, merge file, etc.]\nREASONING: [Why this change is needed]\nEXPECTED_CHANGE: [Specific modification expected]\nACCEPTANCE_CRITERIA: [Single, testable criterion]\n\n[Repeat SUBTASK blocks as needed]\n[Repeat TASK blocks as needed]",
    "rules": [
      "Each epic contains multiple tasks",
      "Each task contains multiple subtasks",
      "Each subtask impacts exactly one file",
      "Each subtask has exactly one acceptance criterion",
      "If multiple files or criteria are needed, break into additional subtasks",
      "Subtasks must be atomic (smallest possible unit of work)",
      "Operations must be one of: create file, edit file, delete file, merge file, rename file, move file",
      "All file paths must be relative to project root",
      "Acceptance criteria must be testable and unambiguous"
    ]
  }
}

IMPORTANT: The root object must have systemPrompt, userPrompt, contextSummary, taskDecomposition, guidelines, estimatedComplexity, qualityScore, and aiAgentResponseFormat fields. Do NOT return a single epic object.

EXAMPLE OF CORRECT STRUCTURE:
{
  "systemPrompt": "You are an expert developer...",
  "userPrompt": "Implement the CLI enhancement...",
  "contextSummary": "The codebase contains...",
  "taskDecomposition": {
    "epics": [
      {
        "id": "epic-1",
        "title": "CLI Framework Enhancement",
        "description": "...",
        "estimatedComplexity": "medium",
        "tasks": [...]
      }
    ]
  },
  "guidelines": ["Follow atomic task principles", "..."],
  "estimatedComplexity": "medium",
  "qualityScore": 0.9,
  "aiAgentResponseFormat": {
    "description": "...",
    "format": "...",
    "rules": [...]
  }
}

## META-PROMPT GUIDELINES

1. **Be Comprehensive**: Include all necessary context and requirements
2. **Be Specific**: Provide clear, actionable instructions and criteria
3. **Be Structured**: Organize information logically and hierarchically
4. **Be Realistic**: Provide accurate estimates and achievable goals
5. **Be Contextual**: Leverage codebase understanding and architectural patterns
6. **Be Quality-Focused**: Emphasize best practices and maintainable solutions

Generate a complete meta-prompt that enables downstream AI agents to successfully complete the development task with full context and clear guidance.`;

/**
 * Build user prompt for meta-prompt generation
 */
export function buildMetaPromptGenerationPrompt(
  originalPrompt: string,
  intentAnalysis: IntentAnalysisResult,
  refinedPrompt: string,
  relevanceScoringResult: RelevanceScoringResult,
  additionalContext?: {
    codemapContent?: string;
    architecturalPatterns?: string[];
    patternConfidence?: { [pattern: string]: number };
    patternEvidence?: { [pattern: string]: string[] };
    technicalConstraints?: string[];
    qualityRequirements?: string[];
    teamExpertise?: string[];
    timelineConstraints?: string;
    existingGuidelines?: string[];
  }
): string {
  let prompt = `ORIGINAL DEVELOPMENT REQUEST:
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

RELEVANCE SCORING RESULTS:
Scoring Strategy: ${relevanceScoringResult.scoringStrategy}
Total Files Scored: ${relevanceScoringResult.overallMetrics.totalFilesScored}
Average Relevance: ${relevanceScoringResult.overallMetrics.averageRelevance}
High Relevance Count: ${relevanceScoringResult.overallMetrics.highRelevanceCount}
Processing Time: ${relevanceScoringResult.overallMetrics.processingTimeMs}ms

RELEVANT FILES:`;

  relevanceScoringResult.fileScores.forEach((fileScore, index) => {
    prompt += `
${index + 1}. ${fileScore.filePath}
   Relevance Score: ${fileScore.relevanceScore}
   Confidence: ${fileScore.confidence}
   Categories: ${fileScore.categories.join(', ')}
   Modification Likelihood: ${fileScore.modificationLikelihood}
   Reasoning: ${fileScore.reasoning}`;
  });

  if (additionalContext) {
    const contextItems: string[] = [];

    if (additionalContext.codemapContent) {
      contextItems.push(`Complete Codebase Content: ${additionalContext.codemapContent}`);
    }

    if (additionalContext.architecturalPatterns && additionalContext.architecturalPatterns.length > 0) {
      let patternInfo = `Architectural Patterns: ${additionalContext.architecturalPatterns.join(', ')}`;

      // Add confidence scores if available
      if (additionalContext.patternConfidence) {
        const confidenceInfo = additionalContext.architecturalPatterns
          .map(pattern => `${pattern} (confidence: ${(additionalContext.patternConfidence![pattern] * 100).toFixed(1)}%)`)
          .join(', ');
        patternInfo = `Architectural Patterns with Confidence: ${confidenceInfo}`;
      }

      // Add evidence if available
      if (additionalContext.patternEvidence) {
        const evidenceInfo = additionalContext.architecturalPatterns
          .map(pattern => {
            const evidence = additionalContext.patternEvidence![pattern];
            return evidence && evidence.length > 0
              ? `${pattern}: [${evidence.slice(0, 3).join(', ')}${evidence.length > 3 ? '...' : ''}]`
              : pattern;
          })
          .join(', ');
        patternInfo += `\nPattern Evidence: ${evidenceInfo}`;
      }

      contextItems.push(patternInfo);
    }

    if (additionalContext.technicalConstraints && additionalContext.technicalConstraints.length > 0) {
      contextItems.push(`Technical Constraints: ${additionalContext.technicalConstraints.join(', ')}`);
    }

    if (additionalContext.qualityRequirements && additionalContext.qualityRequirements.length > 0) {
      contextItems.push(`Quality Requirements: ${additionalContext.qualityRequirements.join(', ')}`);
    }

    if (additionalContext.teamExpertise && additionalContext.teamExpertise.length > 0) {
      contextItems.push(`Team Expertise: ${additionalContext.teamExpertise.join(', ')}`);
    }

    if (additionalContext.timelineConstraints) {
      contextItems.push(`Timeline Constraints: ${additionalContext.timelineConstraints}`);
    }

    if (additionalContext.existingGuidelines && additionalContext.existingGuidelines.length > 0) {
      contextItems.push(`Existing Guidelines: ${additionalContext.existingGuidelines.join(', ')}`);
    }

    if (contextItems.length > 0) {
      prompt += '\n\nADDITIONAL CONTEXT:\n' + contextItems.join('\n');
    }
  }

  prompt += `\n\nGenerate a comprehensive meta-prompt for the ${intentAnalysis.taskType} task. Include structured task decomposition with realistic estimates, development guidelines specific to the task type, and a complete context summary. Focus on creating actionable guidance for downstream AI agents.

CRITICAL STRUCTURE REQUIREMENTS:
You must return a complete meta-prompt object with ALL required fields:

REQUIRED FIELDS CHECKLIST:
✓ systemPrompt (string)
✓ userPrompt (string)
✓ contextSummary (string)
✓ taskDecomposition (object with "epics" array)
✓ guidelines (array)
✓ estimatedComplexity (enum)
✓ qualityScore (number)
✓ aiAgentResponseFormat (object with description, format, rules)

CRITICAL FORMAT VALIDATION:
❌ INVALID: {"id": "epic-1", "title": "...", "tasks": [...]}
❌ INVALID: {"epics": [{"id": "epic-1", ...}]}
✅ VALID: {"systemPrompt": "...", "userPrompt": "...", "taskDecomposition": {"epics": [...]}, ...}

Your response MUST start with:
{
  "systemPrompt": "

NOT with:
{
  "id": "epic-1"

NOT with:
{
  "epics": [

COMMON ERROR TO AVOID:
❌ DO NOT return just an epic object like: {"id": "epic-1", "title": "...", "tasks": [...]}
✅ DO return complete structure like: {"systemPrompt": "...", "taskDecomposition": {"epics": [...]}, ...}

VALIDATION BEFORE RESPONDING:
- Confirm your response has all 8 required top-level fields
- Confirm taskDecomposition contains an "epics" array, not just epic properties
- Base all file references on the actual codebase structure provided above

REQUIRED JSON STRUCTURE - COPY THIS TEMPLATE:
{
  "systemPrompt": "Your system prompt here...",
  "userPrompt": "Your user prompt here...",
  "contextSummary": "Your context summary here...",
  "taskDecomposition": {
    "epics": [
      {
        "id": "epic-1",
        "title": "Epic Title",
        "description": "Epic description...",
        "estimatedComplexity": "medium",
        "tasks": [
          {
            "id": "task-1-1",
            "title": "Task Title",
            "description": "Task description...",
            "estimatedHours": 2,
            "dependencies": [],
            "subtasks": [
              {
                "id": "subtask-1-1-1",
                "title": "Subtask Title",
                "description": "Subtask description...",
                "estimatedMinutes": 15
              }
            ]
          }
        ]
      }
    ]
  },
  "guidelines": ["Guideline 1", "Guideline 2"],
  "estimatedComplexity": "medium",
  "qualityScore": 0.85,
  "aiAgentResponseFormat": {
    "description": "Response format description",
    "format": "Format template",
    "rules": ["Rule 1", "Rule 2"]
  }
}

IMPORTANT: Start your response with { and end with }. Do not include any text before or after the JSON object.`;

  return prompt;
}

/**
 * JSON schema for meta-prompt generation response validation
 */
export const META_PROMPT_GENERATION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    systemPrompt: {
      type: 'string',
      minLength: 1,
      description: 'Comprehensive system prompt for AI agents'
    },
    userPrompt: {
      type: 'string',
      minLength: 1,
      description: 'Detailed user prompt with context and requirements'
    },
    contextSummary: {
      type: 'string',
      minLength: 1,
      description: 'Synthesized codebase and architectural understanding'
    },
    taskDecomposition: {
      type: 'object',
      properties: {
        epics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                minLength: 1,
                description: 'Unique identifier for the epic'
              },
              title: {
                type: 'string',
                minLength: 1,
                description: 'Epic title'
              },
              description: {
                type: 'string',
                minLength: 1,
                description: 'Detailed epic description'
              },
              estimatedComplexity: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'very_high'],
                description: 'Estimated complexity level'
              },
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                      minLength: 1,
                      description: 'Unique identifier for the task'
                    },
                    title: {
                      type: 'string',
                      minLength: 1,
                      description: 'Task title'
                    },
                    description: {
                      type: 'string',
                      minLength: 1,
                      description: 'Detailed task description'
                    },
                    estimatedHours: {
                      type: 'number',
                      minimum: 0,
                      description: 'Estimated hours to complete'
                    },
                    dependencies: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'List of task dependencies'
                    },
                    subtasks: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: {
                            type: 'string',
                            minLength: 1,
                            description: 'Unique identifier for the subtask'
                          },
                          title: {
                            type: 'string',
                            minLength: 1,
                            description: 'Subtask title'
                          },
                          description: {
                            type: 'string',
                            minLength: 1,
                            description: 'Specific subtask description'
                          },
                          estimatedMinutes: {
                            type: 'number',
                            minimum: 0,
                            description: 'Estimated minutes to complete'
                          }
                        },
                        required: ['id', 'title', 'description', 'estimatedMinutes'],
                        additionalProperties: false
                      },
                      description: 'List of atomic subtasks'
                    }
                  },
                  required: ['id', 'title', 'description', 'estimatedHours', 'dependencies', 'subtasks'],
                  additionalProperties: false
                },
                description: 'List of tasks within the epic'
              }
            },
            required: ['id', 'title', 'description', 'estimatedComplexity', 'tasks'],
            additionalProperties: false
          },
          description: 'List of epics for the project'
        }
      },
      required: ['epics'],
      additionalProperties: false,
      description: 'Structured task decomposition'
    },
    guidelines: {
      type: 'array',
      items: { type: 'string' },
      description: 'Development guidelines for the task'
    },
    estimatedComplexity: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'very_high'],
      description: 'Overall estimated complexity'
    },
    qualityScore: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Quality score of the generated meta-prompt'
    },
    aiAgentResponseFormat: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          minLength: 1,
          description: 'Description of the response format'
        },
        format: {
          type: 'string',
          minLength: 1,
          description: 'Structured format template with EPIC_ID, TASK_ID, SUBTASK_ID elements'
        },
        rules: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Rules for AI agents to follow'
        }
      },
      required: ['description', 'format', 'rules'],
      additionalProperties: false,
      description: 'AI Agent response format specification'
    }
  },
  required: [
    'systemPrompt',
    'userPrompt',
    'contextSummary',
    'taskDecomposition',
    'guidelines',
    'estimatedComplexity',
    'qualityScore'
  ],
  additionalProperties: false
} as const;

/**
 * Example prompts for different meta-prompt generation scenarios
 */
export const META_PROMPT_GENERATION_EXAMPLES = {
  refactoring_authentication: {
    originalPrompt: 'Refactor the authentication module to use JWT tokens',
    taskType: 'refactoring' as const,
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
    relevanceScoringResult: {
      fileScores: [
        {
          filePath: 'src/auth/authentication.ts',
          relevanceScore: 0.95,
          confidence: 0.9,
          reasoning: 'Core authentication module that needs JWT implementation',
          categories: ['core', 'authentication'],
          modificationLikelihood: 'very_high' as const
        }
      ],
      overallMetrics: {
        averageRelevance: 0.95,
        totalFilesScored: 1,
        highRelevanceCount: 1,
        processingTimeMs: 1800
      },
      scoringStrategy: 'semantic_similarity' as const
    },
    expectedResponse: {
      systemPrompt: 'You are an expert software engineer specializing in authentication systems and security refactoring.',
      userPrompt: 'Refactor the authentication module to use JWT tokens while maintaining security best practices.',
      contextSummary: 'The codebase contains a traditional authentication system that requires JWT token implementation.',
      taskDecomposition: {
        epics: [
          {
            id: 'epic-1',
            title: 'JWT Token Implementation',
            description: 'Implement JWT token generation, validation, and management',
            estimatedComplexity: 'medium' as const,
            tasks: [
              {
                id: 'task-1-1',
                title: 'Implement JWT token generation',
                description: 'Create secure JWT token generation with proper claims',
                estimatedHours: 4,
                dependencies: [],
                subtasks: [
                  {
                    id: 'subtask-1-1-1',
                    title: 'Set up JWT library',
                    description: 'Install and configure JWT library',
                    estimatedMinutes: 15
                  }
                ]
              }
            ]
          }
        ]
      },
      guidelines: [
        'Maintain backward compatibility during refactoring',
        'Implement comprehensive security measures for JWT tokens'
      ],
      estimatedComplexity: 'medium' as const,
      qualityScore: 0.92
    }
  }
} as const;

/**
 * Get the LLM task identifier for meta-prompt generation
 */
export function getMetaPromptGenerationTaskId(): ContextCuratorLLMTask {
  return ContextCuratorLLMTask.META_PROMPT_GENERATION;
}

/**
 * Attempt to recover a partial response by transforming it to the expected format
 */
export function attemptResponseRecovery(response: unknown): unknown {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const obj = response as Record<string, unknown>;

  // NEW: Handle single epic object case
  if ('id' in obj && 'title' in obj && 'tasks' in obj && 'estimatedComplexity' in obj && !('epics' in obj)) {
    console.warn('Detected single epic response, converting to complete meta-prompt format');

    return {
      systemPrompt: "You are an expert software engineer with deep knowledge of the codebase architecture and development best practices.",
      userPrompt: "Complete the development task following the structured decomposition and guidelines provided.",
      contextSummary: "The codebase requires implementation of the requested features following established patterns and architectural principles.",
      taskDecomposition: {
        epics: [obj] // Wrap single epic in array
      },
      guidelines: generateTaskTypeGuidelines('feature_addition'),
      estimatedComplexity: obj.estimatedComplexity || "medium",
      qualityScore: 0.75,
      aiAgentResponseFormat: {
        description: "Structured response format for development tasks",
        format: "EPIC_ID: [epic-id]\nTASK_ID: [task-id]\nSUBTASK_ID: [subtask-id]\nSTATUS: [status]",
        rules: [
          "Each response must reference the specific epic, task, and subtask being addressed",
          "Include clear status updates and completion criteria",
          "Provide detailed implementation notes and considerations"
        ]
      }
    };
  }

  // Check if this is a partial response with only epics
  if ('epics' in obj && Array.isArray(obj.epics) && Object.keys(obj).length === 1) {
    console.warn('Detected partial response with only epics field, attempting recovery');

    // Transform to expected format with default values
    return {
      systemPrompt: "You are an expert software engineer with deep knowledge of the codebase architecture and development best practices.",
      userPrompt: "Complete the development task following the structured decomposition and guidelines provided.",
      contextSummary: "The codebase requires implementation of the requested features following established patterns and architectural principles.",
      taskDecomposition: {
        epics: obj.epics
      },
      guidelines: [
        "Follow existing code patterns and architectural principles",
        "Maintain code quality and test coverage",
        "Ensure backward compatibility where applicable",
        "Document significant changes and new features"
      ],
      estimatedComplexity: "medium",
      qualityScore: 0.75,
      aiAgentResponseFormat: {
        description: "Structured response format for development tasks",
        format: "EPIC_ID: [epic-id]\nTASK_ID: [task-id]\nSUBTASK_ID: [subtask-id]\nSTATUS: [status]",
        rules: [
          "Each response must reference the specific epic, task, and subtask being addressed",
          "Include clear status updates and completion criteria",
          "Provide detailed implementation notes and considerations"
        ]
      }
    };
  }

  return response;
}

/**
 * Validate meta-prompt generation response against schema
 */
export function validateMetaPromptGenerationResponse(response: unknown): boolean {
  try {
    if (!response || typeof response !== 'object') {
      console.error('Meta-prompt validation failed: response is not an object', { response, type: typeof response });
      return false;
    }

    const obj = response as Record<string, unknown>;

    // Check required fields (aiAgentResponseFormat is optional)
    const requiredFields = [
      'systemPrompt', 'userPrompt', 'contextSummary', 'taskDecomposition',
      'guidelines', 'estimatedComplexity', 'qualityScore'
    ];

    for (const field of requiredFields) {
      if (!(field in obj)) {
        console.error(`Meta-prompt validation failed: missing required field '${field}'`, {
          availableFields: Object.keys(obj),
          missingField: field
        });
        return false;
      }
    }

    // Validate string fields
    if (typeof obj.systemPrompt !== 'string' || obj.systemPrompt.length === 0) {
      console.error('Meta-prompt validation failed: invalid systemPrompt', {
        type: typeof obj.systemPrompt,
        length: typeof obj.systemPrompt === 'string' ? obj.systemPrompt.length : 'N/A'
      });
      return false;
    }

    if (typeof obj.userPrompt !== 'string' || obj.userPrompt.length === 0) {
      console.error('Meta-prompt validation failed: invalid userPrompt', {
        type: typeof obj.userPrompt,
        length: typeof obj.userPrompt === 'string' ? obj.userPrompt.length : 'N/A'
      });
      return false;
    }

    if (typeof obj.contextSummary !== 'string' || obj.contextSummary.length === 0) {
      console.error('Meta-prompt validation failed: invalid contextSummary', {
        type: typeof obj.contextSummary,
        length: typeof obj.contextSummary === 'string' ? obj.contextSummary.length : 'N/A'
      });
      return false;
    }

    // Validate guidelines array
    if (!Array.isArray(obj.guidelines)) {
      console.error('Meta-prompt validation failed: guidelines is not an array', {
        type: typeof obj.guidelines,
        value: obj.guidelines
      });
      return false;
    }

    for (const guideline of obj.guidelines) {
      if (typeof guideline !== 'string') {
        console.error('Meta-prompt validation failed: guideline is not a string', {
          type: typeof guideline,
          value: guideline
        });
        return false;
      }
    }

    // Validate complexity
    if (!['low', 'medium', 'high', 'very_high'].includes(obj.estimatedComplexity as string)) {
      console.error('Meta-prompt validation failed: invalid estimatedComplexity', {
        value: obj.estimatedComplexity,
        type: typeof obj.estimatedComplexity
      });
      return false;
    }

    // Validate quality score
    if (typeof obj.qualityScore !== 'number' || obj.qualityScore < 0 || obj.qualityScore > 1) {
      console.error('Meta-prompt validation failed: invalid qualityScore', {
        value: obj.qualityScore,
        type: typeof obj.qualityScore
      });
      return false;
    }

    // Validate aiAgentResponseFormat (optional field)
    if (obj.aiAgentResponseFormat !== undefined) {
      if (!obj.aiAgentResponseFormat || typeof obj.aiAgentResponseFormat !== 'object') {
        console.error('Meta-prompt validation failed: invalid aiAgentResponseFormat', {
          value: obj.aiAgentResponseFormat,
          type: typeof obj.aiAgentResponseFormat
        });
        return false;
      }

      const responseFormat = obj.aiAgentResponseFormat as Record<string, unknown>;
      if (typeof responseFormat.description !== 'string' || responseFormat.description.length === 0) {
        console.error('Meta-prompt validation failed: invalid aiAgentResponseFormat.description', {
          value: responseFormat.description,
          type: typeof responseFormat.description
        });
        return false;
      }

      if (typeof responseFormat.format !== 'string' || responseFormat.format.length === 0) {
        console.error('Meta-prompt validation failed: invalid aiAgentResponseFormat.format', {
          value: responseFormat.format,
          type: typeof responseFormat.format
        });
        return false;
      }

      if (!Array.isArray(responseFormat.rules)) {
        console.error('Meta-prompt validation failed: aiAgentResponseFormat.rules is not an array', {
          value: responseFormat.rules,
          type: typeof responseFormat.rules
        });
        return false;
      }
    }

    // Validate task decomposition
    if (!obj.taskDecomposition || typeof obj.taskDecomposition !== 'object') {
      console.error('Meta-prompt validation failed: invalid taskDecomposition', {
        value: obj.taskDecomposition,
        type: typeof obj.taskDecomposition
      });
      return false;
    }

    const decomposition = obj.taskDecomposition as Record<string, unknown>;
    if (!Array.isArray(decomposition.epics)) {
      console.error('Meta-prompt validation failed: epics is not an array', {
        epics: decomposition.epics,
        type: typeof decomposition.epics,
        decompositionKeys: Object.keys(decomposition)
      });
      return false;
    }

    for (const epic of decomposition.epics) {
      if (!epic || typeof epic !== 'object') {
        return false;
      }

      const epicObj = epic as Record<string, unknown>;

      // Validate epic fields
      if (typeof epicObj.id !== 'string' || epicObj.id.length === 0) {
        return false;
      }

      if (typeof epicObj.title !== 'string' || epicObj.title.length === 0) {
        return false;
      }

      if (typeof epicObj.description !== 'string' || epicObj.description.length === 0) {
        return false;
      }

      if (!['low', 'medium', 'high', 'very_high'].includes(epicObj.estimatedComplexity as string)) {
        return false;
      }

      // Validate tasks
      if (!Array.isArray(epicObj.tasks)) {
        return false;
      }

      for (const task of epicObj.tasks) {
        if (!task || typeof task !== 'object') {
          return false;
        }

        const taskObj = task as Record<string, unknown>;

        if (typeof taskObj.id !== 'string' || taskObj.id.length === 0) {
          return false;
        }

        if (typeof taskObj.title !== 'string' || taskObj.title.length === 0) {
          return false;
        }

        if (typeof taskObj.description !== 'string' || taskObj.description.length === 0) {
          return false;
        }

        if (typeof taskObj.estimatedHours !== 'number' || taskObj.estimatedHours < 0) {
          return false;
        }

        if (!Array.isArray(taskObj.dependencies)) {
          return false;
        }

        for (const dep of taskObj.dependencies) {
          if (typeof dep !== 'string') {
            return false;
          }
        }

        // Validate subtasks
        if (!Array.isArray(taskObj.subtasks)) {
          return false;
        }

        for (const subtask of taskObj.subtasks) {
          if (!subtask || typeof subtask !== 'object') {
            return false;
          }

          const subtaskObj = subtask as Record<string, unknown>;

          if (typeof subtaskObj.id !== 'string' || subtaskObj.id.length === 0) {
            return false;
          }

          if (typeof subtaskObj.title !== 'string' || subtaskObj.title.length === 0) {
            return false;
          }

          if (typeof subtaskObj.description !== 'string' || subtaskObj.description.length === 0) {
            return false;
          }

          if (typeof subtaskObj.estimatedMinutes !== 'number' || subtaskObj.estimatedMinutes < 0) {
            return false;
          }
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Calculate task decomposition metrics
 */
export function calculateTaskDecompositionMetrics(
  taskDecomposition: {
    epics: Array<{
      tasks: Array<{
        estimatedHours: number;
        subtasks: Array<{
          estimatedMinutes: number;
        }>;
      }>;
    }>;
  }
): {
  totalEpics: number;
  totalTasks: number;
  totalSubtasks: number;
  totalEstimatedHours: number;
  totalEstimatedMinutes: number;
  averageTasksPerEpic: number;
  averageSubtasksPerTask: number;
} {
  const totalEpics = taskDecomposition.epics.length;
  let totalTasks = 0;
  let totalSubtasks = 0;
  let totalEstimatedHours = 0;
  let totalEstimatedMinutes = 0;

  for (const epic of taskDecomposition.epics) {
    totalTasks += epic.tasks.length;

    for (const task of epic.tasks) {
      totalEstimatedHours += task.estimatedHours;
      totalSubtasks += task.subtasks.length;

      for (const subtask of task.subtasks) {
        totalEstimatedMinutes += subtask.estimatedMinutes;
      }
    }
  }

  return {
    totalEpics,
    totalTasks,
    totalSubtasks,
    totalEstimatedHours,
    totalEstimatedMinutes,
    averageTasksPerEpic: totalEpics > 0 ? Math.round((totalTasks / totalEpics) * 100) / 100 : 0,
    averageSubtasksPerTask: totalTasks > 0 ? Math.round((totalSubtasks / totalTasks) * 100) / 100 : 0
  };
}

/**
 * Generate task-type specific guidelines
 */
export function generateTaskTypeGuidelines(taskType: string): string[] {
  const baseGuidelines = [
    'Follow established coding standards and conventions',
    'Write comprehensive unit tests for all new functionality',
    'Document all public APIs and complex logic',
    'Ensure code is maintainable and follows SOLID principles'
  ];

  const taskSpecificGuidelines: Record<string, string[]> = {
    refactoring: [
      'Maintain backward compatibility during refactoring',
      'Preserve existing functionality while improving code structure',
      'Add regression tests to prevent breaking changes',
      'Document refactoring decisions and architectural changes'
    ],
    feature_addition: [
      'Design with extensibility and scalability in mind',
      'Integrate seamlessly with existing architecture',
      'Consider performance implications of new features',
      'Implement proper error handling and edge case management'
    ],
    bug_fix: [
      'Identify and address root cause, not just symptoms',
      'Add tests that reproduce the bug before fixing',
      'Verify fix doesn\'t introduce new issues',
      'Document the bug cause and solution for future reference'
    ],
    general: [
      'Balance functionality with maintainability',
      'Consider long-term implications of implementation choices',
      'Ensure changes align with overall system architecture',
      'Prioritize code clarity and readability'
    ]
  };

  const specificGuidelines = taskSpecificGuidelines[taskType] || taskSpecificGuidelines.general;
  return [...baseGuidelines, ...specificGuidelines];
}

/**
 * Estimate overall complexity based on task decomposition
 */
export function estimateOverallComplexity(
  taskDecomposition: {
    epics: Array<{
      estimatedComplexity: 'low' | 'medium' | 'high' | 'very_high';
      tasks: Array<{
        estimatedHours: number;
      }>;
    }>;
  }
): 'low' | 'medium' | 'high' | 'very_high' {
  const complexityWeights = {
    low: 1,
    medium: 2,
    high: 3,
    very_high: 4
  };

  let totalWeight = 0;
  let totalHours = 0;

  for (const epic of taskDecomposition.epics) {
    totalWeight += complexityWeights[epic.estimatedComplexity];

    for (const task of epic.tasks) {
      totalHours += task.estimatedHours;
    }
  }

  const averageComplexity = totalWeight / taskDecomposition.epics.length;

  // Factor in total hours for complexity assessment
  if (totalHours > 40 || averageComplexity >= 3.5) {
    return 'very_high';
  } else if (totalHours > 20 || averageComplexity >= 2.5) {
    return 'high';
  } else if (totalHours > 8 || averageComplexity >= 1.5) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Calculate quality score based on meta-prompt completeness
 */
export function calculateQualityScore(
  systemPrompt: string,
  userPrompt: string,
  contextSummary: string,
  taskDecomposition: {
    epics: Array<{
      tasks: Array<{
        estimatedHours?: number;
        subtasks: Array<{
          estimatedMinutes?: number;
        }>;
      }>;
    }>;
  },
  guidelines: string[]
): number {
  let score = 0;

  // System prompt quality (0.2 weight)
  if (systemPrompt.length > 100) score += 0.1;
  if (systemPrompt.includes('expert') || systemPrompt.includes('specialist')) score += 0.05;
  if (systemPrompt.includes('best practices') || systemPrompt.includes('standards')) score += 0.05;

  // User prompt quality (0.2 weight)
  if (userPrompt.length > 100) score += 0.1;
  if (userPrompt.includes('specific') || userPrompt.includes('detailed')) score += 0.05;
  if (userPrompt.includes('requirements') || userPrompt.includes('criteria')) score += 0.05;

  // Context summary quality (0.2 weight)
  if (contextSummary.length > 100) score += 0.1;
  if (contextSummary.includes('architecture') || contextSummary.includes('patterns')) score += 0.05;
  if (contextSummary.includes('components') || contextSummary.includes('dependencies')) score += 0.05;

  // Task decomposition quality (0.3 weight)
  try {
    // Convert to the expected format for metrics calculation
    const metricsTaskDecomposition = {
      epics: taskDecomposition.epics.map(epic => ({
        tasks: epic.tasks.map(task => ({
          estimatedHours: task.estimatedHours || 0,
          subtasks: task.subtasks.map(subtask => ({
            estimatedMinutes: subtask.estimatedMinutes || 0
          }))
        }))
      }))
    };

    const metrics = calculateTaskDecompositionMetrics(metricsTaskDecomposition);
    if (metrics.totalEpics >= 2 && metrics.totalEpics <= 8) score += 0.1;
    if (metrics.averageTasksPerEpic >= 3 && metrics.averageTasksPerEpic <= 7) score += 0.1;
    if (metrics.averageSubtasksPerTask >= 3 && metrics.averageSubtasksPerTask <= 10) score += 0.1;
  } catch {
    // If metrics calculation fails, skip this scoring component
  }

  // Guidelines quality (0.1 weight)
  if (guidelines.length >= 4) score += 0.05;
  if (guidelines.length >= 6) score += 0.05;

  return Math.round(score * 100) / 100;
}
