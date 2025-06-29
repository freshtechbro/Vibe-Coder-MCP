/**
 * Type definitions for Vibe Task Manager configuration
 * Separated to avoid circular dependencies
 */

/**
 * LLM configuration interface
 */
export interface LLMConfig {
  llm_mapping: Record<string, string>;
}

/**
 * MCP tool configuration interface
 */
export interface MCPToolConfig {
  description: string;
  use_cases: string[];
  input_patterns: string[];
}

/**
 * MCP configuration interface
 */
export interface MCPConfig {
  tools: Record<string, MCPToolConfig>;
}

/**
 * Vibe Task Manager security configuration interface
 */
export interface VibeTaskManagerSecurityConfig {
  allowedReadDirectory: string;
  allowedWriteDirectory: string;
  securityMode: 'strict' | 'permissive';
}

/**
 * Performance configuration for startup optimization
 */
export interface PerformanceConfig {
  enableConfigCache: boolean;
  configCacheTTL: number;
  lazyLoadServices: boolean;
  preloadCriticalServices: string[];
  connectionPoolSize: number;
  maxStartupTime: number;
  asyncInitialization: boolean;
  batchConfigLoading: boolean;
}

/**
 * Combined configuration for Vibe Task Manager
 */
export interface VibeTaskManagerConfig {
  llm: LLMConfig;
  mcp: MCPConfig;
  taskManager: {
    // Task manager specific settings
    maxConcurrentTasks: number;
    defaultTaskTemplate: string;
    dataDirectory: string;
    performanceTargets: {
      maxResponseTime: number; // ms
      maxMemoryUsage: number; // MB
      minTestCoverage: number; // percentage
    };
    agentSettings: {
      maxAgents: number;
      defaultAgent: string;
      coordinationStrategy: 'round_robin' | 'least_loaded' | 'capability_based' | 'priority_based';
      healthCheckInterval: number; // seconds
    };
    nlpSettings: {
      primaryMethod: 'pattern' | 'llm' | 'hybrid';
      fallbackMethod: 'pattern' | 'llm' | 'none';
      minConfidence: number;
      maxProcessingTime: number; // ms
    };
    // Timeout and retry configuration
    timeouts: {
      taskExecution: number; // ms
      taskDecomposition: number; // ms
      recursiveTaskDecomposition: number; // ms
      taskRefinement: number; // ms
      agentCommunication: number; // ms
      llmRequest: number; // ms
      fileOperations: number; // ms
      databaseOperations: number; // ms
      networkOperations: number; // ms
    };
    retryPolicy: {
      maxRetries: number;
      backoffMultiplier: number;
      initialDelayMs: number;
      maxDelayMs: number;
      enableExponentialBackoff: boolean;
    };
    // Performance optimization settings
    performance: {
      memoryManagement: {
        enabled: boolean;
        maxMemoryPercentage: number;
        monitorInterval: number;
        autoManage: boolean;
        pruneThreshold: number;
        prunePercentage: number;
      };
      fileSystem: {
        enableLazyLoading: boolean;
        batchSize: number;
        enableCompression: boolean;
        indexingEnabled: boolean;
        concurrentOperations: number;
      };
      caching: {
        enabled: boolean;
        strategy: 'memory' | 'disk' | 'hybrid';
        maxCacheSize: number;
        defaultTTL: number;
        enableWarmup: boolean;
      };
      monitoring: {
        enabled: boolean;
        metricsInterval: number;
        enableAlerts: boolean;
        performanceThresholds: {
          maxResponseTime: number;
          maxMemoryUsage: number;
          maxCpuUsage: number;
        };
      };
    };
  };
}
