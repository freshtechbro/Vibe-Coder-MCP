import path from 'path';
import { readFile } from 'fs/promises';
import { pathExists } from 'fs-extra';
import logger from '../../../logger.js';
import { getProjectRoot } from '../../code-map-generator/utils/pathUtils.enhanced.js';
import { 
  ContextCuratorConfig, 
  contextCuratorConfigSchema,
  validateContextCuratorConfig 
} from '../types/context-curator.js';

/**
 * LLM configuration interface for Context Curator
 */
export interface ContextCuratorLLMConfig {
  llm_mapping: Record<string, string>;
}

/**
 * Environment variable configuration interface
 */
export interface ContextCuratorEnvConfig {
  // Content density settings
  maxContentLength?: number;
  optimizationThreshold?: number;
  preserveComments?: boolean;
  preserveTypes?: boolean;
  
  // Relevance scoring settings
  keywordWeight?: number;
  semanticWeight?: number;
  structuralWeight?: number;
  minRelevanceThreshold?: number;
  
  // Output format settings
  includeMetaPrompt?: boolean;
  includeFileContent?: boolean;
  maxTokensPerFile?: number;
  xmlValidation?: boolean;
  
  // LLM integration settings
  maxRetries?: number;
  timeoutMs?: number;
  fallbackModel?: string;
}

/**
 * Configuration loading result
 */
export interface ConfigLoadResult {
  success: boolean;
  config?: ContextCuratorConfig;
  error?: string;
  source: 'environment' | 'file' | 'defaults' | 'mixed';
  warnings: string[];
}

/**
 * Context Curator Configuration Loader
 * 
 * Singleton service that loads and manages Context Curator configuration
 * from multiple sources: environment variables, configuration files, and defaults.
 * 
 * Features:
 * - Environment variable loading with VIBE_CONTEXT_CURATOR_ prefix
 * - Integration with existing llm_config.json
 * - Default configuration fallback
 * - Comprehensive validation and error handling
 * - Performance optimization with caching
 */
export class ContextCuratorConfigLoader {
  private static instance: ContextCuratorConfigLoader | null = null;
  private config: ContextCuratorConfig | null = null;
  private llmConfig: ContextCuratorLLMConfig | null = null;
  private configLoaded = false;
  private lastLoadTime = 0;
  private readonly cacheTTL = 300000; // 5 minutes
  
  // Configuration file paths
  private readonly llmConfigPath: string;
  private readonly contextCuratorConfigPath: string;
  
  private constructor() {
    const projectRoot = getProjectRoot();
    this.llmConfigPath = path.join(projectRoot, 'llm_config.json');
    this.contextCuratorConfigPath = path.join(projectRoot, 'context-curator-config.json');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ContextCuratorConfigLoader {
    if (!ContextCuratorConfigLoader.instance) {
      ContextCuratorConfigLoader.instance = new ContextCuratorConfigLoader();
    }
    return ContextCuratorConfigLoader.instance;
  }

  /**
   * Load configuration from all sources
   */
  async loadConfig(): Promise<ConfigLoadResult> {
    try {
      // Check cache validity
      const now = Date.now();
      if (this.configLoaded && (now - this.lastLoadTime) < this.cacheTTL && this.config) {
        logger.debug('Using cached Context Curator configuration');
        return {
          success: true,
          config: this.config,
          source: 'mixed',
          warnings: []
        };
      }

      logger.info('Loading Context Curator configuration...');
      const warnings: string[] = [];
      
      // Load LLM configuration first
      const llmResult = await this.loadLLMConfig();
      if (!llmResult.success) {
        warnings.push(`LLM config warning: ${llmResult.error}`);
      }

      // Load environment configuration
      const envConfig = this.loadEnvironmentConfig();
      
      // Load file configuration
      const fileConfig = await this.loadFileConfig();
      if (fileConfig.warnings.length > 0) {
        warnings.push(...fileConfig.warnings);
      }

      // Merge configurations (priority: env > file > defaults)
      const mergedConfig = this.mergeConfigurations(envConfig, fileConfig.config);
      
      // Validate final configuration
      const validatedConfig = validateContextCuratorConfig(mergedConfig);
      
      // Store configuration
      this.config = validatedConfig;
      this.configLoaded = true;
      this.lastLoadTime = now;
      
      logger.info('Context Curator configuration loaded successfully');
      
      return {
        success: true,
        config: validatedConfig,
        source: this.determineConfigSource(envConfig, fileConfig.config),
        warnings
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to load Context Curator configuration:', errorMessage);

      // Fallback to defaults
      const now = Date.now();
      const defaultConfig = contextCuratorConfigSchema.parse({});
      this.config = defaultConfig;
      this.configLoaded = true;
      this.lastLoadTime = now;

      return {
        success: false,
        config: defaultConfig,
        error: errorMessage,
        source: 'defaults',
        warnings: ['Using default configuration due to load failure']
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextCuratorConfig | null {
    return this.config;
  }

  /**
   * Get LLM model for specific Context Curator operation
   */
  getLLMModel(operation: string): string {
    // If no LLM config loaded, use environment fallback
    if (!this.llmConfig) {
      return this.getEnvironmentFallbackModel();
    }

    // Context Curator specific operations
    const contextCuratorOperations = [
      'intent_analysis',
      'prompt_refinement',
      'file_discovery',
      'relevance_ranking',
      'meta_prompt_generation',
      'task_decomposition'
    ];

    // Try context curator prefixed operation first, then fallback to operation name
    const prefixedOperation = `context_curator_${operation}`;
    return this.llmConfig.llm_mapping[prefixedOperation] ||
           this.llmConfig.llm_mapping[operation] ||
           this.llmConfig.llm_mapping['default_generation'] ||
           this.getEnvironmentFallbackModel();
  }

  /**
   * Get fallback model from environment or final hardcoded default
   */
  private getEnvironmentFallbackModel(): string {
    return process.env.GEMINI_MODEL ||
           process.env.VIBE_DEFAULT_LLM_MODEL ||
           'google/gemini-2.5-flash-preview-05-20';
  }

  /**
   * Force reload configuration (bypass cache)
   */
  async reloadConfig(): Promise<ConfigLoadResult> {
    this.configLoaded = false;
    this.lastLoadTime = 0;
    return this.loadConfig();
  }

  /**
   * Validate current configuration
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    if (!this.config) {
      return { valid: false, errors: ['No configuration loaded'] };
    }

    try {
      validateContextCuratorConfig(this.config);
      return { valid: true, errors: [] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      return { valid: false, errors: [errorMessage] };
    }
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary(): Record<string, any> {
    return {
      loaded: this.configLoaded,
      lastLoadTime: new Date(this.lastLoadTime).toISOString(),
      hasConfig: !!this.config,
      hasLLMConfig: !!this.llmConfig,
      cacheAge: Date.now() - this.lastLoadTime,
      cacheTTL: this.cacheTTL
    };
  }

  /**
   * Load LLM configuration from llm_config.json
   */
  private async loadLLMConfig(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!(await pathExists(this.llmConfigPath))) {
        return { success: false, error: 'LLM config file not found' };
      }

      const content = await readFile(this.llmConfigPath, 'utf-8');
      const llmConfig = JSON.parse(content) as ContextCuratorLLMConfig;

      if (!llmConfig.llm_mapping || typeof llmConfig.llm_mapping !== 'object') {
        return { success: false, error: 'Invalid LLM config format' };
      }

      this.llmConfig = llmConfig;
      logger.debug('LLM configuration loaded successfully');
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Failed to load LLM configuration:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadEnvironmentConfig(): Partial<ContextCuratorConfig> {
    const envConfig: Partial<ContextCuratorConfig> = {};

    // Content density settings
    const contentDensity: any = {};
    if (process.env.VIBE_CONTEXT_CURATOR_MAX_CONTENT_LENGTH) {
      const parsed = parseInt(process.env.VIBE_CONTEXT_CURATOR_MAX_CONTENT_LENGTH, 10);
      if (!isNaN(parsed)) {
        contentDensity.maxContentLength = parsed;
      }
    }
    if (process.env.VIBE_CONTEXT_CURATOR_OPTIMIZATION_THRESHOLD) {
      const parsed = parseInt(process.env.VIBE_CONTEXT_CURATOR_OPTIMIZATION_THRESHOLD, 10);
      if (!isNaN(parsed)) {
        contentDensity.optimizationThreshold = parsed;
      }
    }
    if (process.env.VIBE_CONTEXT_CURATOR_PRESERVE_COMMENTS) {
      contentDensity.preserveComments = process.env.VIBE_CONTEXT_CURATOR_PRESERVE_COMMENTS === 'true';
    }
    if (process.env.VIBE_CONTEXT_CURATOR_PRESERVE_TYPES) {
      contentDensity.preserveTypes = process.env.VIBE_CONTEXT_CURATOR_PRESERVE_TYPES === 'true';
    }
    if (Object.keys(contentDensity).length > 0) {
      envConfig.contentDensity = contentDensity;
    }

    // Relevance scoring settings
    const relevanceScoring: any = {};
    if (process.env.VIBE_CONTEXT_CURATOR_KEYWORD_WEIGHT) {
      const parsed = parseFloat(process.env.VIBE_CONTEXT_CURATOR_KEYWORD_WEIGHT);
      if (!isNaN(parsed)) {
        relevanceScoring.keywordWeight = parsed;
      }
    }
    if (process.env.VIBE_CONTEXT_CURATOR_SEMANTIC_WEIGHT) {
      const parsed = parseFloat(process.env.VIBE_CONTEXT_CURATOR_SEMANTIC_WEIGHT);
      if (!isNaN(parsed)) {
        relevanceScoring.semanticWeight = parsed;
      }
    }
    if (process.env.VIBE_CONTEXT_CURATOR_STRUCTURAL_WEIGHT) {
      const parsed = parseFloat(process.env.VIBE_CONTEXT_CURATOR_STRUCTURAL_WEIGHT);
      if (!isNaN(parsed)) {
        relevanceScoring.structuralWeight = parsed;
      }
    }
    if (process.env.VIBE_CONTEXT_CURATOR_MIN_RELEVANCE_THRESHOLD) {
      const parsed = parseFloat(process.env.VIBE_CONTEXT_CURATOR_MIN_RELEVANCE_THRESHOLD);
      if (!isNaN(parsed)) {
        relevanceScoring.minRelevanceThreshold = parsed;
      }
    }
    if (Object.keys(relevanceScoring).length > 0) {
      envConfig.relevanceScoring = relevanceScoring;
    }

    // Output format settings
    const outputFormat: any = {};
    if (process.env.VIBE_CONTEXT_CURATOR_INCLUDE_META_PROMPT) {
      outputFormat.includeMetaPrompt = process.env.VIBE_CONTEXT_CURATOR_INCLUDE_META_PROMPT === 'true';
    }
    if (process.env.VIBE_CONTEXT_CURATOR_INCLUDE_FILE_CONTENT) {
      outputFormat.includeFileContent = process.env.VIBE_CONTEXT_CURATOR_INCLUDE_FILE_CONTENT === 'true';
    }
    if (process.env.VIBE_CONTEXT_CURATOR_MAX_TOKENS_PER_FILE) {
      const parsed = parseInt(process.env.VIBE_CONTEXT_CURATOR_MAX_TOKENS_PER_FILE, 10);
      if (!isNaN(parsed)) {
        outputFormat.maxTokensPerFile = parsed;
      }
    }
    if (process.env.VIBE_CONTEXT_CURATOR_XML_VALIDATION) {
      outputFormat.xmlValidation = process.env.VIBE_CONTEXT_CURATOR_XML_VALIDATION === 'true';
    }
    if (Object.keys(outputFormat).length > 0) {
      envConfig.outputFormat = outputFormat;
    }

    // LLM integration settings
    const llmIntegration: any = {};
    if (process.env.VIBE_CONTEXT_CURATOR_MAX_RETRIES) {
      const parsed = parseInt(process.env.VIBE_CONTEXT_CURATOR_MAX_RETRIES, 10);
      if (!isNaN(parsed)) {
        llmIntegration.maxRetries = parsed;
      }
    }
    if (process.env.VIBE_CONTEXT_CURATOR_TIMEOUT_MS) {
      const parsed = parseInt(process.env.VIBE_CONTEXT_CURATOR_TIMEOUT_MS, 10);
      if (!isNaN(parsed)) {
        llmIntegration.timeoutMs = parsed;
      }
    }
    if (process.env.VIBE_CONTEXT_CURATOR_FALLBACK_MODEL) {
      llmIntegration.fallbackModel = process.env.VIBE_CONTEXT_CURATOR_FALLBACK_MODEL;
    }
    if (Object.keys(llmIntegration).length > 0) {
      envConfig.llmIntegration = llmIntegration;
    }

    if (Object.keys(envConfig).length > 0) {
      logger.debug('Environment configuration loaded');
    }

    return envConfig;
  }

  /**
   * Load configuration from file
   */
  private async loadFileConfig(): Promise<{ config: Partial<ContextCuratorConfig>; warnings: string[] }> {
    const warnings: string[] = [];

    try {
      if (!(await pathExists(this.contextCuratorConfigPath))) {
        logger.debug('Context Curator config file not found, using defaults');
        return { config: {}, warnings };
      }

      const content = await readFile(this.contextCuratorConfigPath, 'utf-8');
      const fileConfig = JSON.parse(content);

      logger.debug('File configuration loaded successfully');
      return { config: fileConfig, warnings };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(`Failed to load file configuration: ${errorMessage}`);
      logger.warn('Failed to load file configuration:', errorMessage);
      return { config: {}, warnings };
    }
  }

  /**
   * Merge configurations with priority: env > file > defaults
   */
  private mergeConfigurations(
    envConfig: Partial<ContextCuratorConfig>,
    fileConfig: Partial<ContextCuratorConfig>
  ): any {
    const merged: any = {};

    // Merge content density - only include if there are values
    if (fileConfig.contentDensity || envConfig.contentDensity) {
      merged.contentDensity = {
        ...fileConfig.contentDensity,
        ...envConfig.contentDensity
      };
    }

    // Merge relevance scoring - only include if there are values
    if (fileConfig.relevanceScoring || envConfig.relevanceScoring) {
      merged.relevanceScoring = {
        ...fileConfig.relevanceScoring,
        ...envConfig.relevanceScoring
      };
    }

    // Merge output format - only include if there are values
    if (fileConfig.outputFormat || envConfig.outputFormat) {
      merged.outputFormat = {
        ...fileConfig.outputFormat,
        ...envConfig.outputFormat
      };
    }

    // Merge LLM integration - only include if there are values
    if (fileConfig.llmIntegration || envConfig.llmIntegration) {
      merged.llmIntegration = {
        ...fileConfig.llmIntegration,
        ...envConfig.llmIntegration
      };
    }

    return merged;
  }

  /**
   * Determine configuration source for reporting
   */
  private determineConfigSource(
    envConfig: Partial<ContextCuratorConfig>,
    fileConfig: Partial<ContextCuratorConfig>
  ): 'environment' | 'file' | 'defaults' | 'mixed' {
    const hasEnvConfig = Object.keys(envConfig).length > 0;
    const hasFileConfig = Object.keys(fileConfig).length > 0;

    if (hasEnvConfig && hasFileConfig) return 'mixed';
    if (hasEnvConfig) return 'environment';
    if (hasFileConfig) return 'file';
    return 'defaults';
  }
}
