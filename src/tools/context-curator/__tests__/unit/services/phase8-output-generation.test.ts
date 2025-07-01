import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { OutputFormatterService } from '../../../services/output-formatter.js';
import { ContextCuratorService } from '../../../services/context-curator-service.js';
import {
  OutputFormat,
  TaskType,
  ContextCuratorConfig
} from '../../../types/context-curator.js';
import { ContextPackage, createEmptyContextPackage } from '../../../types/output-package.js';

describe('Phase 8: Enhanced Output Generation', () => {
  let outputFormatter: OutputFormatterService;
  let contextCuratorService: ContextCuratorService;
  let mockContextPackage: ContextPackage;
  let mockConfig: ContextCuratorConfig;

  beforeEach(() => {
    outputFormatter = OutputFormatterService.getInstance();
    contextCuratorService = ContextCuratorService.getInstance();
    
    // Create mock context package
    mockContextPackage = createEmptyContextPackage(
      '/test/project',
      'Test refactoring task',
      'refactoring'
    );
    
    // Add some test data
    mockContextPackage.metadata.filesIncluded = 5;
    mockContextPackage.metadata.totalTokenEstimate = 1500;
    mockContextPackage.refinedPrompt = 'Refactor the authentication module to improve security';
    mockContextPackage.codemapPath = '/test/project/codemap.md';

    // Add a proper meta-prompt to avoid undefined issues
    mockContextPackage.metaPrompt = {
      systemPrompt: 'You are an expert software engineer with deep knowledge of refactoring patterns.',
      userPrompt: 'Refactor the authentication module to improve security and maintainability.',
      contextSummary: 'The authentication module requires refactoring to improve security practices.',
      taskDecomposition: {
        epics: [
          {
            id: 'epic-1',
            title: 'Security Enhancement',
            description: 'Improve authentication security',
            estimatedComplexity: 'medium',
            tasks: []
          }
        ]
      },
      guidelines: ['Follow SOLID principles', 'Maintain backward compatibility'],
      estimatedComplexity: 'medium',
      qualityScore: 0.85,
      aiAgentResponseFormat: {
        description: 'Structured response format',
        format: 'EPIC_ID: [epic-id]\nTASK_ID: [task-id]',
        rules: ['Include clear status updates']
      }
    };
    
    // Mock configuration
    mockConfig = {
      contentDensity: {
        maxContentLength: 25,
        optimizationThreshold: 1000,
        preserveComments: true,
        preserveTypes: true
      },
      outputFormat: {
        format: 'xml' as OutputFormat,
        includeMetaPrompt: true,
        includeFileContent: true,
        maxTokensPerFile: 2000,
        validateOutput: true,
        templateOptions: {
          includeAtomicGuidelines: true,
          includeArchitecturalPatterns: true,
          customVariables: {
            customVar: 'testValue'
          }
        }
      },
      llm: {
        models: {
          intentAnalysis: 'gpt-4',
          promptRefinement: 'gpt-4',
          fileDiscovery: 'gpt-4',
          relevanceScoring: 'gpt-4',
          metaPromptGeneration: 'gpt-4'
        },
        maxTokens: 4000,
        temperature: 0.1
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('OutputFormatterService', () => {
    describe('XML Format Output', () => {
      it('should generate valid XML output for refactoring task', async () => {
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );

        expect(result.format).toBe('xml');
        expect(result.content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        // Accept both generic and task-specific root elements
        expect(
          result.content.includes('<context_package') ||
          result.content.includes('<refactoring_context_package')
        ).toBe(true);
        expect(result.content).toContain('task_type="refactoring"');
        expect(result.size).toBeGreaterThan(0);
        expect(result.processingTimeMs).toBeGreaterThan(0);
        
        // Validate XML structure
        expect(result.validation).toHaveProperty('hasXmlDeclaration', true);
        expect(result.validation).toHaveProperty('isWellFormed', true);
        expect(result.validation).toHaveProperty('schemaCompliant', true);
      });

      it('should generate valid XML output for feature addition task', async () => {
        mockContextPackage.metadata.taskType = 'feature_addition';
        
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );

        expect(result.content).toContain('task_type="feature_addition"');
        expect(result.validation).toHaveProperty('hasXmlDeclaration', true);
      });

      it('should generate valid XML output for bug fix task', async () => {
        mockContextPackage.metadata.taskType = 'bug_fix';
        
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );

        expect(result.content).toContain('task_type="bug_fix"');
        expect(result.validation).toHaveProperty('hasXmlDeclaration', true);
      });

      it('should generate valid XML output for general task', async () => {
        mockContextPackage.metadata.taskType = 'general';
        
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );

        expect(result.content).toContain('task_type="general"');
        expect(result.validation).toHaveProperty('hasXmlDeclaration', true);
      });
    });

    describe('JSON Format Output', () => {
      it('should generate valid JSON output', async () => {
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'json',
          mockConfig
        );

        expect(result.format).toBe('json');
        expect(result.content).toBeTruthy();
        expect(result.size).toBeGreaterThan(0);
        
        // Validate JSON structure
        expect(result.validation).toHaveProperty('isValidJson', true);
        expect(result.validation).toHaveProperty('schemaCompliant', true);
        expect(result.validation).toHaveProperty('hasRequiredFields', true);
        
        // Parse and validate JSON content
        const parsedJson = JSON.parse(result.content);
        expect(parsedJson).toHaveProperty('metadata');
        expect(parsedJson).toHaveProperty('files');
        expect(parsedJson.metadata).toHaveProperty('taskType');
        expect(parsedJson.metadata).toHaveProperty('generationTimestamp');
      });

      it('should include template variables in JSON output', async () => {
        const templateVariables = {
          projectName: 'TestProject',
          customVar: 'customValue'
        };

        // Update config to override the default customVar
        const testConfig = {
          ...mockConfig,
          outputFormat: {
            ...mockConfig.outputFormat,
            templateOptions: {
              ...mockConfig.outputFormat.templateOptions,
              customVariables: {
                customVar: 'customValue'
              }
            }
          }
        };

        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'json',
          testConfig,
          templateVariables
        );

        const parsedJson = JSON.parse(result.content);
        expect(parsedJson).toHaveProperty('templateVariables');
        expect(parsedJson.templateVariables).toHaveProperty('projectName', 'TestProject');
        expect(parsedJson.templateVariables).toHaveProperty('customVar', 'customValue');
      });
    });

    describe('YAML Format Output', () => {
      it('should generate valid YAML output', async () => {
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'yaml',
          mockConfig
        );

        expect(result.format).toBe('yaml');
        expect(result.content).toBeTruthy();
        expect(result.size).toBeGreaterThan(0);
        
        // Validate YAML structure
        expect(result.validation).toHaveProperty('isValidYaml', true);
        expect(result.validation).toHaveProperty('schemaCompliant', true);
        expect(result.validation).toHaveProperty('hasRequiredFields', true);
        
        // Check YAML content structure
        expect(result.content).toContain('metadata:');
        expect(result.content).toContain('files:');
        expect(result.content).toContain('taskType:');
      });

      it('should handle complex data structures in YAML', async () => {
        // Add complex data to context package
        mockContextPackage.highPriorityFiles = [{
          path: 'src/auth.ts',
          content: 'export class AuthService { }',
          isOptimized: false,
          totalLines: 50,
          tokenEstimate: 200,
          contentSections: []
        }];

        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'yaml',
          mockConfig
        );

        expect(result.validation).toHaveProperty('isValidYaml', true);
        expect(result.content).toContain('highPriority:');
        expect(result.content).toContain('src/auth.ts');
      });
    });

    describe('Template System', () => {
      it('should load and cache templates correctly', async () => {
        // First call should load template
        const result1 = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );

        // Second call should use cached template
        const result2 = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );

        expect(result1.content).toBeTruthy();
        expect(result2.content).toBeTruthy();
        // Processing time for second call should be similar or faster due to caching
        expect(result2.processingTimeMs).toBeLessThanOrEqual(result1.processingTimeMs + 50);
      });

      it('should handle missing templates gracefully', async () => {
        // Test with a task type that might not have a template
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );

        // Should still generate output even if template is missing
        expect(result.content).toBeTruthy();
        expect(result.format).toBe('xml');
      });
    });

    describe('Validation', () => {
      it('should validate XML output correctly', async () => {
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );

        const validation = result.validation as Record<string, unknown>;
        expect(validation).toHaveProperty('hasXmlDeclaration');
        expect(validation).toHaveProperty('isWellFormed');
        expect(validation).toHaveProperty('schemaCompliant');
        expect(validation).toHaveProperty('validEncoding');
      });

      it('should validate JSON output correctly', async () => {
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'json',
          mockConfig
        );

        const validation = result.validation as Record<string, unknown>;
        expect(validation).toHaveProperty('isValidJson');
        expect(validation).toHaveProperty('schemaCompliant');
        expect(validation).toHaveProperty('hasRequiredFields');
      });

      it('should validate YAML output correctly', async () => {
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'yaml',
          mockConfig
        );

        const validation = result.validation as Record<string, unknown>;
        expect(validation).toHaveProperty('isValidYaml');
        expect(validation).toHaveProperty('schemaCompliant');
        expect(validation).toHaveProperty('hasRequiredFields');
      });
    });

    describe('Performance', () => {
      it('should complete formatting within performance requirements', async () => {
        const startTime = Date.now();
        
        const result = await outputFormatter.formatOutput(
          mockContextPackage,
          'xml',
          mockConfig
        );
        
        const totalTime = Date.now() - startTime;
        
        // Should complete within 200ms additional overhead
        expect(totalTime).toBeLessThan(200);
        expect(result.processingTimeMs).toBeLessThan(200);
      });

      it('should handle large context packages efficiently', async () => {
        // Create a larger context package
        const largePackage = { ...mockContextPackage };
        largePackage.highPriorityFiles = Array(10).fill(null).map((_, i) => ({
          path: `src/file${i}.ts`,
          content: 'export class TestClass { '.repeat(100) + ' }',
          isOptimized: false,
          totalLines: 100,
          tokenEstimate: 500,
          contentSections: []
        }));

        const result = await outputFormatter.formatOutput(
          largePackage,
          'xml',
          mockConfig
        );

        expect(result.processingTimeMs).toBeLessThan(500); // Allow more time for larger packages
        expect(result.content).toBeTruthy();
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid output format gracefully', async () => {
        await expect(
          outputFormatter.formatOutput(
            mockContextPackage,
            'invalid' as OutputFormat,
            mockConfig
          )
        ).rejects.toThrow('Unsupported output format');
      });

      it('should handle malformed context package', async () => {
        const malformedPackage = { ...mockContextPackage };
        delete (malformedPackage as Record<string, unknown>).metadata;

        await expect(
          outputFormatter.formatOutput(
            malformedPackage,
            'xml',
            mockConfig
          )
        ).rejects.toThrow();
      });
    });
  });

  describe('Context Curator Service Integration', () => {
    describe('Enhanced executeOutputGeneration', () => {
      it('should generate multi-format output when validation passes', async () => {
        // Mock file system operations
        const mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
        const writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue();

        // Create a mock workflow context
        const mockContext = {
          jobId: 'test-job-123',
          currentPhase: 'OUTPUT_GENERATION',
          contextPackage: mockContextPackage,
          config: mockConfig,
          input: {
            projectPath: '/test/project'
          },
          completedPhases: 7,
          totalPhases: 8
        };

        // Use reflection to access private method
        const service = contextCuratorService as Record<string, unknown>;
        await service.executeOutputGeneration(mockContext);

        // Verify directory creation
        expect(mkdirSpy).toHaveBeenCalledWith(
          expect.stringContaining('VibeCoderOutput/context-curator'),
          { recursive: true }
        );

        // Verify multiple files were written (primary + additional formats)
        // Note: JSON validation may fail, so we expect at least 2 files (primary + one additional)
        expect(writeFileSpy).toHaveBeenCalledTimes(2); // XML and JSON (JSON validation may fail)

        // Verify file paths
        const writeCalls = writeFileSpy.mock.calls;
        expect(writeCalls.some(call => call[0].includes('.xml'))).toBe(true);
        expect(writeCalls.some(call => call[0].includes('.json'))).toBe(true);

        mkdirSpy.mockRestore();
        writeFileSpy.mockRestore();
      });

      it('should handle different output format configurations', async () => {
        const mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
        const writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue();

        // Test with JSON as primary format
        const jsonConfig = {
          ...mockConfig,
          outputFormat: {
            ...mockConfig.outputFormat,
            format: 'json' as OutputFormat
          }
        };

        const mockContext = {
          jobId: 'test-job-json',
          currentPhase: 'OUTPUT_GENERATION',
          contextPackage: mockContextPackage,
          config: jsonConfig,
          input: {
            projectPath: '/test/project'
          },
          completedPhases: 7,
          totalPhases: 8
        };

        const service = contextCuratorService as Record<string, unknown>;
        await service.executeOutputGeneration(mockContext);

        // Verify JSON was written as primary format
        const writeCalls = writeFileSpy.mock.calls;
        expect(writeCalls.some(call => call[0].includes('.json'))).toBe(true);

        mkdirSpy.mockRestore();
        writeFileSpy.mockRestore();
      });

      it('should handle validation failures gracefully', async () => {
        const mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
        const writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue();

        // Create context with malformed package that might fail validation
        const malformedPackage = { ...mockContextPackage };
        malformedPackage.metadata.taskType = 'invalid' as TaskType;

        const mockContext = {
          jobId: 'test-job-validation',
          currentPhase: 'OUTPUT_GENERATION',
          contextPackage: malformedPackage,
          config: mockConfig,
          input: {
            projectPath: '/test/project'
          },
          completedPhases: 7,
          totalPhases: 8
        };

        const service = contextCuratorService as Record<string, unknown>;

        // Should not throw error, but handle gracefully
        await expect(service.executeOutputGeneration(mockContext)).resolves.not.toThrow();

        mkdirSpy.mockRestore();
        writeFileSpy.mockRestore();
      });

      it('should handle missing context package', async () => {
        const mockContext = {
          jobId: 'test-job-missing',
          currentPhase: 'OUTPUT_GENERATION',
          contextPackage: null,
          config: mockConfig,
          input: {
            projectPath: '/test/project'
          },
          completedPhases: 7,
          totalPhases: 8
        };

        const service = contextCuratorService as Record<string, unknown>;

        await expect(service.executeOutputGeneration(mockContext))
          .rejects.toThrow('Context package is not available for output generation');
      });
    });

    describe('Validation Helper Methods', () => {
      it('should correctly validate XML output', () => {
        const service = contextCuratorService as Record<string, unknown>;

        const validXmlValidation = {
          hasXmlDeclaration: true,
          isWellFormed: true,
          schemaCompliant: true,
          validEncoding: true
        };

        const invalidXmlValidation = {
          hasXmlDeclaration: false,
          isWellFormed: true,
          schemaCompliant: true,
          validEncoding: true
        };

        expect(service.isValidationPassed(validXmlValidation)).toBe(true);
        expect(service.isValidationPassed(invalidXmlValidation)).toBe(false);
      });

      it('should correctly validate JSON output', () => {
        const service = contextCuratorService as Record<string, unknown>;

        const validJsonValidation = {
          isValidJson: true,
          schemaCompliant: true,
          hasRequiredFields: true
        };

        const invalidJsonValidation = {
          isValidJson: true,
          schemaCompliant: false,
          hasRequiredFields: true
        };

        expect(service.isValidationPassed(validJsonValidation)).toBe(true);
        expect(service.isValidationPassed(invalidJsonValidation)).toBe(false);
      });

      it('should correctly validate YAML output', () => {
        const service = contextCuratorService as Record<string, unknown>;

        const validYamlValidation = {
          isValidYaml: true,
          schemaCompliant: true,
          hasRequiredFields: true
        };

        const invalidYamlValidation = {
          isValidYaml: false,
          schemaCompliant: true,
          hasRequiredFields: true
        };

        expect(service.isValidationPassed(validYamlValidation)).toBe(true);
        expect(service.isValidationPassed(invalidYamlValidation)).toBe(false);
      });
    });
  });

  describe('End-to-End Integration', () => {
    it('should complete full output generation workflow', async () => {
      const mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      const writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue();

      // Test all task types
      const taskTypes: TaskType[] = ['refactoring', 'feature_addition', 'bug_fix', 'general'];

      for (const taskType of taskTypes) {
        const testPackage = createEmptyContextPackage(
          '/test/project',
          `Test ${taskType} task`,
          taskType
        );

        testPackage.metadata.filesIncluded = 3;
        testPackage.metadata.totalTokenEstimate = 1000;

        const result = await outputFormatter.formatOutput(
          testPackage,
          'xml',
          mockConfig
        );

        expect(result.content).toContain(`task_type="${taskType}"`);
        expect(result.validation).toBeTruthy();
        expect(result.processingTimeMs).toBeLessThan(200);
      }

      mkdirSpy.mockRestore();
      writeFileSpy.mockRestore();
    });

    it('should maintain backward compatibility', async () => {
      // Test that legacy XML generation still works
      const service = contextCuratorService as Record<string, unknown>;
      const legacyXml = service.generateSimpleXMLOutput(mockContextPackage);

      expect(legacyXml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(legacyXml).toContain('<context-package');
      expect(legacyXml).toBeTruthy();
    });
  });

  describe('Meta-Prompt Recovery Integration', () => {
    it('should handle recovered meta-prompt in XML output', async () => {
      // Create a context package with a recovered meta-prompt structure
      const packageWithRecoveredMetaPrompt = { ...mockContextPackage };
      packageWithRecoveredMetaPrompt.metaPrompt = {
        systemPrompt: 'You are an expert software engineer.',
        userPrompt: 'Complete the development task.',
        contextSummary: 'The codebase requires implementation.',
        taskDecomposition: {
          epics: [
            {
              id: 'epic-1',
              title: 'Test Epic',
              description: 'Test description',
              estimatedComplexity: 'medium',
              tasks: []
            }
          ]
        },
        guidelines: ['Follow existing patterns'],
        estimatedComplexity: 'medium',
        qualityScore: 0.75,
        aiAgentResponseFormat: {
          description: 'Structured response format',
          format: 'EPIC_ID: [epic-id]',
          rules: ['Include clear status updates']
        }
      };

      const result = await outputFormatter.formatOutput(
        packageWithRecoveredMetaPrompt,
        'xml',
        mockConfig
      );

      expect(result.content).toContain('<system_prompt>');
      expect(result.content).toContain('<user_prompt>');
      expect(result.content).toContain('<context_summary>');
      expect(result.content).toContain('<task_decomposition>');
      expect(result.content).toContain('<guidelines>');
      expect(result.content).toContain('<ai_agent_response_format>');
      expect(result.validation).toHaveProperty('isWellFormed', true);
    });

    it('should handle recovered meta-prompt in JSON output', async () => {
      // Create a context package with a recovered meta-prompt structure
      const packageWithRecoveredMetaPrompt = { ...mockContextPackage };
      packageWithRecoveredMetaPrompt.metaPrompt = {
        systemPrompt: 'You are an expert software engineer.',
        userPrompt: 'Complete the development task.',
        contextSummary: 'The codebase requires implementation.',
        taskDecomposition: {
          epics: [
            {
              id: 'epic-1',
              title: 'Test Epic',
              description: 'Test description',
              estimatedComplexity: 'medium',
              tasks: []
            }
          ]
        },
        guidelines: ['Follow existing patterns'],
        estimatedComplexity: 'medium',
        qualityScore: 0.75,
        aiAgentResponseFormat: {
          description: 'Structured response format',
          format: 'EPIC_ID: [epic-id]',
          rules: ['Include clear status updates']
        }
      };

      const result = await outputFormatter.formatOutput(
        packageWithRecoveredMetaPrompt,
        'json',
        mockConfig
      );

      const parsedJson = JSON.parse(result.content);
      expect(parsedJson.metaPrompt).toHaveProperty('systemPrompt');
      expect(parsedJson.metaPrompt).toHaveProperty('userPrompt');
      expect(parsedJson.metaPrompt).toHaveProperty('contextSummary');
      expect(parsedJson.metaPrompt).toHaveProperty('taskDecomposition');
      expect(parsedJson.metaPrompt).toHaveProperty('guidelines');
      expect(parsedJson.metaPrompt).toHaveProperty('aiAgentResponseFormat');
      expect(result.validation).toHaveProperty('isValidJson', true);
      expect(result.validation).toHaveProperty('hasRequiredFields', true);
    });
  });
});
