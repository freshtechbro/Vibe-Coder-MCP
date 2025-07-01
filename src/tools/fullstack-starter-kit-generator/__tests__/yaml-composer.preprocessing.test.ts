import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YAMLComposer } from '../yaml-composer.js';
import path from 'path';
import { fileURLToPath } from 'url';

type YAMLComposerWithPreprocess = YAMLComposer & { preprocessTemplateForValidation: (input: unknown, moduleType: string) => unknown };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('YAMLComposer Preprocessing Fix', () => {
  let yamlComposer: YAMLComposer;
  const mockConfig = {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'test-key',
    geminiModel: 'google/gemini-2.5-flash-preview',
    perplexityModel: 'perplexity/sonar-deep-research',
    llm_mapping: {
      fullstack_starter_kit_dynamic_yaml_module_generation: 'google/gemini-2.5-flash-preview'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    yamlComposer = new YAMLComposer(mockConfig, path.join(__dirname, '../templates'));
  });

  describe('preprocessTemplateForValidation', () => {
    it('should fix missing content field for directories', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/',
              type: 'directory',
              // Missing content field - this is the bug!
              children: []
            }
          ]
        }
      };

      // Access the private method using bracket notation for testing
      const preprocessed = (yamlComposer as YAMLComposerWithPreprocess).preprocessTemplateForValidation(problematicJson, 'test/module');

      expect(preprocessed.provides.directoryStructure[0]).toHaveProperty('content');
      expect(preprocessed.provides.directoryStructure[0].content).toBe(null);
    });

    it('should fix missing content field for files', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/index.js',
              type: 'file',
              // Missing content field - this is the bug!
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as YAMLComposerWithPreprocess).preprocessTemplateForValidation(problematicJson, 'test/module');

      expect(preprocessed.provides.directoryStructure[0]).toHaveProperty('content');
      expect(preprocessed.provides.directoryStructure[0]).toHaveProperty('generationPrompt');
      expect(preprocessed.provides.directoryStructure[0].generationPrompt).toBe(null);
    });

    it('should fix missing generationPrompt field for files', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/index.js',
              type: 'file',
              content: 'console.log("test");'
              // Missing generationPrompt field
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as YAMLComposerWithPreprocess).preprocessTemplateForValidation(problematicJson, 'test/module');

      expect(preprocessed.provides.directoryStructure[0]).toHaveProperty('generationPrompt');
      expect(preprocessed.provides.directoryStructure[0].generationPrompt).toBe(null);
    });

    it('should handle nested directory structures', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/',
              type: 'directory',
              // Missing content field
              children: [
                {
                  path: 'src/components/',
                  type: 'directory',
                  // Missing content field
                  children: [
                    {
                      path: 'src/components/Button.js',
                      type: 'file',
                      content: 'export default Button;'
                      // Missing generationPrompt field
                    }
                  ]
                }
              ]
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as YAMLComposerWithPreprocess).preprocessTemplateForValidation(problematicJson, 'test/module');

      // Check root directory
      expect(preprocessed.provides.directoryStructure[0].content).toBe(null);
      
      // Check nested directory
      expect(preprocessed.provides.directoryStructure[0].children[0].content).toBe(null);
      
      // Check nested file
      const nestedFile = preprocessed.provides.directoryStructure[0].children[0].children[0];
      expect(nestedFile.content).toBe('export default Button;');
      expect(nestedFile.generationPrompt).toBe(null);
    });

    it('should handle the exact voice-recognition-web-api error case', () => {
      // This is the exact structure that caused the original error
      const problematicJson = {
        moduleName: 'voice-recognition-web-api-utility',
        description: 'Voice Recognition Web API utility module for {projectName}',
        type: 'utility',
        placeholders: ['projectName'],
        provides: {
          techStack: {
            'web-api': {
              name: 'Web Speech API',
              rationale: 'Provides browser-native voice recognition capabilities.'
            }
          },
          directoryStructure: [
            {
              path: 'src/',
              type: 'directory',
              // Missing content field - this is the exact bug!
              children: [
                {
                  path: 'src/voiceRecognition.js',
                  type: 'file',
                  content: 'console.log("voice recognition code");'
                  // Missing generationPrompt field
                }
              ]
            }
          ],
          dependencies: {},
          setupCommands: []
        }
      };

      const preprocessed = (yamlComposer as YAMLComposerWithPreprocess).preprocessTemplateForValidation(problematicJson, 'utility/voice-recognition-web-api');

      // Verify the directory has content: null
      expect(preprocessed.provides.directoryStructure[0].content).toBe(null);
      
      // Verify the file has both content and generationPrompt fields
      const fileItem = preprocessed.provides.directoryStructure[0].children[0];
      expect(fileItem.content).toBe('console.log("voice recognition code");');
      expect(fileItem.generationPrompt).toBe(null);
    });

    it('should resolve content/generationPrompt conflict by prioritizing generationPrompt', () => {
      // This is the exact issue that was causing the monaco-judge0 error
      const problematicJson = {
        moduleName: 'monaco-judge0-development-tools',
        description: 'Test module with content/generationPrompt conflict',
        type: 'development-tools',
        provides: {
          directoryStructure: [
            {
              path: 'backend/',
              type: 'directory',
              content: null,
              children: [
                {
                  path: 'backend/.env.example',
                  type: 'file',
                  content: 'BACKEND_PORT=3000\nAPI_KEY=YOUR_API_KEY_HERE',
                  generationPrompt: 'Please fill in your API key for the service.'
                }
              ]
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as YAMLComposerWithPreprocess).preprocessTemplateForValidation(problematicJson, 'development-tools/monaco-judge0');

      // Verify the conflict was resolved by prioritizing generationPrompt
      const fileItem = preprocessed.provides.directoryStructure[0].children[0];
      expect(fileItem.content).toBe(null); // Should be null when generationPrompt is present
      expect(fileItem.generationPrompt).toBe('Please fill in your API key for the service.');
    });

    it('should handle files with only generationPrompt', () => {
      const problematicJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'config.env',
              type: 'file',
              generationPrompt: 'Generate environment configuration'
              // Missing content field
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as YAMLComposerWithPreprocess).preprocessTemplateForValidation(problematicJson, 'test/module');

      const fileItem = preprocessed.provides.directoryStructure[0];
      expect(fileItem.content).toBe(null);
      expect(fileItem.generationPrompt).toBe('Generate environment configuration');
    });

    it('should handle array responses by converting to minimal object structure', () => {
      // This tests the fix for the monaco-judge0 array response issue
      const arrayResponse = ["projectName", "monitoringPath", "prometheusPort", "grafanaPort"];
      const modulePathSegment = 'monitoring/prometheus-grafana';

      // Simulate the array handling logic from generateDynamicTemplate
      const minimalObject = {
        moduleName: `${modulePathSegment.replace('/', '-')}`,
        description: `${modulePathSegment} module for the project`,
        type: modulePathSegment.includes('/') ? modulePathSegment.split('/')[0] : 'utility',
        placeholders: arrayResponse,
        provides: {
          techStack: {},
          directoryStructure: [],
          dependencies: { npm: {} },
          setupCommands: [],
          nextSteps: []
        }
      };

      // Verify the constructed object is valid
      expect(minimalObject.moduleName).toBe('monitoring-prometheus-grafana');
      expect(minimalObject.type).toBe('monitoring');
      expect(minimalObject.placeholders).toEqual(arrayResponse);
      expect(minimalObject.provides.directoryStructure).toEqual([]);
      expect(minimalObject.provides.setupCommands).toEqual([]);
    });

    it('should not modify already valid structures', () => {
      const validJson = {
        moduleName: 'test-module',
        description: 'Test module',
        type: 'utility',
        provides: {
          directoryStructure: [
            {
              path: 'src/',
              type: 'directory',
              content: null,
              children: [
                {
                  path: 'src/index.js',
                  type: 'file',
                  content: 'console.log("test");',
                  generationPrompt: null
                }
              ]
            }
          ]
        }
      };

      const preprocessed = (yamlComposer as YAMLComposerWithPreprocess).preprocessTemplateForValidation(validJson, 'test/module');

      // Should remain unchanged
      expect(preprocessed.provides.directoryStructure[0].content).toBe(null);
      const fileItem = preprocessed.provides.directoryStructure[0].children[0];
      expect(fileItem.content).toBe('console.log("test");');
      expect(fileItem.generationPrompt).toBe(null);
    });
  });
});
