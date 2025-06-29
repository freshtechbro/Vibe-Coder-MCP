import path from 'path';
import { readFile } from 'fs/promises';
import { FileUtils, FileOperationResult } from './file-utils.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import {
  LLMConfig,
  MCPConfig,
  MCPToolConfig,
  VibeTaskManagerConfig,
  VibeTaskManagerSecurityConfig,
  PerformanceConfig
} from '../types/config.js';

// Re-export types for external modules
export {
  LLMConfig,
  MCPConfig,
  MCPToolConfig,
  VibeTaskManagerConfig,
  VibeTaskManagerSecurityConfig,
  PerformanceConfig
} from '../types/config.js';
import {
  ConfigurationError,
  ValidationError,
  createErrorContext
} from './enhanced-errors.js';
import {
  ENVIRONMENT_VARIABLES,
  DEFAULT_PERFORMANCE_CONFIG,
  getEnvironmentValue,
  validateAllEnvironmentVariables
} from './config-defaults.js';
import logger from '../../../logger.js';
/**
 * Safe project root detection without circular dependencies
 */
function getSafeProjectRoot(): string {
  const allowedRoot = process.cwd();
  return path.join(allowedRoot, 'vibe-coder-mcp');
}

/**
 * Configuration cache entry
 */
interface ConfigCacheEntry {
  config: VibeTaskManagerConfig;
  timestamp: number;
  ttl: number;
}

/**
 * Enhanced configuration loader with performance optimizations
 * - Configuration caching with TTL
 * - Async initialization
 * - Batch loading
 * - Connection pooling preparation
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: VibeTaskManagerConfig | null = null;
  private configCache: Map<string, ConfigCacheEntry> = new Map();
  private llmConfigPath: string;
  private mcpConfigPath: string;
  private performanceConfig: PerformanceConfig;
  private initializationPromise: Promise<void> | null = null;
  private loadingStartTime: number = 0;

  // Cache hit rate tracking
  private cacheHits: number = 0;
  private cacheRequests: number = 0;

  private constructor() {
    const projectRoot = getSafeProjectRoot();
    this.llmConfigPath = path.join(projectRoot, 'llm_config.json');
    this.mcpConfigPath = path.join(projectRoot, 'mcp-config.json');

    // Performance configuration from defaults
    this.performanceConfig = { ...DEFAULT_PERFORMANCE_CONFIG };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Get the Vibe Task Manager output directory following the established convention
   */
  private getVibeTaskManagerOutputDirectory(): string {
    const baseOutputDir = getBaseOutputDir(); // Use the safe function
    return path.join(baseOutputDir, 'vibe-task-manager');
  }

  /**
   * Check if cached configuration is valid
   */
  private isCacheValid(cacheKey: string): boolean {
    if (!this.performanceConfig.enableConfigCache) {
      return false;
    }

    const cached = this.configCache.get(cacheKey);
    if (!cached) {
      return false;
    }

    const now = Date.now();
    return (now - cached.timestamp) < cached.ttl;
  }

  /**
   * Get configuration from cache
   */
  private getCachedConfig(cacheKey: string): VibeTaskManagerConfig | null {
    this.cacheRequests++;

    if (!this.isCacheValid(cacheKey)) {
      this.configCache.delete(cacheKey);
      return null;
    }

    const cached = this.configCache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      return { ...cached.config };
    }

    return null;
  }

  /**
   * Cache configuration
   */
  private cacheConfig(cacheKey: string, config: VibeTaskManagerConfig): void {
    if (!this.performanceConfig.enableConfigCache) {
      return;
    }

    this.configCache.set(cacheKey, {
      config: { ...config },
      timestamp: Date.now(),
      ttl: this.performanceConfig.configCacheTTL
    });
  }

  /**
   * Load configuration files in batch for better performance
   */
  private async batchLoadConfigs(): Promise<{ llm: LLMConfig; mcp: MCPConfig }> {
    const context = createErrorContext('ConfigLoader', 'batchLoadConfigs')
      .metadata({
        llmConfigPath: this.llmConfigPath,
        mcpConfigPath: this.mcpConfigPath,
        batchLoading: this.performanceConfig.batchConfigLoading
      })
      .build();

    try {
      if (this.performanceConfig.batchConfigLoading) {
        // Load both files concurrently
        const [llmResult, mcpResult] = await Promise.all([
          FileUtils.readJsonFile<LLMConfig>(this.llmConfigPath),
          FileUtils.readJsonFile<MCPConfig>(this.mcpConfigPath)
        ]);

        if (!llmResult.success) {
          throw new ConfigurationError(
            `Failed to load LLM configuration file: ${llmResult.error}`,
            context,
            {
              configKey: 'llm_config',
              expectedValue: 'Valid JSON file with LLM mappings',
              actualValue: llmResult.error
            }
          );
        }

        if (!mcpResult.success) {
          throw new ConfigurationError(
            `Failed to load MCP configuration file: ${mcpResult.error}`,
            context,
            {
              configKey: 'mcp_config',
              expectedValue: 'Valid JSON file with MCP tool definitions',
              actualValue: mcpResult.error
            }
          );
        }

        return {
          llm: llmResult.data!,
          mcp: mcpResult.data!
        };
      } else {
        // Sequential loading (fallback)
        const llmResult = await FileUtils.readJsonFile<LLMConfig>(this.llmConfigPath);
        if (!llmResult.success) {
          throw new ConfigurationError(
            `Failed to load LLM configuration file: ${llmResult.error}`,
            context,
            {
              configKey: 'llm_config',
              expectedValue: 'Valid JSON file with LLM mappings',
              actualValue: llmResult.error
            }
          );
        }

        const mcpResult = await FileUtils.readJsonFile<MCPConfig>(this.mcpConfigPath);
        if (!mcpResult.success) {
          throw new ConfigurationError(
            `Failed to load MCP configuration file: ${mcpResult.error}`,
            context,
            {
              configKey: 'mcp_config',
              expectedValue: 'Valid JSON file with MCP tool definitions',
              actualValue: mcpResult.error
            }
          );
        }

        return {
          llm: llmResult.data!,
          mcp: mcpResult.data!
        };
      }
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }

      throw new ConfigurationError(
        `Unexpected error during configuration loading: ${error instanceof Error ? error.message : String(error)}`,
        context,
        {
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }

  /**
   * Load configuration from existing files with performance optimizations
   */
  async loadConfig(): Promise<FileOperationResult<VibeTaskManagerConfig>> {
    this.loadingStartTime = performance.now();

    try {
      const cacheKey = 'main-config';

      // Check cache first
      const cachedConfig = this.getCachedConfig(cacheKey);
      if (cachedConfig) {
        const loadTime = performance.now() - this.loadingStartTime;
        logger.debug({ loadTime }, 'Configuration loaded from cache');

        this.config = cachedConfig;
        return {
          success: true,
          data: cachedConfig,
          metadata: {
            filePath: 'cached-config',
            operation: 'load_config_cached',
            timestamp: new Date(),
            loadTime
          }
        };
      }

      logger.debug('Loading Vibe Task Manager configuration from files');

      // Batch load configuration files
      const { llm, mcp } = await this.batchLoadConfigs();

      // Validate environment variables first
      const envValidation = validateAllEnvironmentVariables();
      if (!envValidation.valid) {
        const errorContext = createErrorContext('ConfigLoader', 'loadConfig')
          .metadata({ errors: envValidation.errors })
          .build();

        throw new ConfigurationError(
          `Environment variable validation failed: ${envValidation.errors.join(', ')}`,
          errorContext,
          {
            configKey: 'environment_variables',
            expectedValue: 'Valid environment configuration',
            actualValue: envValidation.errors.join(', ')
          }
        );
      }

      // Log warnings for non-critical environment variable issues
      if (envValidation.warnings.length > 0) {
        logger.warn({ warnings: envValidation.warnings }, 'Environment variable warnings (using defaults)');
      }

      // Combine configurations with environment-based task manager settings
      this.config = {
        llm,
        mcp,
        taskManager: {
          maxConcurrentTasks: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_CONCURRENT_TASKS),
          defaultTaskTemplate: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_DEFAULT_TASK_TEMPLATE),
          dataDirectory: this.getVibeTaskManagerOutputDirectory(),
          performanceTargets: {
            maxResponseTime: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_RESPONSE_TIME),
            maxMemoryUsage: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_MEMORY_USAGE),
            minTestCoverage: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MIN_TEST_COVERAGE)
          },
          agentSettings: {
            maxAgents: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_AGENTS),
            defaultAgent: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_DEFAULT_AGENT),
            coordinationStrategy: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_COORDINATION_STRATEGY),
            healthCheckInterval: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_HEALTH_CHECK_INTERVAL)
          },
          nlpSettings: {
            primaryMethod: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_PRIMARY_NLP_METHOD),
            fallbackMethod: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_FALLBACK_NLP_METHOD),
            minConfidence: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MIN_CONFIDENCE),
            maxProcessingTime: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_NLP_PROCESSING_TIME)
          },
          // Environment-based timeout and retry settings
          timeouts: {
            taskExecution: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_TASK_EXECUTION_TIMEOUT),
            taskDecomposition: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_TASK_DECOMPOSITION_TIMEOUT),
            recursiveTaskDecomposition: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_RECURSIVE_TASK_DECOMPOSITION_TIMEOUT),
            taskRefinement: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_TASK_REFINEMENT_TIMEOUT),
            agentCommunication: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_AGENT_COMMUNICATION_TIMEOUT),
            llmRequest: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_LLM_REQUEST_TIMEOUT),
            fileOperations: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_FILE_OPERATIONS_TIMEOUT),
            databaseOperations: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_DATABASE_OPERATIONS_TIMEOUT),
            networkOperations: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_NETWORK_OPERATIONS_TIMEOUT)
          },
          retryPolicy: {
            maxRetries: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_RETRIES),
            backoffMultiplier: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_BACKOFF_MULTIPLIER),
            initialDelayMs: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_INITIAL_DELAY_MS),
            maxDelayMs: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_MAX_DELAY_MS),
            enableExponentialBackoff: getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_ENABLE_EXPONENTIAL_BACKOFF)
          },
          // Enhanced performance optimization for <50ms target
          performance: {
            memoryManagement: {
              enabled: true,
              maxMemoryPercentage: 0.3, // Reduced to 30% for better performance
              monitorInterval: 5000, // 5 seconds for faster response
              autoManage: true,
              pruneThreshold: 0.6, // More aggressive pruning
              prunePercentage: 0.4 // Prune 40% of entries
            },
            fileSystem: {
              enableLazyLoading: true,
              batchSize: 50, // Smaller batches for faster processing
              enableCompression: false, // Disabled for speed
              indexingEnabled: true,
              concurrentOperations: 10 // Increased concurrency
            },
            caching: {
              enabled: true,
              strategy: 'memory', // Memory-only for speed
              maxCacheSize: 50 * 1024 * 1024, // 50MB for faster access
              defaultTTL: 60000, // 1 minute for faster refresh
              enableWarmup: true
            },
            monitoring: {
              enabled: true,
              metricsInterval: 1000, // 1 second for real-time monitoring
              enableAlerts: true,
              performanceThresholds: {
                maxResponseTime: 50, // <50ms target
                maxMemoryUsage: 300, // 300MB
                maxCpuUsage: 70 // 70%
              }
            }
          }
        }
      };

      // Cache the configuration
      this.cacheConfig(cacheKey, this.config);

      const loadTime = performance.now() - this.loadingStartTime;

      // Check if we met the performance target
      if (loadTime > this.performanceConfig.maxStartupTime) {
        logger.warn({
          loadTime,
          target: this.performanceConfig.maxStartupTime
        }, 'Configuration loading exceeded performance target');
      } else {
        logger.debug({ loadTime }, 'Configuration loaded within performance target');
      }

      logger.info({ loadTime }, 'Vibe Task Manager configuration loaded successfully');

      return {
        success: true,
        data: this.config,
        metadata: {
          filePath: 'combined-config',
          operation: 'load_config',
          timestamp: new Date(),
          loadTime,
          fromCache: false
        }
      };

    } catch (error) {
      const loadTime = performance.now() - this.loadingStartTime;

      const context = createErrorContext('ConfigLoader', 'loadConfig')
        .metadata({
          loadTime,
          performanceTarget: this.performanceConfig.maxStartupTime
        })
        .build();

      // Enhanced error logging with context
      if (error instanceof ConfigurationError || error instanceof ValidationError) {
        logger.error({
          err: error,
          loadTime,
          category: error.category,
          severity: error.severity,
          retryable: error.retryable,
          recoveryActions: error.recoveryActions.length
        }, 'Configuration loading failed with enhanced error');
      } else {
        logger.error({
          err: error,
          loadTime,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }, 'Configuration loading failed with unexpected error');
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'combined-config',
          operation: 'load_config',
          timestamp: new Date(),
          loadTime
        }
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): VibeTaskManagerConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Get LLM model for specific operation
   */
  getLLMModel(operation: string): string {
    const fallbackModel = getEnvironmentValue(ENVIRONMENT_VARIABLES.VIBE_DEFAULT_LLM_MODEL);

    if (!this.config) {
      return fallbackModel;
    }

    return this.config.llm.llm_mapping[operation] ||
           this.config.llm.llm_mapping['default_generation'] ||
           fallbackModel;
  }

  /**
   * Get MCP tool configuration
   */
  getMCPToolConfig(toolName: string): MCPToolConfig | null {
    if (!this.config) {
      return null;
    }

    return this.config.mcp.tools[toolName] || null;
  }

  /**
   * Get task manager specific configuration
   */
  getTaskManagerConfig(): VibeTaskManagerConfig['taskManager'] | null {
    return this.config?.taskManager || null;
  }

  /**
   * Validate that required LLM mappings exist for task manager
   */
  validateLLMMappings(): { valid: boolean; missing: string[] } {
    if (!this.config) {
      return { valid: false, missing: ['Configuration not loaded'] };
    }

    const requiredMappings = [
      'task_decomposition',
      'atomic_task_detection',
      'intent_recognition',
      'task_refinement',
      'dependency_graph_analysis',
      'agent_coordination'
    ];

    const missing = requiredMappings.filter(
      mapping => !this.config!.llm.llm_mapping[mapping]
    );

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Validate that task manager is registered in MCP config
   */
  validateMCPRegistration(): { valid: boolean; error?: string } {
    if (!this.config) {
      return { valid: false, error: 'Configuration not loaded' };
    }

    const taskManagerConfig = this.config.mcp.tools['vibe-task-manager'];
    if (!taskManagerConfig) {
      return { valid: false, error: 'vibe-task-manager not found in MCP config' };
    }

    // Validate required fields
    if (!taskManagerConfig.description ||
        !taskManagerConfig.use_cases ||
        !taskManagerConfig.input_patterns) {
      return { valid: false, error: 'vibe-task-manager MCP config is incomplete' };
    }

    return { valid: true };
  }

  /**
   * Get configuration summary for logging/debugging
   */
  getConfigSummary(): {
    llmMappingsCount: number;
    mcpToolsCount: number;
    taskManagerConfigured: boolean;
    requiredLLMMappingsPresent: boolean;
  } {
    if (!this.config) {
      return {
        llmMappingsCount: 0,
        mcpToolsCount: 0,
        taskManagerConfigured: false,
        requiredLLMMappingsPresent: false
      };
    }

    const llmValidation = this.validateLLMMappings();
    const mcpValidation = this.validateMCPRegistration();

    return {
      llmMappingsCount: Object.keys(this.config.llm.llm_mapping).length,
      mcpToolsCount: Object.keys(this.config.mcp.tools).length,
      taskManagerConfigured: mcpValidation.valid,
      requiredLLMMappingsPresent: llmValidation.valid
    };
  }

  /**
   * Reload configuration from files
   */
  async reloadConfig(): Promise<FileOperationResult<VibeTaskManagerConfig>> {
    this.config = null;
    return await this.loadConfig();
  }

  /**
   * Check if configuration is loaded and valid
   */
  isConfigValid(): boolean {
    if (!this.config) {
      return false;
    }

    const llmValidation = this.validateLLMMappings();
    const mcpValidation = this.validateMCPRegistration();

    return llmValidation.valid && mcpValidation.valid;
  }

  /**
   * Get performance configuration
   */
  getPerformanceConfig(): PerformanceConfig {
    return { ...this.performanceConfig };
  }

  /**
   * Update performance configuration
   */
  updatePerformanceConfig(updates: Partial<PerformanceConfig>): void {
    this.performanceConfig = { ...this.performanceConfig, ...updates };
    logger.debug({ updates }, 'Performance configuration updated');
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    this.cacheHits = 0;
    this.cacheRequests = 0;
    logger.debug('Configuration cache and statistics cleared');
  }

  /**
   * Reset cache statistics without clearing cache
   */
  resetCacheStats(): void {
    this.cacheHits = 0;
    this.cacheRequests = 0;
    logger.debug('Cache statistics reset');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: string[];
    hitRate: number;
    totalRequests: number;
    totalHits: number;
  } {
    const entries = Array.from(this.configCache.keys());
    const hitRate = this.cacheRequests > 0 ? (this.cacheHits / this.cacheRequests) : 0;

    return {
      size: this.configCache.size,
      entries,
      hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
      totalRequests: this.cacheRequests,
      totalHits: this.cacheHits
    };
  }

  /**
   * Warm up configuration cache
   */
  async warmupCache(): Promise<void> {
    if (!this.performanceConfig.enableConfigCache) {
      return;
    }

    const startTime = performance.now();
    await this.loadConfig();

    // Pre-load frequently accessed configurations
    this.getLLMModel('task_decomposition');
    this.getLLMModel('atomic_task_detection');
    this.getLLMModel('intent_recognition');
    this.getMCPToolConfig('vibe-task-manager');
    this.getTaskManagerConfig();

    const warmupTime = performance.now() - startTime;

    logger.debug({ warmupTime }, 'Configuration cache warmed up');
  }
}

/**
 * Convenience function to get configured instance
 */
export async function getVibeTaskManagerConfig(): Promise<VibeTaskManagerConfig | null> {
  const loader = ConfigLoader.getInstance();

  if (!loader.getConfig()) {
    const result = await loader.loadConfig();
    if (!result.success) {
      logger.error({ error: result.error }, 'Failed to load Vibe Task Manager configuration');
      return null;
    }
  }

  return loader.getConfig();
}

/**
 * Convenience function to get LLM model for operation
 */
export async function getLLMModelForOperation(operation: string): Promise<string> {
  const loader = ConfigLoader.getInstance();

  if (!loader.getConfig()) {
    await loader.loadConfig();
  }

  return loader.getLLMModel(operation);
}

/**
 * Get the base output directory following the established Vibe Coder MCP convention
 */
export function getBaseOutputDir(): string {
  const allowedRoot = 'C:\\Users\\Ascension\\Claude\\root';
  
  if (process.env.VIBE_CODER_OUTPUT_DIR) {
    // DON'T use path.resolve() as it calls process.cwd() internally!
    const envPath = process.env.VIBE_CODER_OUTPUT_DIR;
    // Simple check - if it's an absolute path starting with allowed root, use it
    if (envPath.startsWith(allowedRoot)) {
      return envPath;
    }
    // If outside boundaries, use safe default within allowed root
    logger.warn({ envPath, allowedRoot }, 'VIBE_CODER_OUTPUT_DIR outside allowed boundaries, using safe default');
  }
  
  return path.join(getSafeProjectRoot(), 'VibeCoderOutput');
}

/**
 * Get the Vibe Task Manager specific output directory
 */
export function getVibeTaskManagerOutputDir(): string {
  const baseOutputDir = getBaseOutputDir();
  return path.join(baseOutputDir, 'vibe-task-manager');
}

/**
 * Extracts and validates the Vibe Task Manager security configuration from the MCP client config.
 * This follows the same pattern as the Code Map Generator's extractCodeMapConfig function.
 * @param config The OpenRouter configuration object from MCP client
 * @returns The validated Vibe Task Manager security configuration
 * @throws Error if the configuration is invalid
 */
export function extractVibeTaskManagerSecurityConfig(config?: OpenRouterConfig): VibeTaskManagerSecurityConfig {
  // Create a base security configuration object
  let securityConfig: Partial<VibeTaskManagerSecurityConfig> = {};

  if (config) {
    // Try to extract from tools['vibe-task-manager'] first
    const toolConfig = config.tools?.['vibe-task-manager'] as any;

    // If not found, try config['vibe-task-manager']
    const configSection = config.config?.['vibe-task-manager'] as any;

    // Merge configurations if they exist
    if (toolConfig || configSection) {
      securityConfig = {
        ...configSection,
        ...toolConfig,
      };
    }
  }

  // Even if no config is provided, we'll try to use environment variables
  logger.debug(`Extracted vibe-task-manager security config: ${JSON.stringify(securityConfig)}`);

  // Validate and apply defaults with environment variable fallbacks
  const allowedRoot = 'C:\\Users\\Ascension\\Claude\\root';
  
  const allowedReadDirectory = securityConfig.allowedReadDirectory ||
                               process.env.VIBE_TASK_MANAGER_READ_DIR ||
                               getSafeProjectRoot();

  const allowedWriteDirectory = securityConfig.allowedWriteDirectory ||
                                process.env.VIBE_CODER_OUTPUT_DIR ||
                                getBaseOutputDir();

  const securityMode = (securityConfig.securityMode ||
                       process.env.VIBE_TASK_MANAGER_SECURITY_MODE ||
                       'strict') as 'strict' | 'permissive';

  // Validate that directories are provided
  if (!allowedReadDirectory) {
    throw new Error('allowedReadDirectory is required in the configuration, VIBE_TASK_MANAGER_READ_DIR environment variable, or defaults to current working directory');
  }

  if (!allowedWriteDirectory) {
    throw new Error('allowedWriteDirectory is required in the configuration, VIBE_CODER_OUTPUT_DIR environment variable, or defaults to VibeCoderOutput');
  }

  // DON'T use path.resolve() as it calls process.cwd() internally!
  // Just validate paths without resolving them
  const readDir = allowedReadDirectory;
  const writeDir = allowedWriteDirectory;
  
  // Validate that resolved paths are within allowed boundaries
  if (!readDir.startsWith(allowedRoot)) {
    logger.warn({ readDir, allowedRoot }, 'Read directory outside allowed boundaries, using safe default');
    // Use safe default if outside boundaries
    const safeReadDir = getSafeProjectRoot();
    logger.info({ safeReadDir }, 'Using safe read directory within allowed boundaries');
    return {
      allowedReadDirectory: safeReadDir,
      allowedWriteDirectory: writeDir.startsWith(allowedRoot) ? writeDir : getBaseOutputDir(),
      securityMode
    };
  }
  
  if (!writeDir.startsWith(allowedRoot)) {
    logger.warn({ writeDir, allowedRoot }, 'Write directory outside allowed boundaries, using safe default');
    const safeWriteDir = getBaseOutputDir();
    logger.info({ safeWriteDir }, 'Using safe write directory within allowed boundaries');
    return {
      allowedReadDirectory: readDir,
      allowedWriteDirectory: safeWriteDir,
      securityMode
    };
  }

  logger.info({
    allowedReadDirectory: readDir,
    allowedWriteDirectory: writeDir,
    securityMode
  }, 'Vibe Task Manager security configuration extracted from MCP client config');

  return {
    allowedReadDirectory: readDir,
    allowedWriteDirectory: writeDir,
    securityMode
  };
}
