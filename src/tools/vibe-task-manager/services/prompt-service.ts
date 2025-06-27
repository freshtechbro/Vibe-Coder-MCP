import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import yaml from 'yaml';
import logger from '../../../logger.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Prompt configuration interface
 */
export interface PromptConfig {
  system_prompt: string;
  atomic_detection_prompt?: string;
  context_integration_prompt?: string;
  coordination_prompt?: string;
  escalation_prompt?: string;
  fallback_prompt?: string;
  version: string;
  last_updated: string;
  compatibility: string[];
}

/**
 * Prompt types supported by the system
 */
export type PromptType = 
  | 'decomposition'
  | 'atomic_detection'
  | 'context_integration'
  | 'agent_system'
  | 'coordination'
  | 'escalation'
  | 'intent_recognition'
  | 'fallback';

/**
 * Prompt service for managing system prompts
 */
export class PromptService {
  private static instance: PromptService;
  private promptCache: Map<string, PromptConfig> = new Map();
  private promptsDir: string;

  private constructor() {
    // Try multiple possible paths for prompt directory
    const possiblePaths = [
      join(__dirname, '..', 'prompts'),  // Normal case: src/tools/vibe-task-manager/services -> src/tools/vibe-task-manager/prompts
      join(__dirname, '..', '..', '..', '..', 'src', 'tools', 'vibe-task-manager', 'prompts'), // Test case: build/tools/vibe-task-manager/services -> src/tools/vibe-task-manager/prompts
      join(process.cwd(), 'src', 'tools', 'vibe-task-manager', 'prompts'), // Fallback: from project root
      join(process.cwd(), 'build', 'tools', 'vibe-task-manager', 'prompts') // Build directory
    ];

    // Find the first path that exists
    this.promptsDir = possiblePaths.find(path => existsSync(path)) || possiblePaths[0];
    
    logger.debug({ promptsDir: this.promptsDir, testedPaths: possiblePaths }, 'PromptService initialized with prompts directory');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PromptService {
    if (!PromptService.instance) {
      PromptService.instance = new PromptService();
    }
    return PromptService.instance;
  }

  /**
   * Load a prompt by type
   */
  async getPrompt(type: PromptType): Promise<string> {
    try {
      const config = await this.loadPromptConfig(type);
      
      switch (type) {
        case 'decomposition':
          return config.system_prompt;
        case 'atomic_detection':
          return config.atomic_detection_prompt || config.system_prompt;
        case 'context_integration':
          return config.context_integration_prompt || config.system_prompt;
        case 'agent_system':
          return config.system_prompt;
        case 'coordination':
          return config.coordination_prompt || config.system_prompt;
        case 'escalation':
          return config.escalation_prompt || config.system_prompt;
        case 'intent_recognition':
          return config.system_prompt;
        case 'fallback':
          return config.fallback_prompt || config.system_prompt;
        default:
          throw new Error(`Unknown prompt type: ${type}`);
      }
    } catch (error) {
      logger.error({ err: error, type }, 'Failed to load prompt');
      return this.getFallbackPrompt(type);
    }
  }

  /**
   * Load prompt configuration from YAML file
   */
  private async loadPromptConfig(type: PromptType): Promise<PromptConfig> {
    const cacheKey = type;
    
    // Check cache first
    if (this.promptCache.has(cacheKey)) {
      return this.promptCache.get(cacheKey)!;
    }

    try {
      const filename = this.getPromptFilename(type);
      const filePath = join(this.promptsDir, filename);
      
      logger.debug({ filePath, type, promptsDir: this.promptsDir }, 'Loading prompt configuration');
      
      // Check if file exists before trying to read
      if (!existsSync(filePath)) {
        throw new Error(`Prompt file not found: ${filePath}`);
      }
      
      const fileContent = await readFile(filePath, 'utf-8');
      
      // Check if file content is valid before parsing
      if (!fileContent || fileContent.trim().length === 0) {
        throw new Error(`Prompt file is empty: ${filePath}`);
      }
      
      let config: PromptConfig;
      try {
        config = yaml.parse(fileContent) as PromptConfig;
      } catch (yamlError) {
        throw new Error(`Failed to parse YAML in ${filePath}: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`);
      }
      
      // Validate configuration
      this.validatePromptConfig(config, type);
      
      // Cache the configuration
      this.promptCache.set(cacheKey, config);
      
      logger.info({ type, version: config.version }, 'Prompt configuration loaded');
      
      return config;
    } catch (error) {
      logger.error({ 
        err: error, 
        type, 
        promptsDir: this.promptsDir,
        filename: this.getPromptFilename(type),
        fullPath: join(this.promptsDir, this.getPromptFilename(type)),
        cwd: process.cwd(),
        __dirname
      }, 'Failed to load prompt configuration');
      throw error;
    }
  }

  /**
   * Get filename for prompt type
   */
  private getPromptFilename(type: PromptType): string {
    switch (type) {
      case 'decomposition':
      case 'atomic_detection':
      case 'context_integration':
        return 'decomposition-prompt.yaml';
      case 'agent_system':
      case 'coordination':
      case 'escalation':
        return 'agent-system-prompt.yaml';
      case 'intent_recognition':
      case 'fallback':
        return 'intent-recognition-prompt.yaml';
      default:
        throw new Error(`No filename mapping for prompt type: ${type}`);
    }
  }

  /**
   * Validate prompt configuration
   */
  private validatePromptConfig(config: PromptConfig, type: PromptType): void {
    if (!config.system_prompt) {
      throw new Error(`Missing system_prompt in configuration for type: ${type}`);
    }

    if (!config.version) {
      throw new Error(`Missing version in configuration for type: ${type}`);
    }

    if (!config.compatibility || !Array.isArray(config.compatibility)) {
      throw new Error(`Missing or invalid compatibility array for type: ${type}`);
    }

    // Check for required sub-prompts based on type
    if (type === 'atomic_detection' && !config.atomic_detection_prompt) {
      logger.warn({ type }, 'atomic_detection_prompt not found, using system_prompt');
    }

    if (type === 'fallback' && !config.fallback_prompt) {
      logger.warn({ type }, 'fallback_prompt not found, using system_prompt');
    }
  }

  /**
   * Get fallback prompt when loading fails
   */
  private getFallbackPrompt(type: PromptType): string {
    const fallbackPrompts: Record<PromptType, string> = {
      decomposition: `You are an expert software development task decomposition specialist. 
        Break down complex tasks into smaller, atomic sub-tasks that can be completed in 1-4 hours.
        Respond with valid JSON containing a subTasks array.`,
      
      atomic_detection: `You are an expert at determining if a software development task is atomic.
        Analyze the task and determine if it can be completed in 1-4 hours by a skilled developer.
        Respond with valid JSON containing isAtomic, confidence, reasoning, estimatedHours, complexityFactors, and recommendations.`,
      
      context_integration: `You are an expert at integrating codebase context into task analysis.
        Consider existing code patterns, architecture, and project characteristics when analyzing tasks.`,
      
      agent_system: `You are an autonomous AI development agent. Execute assigned tasks completely and correctly,
        following quality standards and coordination protocols. Report progress and communicate blockers clearly.`,
      
      coordination: `You are coordinating multiple AI agents working on related tasks.
        Ensure efficient collaboration, prevent conflicts, and optimize overall project progress.`,
      
      escalation: `You are handling escalations and complex issues that require specialized attention.
        Triage issues, gather relevant information, and facilitate resolution.`,
      
      intent_recognition: `You are an expert natural language processing system for task management.
        Analyze user input and identify specific task management intents with relevant parameters.
        Respond with valid JSON containing intent, confidence, parameters, and context.`,
      
      fallback: `I'm not sure what you'd like me to do. Could you please clarify your request?
        I can help with creating projects and tasks, checking status, running tasks, and managing agents.`
    };

    return fallbackPrompts[type] || fallbackPrompts.fallback;
  }

  /**
   * Clear prompt cache
   */
  clearCache(): void {
    this.promptCache.clear();
    logger.info('Prompt cache cleared');
  }

  /**
   * Reload a specific prompt
   */
  async reloadPrompt(type: PromptType): Promise<void> {
    this.promptCache.delete(type);
    await this.loadPromptConfig(type);
    logger.info({ type }, 'Prompt reloaded');
  }

  /**
   * Get prompt metadata
   */
  async getPromptMetadata(type: PromptType): Promise<{
    version: string;
    lastUpdated: string;
    compatibility: string[];
  }> {
    const config = await this.loadPromptConfig(type);
    return {
      version: config.version,
      lastUpdated: config.last_updated,
      compatibility: config.compatibility
    };
  }

  /**
   * List all available prompt types
   */
  getAvailablePromptTypes(): PromptType[] {
    return [
      'decomposition',
      'atomic_detection',
      'context_integration',
      'agent_system',
      'coordination',
      'escalation',
      'intent_recognition',
      'fallback'
    ];
  }

  /**
   * Validate all prompts
   */
  async validateAllPrompts(): Promise<{
    valid: PromptType[];
    invalid: { type: PromptType; error: string }[];
  }> {
    const valid: PromptType[] = [];
    const invalid: { type: PromptType; error: string }[] = [];

    for (const type of this.getAvailablePromptTypes()) {
      try {
        await this.getPrompt(type);
        valid.push(type);
      } catch (error) {
        invalid.push({
          type,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { valid, invalid };
  }

  /**
   * Get prompt with variable substitution
   */
  async getPromptWithVariables(
    type: PromptType, 
    variables: Record<string, string>
  ): Promise<string> {
    let prompt = await this.getPrompt(type);

    // Simple variable substitution
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
    }

    return prompt;
  }
}

/**
 * Convenience function to get prompt service instance
 */
export function getPromptService(): PromptService {
  return PromptService.getInstance();
}

/**
 * Convenience function to get a prompt
 */
export async function getPrompt(type: PromptType): Promise<string> {
  const service = getPromptService();
  return service.getPrompt(type);
}
