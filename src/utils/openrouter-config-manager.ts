/**
 * Centralized OpenRouter Configuration Manager
 * 
 * This singleton service provides centralized management of OpenRouter configurations
 * across all tools and services, ensuring consistent configuration loading and
 * proper fallback behavior for LLM model selection.
 * 
 * Features:
 * - Singleton pattern for consistent configuration access
 * - Environment variable integration
 * - LLM mapping support with fallback mechanisms
 * - Configuration validation and error handling
 * - Caching for performance optimization
 */

import path from 'path';
import { readFile } from 'fs/promises';
import { OpenRouterConfig } from '../types/workflow.js';
import { getProjectRoot } from '../tools/code-map-generator/utils/pathUtils.enhanced.js';
import {
  ConfigurationError,
  ValidationError,
  createErrorContext
} from '../tools/vibe-task-manager/utils/enhanced-errors.js';
import logger from '../logger.js';

/**
 * LLM configuration interface
 */
export interface LLMConfig {
  llm_mapping: Record<string, string>;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Environment validation result
 */
export interface EnvironmentValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
  warnings: string[];
}

/**
 * Configuration cache entry
 */
interface ConfigCacheEntry {
  config: OpenRouterConfig;
  timestamp: number;
  ttl: number;
}

/**
 * OpenRouter Configuration Manager
 * Provides centralized configuration management following singleton pattern
 */
export class OpenRouterConfigManager {
  private static instance: OpenRouterConfigManager | null = null;
  private config: OpenRouterConfig | null = null;
  private llmConfig: LLMConfig | null = null;
  private configCache: Map<string, ConfigCacheEntry> = new Map();
  private readonly cacheTTL = 300000; // 5 minutes
  private readonly llmConfigPath: string;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    const projectRoot = getProjectRoot();
    this.llmConfigPath = path.join(projectRoot, 'llm_config.json');
    logger.debug('OpenRouterConfigManager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): OpenRouterConfigManager {
    if (!OpenRouterConfigManager.instance) {
      OpenRouterConfigManager.instance = new OpenRouterConfigManager();
    }
    return OpenRouterConfigManager.instance;
  }

  /**
   * Initialize configuration from environment and files
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  /**
   * Internal initialization logic
   */
  private async _performInitialization(): Promise<void> {
    const context = createErrorContext('OpenRouterConfigManager', '_performInitialization')
      .metadata({ timestamp: new Date() })
      .build();

    try {
      // Ensure environment variables are fully loaded before validation
      await this.ensureEnvironmentLoaded();

      // Validate environment variables after ensuring they're loaded
      const envValidation = this.validateEnvironmentVariables();
      if (!envValidation.valid) {
        throw new ConfigurationError(
          `Environment validation failed: ${envValidation.missing.join(', ')}`,
          context,
          {
            configKey: 'environment_variables',
            expectedValue: 'OPENROUTER_API_KEY is required',
            userFriendly: true
          }
        );
      }

      // Load LLM configuration with validation
      await this.loadLLMConfig();

      // Create OpenRouter configuration from environment
      this.config = {
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        geminiModel: process.env.GEMINI_MODEL || 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: process.env.PERPLEXITY_MODEL || 'perplexity/llama-3.1-sonar-small-128k-online',
        llm_mapping: this.llmConfig?.llm_mapping || {}
      };

      // Validate the complete configuration
      const configValidation = this.validateConfiguration();
      if (!configValidation.valid) {
        throw new ValidationError(
          `Configuration validation failed: ${configValidation.errors.join(', ')}`,
          context,
          {
            userFriendly: true
          }
        );
      }

      // Log warnings if any
      if (configValidation.warnings.length > 0) {
        logger.warn({
          warnings: configValidation.warnings,
          suggestions: configValidation.suggestions
        }, 'OpenRouter configuration has warnings');
      }

      // Enhanced initialization logging
      const mappingCount = Object.keys(this.config.llm_mapping || {}).length;
      const hasDefaultGeneration = Boolean(this.config.llm_mapping?.['default_generation']);
      
      logger.info({
        hasApiKey: Boolean(this.config.apiKey),
        baseUrl: this.config.baseUrl,
        geminiModel: this.config.geminiModel,
        perplexityModel: this.config.perplexityModel,
        mappingCount,
        hasDefaultGeneration,
        configPath: this.llmConfigPath,
        isTestEnvironment: this.isTestEnvironment(),
        forceRealConfig: process.env.FORCE_REAL_LLM_CONFIG === 'true'
      }, 'OpenRouterConfigManager initialized successfully');

      // Log sample mappings for debugging
      if (mappingCount > 0) {
        const sampleMappings = Object.entries(this.config.llm_mapping || {})
          .slice(0, 3)
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
        
        logger.debug({
          sampleMappings,
          totalMappings: mappingCount
        }, 'LLM mapping sample (first 3 entries)');
      }

    } catch (error) {
      if (error instanceof ConfigurationError || error instanceof ValidationError) {
        throw error;
      }

      throw new ConfigurationError(
        `Failed to initialize OpenRouter configuration: ${error instanceof Error ? error.message : String(error)}`,
        context,
        {
          cause: error instanceof Error ? error : undefined,
          userFriendly: true
        }
      );
    }
  }

  /**
   * Load LLM configuration from file with validation and retry logic
   */
  private async loadLLMConfig(): Promise<void> {
    const context = createErrorContext('OpenRouterConfigManager', 'loadLLMConfig')
      .metadata({ configPath: this.llmConfigPath })
      .build();

    try {
      // Enhanced test environment detection
      const isTestEnvironment = this.isTestEnvironment();
      const forceRealConfig = process.env.FORCE_REAL_LLM_CONFIG === 'true';

      // Read file with retry logic (includes existence check)
      const configContent = await this.readFileWithRetry(this.llmConfigPath, 3);

      // Enhanced content validation
      if (configContent === undefined || configContent === null) {
        throw new Error('Configuration file returned undefined/null content');
      }

      if (typeof configContent !== 'string') {
        throw new Error(`Configuration file returned unexpected type: ${typeof configContent}`);
      }

      if (configContent.trim().length === 0) {
        throw new Error('Configuration file is empty');
      }

      // Log successful read for debugging
      logger.debug({
        configPath: this.llmConfigPath,
        contentLength: configContent.length,
        isTestEnvironment,
        forceRealConfig
      }, 'Configuration file read successfully');

      // Check if we should use empty mapping in test environment (only if not forced)
      if (isTestEnvironment && !forceRealConfig && configContent.trim().length < 50) {
        logger.debug({
          configPath: this.llmConfigPath,
          contentLength: configContent.length,
          isTestEnvironment,
          forceRealConfig
        }, 'Test environment with minimal config detected, using fallback');

        this.llmConfig = { llm_mapping: {} };
        return;
      }

      // Parse and validate JSON structure
      let parsedConfig: unknown;
      try {
        parsedConfig = JSON.parse(configContent);
      } catch (parseError) {
        throw new ValidationError(
          `Invalid JSON in LLM configuration file: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          context,
          {
            userFriendly: true
          }
        );
      }

      // Validate structure
      if (!parsedConfig || typeof parsedConfig !== 'object') {
        throw new ValidationError(
          'LLM configuration must be a valid JSON object',
          context,
          {
            userFriendly: true
          }
        );
      }

      if (!(parsedConfig as { llm_mapping?: unknown }).llm_mapping || typeof (parsedConfig as { llm_mapping?: unknown }).llm_mapping !== 'object') {
        throw new ValidationError(
          'LLM configuration must contain llm_mapping object',
          context,
          {
            userFriendly: true
          }
        );
      }

      this.llmConfig = parsedConfig as LLMConfig;

      // Validate required mappings
      const requiredMappings = ['default_generation'];
      const missing = requiredMappings.filter(
        mapping => !this.llmConfig!.llm_mapping[mapping]
      );

      if (missing.length > 0) {
        logger.warn({
          missing,
          configPath: this.llmConfigPath
        }, 'LLM configuration missing required mappings');
      }

      logger.debug({
        configPath: this.llmConfigPath,
        mappingCount: Object.keys(this.llmConfig.llm_mapping).length,
        hasDefaultGeneration: Boolean(this.llmConfig.llm_mapping['default_generation'])
      }, 'LLM configuration loaded successfully');

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      // Enhanced error handling with more restrictive fallback behavior
      const isTestEnvironment = this.isTestEnvironment();
      const forceRealConfig = process.env.FORCE_REAL_LLM_CONFIG === 'true';
      
      // Only use empty mapping as absolute last resort
      const shouldUseEmptyMapping = (
        isTestEnvironment && 
        !forceRealConfig && 
        (error instanceof Error && error.message.includes('ENOENT'))
      );

      if (shouldUseEmptyMapping) {
        logger.debug({
          err: error,
          configPath: this.llmConfigPath,
          isTestEnvironment,
          forceRealConfig,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error)
        }, 'Test environment file not found, using empty mapping as fallback');

        this.llmConfig = { llm_mapping: {} };
      } else {
        // In all other cases, throw the error to force proper initialization
        logger.error({
          err: error,
          configPath: this.llmConfigPath,
          isTestEnvironment,
          forceRealConfig,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error)
        }, 'Critical: Failed to load LLM configuration');

        throw new ConfigurationError(
          `Failed to load LLM configuration: ${error instanceof Error ? error.message : String(error)}`,
          context,
          {
            cause: error instanceof Error ? error : undefined,
            userFriendly: true
          }
        );
      }
    }
  }

  /**
   * Check if configuration is properly initialized
   */
  isInitialized(): boolean {
    return Boolean(this.config && this.llmConfig);
  }

  /**
   * Check if initialization is currently in progress
   */
  isInitializing(): boolean {
    return Boolean(this.initializationPromise);
  }

  /**
   * Get OpenRouter configuration with enhanced initialization guards
   * Ensures configuration is initialized before returning
   */
  async getOpenRouterConfig(): Promise<OpenRouterConfig> {
    // Guard against multiple concurrent initialization attempts
    if (!this.config) {
      if (this.initializationPromise) {
        // Wait for ongoing initialization
        try {
          await this.initializationPromise;
        } catch (error) {
          logger.error({ err: error }, 'Initialization failed while waiting for configuration');
          throw new Error(`Configuration initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        // Start new initialization
        try {
          await this.initialize();
        } catch (error) {
          logger.error({ err: error }, 'Failed to initialize configuration');
          throw new Error(`Failed to initialize OpenRouter configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Final validation after initialization
    if (!this.config) {
      throw new Error('Configuration is null after successful initialization - this should not happen');
    }

    if (!this.llmConfig) {
      logger.warn('LLM configuration is missing, using empty mapping');
    }

    // Return a deep copy to prevent external modifications
    return {
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      geminiModel: this.config.geminiModel,
      perplexityModel: this.config.perplexityModel,
      llm_mapping: { ...this.config.llm_mapping }
    };
  }

  /**
   * Get model for specific task with initialization guard
   */
  getModelForTask(taskName: string): string {
    // Guard against uninitialized state
    if (!this.config) {
      logger.warn({
        taskName,
        initialized: Boolean(this.config),
        initializationInProgress: Boolean(this.initializationPromise)
      }, 'Configuration not initialized when getting model for task, using fallback');

      return process.env.GEMINI_MODEL || 'google/gemini-2.5-flash-preview-05-20';
    }

    // Check if there's a specific mapping for this task
    if (this.config.llm_mapping && this.config.llm_mapping[taskName]) {
      return this.config.llm_mapping[taskName];
    }

    // Fall back to default_generation mapping
    if (this.config.llm_mapping && this.config.llm_mapping['default_generation']) {
      return this.config.llm_mapping['default_generation'];
    }

    // Final fallback to gemini model
    return this.config.geminiModel;
  }

  /**
   * Get LLM model for specific operation with fallback logic and initialization guards
   */
  async getLLMModel(operation: string): Promise<string> {
    // Guard against concurrent initialization attempts
    if (!this.config) {
      try {
        await this.initialize();
      } catch (error) {
        logger.warn({
          err: error,
          operation,
          fallbackModel: this.getDefaultModel()
        }, 'Failed to initialize configuration for LLM model lookup, using fallback');

        return this.getDefaultModel();
      }
    }

    // Double-check after initialization attempt
    if (!this.config || !this.llmConfig) {
      logger.warn({
        operation,
        hasConfig: Boolean(this.config),
        hasLlmConfig: Boolean(this.llmConfig),
        fallbackModel: this.getDefaultModel()
      }, 'Configuration incomplete after initialization, using fallback model');

      return this.getDefaultModel();
    }

    // Try operation-specific mapping first
    const mappedModel = this.llmConfig.llm_mapping[operation];
    if (mappedModel) {
      return mappedModel;
    }

    // Try default_generation fallback
    const defaultGeneration = this.llmConfig.llm_mapping['default_generation'];
    if (defaultGeneration) {
      return defaultGeneration;
    }

    // Final fallback to environment or hardcoded default
    return this.getDefaultModel();
  }

  /**
   * Get default model from environment or hardcoded fallback
   */
  private getDefaultModel(): string {
    return process.env.GEMINI_MODEL || 'google/gemini-2.5-flash-preview-05-20';
  }

  /**
   * Enhanced test environment detection
   */
  private isTestEnvironment(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      process.env.JEST_WORKER_ID !== undefined ||
      typeof global !== 'undefined' && 'it' in global
    );
  }

  /**
   * Read file with retry logic and exponential backoff
   */
  private async readFileWithRetry(filePath: string, maxRetries: number = 3): Promise<string> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const content = await readFile(filePath, 'utf-8');
        
        // Validate that we got actual content
        if (content === undefined || content === null) {
          throw new Error(`File read returned ${content}`);
        }
        
        if (typeof content !== 'string') {
          throw new Error(`File read returned non-string type: ${typeof content}`);
        }
        
        // Success - return content
        logger.debug({
          filePath,
          attempt,
          contentLength: content.length,
          contentType: typeof content
        }, 'File read successful');
        
        return content;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        logger.debug({
          filePath,
          attempt,
          maxRetries,
          error: lastError.message,
          errorType: lastError.constructor.name
        }, `File read attempt ${attempt} failed`);
        
        // If this isn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const backoffMs = Math.min(100 * Math.pow(2, attempt - 1), 1000); // Max 1 second
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    // All attempts failed
    throw new Error(`Failed to read file after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Reload configuration from files
   */
  async reloadConfig(): Promise<void> {
    this.config = null;
    this.llmConfig = null;
    this.initializationPromise = null;
    this.configCache.clear();
    
    await this.initialize();
    logger.info('OpenRouter configuration reloaded');
  }

  /**
   * Ensure environment variables are fully loaded
   * This addresses race conditions where dotenv might not have finished loading
   */
  private async ensureEnvironmentLoaded(): Promise<void> {
    // Small delay to ensure dotenv has finished loading
    // This is particularly important in startup scenarios
    await new Promise(resolve => setTimeout(resolve, 10));

    // Check if critical environment variables are available
    // If not, try to reload them
    if (!process.env.OPENROUTER_API_KEY) {
      // Try to reload environment variables from .env file
      try {
        const dotenv = await import('dotenv');
        const path = await import('path');
        const { fileURLToPath } = await import('url');

        // Calculate .env path relative to current file
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const envPath = path.resolve(__dirname, '../../.env');

        const result = dotenv.config({ path: envPath });

        if (result.error) {
          logger.debug({
            err: result.error,
            envPath
          }, 'Could not reload .env file during environment validation');
        } else {
          logger.debug({
            envPath,
            reloaded: result.parsed ? Object.keys(result.parsed) : []
          }, 'Reloaded environment variables during initialization');
        }
      } catch (error) {
        logger.debug({
          err: error
        }, 'Failed to reload environment variables');
      }
    }
  }

  /**
   * Validate environment variables
   */
  private validateEnvironmentVariables(): EnvironmentValidationResult {
    const missing: string[] = [];
    const invalid: string[] = [];
    const warnings: string[] = [];

    // Required environment variables
    if (!process.env.OPENROUTER_API_KEY) {
      missing.push('OPENROUTER_API_KEY');
    }

    // Optional but recommended
    if (!process.env.OPENROUTER_BASE_URL) {
      warnings.push('OPENROUTER_BASE_URL not set, using default');
    }

    if (!process.env.GEMINI_MODEL) {
      warnings.push('GEMINI_MODEL not set, using default');
    }

    if (!process.env.PERPLEXITY_MODEL) {
      warnings.push('PERPLEXITY_MODEL not set, using default');
    }

    // Validate URL format if provided
    if (process.env.OPENROUTER_BASE_URL) {
      try {
        new URL(process.env.OPENROUTER_BASE_URL);
      } catch {
        invalid.push('OPENROUTER_BASE_URL must be a valid URL');
      }
    }

    return {
      valid: missing.length === 0 && invalid.length === 0,
      missing,
      invalid,
      warnings
    };
  }

  /**
   * Validate current configuration with comprehensive checks
   */
  validateConfiguration(): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!this.config) {
      errors.push('Configuration not initialized');
      return { valid: false, errors, warnings, suggestions };
    }

    // Required fields validation
    if (!this.config.apiKey) {
      errors.push('Missing OPENROUTER_API_KEY');
      suggestions.push('Set OPENROUTER_API_KEY environment variable');
    }

    if (!this.config.baseUrl) {
      errors.push('Missing OPENROUTER_BASE_URL');
      suggestions.push('Set OPENROUTER_BASE_URL environment variable');
    }

    if (!this.config.geminiModel) {
      errors.push('Missing GEMINI_MODEL');
      suggestions.push('Set GEMINI_MODEL environment variable');
    }

    if (!this.config.perplexityModel) {
      errors.push('Missing PERPLEXITY_MODEL');
      suggestions.push('Set PERPLEXITY_MODEL environment variable');
    }

    // URL validation
    if (this.config.baseUrl) {
      try {
        const url = new URL(this.config.baseUrl);
        if (!url.protocol.startsWith('http')) {
          errors.push('OPENROUTER_BASE_URL must use HTTP or HTTPS protocol');
        }
      } catch {
        errors.push('OPENROUTER_BASE_URL must be a valid URL');
      }
    }

    // Model validation
    if (this.config.geminiModel && !this.config.geminiModel.includes('gemini')) {
      warnings.push('GEMINI_MODEL does not appear to be a Gemini model');
    }

    if (this.config.perplexityModel && !this.config.perplexityModel.includes('perplexity')) {
      warnings.push('PERPLEXITY_MODEL does not appear to be a Perplexity model');
    }

    // Enhanced LLM mapping validation
    const mappingCount = Object.keys(this.config.llm_mapping || {}).length;
    
    if (!this.config.llm_mapping || mappingCount === 0) {
      warnings.push('No LLM mappings configured, using defaults');
      suggestions.push('Configure llm_config.json with task-specific model mappings');
      suggestions.push('Run: echo \'{"llm_mapping": {"default_generation": "google/gemini-2.5-flash-preview-05-20"}}\' > llm_config.json');
    } else {
      // Log successful mapping count for debugging
      logger.debug({
        mappingCount,
        hasDefaultGeneration: Boolean(this.config.llm_mapping['default_generation']),
        configPath: this.llmConfigPath
      }, 'LLM mappings loaded successfully');
    }

    if (this.config.llm_mapping && !this.config.llm_mapping['default_generation']) {
      warnings.push('No default_generation mapping configured');
      suggestions.push('Add default_generation mapping to llm_config.json');
      suggestions.push('This mapping is used as fallback when specific task mappings are not found');
    }

    // Validate mapping completeness
    if (mappingCount > 0 && mappingCount < 10) {
      suggestions.push('Consider adding more task-specific mappings for better performance');
    }

    // Performance suggestions
    if (this.config.llm_mapping && Object.keys(this.config.llm_mapping).length > 50) {
      suggestions.push('Consider optimizing LLM mappings for better performance');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Get configuration status for debugging
   */
  getStatus(): {
    initialized: boolean;
    hasApiKey: boolean;
    mappingCount: number;
    cacheSize: number;
  } {
    return {
      initialized: Boolean(this.config),
      hasApiKey: Boolean(this.config?.apiKey),
      mappingCount: Object.keys(this.config?.llm_mapping || {}).length,
      cacheSize: this.configCache.size
    };
  }

  /**
   * Get cached configuration if available and valid
   */
  private getCachedConfig(key: string): OpenRouterConfig | null {
    const entry = this.configCache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.configCache.delete(key);
      return null;
    }

    return entry.config;
  }

  /**
   * Cache configuration with TTL
   */
  private setCachedConfig(key: string, config: OpenRouterConfig, ttl?: number): void {
    this.configCache.set(key, {
      config: { ...config }, // Deep copy
      timestamp: Date.now(),
      ttl: ttl || this.cacheTTL
    });
  }

  /**
   * Validate LLM mappings for completeness
   */
  validateLLMMappings(): { valid: boolean; missing: string[]; recommendations: string[] } {
    const missing: string[] = [];
    const recommendations: string[] = [];

    if (!this.llmConfig) {
      return {
        valid: false,
        missing: ['LLM configuration not loaded'],
        recommendations: ['Load llm_config.json file']
      };
    }

    // Core required mappings
    const coreRequiredMappings = [
      'default_generation',
      'task_decomposition',
      'intent_recognition'
    ];

    // Recommended mappings for better performance
    const recommendedMappings = [
      'research_query',
      'sequential_thought_generation',
      'context_curator_intent_analysis',
      'context_curator_relevance_ranking',
      'agent_coordination'
    ];

    // Check core required mappings
    for (const mapping of coreRequiredMappings) {
      if (!this.llmConfig.llm_mapping[mapping]) {
        missing.push(mapping);
      }
    }

    // Check recommended mappings
    for (const mapping of recommendedMappings) {
      if (!this.llmConfig.llm_mapping[mapping]) {
        recommendations.push(`Consider adding ${mapping} mapping for optimized performance`);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      recommendations
    };
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    logger.debug('OpenRouter configuration cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number; entries: string[] } {
    const entries = Array.from(this.configCache.keys());
    return {
      size: this.configCache.size,
      hitRate: 0, // Could be enhanced with hit/miss tracking
      entries
    };
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    OpenRouterConfigManager.instance = null;
  }
}

/**
 * Convenience function to get OpenRouter configuration
 */
export async function getOpenRouterConfig(): Promise<OpenRouterConfig> {
  const manager = OpenRouterConfigManager.getInstance();
  return await manager.getOpenRouterConfig();
}

/**
 * Convenience function to get LLM model for operation
 */
export async function getLLMModelForOperation(operation: string): Promise<string> {
  const manager = OpenRouterConfigManager.getInstance();
  return await manager.getLLMModel(operation);
}
