import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YAMLComposer, validateSetupCommandsFormat, generateSetupCommandsErrorContext } from '../yaml-composer.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import logger from '../../../logger.js';

// Mock logger to avoid noise in tests
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Bug Fix Verification: SetupCommands Schema Validation Error', () => {
  let yamlComposer: YAMLComposer;
  let mockConfig: OpenRouterConfig;

  beforeEach(() => {
    vi.clearAllMocks(); // Clear previous mock calls
    
    mockConfig = {
      apiKey: 'test-key',
      llm_mapping: {
        'fullstack_starter_kit_dynamic_yaml_module_generation': 'test-model'
      }
    };
    yamlComposer = new YAMLComposer(mockConfig);
  });

  describe('Original Error Case: testing/jest', () => {
    it('should fix the exact error case from the bug report', () => {
      // Arrange - This is the exact LLM output that caused the original error
      const problematicLlmOutput = {
        moduleName: "jest-testing",
        description: "Jest testing framework setup for comprehensive unit and integration testing",
        type: "testing",
        provides: {
          techStack: {
            jest: {
              name: "Jest",
              version: "^29.0.0",
              rationale: "Popular JavaScript testing framework with built-in mocking and assertion capabilities"
            }
          },
          directoryStructure: [
            {
              path: "__tests__",
              type: "directory",
              content: null,
              children: []
            },
            {
              path: "jest.config.js",
              type: "file",
              content: "module.exports = {\n  testEnvironment: 'node',\n  collectCoverage: true,\n  coverageDirectory: 'coverage'\n};",
              generationPrompt: null
            }
          ],
          dependencies: {
            npm: {
              root: {
                devDependencies: {
                  "jest": "^29.0.0",
                  "@types/jest": "^29.0.0"
                }
              }
            }
          },
          // This is the problematic part - strings instead of objects
          setupCommands: [
            "npm install jest @types/jest",  // ❌ String instead of object
            "npm run test"                   // ❌ String instead of object
          ]
        }
      };

      // Act - Apply preprocessing
      const result = (yamlComposer as any).preprocessTemplateForValidation(problematicLlmOutput, 'testing/jest');

      // Assert - setupCommands should be converted to objects
      expect(result.provides.setupCommands).toEqual([
        { command: "npm install jest @types/jest", context: "root" },
        { command: "npm run test", context: "root" }
      ]);

      // Verify the structure is now valid for schema validation
      expect(result.provides.setupCommands[0]).toHaveProperty('command');
      expect(result.provides.setupCommands[0]).toHaveProperty('context');
      expect(typeof result.provides.setupCommands[0].command).toBe('string');
      expect(typeof result.provides.setupCommands[0].context).toBe('string');

      // Verify logging occurred
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          modulePathSegment: 'testing/jest',
          originalCommand: "npm install jest @types/jest"
        }),
        "Converted string setupCommand to object format"
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          modulePathSegment: 'testing/jest',
          conversions: 2,
          removals: 0,
          fixes: 0
        }),
        "SetupCommands preprocessing completed with changes"
      );
    });

    it('should validate the original error would have been caught', () => {
      // Arrange - The problematic setupCommands from the error
      const problematicSetupCommands = [
        "npm install jest @types/jest",
        "npm run test"
      ];

      // Act
      const validation = validateSetupCommandsFormat(problematicSetupCommands);

      // Assert - Should detect the error
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toEqual([
        "setupCommands[0] is a string, expected object with 'command' field",
        "setupCommands[1] is a string, expected object with 'command' field"
      ]);
    });

    it('should generate helpful error context for the original error', () => {
      // Arrange
      const problematicSetupCommands = [
        "npm install jest @types/jest",
        "npm run test"
      ];

      // Act
      const errorContext = generateSetupCommandsErrorContext(problematicSetupCommands, 'testing/jest');

      // Assert
      expect(errorContext).toContain('SetupCommands validation failed for testing/jest:');
      expect(errorContext).toContain('setupCommands[0] is a string, expected object with \'command\' field');
      expect(errorContext).toContain('setupCommands[1] is a string, expected object with \'command\' field');
      expect(errorContext).toContain('Expected format:');
      expect(errorContext).toContain('{"command": "npm install", "context": "root"}');
      expect(errorContext).toContain('Received: [');
    });
  });

  describe('Comprehensive Error Prevention', () => {
    it('should handle various problematic LLM outputs', () => {
      // Test case 1: Mixed strings and objects
      const mixedOutput = {
        provides: {
          setupCommands: [
            "npm install",                                    // String
            { command: "npm test", context: "backend" },      // Valid object
            { cmd: "npm build" },                            // Wrong field name
            null,                                            // Invalid
            { command: "docker run", context: 123 }          // Invalid context type
          ]
        }
      };

      const result1 = (yamlComposer as any).preprocessTemplateForValidation(mixedOutput, 'mixed-test');
      expect(result1.provides.setupCommands).toEqual([
        { command: "npm install", context: "root" },
        { command: "npm test", context: "backend" },
        { command: "npm build", context: "root" },
        { command: "docker run", context: "123" }
      ]);

      // Test case 2: All invalid commands
      const allInvalidOutput = {
        provides: {
          setupCommands: [null, undefined, 123, { invalid: "object" }]
        }
      };

      const result2 = (yamlComposer as any).preprocessTemplateForValidation(allInvalidOutput, 'invalid-test');
      expect(result2.provides.setupCommands).toEqual([]);

      // Test case 3: Empty array
      const emptyOutput = {
        provides: {
          setupCommands: []
        }
      };

      const result3 = (yamlComposer as any).preprocessTemplateForValidation(emptyOutput, 'empty-test');
      expect(result3.provides.setupCommands).toEqual([]);
    });

    it('should preserve valid setupCommands unchanged', () => {
      // Arrange
      const validOutput = {
        provides: {
          setupCommands: [
            { command: "npm install", context: "root" },
            { command: "npm test" },
            { command: "docker build .", context: "backend" }
          ]
        }
      };

      // Act
      const result = (yamlComposer as any).preprocessTemplateForValidation(validOutput, 'valid-test');

      // Assert - should remain unchanged
      expect(result.provides.setupCommands).toEqual([
        { command: "npm install", context: "root" },
        { command: "npm test" },
        { command: "docker build .", context: "backend" }
      ]);

      // Should log no changes
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          modulePathSegment: 'valid-test',
          conversions: 0,
          removals: 0,
          fixes: 0
        }),
        "SetupCommands preprocessing completed with no changes"
      );
    });
  });

  describe('Integration with Schema Validation', () => {
    it('should work with the complete template validation flow', () => {
      // Arrange - Complete template with problematic setupCommands
      const completeTemplate = {
        moduleName: "complete-test",
        description: "Complete test template",
        type: "testing",
        provides: {
          techStack: {
            jest: { name: "Jest", version: "^29.0.0", rationale: "Testing framework" }
          },
          directoryStructure: [
            { path: "test", type: "directory", content: null }
          ],
          dependencies: {
            npm: {
              root: {
                devDependencies: { "jest": "^29.0.0" }
              }
            }
          },
          setupCommands: [
            "npm install jest",  // String - should be converted
            "npm test"           // String - should be converted
          ]
        }
      };

      // Act
      const result = (yamlComposer as any).preprocessTemplateForValidation(completeTemplate, 'complete-test');

      // Assert - All parts should be processed correctly
      expect(result.moduleName).toBe("complete-test");
      expect(result.provides.techStack.jest.name).toBe("Jest");
      expect(result.provides.directoryStructure[0].content).toBe(null);
      expect(result.provides.setupCommands).toEqual([
        { command: "npm install jest", context: "root" },
        { command: "npm test", context: "root" }
      ]);
    });
  });

  describe('Error Prevention Validation', () => {
    it('should prevent the original ConfigurationError from occurring', () => {
      // This test verifies that the preprocessing prevents the original error:
      // "YAML module template not found at '...' and dynamic generation failed: 
      //  Dynamically generated template for testing/jest failed validation"

      // Arrange - The exact problematic data structure
      const problematicData = {
        moduleName: "jest-testing",
        description: "Jest testing setup",
        type: "testing",
        provides: {
          setupCommands: [
            "npm install jest @types/jest",
            "npm run test"
          ]
        }
      };

      // Act - Apply preprocessing
      const preprocessed = (yamlComposer as any).preprocessTemplateForValidation(problematicData, 'testing/jest');

      // Assert - The data should now be valid
      expect(preprocessed.provides.setupCommands).toEqual([
        { command: "npm install jest @types/jest", context: "root" },
        { command: "npm run test", context: "root" }
      ]);

      // Verify validation would now pass
      const validation = validateSetupCommandsFormat(preprocessed.provides.setupCommands);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });
});
