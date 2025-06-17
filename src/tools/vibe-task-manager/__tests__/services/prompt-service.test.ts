import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptService, PromptType, getPrompt, getPromptService } from '../../services/prompt-service.js';
import { readFile } from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

// Mock yaml
vi.mock('yaml', () => ({
  default: {
    parse: vi.fn()
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('PromptService', () => {
  let promptService: PromptService;
  let mockReadFile: any;
  let mockYamlParse: any;

  beforeEach(async () => {
    // Clear singleton instance
    (PromptService as any).instance = undefined;
    promptService = PromptService.getInstance();

    const fs = await import('fs/promises');
    const yaml = await import('yaml');

    mockReadFile = vi.mocked(fs.readFile);
    mockYamlParse = vi.mocked(yaml.default.parse);

    // Clear cache before each test
    promptService.clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PromptService.getInstance();
      const instance2 = PromptService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should work with convenience function', () => {
      const instance1 = getPromptService();
      const instance2 = PromptService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getPrompt', () => {
    const mockPromptConfig = {
      system_prompt: 'Main system prompt for testing',
      atomic_detection_prompt: 'Atomic detection specific prompt',
      context_integration_prompt: 'Context integration prompt',
      coordination_prompt: 'Coordination prompt',
      escalation_prompt: 'Escalation prompt',
      fallback_prompt: 'Fallback prompt',
      version: '1.0',
      last_updated: '2024-01-20',
      compatibility: ['test-compatibility']
    };

    beforeEach(() => {
      mockReadFile.mockResolvedValue('mock yaml content');
      mockYamlParse.mockReturnValue(mockPromptConfig);
    });

    it('should load decomposition prompt', async () => {
      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toBe(mockPromptConfig.system_prompt);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('decomposition-prompt.yaml'),
        'utf-8'
      );
    });

    it('should load atomic detection prompt', async () => {
      const prompt = await promptService.getPrompt('atomic_detection');
      expect(prompt).toBe(mockPromptConfig.atomic_detection_prompt);
    });

    it('should load context integration prompt', async () => {
      const prompt = await promptService.getPrompt('context_integration');
      expect(prompt).toBe(mockPromptConfig.context_integration_prompt);
    });

    it('should load agent system prompt', async () => {
      const prompt = await promptService.getPrompt('agent_system');
      expect(prompt).toBe(mockPromptConfig.system_prompt);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('agent-system-prompt.yaml'),
        'utf-8'
      );
    });

    it('should load coordination prompt', async () => {
      const prompt = await promptService.getPrompt('coordination');
      expect(prompt).toBe(mockPromptConfig.coordination_prompt);
    });

    it('should load escalation prompt', async () => {
      const prompt = await promptService.getPrompt('escalation');
      expect(prompt).toBe(mockPromptConfig.escalation_prompt);
    });

    it('should load intent recognition prompt', async () => {
      const prompt = await promptService.getPrompt('intent_recognition');
      expect(prompt).toBe(mockPromptConfig.system_prompt);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('intent-recognition-prompt.yaml'),
        'utf-8'
      );
    });

    it('should load fallback prompt', async () => {
      const prompt = await promptService.getPrompt('fallback');
      expect(prompt).toBe(mockPromptConfig.fallback_prompt);
    });

    it('should fall back to system prompt when specific prompt is missing', async () => {
      const configWithoutSpecificPrompts = {
        system_prompt: 'Main system prompt',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockYamlParse.mockReturnValue(configWithoutSpecificPrompts);

      const prompt = await promptService.getPrompt('atomic_detection');
      expect(prompt).toBe(configWithoutSpecificPrompts.system_prompt);
    });

    it('should cache loaded prompts', async () => {
      await promptService.getPrompt('decomposition');
      await promptService.getPrompt('decomposition');

      // Should only read file once due to caching
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('should return fallback prompt on error', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toContain('expert software development task decomposition specialist');
    });

    it('should handle invalid prompt type', async () => {
      const prompt = await promptService.getPrompt('invalid_type' as PromptType);
      expect(prompt).toContain('I\'m not sure what you\'d like me to do');
    });
  });

  describe('prompt validation', () => {
    it('should validate prompt configuration', async () => {
      const validConfig = {
        system_prompt: 'Valid prompt',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(validConfig);

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toBe(validConfig.system_prompt);
    });

    it('should reject configuration without system_prompt', async () => {
      const invalidConfig = {
        version: '1.0',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(invalidConfig);

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toContain('expert software development task decomposition specialist');
    });

    it('should reject configuration without version', async () => {
      const invalidConfig = {
        system_prompt: 'Valid prompt',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(invalidConfig);

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toContain('expert software development task decomposition specialist');
    });

    it('should reject configuration without compatibility', async () => {
      const invalidConfig = {
        system_prompt: 'Valid prompt',
        version: '1.0'
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(invalidConfig);

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toContain('expert software development task decomposition specialist');
    });
  });

  describe('cache management', () => {
    beforeEach(() => {
      const mockConfig = {
        system_prompt: 'Test prompt',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(mockConfig);
    });

    it('should clear cache', async () => {
      await promptService.getPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      promptService.clearCache();
      await promptService.getPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });

    it('should reload specific prompt', async () => {
      await promptService.getPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      await promptService.reloadPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('metadata and utilities', () => {
    const mockConfig = {
      system_prompt: 'Test prompt',
      version: '1.0',
      last_updated: '2024-01-20',
      compatibility: ['test-compatibility']
    };

    beforeEach(() => {
      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(mockConfig);
    });

    it('should get prompt metadata', async () => {
      const metadata = await promptService.getPromptMetadata('decomposition');

      expect(metadata).toEqual({
        version: '1.0',
        lastUpdated: '2024-01-20',
        compatibility: ['test-compatibility']
      });
    });

    it('should list available prompt types', () => {
      const types = promptService.getAvailablePromptTypes();

      expect(types).toContain('decomposition');
      expect(types).toContain('atomic_detection');
      expect(types).toContain('agent_system');
      expect(types).toContain('intent_recognition');
      expect(types.length).toBeGreaterThan(0);
    });

    it('should validate all prompts', async () => {
      const result = await promptService.validateAllPrompts();

      expect(result.valid).toContain('decomposition');
      expect(result.valid).toContain('agent_system');
      // Since we're mocking file reads, some prompts may fail validation
      expect(result.valid.length).toBeGreaterThan(0);
    });

    it('should handle validation failures', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await promptService.validateAllPrompts();

      // Since getPrompt catches errors and returns fallback prompts,
      // validation failures won't actually fail - they'll return valid fallback prompts
      expect(result.valid.length).toBeGreaterThan(0);
      expect(result.invalid.length).toBe(0);
    });

    it('should substitute variables in prompts', async () => {
      const configWithVariables = {
        system_prompt: 'Hello {{name}}, your task is {{task}}',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockYamlParse.mockReturnValue(configWithVariables);

      const prompt = await promptService.getPromptWithVariables('decomposition', {
        name: 'Agent',
        task: 'implement feature'
      });

      expect(prompt).toBe('Hello Agent, your task is implement feature');
    });
  });

  describe('Enhanced Decomposition Prompt Features', () => {
    it('should load enhanced decomposition prompt with atomic task requirements', async () => {
      const enhancedPromptConfig = {
        system_prompt: `
          ## ATOMIC TASK REQUIREMENTS

          ### PROHIBITED PATTERNS
          - **NO "AND" OPERATORS**: Tasks must NOT contain "and", "or", "then" in titles or descriptions
          - **NO COMPOUND ACTIONS**: Each task must perform exactly ONE action
          - **NO MULTIPLE OUTCOMES**: Each task must have exactly ONE deliverable
          - **NO SEQUENTIAL STEPS**: Tasks requiring "first do X, then do Y" are NOT atomic

          ### REQUIRED PATTERNS
          - **SINGLE ACTION VERBS**: Use Add, Create, Write, Update, Import, Export, Delete
          - **SPECIFIC TARGETS**: Target exactly ONE file, component, or function
          - **CLEAR BOUNDARIES**: Task scope must be unambiguous and measurable
        `,
        version: '2.0',
        last_updated: '2024-01-20',
        compatibility: ['enhanced-atomic-detection']
      };

      mockReadFile.mockResolvedValue('enhanced yaml content');
      mockYamlParse.mockReturnValue(enhancedPromptConfig);

      const prompt = await promptService.getPrompt('decomposition');

      expect(prompt).toContain('ATOMIC TASK REQUIREMENTS');
      expect(prompt).toContain('PROHIBITED PATTERNS');
      expect(prompt).toContain('NO "AND" OPERATORS');
      expect(prompt).toContain('REQUIRED PATTERNS');
      expect(prompt).toContain('SINGLE ACTION VERBS');
    });

    it('should load enhanced validation checklist', async () => {
      const enhancedPromptConfig = {
        system_prompt: `
          **AUTOMATIC REJECTION CRITERIA:**
          - Any task containing "and", "or", "then" will be automatically rejected
          - Any task with multiple acceptance criteria will be automatically rejected
          - Any task estimated over 10 minutes will be automatically rejected

          ## ATOMIC TASK EXAMPLES

          ### ✅ GOOD (Atomic):
          - "Add user authentication middleware to Express app"
          - "Create UserProfile component in React"
          - "Write unit test for calculateTotal function"
          - "Update database schema for users table"

          ### ❌ BAD (Non-Atomic):
          - "Add authentication and authorization middleware" (contains "and")
          - "Create user profile component and add styling" (multiple actions)
          - "Setup database and configure connection" (compound action)
          - "Implement login functionality and error handling" (sequential steps)
        `,
        version: '2.0',
        last_updated: '2024-01-20',
        compatibility: ['enhanced-validation']
      };

      mockReadFile.mockResolvedValue('enhanced validation yaml content');
      mockYamlParse.mockReturnValue(enhancedPromptConfig);

      const prompt = await promptService.getPrompt('decomposition');

      expect(prompt).toContain('AUTOMATIC REJECTION CRITERIA');
      expect(prompt).toContain('automatically rejected');
      expect(prompt).toContain('ATOMIC TASK EXAMPLES');
      expect(prompt).toContain('✅ GOOD (Atomic)');
      expect(prompt).toContain('❌ BAD (Non-Atomic)');
      expect(prompt).toContain('contains "and"');
    });

    it('should load conversion examples for non-atomic tasks', async () => {
      const enhancedPromptConfig = {
        system_prompt: `
          ### 🔄 CONVERSION EXAMPLES:
          **Non-Atomic**: "Create user registration form and add validation"
          **Atomic Split**:
          1. "Create user registration form component"
          2. "Add client-side validation to registration form"

          **Non-Atomic**: "Setup database connection and create user model"
          **Atomic Split**:
          1. "Configure database connection settings"
          2. "Create User model class"
        `,
        version: '2.0',
        last_updated: '2024-01-20',
        compatibility: ['conversion-examples']
      };

      mockReadFile.mockResolvedValue('conversion examples yaml content');
      mockYamlParse.mockReturnValue(enhancedPromptConfig);

      const prompt = await promptService.getPrompt('decomposition');

      expect(prompt).toContain('🔄 CONVERSION EXAMPLES');
      expect(prompt).toContain('Non-Atomic');
      expect(prompt).toContain('Atomic Split');
      expect(prompt).toContain('Create user registration form component');
      expect(prompt).toContain('Configure database connection settings');
    });

    it('should validate enhanced prompt configuration', async () => {
      const enhancedConfig = {
        system_prompt: 'Enhanced prompt with atomic task requirements',
        atomic_detection_prompt: 'Enhanced atomic detection with "and" operator rules',
        version: '2.0',
        last_updated: '2024-01-20',
        compatibility: ['enhanced-atomic-detection', 'validation-rules']
      };

      mockReadFile.mockResolvedValue('enhanced yaml content');
      mockYamlParse.mockReturnValue(enhancedConfig);

      const prompt = await promptService.getPrompt('decomposition');
      const metadata = await promptService.getPromptMetadata('decomposition');

      expect(prompt).toBe(enhancedConfig.system_prompt);
      expect(metadata.version).toBe('2.0');
      expect(metadata.compatibility).toContain('enhanced-atomic-detection');
      expect(metadata.compatibility).toContain('validation-rules');
    });

    it('should handle enhanced prompt loading errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('Enhanced prompt file not found'));

      const prompt = await promptService.getPrompt('decomposition');

      // Should fall back to default prompt
      expect(prompt).toContain('expert software development task decomposition specialist');
      expect(prompt).not.toContain('ATOMIC TASK REQUIREMENTS');
    });

    it('should cache enhanced prompts correctly', async () => {
      const enhancedConfig = {
        system_prompt: 'Enhanced cached prompt',
        version: '2.0',
        last_updated: '2024-01-20',
        compatibility: ['enhanced-caching']
      };

      mockReadFile.mockResolvedValue('enhanced cached yaml content');
      mockYamlParse.mockReturnValue(enhancedConfig);

      // First call should read file
      const prompt1 = await promptService.getPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const prompt2 = await promptService.getPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      expect(prompt1).toBe(prompt2);
      expect(prompt1).toBe(enhancedConfig.system_prompt);
    });
  });

  describe('convenience functions', () => {
    it('should work with getPrompt convenience function', async () => {
      const mockConfig = {
        system_prompt: 'Test prompt',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(mockConfig);

      const prompt = await getPrompt('decomposition');
      expect(prompt).toBe(mockConfig.system_prompt);
    });
  });
});
