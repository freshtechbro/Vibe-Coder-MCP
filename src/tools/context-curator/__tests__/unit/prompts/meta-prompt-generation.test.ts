import { describe, it, expect } from 'vitest';
import {
  META_PROMPT_GENERATION_SYSTEM_PROMPT,
  buildMetaPromptGenerationPrompt,
  getMetaPromptGenerationTaskId,
  validateMetaPromptGenerationResponse,
  attemptResponseRecovery,
  calculateTaskDecompositionMetrics,
  generateTaskTypeGuidelines,
  estimateOverallComplexity,
  calculateQualityScore
} from '../../../prompts/meta-prompt-generation.js';
import { ContextCuratorLLMTask } from '../../../types/llm-tasks.js';
import type { IntentAnalysisResult, RelevanceScoringResult } from '../../../types/llm-tasks.js';

describe('Meta-Prompt Generation Templates', () => {
  describe('META_PROMPT_GENERATION_SYSTEM_PROMPT', () => {
    it('should contain comprehensive system instructions', () => {
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('prompt engineer');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('software architect');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('meta-prompts');
    });

    it('should define meta-prompt components', () => {
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('System Prompt');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('User Prompt');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Context Summary');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Task Decomposition');
    });

    it('should include task decomposition principles', () => {
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Epics');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Tasks');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Subtasks');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('3-8 epics per project');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('3-7 tasks per epic');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('3-10 subtasks per task');
    });

    it('should define development guidelines for task types', () => {
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Refactoring');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Feature Addition');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Bug Fix');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('General');
    });

    it('should include quality assessment criteria', () => {
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Rate the meta-prompt quality');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('0.0 to 1.0');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Completeness of context');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Clarity and actionability');
    });

    it('should specify JSON response format', () => {
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('JSON object');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('systemPrompt');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('userPrompt');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('contextSummary');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('taskDecomposition');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('guidelines');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('estimatedComplexity');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('qualityScore');
    });

    it('should include meta-prompt guidelines', () => {
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Be Comprehensive');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Be Specific');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Be Structured');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Be Realistic');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Be Contextual');
      expect(META_PROMPT_GENERATION_SYSTEM_PROMPT).toContain('Be Quality-Focused');
    });
  });

  describe('buildMetaPromptGenerationPrompt', () => {
    const originalPrompt = 'Add user authentication to the application';
    const refinedPrompt = 'Implement secure JWT-based authentication system with user registration, login, and session management';
    const intentAnalysis: IntentAnalysisResult = {
      taskType: 'feature_addition',
      confidence: 0.9,
      reasoning: ['Clear feature request for authentication'],
      architecturalComponents: ['frontend', 'backend', 'authentication'],
      scopeAssessment: {
        complexity: 'moderate',
        estimatedFiles: 8,
        riskLevel: 'medium'
      },
      suggestedFocusAreas: ['security-patterns', 'user-management'],
      estimatedEffort: 'medium'
    };

    const relevanceScoringResult: RelevanceScoringResult = {
      fileScores: [
        {
          filePath: 'src/auth/authentication.ts',
          relevanceScore: 0.95,
          confidence: 0.9,
          reasoning: 'Core authentication module',
          categories: ['core', 'authentication'],
          modificationLikelihood: 'very_high'
        },
        {
          filePath: 'src/auth/middleware.ts',
          relevanceScore: 0.8,
          confidence: 0.85,
          reasoning: 'Authentication middleware',
          categories: ['integration', 'authentication'],
          modificationLikelihood: 'high'
        }
      ],
      overallMetrics: {
        averageRelevance: 0.875,
        totalFilesScored: 2,
        highRelevanceCount: 2,
        processingTimeMs: 1800
      },
      scoringStrategy: 'semantic_similarity'
    };

    it('should build basic prompt with required sections', () => {
      const prompt = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult
      );
      
      expect(prompt).toContain('ORIGINAL DEVELOPMENT REQUEST:');
      expect(prompt).toContain(originalPrompt);
      expect(prompt).toContain('REFINED PROMPT:');
      expect(prompt).toContain(refinedPrompt);
      expect(prompt).toContain('INTENT ANALYSIS:');
      expect(prompt).toContain('Task Type: feature_addition');
      expect(prompt).toContain('Confidence: 0.9');
      expect(prompt).toContain('RELEVANCE SCORING RESULTS:');
      expect(prompt).toContain('Scoring Strategy: semantic_similarity');
      expect(prompt).toContain('Total Files Scored: 2');
    });

    it('should include intent analysis details', () => {
      const prompt = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult
      );
      
      expect(prompt).toContain('Complexity: moderate');
      expect(prompt).toContain('Risk Level: medium');
      expect(prompt).toContain('Estimated Files: 8');
      expect(prompt).toContain('Estimated Effort: medium');
      expect(prompt).toContain('Reasoning: Clear feature request for authentication');
      expect(prompt).toContain('Architectural Components: frontend, backend, authentication');
      expect(prompt).toContain('Suggested Focus Areas: security-patterns, user-management');
    });

    it('should include relevance scoring details', () => {
      const prompt = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult
      );
      
      expect(prompt).toContain('Average Relevance: 0.875');
      expect(prompt).toContain('High Relevance Count: 2');
      expect(prompt).toContain('Processing Time: 1800ms');
      expect(prompt).toContain('1. src/auth/authentication.ts');
      expect(prompt).toContain('Relevance Score: 0.95');
      expect(prompt).toContain('Confidence: 0.9');
      expect(prompt).toContain('Categories: core, authentication');
      expect(prompt).toContain('Modification Likelihood: very_high');
      expect(prompt).toContain('Reasoning: Core authentication module');
      expect(prompt).toContain('2. src/auth/middleware.ts');
    });

    it('should include additional context when provided', () => {
      const additionalContext = {
        codemapContent: 'React application with Express.js backend',
        architecturalPatterns: ['MVC', 'Repository Pattern'],
        technicalConstraints: ['Node.js 18+', 'TypeScript'],
        qualityRequirements: ['95% test coverage', 'Security compliance'],
        teamExpertise: ['React', 'Node.js', 'TypeScript'],
        timelineConstraints: '2 weeks sprint',
        existingGuidelines: ['ESLint rules', 'Prettier formatting']
      };
      
      const prompt = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult,
        additionalContext
      );
      
      expect(prompt).toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('Complete Codebase Content: React application with Express.js backend');
      expect(prompt).toContain('Architectural Patterns: MVC, Repository Pattern');
      expect(prompt).toContain('Technical Constraints: Node.js 18+, TypeScript');
      expect(prompt).toContain('Quality Requirements: 95% test coverage, Security compliance');
      expect(prompt).toContain('Team Expertise: React, Node.js, TypeScript');
      expect(prompt).toContain('Timeline Constraints: 2 weeks sprint');
      expect(prompt).toContain('Existing Guidelines: ESLint rules, Prettier formatting');
    });

    it('should handle partial additional context', () => {
      const additionalContext = {
        codemapContent: 'TypeScript project',
        technicalConstraints: ['Node.js 18+']
      };
      
      const prompt = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult,
        additionalContext
      );
      
      expect(prompt).toContain('Complete Codebase Content: TypeScript project');
      expect(prompt).toContain('Technical Constraints: Node.js 18+');
      expect(prompt).not.toContain('Architectural Patterns:');
      expect(prompt).not.toContain('Quality Requirements:');
    });

    it('should handle empty additional context', () => {
      const prompt = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult,
        {}
      );
      
      expect(prompt).not.toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('ORIGINAL DEVELOPMENT REQUEST:');
      expect(prompt).toContain('REFINED PROMPT:');
      expect(prompt).toContain('INTENT ANALYSIS:');
      expect(prompt).toContain('RELEVANCE SCORING RESULTS:');
    });

    it('should include task type in generation instruction', () => {
      const prompt = buildMetaPromptGenerationPrompt(
        originalPrompt,
        intentAnalysis,
        refinedPrompt,
        relevanceScoringResult
      );
      
      expect(prompt).toContain(`Generate a comprehensive meta-prompt for the ${intentAnalysis.taskType} task`);
      expect(prompt).toContain('Include structured task decomposition');
      expect(prompt).toContain('development guidelines specific to the task type');
      expect(prompt).toContain('complete context summary');
      expect(prompt).toContain('actionable guidance for downstream AI agents');
    });
  });

  describe('getMetaPromptGenerationTaskId', () => {
    it('should return correct LLM task identifier', () => {
      const taskId = getMetaPromptGenerationTaskId();
      expect(taskId).toBe(ContextCuratorLLMTask.META_PROMPT_GENERATION);
      expect(taskId).toBe('context_curator_meta_prompt_generation');
    });
  });

  describe('validateMetaPromptGenerationResponse', () => {
    it('should validate correct response structure', () => {
      const validResponse = {
        systemPrompt: 'You are an expert software engineer.',
        userPrompt: 'Implement authentication system.',
        contextSummary: 'The application needs secure authentication.',
        taskDecomposition: {
          epics: [
            {
              id: 'epic-1',
              title: 'Authentication Implementation',
              description: 'Implement secure authentication system',
              estimatedComplexity: 'medium',
              tasks: [
                {
                  id: 'task-1-1',
                  title: 'Setup JWT',
                  description: 'Configure JWT token system',
                  estimatedHours: 4,
                  dependencies: [],
                  subtasks: [
                    {
                      id: 'subtask-1-1-1',
                      title: 'Install JWT library',
                      description: 'Install and configure JWT library',
                      estimatedMinutes: 15
                    }
                  ]
                }
              ]
            }
          ]
        },
        guidelines: ['Follow security best practices', 'Write comprehensive tests'],
        estimatedComplexity: 'medium',
        qualityScore: 0.85,
        aiAgentResponseFormat: {
          description: 'Structured response format for AI agents',
          format: 'EPIC_ID: [Unique identifier]\nEPIC_DESCRIPTION: [Description]',
          rules: [
            'Each epic contains multiple tasks',
            'Each task contains multiple subtasks',
            'Each subtask impacts exactly one file'
          ]
        }
      };

      expect(validateMetaPromptGenerationResponse(validResponse)).toBe(true);
    });

    it('should reject invalid complexity values', () => {
      const invalidResponse = {
        systemPrompt: 'Test prompt',
        userPrompt: 'Test user prompt',
        contextSummary: 'Test context',
        taskDecomposition: { epics: [] },
        guidelines: ['Test guideline'],
        estimatedComplexity: 'invalid', // Invalid complexity
        qualityScore: 0.8,
        aiAgentResponseFormat: {
          description: 'Test format',
          format: 'TEST_FORMAT',
          rules: ['Test rule']
        }
      };

      expect(validateMetaPromptGenerationResponse(invalidResponse)).toBe(false);
    });

    it('should reject invalid quality score range', () => {
      const invalidResponse = {
        systemPrompt: 'Test prompt',
        userPrompt: 'Test user prompt',
        contextSummary: 'Test context',
        taskDecomposition: { epics: [] },
        guidelines: ['Test guideline'],
        estimatedComplexity: 'medium',
        qualityScore: 1.5 // Invalid: > 1
      };

      expect(validateMetaPromptGenerationResponse(invalidResponse)).toBe(false);
    });

    it('should reject empty string fields', () => {
      const invalidResponse = {
        systemPrompt: '', // Invalid: empty string
        userPrompt: 'Test user prompt',
        contextSummary: 'Test context',
        taskDecomposition: { epics: [] },
        guidelines: ['Test guideline'],
        estimatedComplexity: 'medium',
        qualityScore: 0.8
      };

      expect(validateMetaPromptGenerationResponse(invalidResponse)).toBe(false);
    });

    it('should reject missing required fields', () => {
      const incompleteResponse = {
        systemPrompt: 'Test prompt',
        userPrompt: 'Test user prompt'
        // Missing other required fields
      };

      expect(validateMetaPromptGenerationResponse(incompleteResponse)).toBe(false);
    });

    it('should validate task decomposition structure', () => {
      const invalidResponse = {
        systemPrompt: 'Test prompt',
        userPrompt: 'Test user prompt',
        contextSummary: 'Test context',
        taskDecomposition: {
          epics: [
            {
              id: 'epic-1',
              title: 'Test Epic',
              description: 'Test description',
              estimatedComplexity: 'medium',
              tasks: [
                {
                  id: 'task-1-1',
                  title: 'Test Task',
                  description: 'Test task description',
                  estimatedHours: -1, // Invalid: negative hours
                  dependencies: [],
                  subtasks: []
                }
              ]
            }
          ]
        },
        guidelines: ['Test guideline'],
        estimatedComplexity: 'medium',
        qualityScore: 0.8
      };

      expect(validateMetaPromptGenerationResponse(invalidResponse)).toBe(false);
    });
  });

  describe('calculateTaskDecompositionMetrics', () => {
    it('should calculate correct metrics for task decomposition', () => {
      const taskDecomposition = {
        epics: [
          {
            tasks: [
              {
                estimatedHours: 4,
                subtasks: [
                  { estimatedMinutes: 15 },
                  { estimatedMinutes: 30 }
                ]
              },
              {
                estimatedHours: 6,
                subtasks: [
                  { estimatedMinutes: 20 },
                  { estimatedMinutes: 25 },
                  { estimatedMinutes: 10 }
                ]
              }
            ]
          },
          {
            tasks: [
              {
                estimatedHours: 2,
                subtasks: [
                  { estimatedMinutes: 10 }
                ]
              }
            ]
          }
        ]
      };

      const metrics = calculateTaskDecompositionMetrics(taskDecomposition);

      expect(metrics.totalEpics).toBe(2);
      expect(metrics.totalTasks).toBe(3);
      expect(metrics.totalSubtasks).toBe(6);
      expect(metrics.totalEstimatedHours).toBe(12); // 4 + 6 + 2
      expect(metrics.totalEstimatedMinutes).toBe(110); // 15 + 30 + 20 + 25 + 10 + 10
      expect(metrics.averageTasksPerEpic).toBe(1.5); // 3 tasks / 2 epics
      expect(metrics.averageSubtasksPerTask).toBe(2); // 6 subtasks / 3 tasks
    });

    it('should handle empty task decomposition', () => {
      const taskDecomposition = { epics: [] };
      const metrics = calculateTaskDecompositionMetrics(taskDecomposition);

      expect(metrics.totalEpics).toBe(0);
      expect(metrics.totalTasks).toBe(0);
      expect(metrics.totalSubtasks).toBe(0);
      expect(metrics.totalEstimatedHours).toBe(0);
      expect(metrics.totalEstimatedMinutes).toBe(0);
      expect(metrics.averageTasksPerEpic).toBe(0);
      expect(metrics.averageSubtasksPerTask).toBe(0);
    });
  });

  describe('generateTaskTypeGuidelines', () => {
    it('should generate refactoring-specific guidelines', () => {
      const guidelines = generateTaskTypeGuidelines('refactoring');

      expect(guidelines.length).toBeGreaterThanOrEqual(6);

      const guidelinesText = guidelines.join(' ');
      expect(guidelinesText).toContain('backward compatibility');
      expect(guidelinesText).toContain('refactoring');
      expect(guidelinesText).toContain('regression tests');
      expect(guidelinesText).toContain('coding standards');
    });

    it('should generate feature addition guidelines', () => {
      const guidelines = generateTaskTypeGuidelines('feature_addition');

      expect(guidelines.length).toBeGreaterThanOrEqual(6);

      const guidelinesText = guidelines.join(' ');
      expect(guidelinesText).toContain('extensibility');
      expect(guidelinesText).toContain('scalability');
      expect(guidelinesText).toContain('architecture');
      expect(guidelinesText).toContain('performance');
    });

    it('should generate bug fix guidelines', () => {
      const guidelines = generateTaskTypeGuidelines('bug_fix');

      expect(guidelines.length).toBeGreaterThanOrEqual(6);

      const guidelinesText = guidelines.join(' ');
      expect(guidelinesText).toContain('root cause');
      expect(guidelinesText).toContain('reproduce the bug');
      expect(guidelinesText).toContain('new issues');
    });

    it('should generate general guidelines for unknown task types', () => {
      const guidelines = generateTaskTypeGuidelines('unknown_task');

      expect(guidelines.length).toBeGreaterThanOrEqual(6);

      const guidelinesText = guidelines.join(' ');
      expect(guidelinesText).toContain('maintainability');
      expect(guidelinesText).toContain('architecture');
      expect(guidelinesText).toContain('clarity');
    });

    it('should always include base guidelines', () => {
      const guidelines = generateTaskTypeGuidelines('refactoring');

      const guidelinesText = guidelines.join(' ');
      expect(guidelinesText).toContain('coding standards');
      expect(guidelinesText).toContain('unit tests');
      expect(guidelinesText).toContain('SOLID principles');
    });
  });

  describe('estimateOverallComplexity', () => {
    it('should estimate very_high complexity for large projects', () => {
      const taskDecomposition = {
        epics: [
          {
            estimatedComplexity: 'high' as const,
            tasks: [{ estimatedHours: 25 }]
          },
          {
            estimatedComplexity: 'very_high' as const,
            tasks: [{ estimatedHours: 20 }]
          }
        ]
      };

      const complexity = estimateOverallComplexity(taskDecomposition);
      expect(complexity).toBe('very_high');
    });

    it('should estimate high complexity for moderate projects', () => {
      const taskDecomposition = {
        epics: [
          {
            estimatedComplexity: 'medium' as const,
            tasks: [{ estimatedHours: 15 }]
          },
          {
            estimatedComplexity: 'high' as const,
            tasks: [{ estimatedHours: 10 }]
          }
        ]
      };

      const complexity = estimateOverallComplexity(taskDecomposition);
      expect(complexity).toBe('high');
    });

    it('should estimate low complexity for simple projects', () => {
      const taskDecomposition = {
        epics: [
          {
            estimatedComplexity: 'low' as const,
            tasks: [{ estimatedHours: 2 }]
          },
          {
            estimatedComplexity: 'low' as const,
            tasks: [{ estimatedHours: 3 }]
          }
        ]
      };

      const complexity = estimateOverallComplexity(taskDecomposition);
      expect(complexity).toBe('low');
    });
  });

  describe('calculateQualityScore', () => {
    it('should calculate high quality score for comprehensive meta-prompt', () => {
      const systemPrompt = 'You are an expert software engineer specializing in authentication systems with deep knowledge of security best practices and modern development standards.';
      const userPrompt = 'Implement a comprehensive authentication system with specific requirements for JWT tokens, user registration, and detailed security measures.';
      const contextSummary = 'The application architecture follows modern patterns with clear component separation and well-defined dependencies between authentication modules.';
      const taskDecomposition = {
        epics: [
          {
            tasks: [
              {
                estimatedHours: 4,
                subtasks: [
                  { estimatedMinutes: 15 },
                  { estimatedMinutes: 20 },
                  { estimatedMinutes: 10 }
                ]
              },
              {
                estimatedHours: 6,
                subtasks: [
                  { estimatedMinutes: 25 },
                  { estimatedMinutes: 30 },
                  { estimatedMinutes: 15 },
                  { estimatedMinutes: 20 }
                ]
              }
            ]
          },
          {
            tasks: [
              {
                estimatedHours: 3,
                subtasks: [
                  { estimatedMinutes: 10 },
                  { estimatedMinutes: 15 },
                  { estimatedMinutes: 20 },
                  { estimatedMinutes: 25 },
                  { estimatedMinutes: 30 }
                ]
              }
            ]
          }
        ]
      };
      const guidelines = ['Follow security best practices', 'Write comprehensive tests', 'Document all APIs', 'Ensure backward compatibility', 'Implement proper error handling', 'Use established patterns'];

      const score = calculateQualityScore(systemPrompt, userPrompt, contextSummary, taskDecomposition, guidelines);

      expect(score).toBeGreaterThan(0.8);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should calculate lower quality score for minimal meta-prompt', () => {
      const systemPrompt = 'You are a developer.';
      const userPrompt = 'Add auth.';
      const contextSummary = 'App needs auth.';
      const taskDecomposition = {
        epics: [
          {
            tasks: [
              {
                estimatedHours: 1,
                subtasks: [
                  { estimatedMinutes: 5 }
                ]
              }
            ]
          }
        ]
      };
      const guidelines = ['Test'];

      const score = calculateQualityScore(systemPrompt, userPrompt, contextSummary, taskDecomposition, guidelines);

      expect(score).toBeLessThan(0.5);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty inputs gracefully', () => {
      const score = calculateQualityScore('', '', '', { epics: [] }, []);

      expect(score).toBe(0);
    });
  });

  describe('attemptResponseRecovery', () => {
    it('should recover partial response with only epics', () => {
      const partialResponse = {
        epics: [
          {
            id: 'epic-1',
            title: 'Test Epic',
            description: 'Test description',
            estimatedComplexity: 'medium',
            tasks: []
          }
        ]
      };

      const recovered = attemptResponseRecovery(partialResponse);

      expect(recovered).toHaveProperty('systemPrompt');
      expect(recovered).toHaveProperty('userPrompt');
      expect(recovered).toHaveProperty('contextSummary');
      expect(recovered).toHaveProperty('taskDecomposition');
      expect(recovered).toHaveProperty('guidelines');
      expect(recovered).toHaveProperty('estimatedComplexity');
      expect(recovered).toHaveProperty('qualityScore');
      expect(recovered).toHaveProperty('aiAgentResponseFormat');

      expect((recovered as Record<string, unknown>).taskDecomposition.epics).toEqual(partialResponse.epics);
      expect(validateMetaPromptGenerationResponse(recovered)).toBe(true);
    });

    it('should return original response if not partial', () => {
      const completeResponse = {
        systemPrompt: 'Test system prompt',
        userPrompt: 'Test user prompt',
        contextSummary: 'Test context',
        taskDecomposition: { epics: [] },
        guidelines: ['Test guideline'],
        estimatedComplexity: 'medium',
        qualityScore: 0.8,
        aiAgentResponseFormat: {
          description: 'Test format',
          format: 'TEST_FORMAT',
          rules: ['Test rule']
        }
      };

      const result = attemptResponseRecovery(completeResponse);
      expect(result).toBe(completeResponse);
    });

    it('should return original response if not an object', () => {
      const invalidResponse = 'not an object';
      const result = attemptResponseRecovery(invalidResponse);
      expect(result).toBe(invalidResponse);
    });

    it('should recover single epic response to complete meta-prompt format', () => {
      const singleEpicResponse = {
        id: 'epic-1',
        title: 'Core Orchestration Hub Development',
        description: 'Establish src/tools/vibe-task-manager/index.ts as the central orchestration hub',
        estimatedComplexity: 'very_high',
        tasks: [
          {
            id: 'task-1',
            title: 'Setup orchestration infrastructure',
            description: 'Create the basic orchestration framework',
            estimatedHours: 8,
            dependencies: [],
            subtasks: [
              {
                id: 'subtask-1-1',
                title: 'Initialize project structure',
                description: 'Set up basic project structure and dependencies',
                estimatedMinutes: 30
              }
            ]
          }
        ]
      };

      const result = attemptResponseRecovery(singleEpicResponse);

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(result).toHaveProperty('contextSummary');
      expect(result).toHaveProperty('taskDecomposition');
      expect(result).toHaveProperty('guidelines');
      expect(result).toHaveProperty('estimatedComplexity', 'very_high');
      expect(result).toHaveProperty('qualityScore', 0.75);
      expect(result).toHaveProperty('aiAgentResponseFormat');

      // Verify the single epic was wrapped in the epics array
      expect((result as Record<string, unknown>).taskDecomposition.epics).toHaveLength(1);
      expect((result as Record<string, unknown>).taskDecomposition.epics[0]).toEqual(singleEpicResponse);

      // Verify the recovered response passes validation
      expect(validateMetaPromptGenerationResponse(result)).toBe(true);
    });

    it('should not modify response that already has epics structure', () => {
      const validResponse = {
        epics: [
          {
            id: 'epic-1',
            title: 'Test Epic',
            description: 'Test description',
            estimatedComplexity: 'medium',
            tasks: []
          }
        ]
      };

      const result = attemptResponseRecovery(validResponse);

      // Should be transformed to complete structure, not treated as single epic
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('taskDecomposition');
      expect((result as Record<string, unknown>).taskDecomposition.epics).toEqual(validResponse.epics);
    });
  });
});
