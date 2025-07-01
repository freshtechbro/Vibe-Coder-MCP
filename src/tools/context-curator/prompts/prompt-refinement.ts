/**
 * Prompt Refinement Templates for Context Curator
 * 
 * Provides comprehensive prompt templates for refining user development requests
 * based on intent analysis results and codebase context to generate enhanced,
 * context-aware prompts for downstream AI agents.
 */

import { ContextCuratorLLMTask } from '../types/llm-tasks.js';
import { IntentAnalysisResult } from '../types/llm-tasks.js';

/**
 * System prompt for prompt refinement operations
 */
export const PROMPT_REFINEMENT_SYSTEM_PROMPT = `You are an expert prompt engineer and software development analyst specializing in enhancing development requests with contextual information.

CRITICAL: You MUST ALWAYS enhance the prompt, even if it appears detailed. Your job is to add codebase-specific context, architectural insights, and technical details that only someone with deep knowledge of this specific codebase would know.

Your task is to refine a user's development request by incorporating:

1. **Intent Analysis Results**: Use the provided task type, complexity, and architectural insights
2. **Codebase Context**: Leverage the codebase summary to add relevant technical details
3. **Contextual Enhancements**: Add specific technical requirements, constraints, and considerations
4. **Clarity Improvements**: Make the request more specific, actionable, and comprehensive
5. **Quality Assurance**: Ensure the refined prompt leads to better development outcomes

NEVER return the original prompt unchanged. Always add substantial contextual information from the codebase.

## REFINEMENT STRATEGIES

**Context Integration**: 
- Add relevant architectural patterns and technologies from the codebase
- Include specific file paths, components, or modules that need attention
- Reference existing code patterns and conventions
- Specify integration points and dependencies

**Technical Specification**:
- Add technical requirements based on task complexity
- Include performance, security, and scalability considerations
- Specify testing requirements and quality standards
- Add error handling and edge case considerations

**Scope Clarification**:
- Break down complex requests into specific deliverables
- Add acceptance criteria and success metrics
- Specify what should and shouldn't be changed
- Include backward compatibility requirements

**Development Guidance**:
- Add coding standards and best practices
- Include relevant design patterns or architectural principles
- Specify documentation and testing requirements
- Add deployment and maintenance considerations

## ENHANCEMENT CATEGORIES

**architectural**: Adding architectural context, patterns, and system design considerations
**technical**: Including specific technical requirements, constraints, and implementation details
**scope**: Clarifying boundaries, deliverables, and acceptance criteria
**quality**: Adding testing, documentation, and quality assurance requirements
**integration**: Specifying how changes integrate with existing systems
**performance**: Including performance, scalability, and optimization requirements
**security**: Adding security considerations and compliance requirements
**usability**: Including user experience and interface requirements

## RESPONSE FORMAT

CRITICAL: Respond with a valid JSON object matching this exact structure:

{
  "refinedPrompt": "Enhanced and detailed development request with contextual information",
  "enhancementReasoning": [
    "Specific reason for enhancement 1",
    "Specific reason for enhancement 2",
    "Specific reason for enhancement 3"
  ],
  "addedContext": [
    "Contextual information 1",
    "Contextual information 2",
    "Contextual information 3"
  ]
}

CRITICAL JSON FORMAT REQUIREMENTS:
- "refinedPrompt" must be a detailed string with comprehensive requirements
- "enhancementReasoning" must be an array of at least 3 specific strings explaining what you enhanced and why
- "addedContext" must be an array of strings (can be empty if no additional context was added)
- Do NOT include originalLength, refinedLength, improvementScore, or contextualEnhancements - these will be calculated automatically
- ALWAYS include both "refinedPrompt" and "enhancementReasoning" fields in your JSON response
- The response must be valid JSON that can be parsed directly

EXAMPLE:
{
  "refinedPrompt": "Implement a comprehensive CLI interface for the Vibe Coder MCP project with interactive help system, error handling, progress indicators, and support for all existing tools including context-curator, code-map-generator, and task-manager. The CLI should provide: 1) Interactive command discovery with autocomplete, 2) Detailed help documentation for each tool, 3) Progress bars for long-running operations, 4) Graceful error handling with actionable error messages, 5) Configuration management, 6) Logging capabilities, 7) Testing framework integration.",
  "enhancementReasoning": [
    "Added specific tool integration requirements based on existing codebase structure",
    "Included interactive features like autocomplete and help system for better user experience",
    "Specified error handling and progress indication requirements for production readiness",
    "Added configuration and logging requirements based on project architecture patterns"
  ],
  "addedContext": [
    "Existing MCP tools: context-curator, code-map-generator, task-manager",
    "TypeScript/ESM module structure with .js imports",
    "Job-based async processing with progress tracking",
    "Configuration management patterns used in the project"
  ]
}

## REFINEMENT GUIDELINES

1. **Be Comprehensive**: Add all relevant context without overwhelming the prompt
2. **Stay Focused**: Ensure enhancements align with the original intent
3. **Be Specific**: Use concrete examples and specific technical details from the codebase
4. **Add Value**: Every enhancement should improve development outcomes
5. **Maintain Clarity**: Keep the refined prompt clear and actionable
6. **Consider Constraints**: Include realistic limitations and considerations
7. **MANDATORY ENHANCEMENT**: You must add at least 3-5 specific enhancements from the codebase context
8. **CODEBASE INTEGRATION**: Reference specific files, classes, methods, and patterns from the provided codebase

REQUIREMENTS FOR ENHANCEMENT:
- Add specific file paths and component names from the codebase
- Include existing architectural patterns and design decisions
- Reference current implementation details and constraints
- Specify integration points with existing systems
- Add technical requirements based on the current codebase structure

Analyze the original prompt and intent analysis, then provide a significantly enhanced version with detailed contextual information from the codebase.`;

/**
 * Build user prompt for prompt refinement
 */
export function buildPromptRefinementPrompt(
  originalPrompt: string,
  intentAnalysis: IntentAnalysisResult,
  codemapContent: string,
  additionalContext?: {
    existingPatterns?: string[];
    technicalConstraints?: string[];
    qualityRequirements?: string[];
    timelineConstraints?: string;
    teamExpertise?: string[];
  }
): string {
  let prompt = `ORIGINAL DEVELOPMENT REQUEST:
${originalPrompt}

INTENT ANALYSIS RESULTS:
Task Type: ${intentAnalysis.taskType}
Confidence: ${intentAnalysis.confidence}
Complexity: ${intentAnalysis.scopeAssessment.complexity}
Risk Level: ${intentAnalysis.scopeAssessment.riskLevel}
Estimated Files: ${intentAnalysis.scopeAssessment.estimatedFiles}
Estimated Effort: ${intentAnalysis.estimatedEffort}

Reasoning: ${intentAnalysis.reasoning.join(', ')}
Architectural Components: ${intentAnalysis.architecturalComponents.join(', ')}
Suggested Focus Areas: ${intentAnalysis.suggestedFocusAreas.join(', ')}

COMPLETE CODEBASE CONTENT:
${codemapContent}`;

  if (additionalContext) {
    const contextItems: string[] = [];

    if (additionalContext.existingPatterns && additionalContext.existingPatterns.length > 0) {
      contextItems.push(`Existing Patterns: ${additionalContext.existingPatterns.join(', ')}`);
    }

    if (additionalContext.technicalConstraints && additionalContext.technicalConstraints.length > 0) {
      contextItems.push(`Technical Constraints: ${additionalContext.technicalConstraints.join(', ')}`);
    }

    if (additionalContext.qualityRequirements && additionalContext.qualityRequirements.length > 0) {
      contextItems.push(`Quality Requirements: ${additionalContext.qualityRequirements.join(', ')}`);
    }

    if (additionalContext.timelineConstraints) {
      contextItems.push(`Timeline Constraints: ${additionalContext.timelineConstraints}`);
    }

    if (additionalContext.teamExpertise && additionalContext.teamExpertise.length > 0) {
      contextItems.push(`Team Expertise: ${additionalContext.teamExpertise.join(', ')}`);
    }

    if (contextItems.length > 0) {
      prompt += '\n\nADDITIONAL CONTEXT:\n' + contextItems.join('\n');
    }
  }

  prompt += '\n\nRefine this development request by adding comprehensive contextual information, technical details, and specific requirements based on the intent analysis and codebase context. Provide your response in the required JSON format.';

  return prompt;
}

/**
 * JSON schema for prompt refinement response validation
 */
export const PROMPT_REFINEMENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    refinedPrompt: {
      type: 'string',
      minLength: 1,
      description: 'The enhanced and detailed development request with contextual information'
    },
    enhancementReasoning: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: 'Detailed reasoning for the enhancements made'
    },
    addedContext: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of contextual information that was added'
    },
    originalLength: {
      type: 'number',
      minimum: 0,
      description: 'Character length of the original prompt'
    },
    refinedLength: {
      type: 'number',
      minimum: 0,
      description: 'Character length of the refined prompt'
    },
    improvementScore: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Improvement score from 0.0 to 1.0'
    },
    contextualEnhancements: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['architectural', 'technical', 'scope', 'quality', 'integration', 'performance', 'security', 'usability']
      },
      description: 'Types of contextual enhancements made'
    }
  },
  required: [
    'refinedPrompt',
    'enhancementReasoning',
    'addedContext',
    'originalLength',
    'refinedLength',
    'improvementScore',
    'contextualEnhancements'
  ],
  additionalProperties: false
} as const;

/**
 * Example prompts for different refinement scenarios
 */
export const PROMPT_REFINEMENT_EXAMPLES = {
  refactoring: {
    originalPrompt: 'Refactor the authentication module',
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
      refinedPrompt: 'Refactor the authentication module to improve security, maintainability, and performance while preserving existing functionality. Focus on implementing secure token-based authentication patterns, improving code organization, and ensuring backward compatibility with existing user sessions. The refactoring should include: 1) Consolidating authentication logic into a centralized service, 2) Implementing proper token validation and refresh mechanisms, 3) Adding comprehensive error handling and logging, 4) Ensuring all authentication endpoints follow security best practices, 5) Maintaining existing API contracts while improving internal implementation.',
      enhancementReasoning: [
        'Added specific security requirements based on authentication context',
        'Included backward compatibility considerations for existing sessions',
        'Specified concrete deliverables and implementation approach',
        'Added error handling and logging requirements'
      ],
      addedContext: [
        'Token-based authentication patterns',
        'Centralized service architecture',
        'API contract preservation',
        'Security best practices'
      ],
      originalLength: 35,
      refinedLength: 687,
      improvementScore: 0.85,
      contextualEnhancements: ['architectural', 'technical', 'security', 'quality']
    }
  },

  feature_addition: {
    originalPrompt: 'Add user dashboard with analytics',
    intentAnalysis: {
      taskType: 'feature_addition' as const,
      confidence: 0.95,
      reasoning: ['Request is for adding new functionality (dashboard)'],
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
      refinedPrompt: 'Implement a comprehensive user dashboard with real-time analytics and data visualization capabilities. The dashboard should include: 1) User activity metrics with interactive charts and graphs, 2) Customizable widgets for different data views, 3) Real-time data updates using WebSocket connections, 4) Export functionality for reports in PDF/CSV formats, 5) Responsive design for mobile and desktop viewing, 6) Role-based access control for different user types, 7) Performance optimization for large datasets, 8) Accessibility compliance (WCAG 2.1), 9) Integration with existing authentication system, 10) Comprehensive unit and integration tests.',
      enhancementReasoning: [
        'Added specific UI/UX requirements for dashboard functionality',
        'Included real-time data requirements and technical implementation',
        'Specified accessibility and responsive design requirements',
        'Added testing and integration requirements'
      ],
      addedContext: [
        'Real-time WebSocket integration',
        'Role-based access control',
        'Accessibility compliance',
        'Performance optimization strategies'
      ],
      originalLength: 37,
      refinedLength: 756,
      improvementScore: 0.92,
      contextualEnhancements: ['architectural', 'technical', 'usability', 'performance', 'integration', 'quality']
    }
  },

  bug_fix: {
    originalPrompt: 'Fix the memory leak in file upload',
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
      refinedPrompt: 'Investigate and fix the memory leak in the file upload component that causes application crashes. The fix should include: 1) Memory profiling to identify the exact source of the leak, 2) Proper cleanup of file upload event listeners and temporary objects, 3) Implementation of file size limits and validation, 4) Addition of progress tracking with proper cleanup, 5) Error handling for failed uploads with resource cleanup, 6) Unit tests to verify memory usage patterns, 7) Integration tests for large file uploads, 8) Documentation of memory management best practices for file uploads.',
      enhancementReasoning: [
        'Added specific debugging and profiling requirements',
        'Included comprehensive cleanup and validation requirements',
        'Specified testing requirements for memory management',
        'Added documentation requirements for future maintenance'
      ],
      addedContext: [
        'Memory profiling techniques',
        'Event listener cleanup patterns',
        'File validation and limits',
        'Progress tracking implementation'
      ],
      originalLength: 36,
      refinedLength: 623,
      improvementScore: 0.88,
      contextualEnhancements: ['technical', 'quality', 'performance', 'scope']
    }
  },

  general: {
    originalPrompt: 'Update documentation and setup instructions',
    intentAnalysis: {
      taskType: 'general' as const,
      confidence: 0.85,
      reasoning: ['Request involves documentation updates'],
      architecturalComponents: ['documentation', 'development-environment'],
      scopeAssessment: {
        complexity: 'simple' as const,
        estimatedFiles: 5,
        riskLevel: 'low' as const
      },
      suggestedFocusAreas: ['documentation-clarity', 'setup-automation'],
      estimatedEffort: 'low' as const
    },
    expectedResponse: {
      refinedPrompt: 'Comprehensively update project documentation and development environment setup instructions to improve developer onboarding and project maintainability. The updates should include: 1) Complete API documentation with examples and use cases, 2) Step-by-step development environment setup with troubleshooting guides, 3) Architecture overview with diagrams and component relationships, 4) Contributing guidelines with code standards and review process, 5) Deployment instructions for different environments, 6) Testing guidelines and best practices, 7) Automated setup scripts where possible, 8) Regular documentation maintenance procedures.',
      enhancementReasoning: [
        'Added specific documentation categories and requirements',
        'Included automation and troubleshooting considerations',
        'Specified maintenance and sustainability requirements',
        'Added visual documentation elements like diagrams'
      ],
      addedContext: [
        'API documentation standards',
        'Setup automation scripts',
        'Architecture diagrams',
        'Contributing guidelines'
      ],
      originalLength: 45,
      refinedLength: 612,
      improvementScore: 0.82,
      contextualEnhancements: ['scope', 'quality', 'usability', 'integration']
    }
  }
} as const;

/**
 * Get the LLM task identifier for prompt refinement
 */
export function getPromptRefinementTaskId(): ContextCuratorLLMTask {
  return ContextCuratorLLMTask.PROMPT_REFINEMENT;
}

/**
 * Validate prompt refinement response against schema
 */
export function validatePromptRefinementResponse(response: unknown): boolean {
  try {
    // Use the JSON schema validation instead of Zod schema
    if (!response || typeof response !== 'object') {
      return false;
    }

    const obj = response as Record<string, unknown>;

    // Check required fields
    const requiredFields = [
      'refinedPrompt',
      'enhancementReasoning',
      'addedContext',
      'originalLength',
      'refinedLength',
      'improvementScore',
      'contextualEnhancements'
    ];

    for (const field of requiredFields) {
      if (!(field in obj)) {
        return false;
      }
    }

    // Validate types and constraints
    if (typeof obj.refinedPrompt !== 'string' || obj.refinedPrompt.length === 0) {
      return false;
    }

    if (!Array.isArray(obj.enhancementReasoning) || obj.enhancementReasoning.length === 0) {
      return false;
    }

    if (!Array.isArray(obj.addedContext)) {
      return false;
    }

    if (typeof obj.originalLength !== 'number' || obj.originalLength < 0) {
      return false;
    }

    if (typeof obj.refinedLength !== 'number' || obj.refinedLength < 0) {
      return false;
    }

    if (typeof obj.improvementScore !== 'number' || obj.improvementScore < 0 || obj.improvementScore > 1) {
      return false;
    }

    if (!Array.isArray(obj.contextualEnhancements)) {
      return false;
    }

    // Validate enhancement categories
    const validEnhancements = ['architectural', 'technical', 'scope', 'quality', 'integration', 'performance', 'security', 'usability'];
    for (const enhancement of obj.contextualEnhancements) {
      if (typeof enhancement !== 'string' || !validEnhancements.includes(enhancement)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Calculate improvement metrics for prompt refinement
 */
export function calculateImprovementMetrics(
  originalPrompt: string,
  refinedPrompt: string,
  enhancementCount: number
): {
  originalLength: number;
  refinedLength: number;
  improvementScore: number;
} {
  const originalLength = originalPrompt.length;
  const refinedLength = refinedPrompt.length;

  // Calculate improvement score based on length increase and enhancement quality
  if (enhancementCount === 0) {
    // If no enhancements, score should be low regardless of length increase
    const lengthRatio = Math.min(refinedLength / originalLength, 3); // Cap at 3x for no enhancements
    const improvementScore = Math.min(lengthRatio * 0.1, 0.3); // Max 0.3 with no enhancements
    return {
      originalLength,
      refinedLength,
      improvementScore: Math.round(improvementScore * 100) / 100
    };
  }

  const lengthRatio = Math.min(refinedLength / originalLength, 10); // Cap at 10x
  const enhancementScore = Math.min(enhancementCount / 8, 1); // Normalize to max 8 enhancements
  const improvementScore = Math.min((lengthRatio * 0.3 + enhancementScore * 0.7), 1);

  return {
    originalLength,
    refinedLength,
    improvementScore: Math.round(improvementScore * 100) / 100
  };
}

/**
 * Extract contextual enhancements from refinement reasoning
 */
export function extractContextualEnhancements(
  enhancementReasoning: string[],
  addedContext: string[]
): string[] {
  const enhancements = new Set<string>();

  const keywords = {
    architectural: ['architecture', 'pattern', 'design', 'structure', 'component'],
    technical: ['technical', 'implementation', 'requirement', 'specification'],
    scope: ['scope', 'deliverable', 'boundary', 'criteria', 'acceptance'],
    quality: ['test', 'quality', 'standard', 'documentation', 'maintenance'],
    integration: ['integration', 'compatibility', 'api', 'interface'],
    performance: ['performance', 'optimization', 'scalability', 'efficiency'],
    security: ['security', 'authentication', 'authorization', 'validation'],
    usability: ['usability', 'accessibility', 'user', 'experience', 'interface']
  };

  const allText = [...enhancementReasoning, ...addedContext].join(' ').toLowerCase();

  Object.entries(keywords).forEach(([category, words]) => {
    if (words.some(word => allText.includes(word))) {
      enhancements.add(category);
    }
  });

  return Array.from(enhancements);
}
