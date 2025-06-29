import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  contextCuratorInputSchema,
  contextCuratorConfigSchema,
  contextPackageSchema,
  relevanceScoreSchema,
  fileRelevanceSchema,
  contextFileSchema,
  metaPromptSchema,
  taskTypeSchema,
  type ContextCuratorInput,
  type ContextCuratorConfig,
  type ContextPackage,
  type RelevanceScore,
  type FileRelevance,
  type ContextFile,
  type MetaPrompt,
  type TaskType
} from '../../../types/context-curator.js';

describe('Context Curator Type Definitions', () => {
  describe('TaskType Schema', () => {
    it('should validate valid task types', () => {
      const validTypes: TaskType[] = ['refactoring', 'feature_addition', 'bug_fix', 'general'];
      
      validTypes.forEach(type => {
        expect(() => taskTypeSchema.parse(type)).not.toThrow();
      });
    });

    it('should reject invalid task types', () => {
      const invalidTypes = ['invalid', 'testing', 'deployment', ''];
      
      invalidTypes.forEach(type => {
        expect(() => taskTypeSchema.parse(type)).toThrow();
      });
    });
  });

  describe('RelevanceScore Schema', () => {
    it('should validate valid relevance scores', () => {
      const validScores = [
        { score: 0.95, confidence: 0.8, reasoning: 'High relevance' },
        { score: 0.0, confidence: 1.0, reasoning: 'No relevance' },
        { score: 1.0, confidence: 0.5, reasoning: 'Maximum relevance' }
      ];

      validScores.forEach(score => {
        expect(() => relevanceScoreSchema.parse(score)).not.toThrow();
      });
    });

    it('should reject invalid relevance scores', () => {
      const invalidScores = [
        { score: 1.5, confidence: 0.8, reasoning: 'Score too high' },
        { score: -0.1, confidence: 0.8, reasoning: 'Score too low' },
        { score: 0.5, confidence: 1.5, reasoning: 'Confidence too high' },
        { score: 0.5, confidence: -0.1, reasoning: 'Confidence too low' },
        { score: 0.5, confidence: 0.8, reasoning: '' }, // Empty reasoning
        { score: 0.5, confidence: 0.8 } // Missing reasoning
      ];

      invalidScores.forEach(score => {
        expect(() => relevanceScoreSchema.parse(score)).toThrow();
      });
    });
  });

  describe('ContextFile Schema', () => {
    it('should validate valid context files', () => {
      const validFile = {
        path: 'src/components/Button.tsx',
        content: 'export const Button = () => <button>Click me</button>;',
        size: 1024,
        lastModified: new Date(),
        language: 'typescript',
        isOptimized: false,
        tokenCount: 50
      };

      expect(() => contextFileSchema.parse(validFile)).not.toThrow();
    });

    it('should validate optimized files without content', () => {
      const optimizedFile = {
        path: 'src/large-file.ts',
        content: null,
        size: 50000,
        lastModified: new Date(),
        language: 'typescript',
        isOptimized: true,
        tokenCount: 2000,
        optimizedSummary: 'Large TypeScript file with utility functions'
      };

      expect(() => contextFileSchema.parse(optimizedFile)).not.toThrow();
    });

    it('should reject invalid context files', () => {
      const invalidFiles = [
        { path: '', content: 'test', size: 100, lastModified: new Date(), language: 'typescript', isOptimized: false, tokenCount: 10 }, // Empty path
        { path: 'test.ts', content: 'test', size: -1, lastModified: new Date(), language: 'typescript', isOptimized: false, tokenCount: 10 }, // Negative size
        { path: 'test.ts', content: 'test', size: 100, lastModified: new Date(), language: 'typescript', isOptimized: false, tokenCount: -1 }, // Negative token count
        { path: 'test.ts', content: null, size: 100, lastModified: new Date(), language: 'typescript', isOptimized: true, tokenCount: 10 } // Optimized without summary
      ];

      invalidFiles.forEach(file => {
        expect(() => contextFileSchema.parse(file)).toThrow();
      });
    });
  });

  describe('FileRelevance Schema', () => {
    it('should validate valid file relevance', () => {
      const validRelevance = {
        file: {
          path: 'src/auth/login.ts',
          content: 'export const login = () => {};',
          size: 500,
          lastModified: new Date(),
          language: 'typescript',
          isOptimized: false,
          tokenCount: 25
        },
        relevanceScore: {
          score: 0.9,
          confidence: 0.85,
          reasoning: 'Contains authentication logic relevant to the task'
        },
        categories: ['authentication', 'core_logic'],
        extractedKeywords: ['login', 'auth', 'user']
      };

      expect(() => fileRelevanceSchema.parse(validRelevance)).not.toThrow();
    });

    it('should reject invalid file relevance', () => {
      const invalidRelevance = {
        file: {
          path: 'src/auth/login.ts',
          content: 'export const login = () => {};',
          size: 500,
          lastModified: new Date(),
          language: 'typescript',
          isOptimized: false,
          tokenCount: 25
        },
        relevanceScore: {
          score: 0.9,
          confidence: 0.85,
          reasoning: 'Contains authentication logic'
        },
        categories: [], // Empty categories array
        extractedKeywords: ['login', 'auth', 'user']
      };

      expect(() => fileRelevanceSchema.parse(invalidRelevance)).toThrow();
    });
  });

  describe('MetaPrompt Schema', () => {
    it('should validate valid meta prompts', () => {
      const validMetaPrompt = {
        taskType: 'feature_addition' as TaskType,
        systemPrompt: 'You are an expert developer...',
        userPrompt: 'Implement user authentication...',
        contextSummary: 'The codebase contains React components...',
        taskDecomposition: {
          epics: [
            {
              id: 'E001',
              title: 'Authentication System',
              description: 'Implement user authentication',
              tasks: [
                {
                  id: 'T001',
                  title: 'Create login component',
                  description: 'Build React login form',
                  subtasks: [
                    {
                      id: 'ST001',
                      title: 'Design form layout',
                      description: 'Create responsive login form'
                    }
                  ]
                }
              ]
            }
          ]
        },
        guidelines: ['Follow atomic task principles', 'Ensure test coverage'],
        estimatedComplexity: 'medium'
      };

      expect(() => metaPromptSchema.parse(validMetaPrompt)).not.toThrow();
    });

    it('should reject invalid meta prompts', () => {
      const invalidMetaPrompt = {
        taskType: 'invalid_type',
        systemPrompt: '',
        userPrompt: 'Test',
        contextSummary: 'Test',
        taskDecomposition: {
          epics: []
        },
        guidelines: [],
        estimatedComplexity: 'invalid'
      };

      expect(() => metaPromptSchema.parse(invalidMetaPrompt)).toThrow();
    });
  });

  describe('ContextCuratorInput Schema', () => {
    it('should validate valid input', () => {
      const validInput = {
        userPrompt: 'Implement user authentication system',
        projectPath: '/path/to/project',
        taskType: 'feature_addition' as TaskType,
        maxFiles: 50,
        includePatterns: ['**/*.ts', '**/*.tsx'],
        excludePatterns: ['node_modules/**', '**/*.test.ts'],
        focusAreas: ['authentication', 'security'],
        useCodeMapCache: true,
        codeMapCacheMaxAgeMinutes: 120
      };

      expect(() => contextCuratorInputSchema.parse(validInput)).not.toThrow();
    });

    it('should use default values for optional fields', () => {
      const minimalInput = {
        userPrompt: 'Fix login bug',
        projectPath: '/path/to/project'
      };

      const parsed = contextCuratorInputSchema.parse(minimalInput);
      expect(parsed.taskType).toBe('general');
      expect(parsed.maxFiles).toBe(100);
      expect(parsed.includePatterns).toEqual(['**/*']);
      expect(parsed.excludePatterns).toEqual(['node_modules/**', '.git/**', 'dist/**', 'build/**']);
      expect(parsed.focusAreas).toEqual([]);
      expect(parsed.useCodeMapCache).toBe(true);
      expect(parsed.codeMapCacheMaxAgeMinutes).toBe(120);
    });

    it('should reject invalid input', () => {
      const invalidInputs = [
        { userPrompt: '', projectPath: '/path' }, // Empty prompt
        { userPrompt: 'Test', projectPath: '' }, // Empty path
        { userPrompt: 'Test', projectPath: '/path', maxFiles: 0 }, // Zero max files
        { userPrompt: 'Test', projectPath: '/path', maxFiles: 1001 }, // Too many max files
        { userPrompt: 'Test', projectPath: '/path', codeMapCacheMaxAgeMinutes: 0 }, // Zero cache age
        { userPrompt: 'Test', projectPath: '/path', codeMapCacheMaxAgeMinutes: 1441 } // Too large cache age
      ];

      invalidInputs.forEach(input => {
        expect(() => contextCuratorInputSchema.parse(input)).toThrow();
      });
    });

    it('should validate cache age limits', () => {
      const validCacheAges = [1, 60, 120, 1440]; // 1 minute to 24 hours

      validCacheAges.forEach(age => {
        const input = {
          userPrompt: 'Test prompt',
          projectPath: '/test/path',
          codeMapCacheMaxAgeMinutes: age
        };

        expect(() => contextCuratorInputSchema.parse(input)).not.toThrow();
      });
    });
  });

  describe('ContextCuratorConfig Schema', () => {
    it('should validate valid configuration', () => {
      const validConfig = {
        contentDensity: {
          maxContentLength: 25,
          optimizationThreshold: 1000,
          preserveComments: true,
          preserveTypes: true
        },
        relevanceScoring: {
          keywordWeight: 0.3,
          semanticWeight: 0.4,
          structuralWeight: 0.3,
          minRelevanceThreshold: 0.1
        },
        outputFormat: {
          includeMetaPrompt: true,
          includeFileContent: true,
          maxTokensPerFile: 2000,
          xmlValidation: true
        },
        llmIntegration: {
          maxRetries: 3,
          timeoutMs: 30000,
          fallbackModel: 'deepseek/deepseek-r1-0528-qwen3-8b:free'
        }
      };

      expect(() => contextCuratorConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should use default values', () => {
      const minimalConfig = {};
      const parsed = contextCuratorConfigSchema.parse(minimalConfig);
      
      expect(parsed.contentDensity.maxContentLength).toBe(0);
      expect(parsed.relevanceScoring.minRelevanceThreshold).toBe(0.1);
      expect(parsed.outputFormat.includeMetaPrompt).toBe(true);
      expect(parsed.llmIntegration.maxRetries).toBe(3);
    });
  });

  describe('ContextPackage Schema', () => {
    it('should validate complete context package', () => {
      const validPackage = {
        id: 'ctx_123456789',
        userPrompt: 'Implement authentication',
        taskType: 'feature_addition' as TaskType,
        projectPath: '/path/to/project',
        generatedAt: new Date(),
        files: [
          {
            file: {
              path: 'src/auth.ts',
              content: 'export const auth = {};',
              size: 100,
              lastModified: new Date(),
              language: 'typescript',
              isOptimized: false,
              tokenCount: 20
            },
            relevanceScore: {
              score: 0.9,
              confidence: 0.8,
              reasoning: 'Core authentication file'
            },
            categories: ['authentication'],
            extractedKeywords: ['auth']
          }
        ],
        metaPrompt: {
          taskType: 'feature_addition' as TaskType,
          systemPrompt: 'You are an expert...',
          userPrompt: 'Implement authentication...',
          contextSummary: 'Project contains...',
          taskDecomposition: {
            epics: [{
              id: 'E001',
              title: 'Auth Epic',
              description: 'Authentication epic',
              tasks: [{
                id: 'T001',
                title: 'Auth Task',
                description: 'Authentication task',
                subtasks: [{
                  id: 'ST001',
                  title: 'Auth Subtask',
                  description: 'Authentication subtask'
                }]
              }]
            }]
          },
          guidelines: ['Follow best practices'],
          estimatedComplexity: 'medium'
        },
        statistics: {
          totalFiles: 1,
          totalTokens: 20,
          averageRelevanceScore: 0.9,
          processingTimeMs: 5000,
          cacheHitRate: 0.5
        }
      };

      expect(() => contextPackageSchema.parse(validPackage)).not.toThrow();
    });
  });

  describe('Type Inference', () => {
    it('should correctly infer TypeScript types', () => {
      // This test ensures our type exports work correctly
      const input: ContextCuratorInput = {
        userPrompt: 'Test prompt',
        projectPath: '/test/path',
        taskType: 'general'
      };

      const config: ContextCuratorConfig = {
        contentDensity: {
          maxContentLength: 50
        }
      };

      // These should compile without errors
      expect(input.userPrompt).toBe('Test prompt');
      expect(config.contentDensity.maxContentLength).toBe(50);
    });
  });
});
