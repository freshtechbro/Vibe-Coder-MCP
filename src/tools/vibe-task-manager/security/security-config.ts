/**
 * Security Configuration Management for Vibe Task Manager
 *
 * Provides unified security configuration with environment-based settings,
 * performance optimization, and runtime configuration updates.
 */

import { PathWhitelistConfig } from './path-validator.js';
import { SanitizationConfig } from './data-sanitizer.js';
import { ConcurrentAccessConfig } from './concurrent-access.js';
import { SecurityMiddlewareConfig } from './security-middleware.js';
import { getUnifiedSecurityConfig } from './unified-security-config.js';
import logger from '../../../logger.js';

/**
 * Unified security configuration
 */
export interface UnifiedSecurityConfig {
  // Global security settings
  enabled: boolean;
  strictMode: boolean;
  performanceThresholdMs: number;
  logViolations: boolean;
  blockOnCriticalViolations: boolean;

  // Component-specific configurations
  pathSecurity: PathWhitelistConfig;
  dataSanitization: SanitizationConfig;
  concurrentAccess: ConcurrentAccessConfig;
  middleware: SecurityMiddlewareConfig;

  // Environment-specific settings
  environment: 'development' | 'testing' | 'staging' | 'production';
  debugMode: boolean;
  auditLevel: 'minimal' | 'standard' | 'comprehensive';

  // Performance optimization
  enablePerformanceOptimization: boolean;
  cacheSecurityResults: boolean;
  cacheTTLSeconds: number;
  batchSecurityOperations: boolean;
}

/**
 * Default security configuration
 */
const DEFAULT_SECURITY_CONFIG: UnifiedSecurityConfig = {
  // Global settings
  enabled: true,
  strictMode: true,
  performanceThresholdMs: 50, // Epic 6.2 target
  logViolations: true,
  blockOnCriticalViolations: true,

  // Path security
  pathSecurity: {
    allowedDirectories: [
      process.cwd(),
      'VibeCoderOutput',
      'data',
      'temp',
      'logs'
    ].map(dir => dir.startsWith('/') ? dir : `${process.cwd()}/${dir}`),
    allowedExtensions: [
      '.json', '.yaml', '.yml', '.txt', '.md', '.log', '.gz',
      '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
      '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h',
      '.html', '.css', '.scss', '.sass', '.less',
      '.xml', '.csv', '.sql', '.sh', '.bat', '.ps1'
    ],
    blockedPatterns: [
      /\.\./g, // Directory traversal
      /~\//g, // Home directory access
      /\/etc\//g, // System config access
      /\/proc\//g, // Process info access
      /\/sys\//g, // System info access
      /\/dev\//g, // Device access
      /\/var\/log\//g, // System logs
      /\/root\//g, // Root directory
      // eslint-disable-next-line no-useless-escape
      /\/home\/[^\/]+\/\.[^\/]+/g, // Hidden files in home dirs
      /\0/g, // Null bytes
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1f\x7f-\x9f]/g // Control characters
    ],
    allowSymlinks: false,
    allowAbsolutePaths: true,
    maxPathLength: 1000
  },

  // Data sanitization
  dataSanitization: {
    enableXssProtection: true,
    enableCommandInjectionProtection: true,
    enableSqlInjectionProtection: true,
    maxStringLength: 10000,
    maxArrayLength: 1000,
    maxObjectDepth: 10,
    allowedHtmlTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
    allowedProtocols: ['http:', 'https:', 'mailto:'],
    strictMode: true,
    logViolations: true
  },

  // Concurrent access
  concurrentAccess: {
    lockDirectory: 'data/locks',
    defaultLockTimeout: 30000, // 30 seconds
    maxLockTimeout: 300000, // 5 minutes
    deadlockDetectionInterval: 10000, // 10 seconds
    lockCleanupInterval: 60000, // 1 minute
    maxRetryAttempts: 3,
    retryDelayMs: 1000,
    enableDeadlockDetection: true,
    enableLockAuditTrail: true
  },

  // Security middleware
  middleware: {
    enablePathValidation: true,
    enableInputSanitization: true,
    enableConcurrentAccess: true,
    performanceThresholdMs: 50,
    strictMode: true,
    logViolations: true,
    blockOnCriticalViolations: true
  },

  // Environment settings
  environment: (process.env.NODE_ENV === 'test' ? 'testing' : process.env.NODE_ENV as 'development' | 'testing' | 'staging' | 'production') || 'development',
  debugMode: process.env.NODE_ENV !== 'production',
  auditLevel: 'standard',

  // Performance optimization
  enablePerformanceOptimization: true,
  cacheSecurityResults: true,
  cacheTTLSeconds: 300, // 5 minutes
  batchSecurityOperations: true
};

/**
 * Environment-specific configuration overrides
 */
const ENVIRONMENT_OVERRIDES: Record<string, Partial<UnifiedSecurityConfig>> = {
  development: {
    strictMode: false,
    debugMode: true,
    auditLevel: 'comprehensive',
    performanceThresholdMs: 100, // More lenient in dev
    blockOnCriticalViolations: false
  },

  testing: {
    strictMode: true,
    debugMode: false,
    auditLevel: 'minimal',
    performanceThresholdMs: 25, // Stricter in tests
    logViolations: false
  },

  staging: {
    strictMode: true,
    debugMode: false,
    auditLevel: 'standard',
    performanceThresholdMs: 50,
    blockOnCriticalViolations: true
  },

  production: {
    strictMode: true,
    debugMode: false,
    auditLevel: 'standard',
    performanceThresholdMs: 50,
    blockOnCriticalViolations: true,
    enablePerformanceOptimization: true
  }
};

/**
 * Security Configuration Manager
 */
export class SecurityConfigManager {
  private static instance: SecurityConfigManager | null = null;
  private config: UnifiedSecurityConfig;
  private configCache = new Map<string, unknown>();
  private lastCacheUpdate = 0;

  private constructor() {
    this.config = this.loadConfiguration();
    logger.info({
      environment: this.config.environment,
      strictMode: this.config.strictMode,
      performanceThreshold: this.config.performanceThresholdMs,
      source: this.config.pathSecurity.allowedDirectories.length > 2 ? 'unified-security-config' : 'environment-variables'
    }, 'Security Configuration Manager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SecurityConfigManager {
    if (!SecurityConfigManager.instance) {
      SecurityConfigManager.instance = new SecurityConfigManager();
    }
    return SecurityConfigManager.instance;
  }

  /**
   * Load configuration from environment and defaults
   */
  private loadConfiguration(): UnifiedSecurityConfig {
    const environment = (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'development';

    try {
      // Try to get configuration from unified security config manager first
      const unifiedConfig = getUnifiedSecurityConfig();
      const unifiedSecurityManagerConfig = unifiedConfig.getSecurityManagerConfig();

      // Create config using unified security configuration
      const config: UnifiedSecurityConfig = {
        ...DEFAULT_SECURITY_CONFIG,
        strictMode: unifiedSecurityManagerConfig.strictMode,
        performanceThresholdMs: unifiedSecurityManagerConfig.performanceThresholdMs,
        pathSecurity: {
          ...DEFAULT_SECURITY_CONFIG.pathSecurity,
          allowedDirectories: unifiedSecurityManagerConfig.pathSecurity.allowedDirectories
        }
      };

      // Apply environment-specific overrides
      const envOverrides = ENVIRONMENT_OVERRIDES[environment] || {};
      const finalConfig = { ...config, ...envOverrides };

      // Apply environment variable overrides
      this.applyEnvironmentVariables(finalConfig);

      logger.debug({
        allowedDirectories: finalConfig.pathSecurity.allowedDirectories,
        source: 'unified-security-config'
      }, 'Security configuration loaded from unified config');

      return finalConfig;

    } catch (error) {
      // Fallback to default configuration if unified config is not available
      logger.warn({ err: error }, 'Unified security config not available, falling back to defaults');

      const baseConfig = { ...DEFAULT_SECURITY_CONFIG };

      // Apply environment-specific overrides
      const envOverrides = ENVIRONMENT_OVERRIDES[environment] || {};
      const config = { ...baseConfig, ...envOverrides };

      // Apply environment variable overrides
      this.applyEnvironmentVariables(config);

      logger.debug({
        allowedDirectories: config.pathSecurity.allowedDirectories,
        source: 'environment-variables'
      }, 'Security configuration loaded from environment variables (fallback)');

      return config;
    }
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentVariables(config: UnifiedSecurityConfig): void {
    // Global security settings
    if (process.env.VIBE_SECURITY_ENABLED !== undefined) {
      config.enabled = process.env.VIBE_SECURITY_ENABLED === 'true';
    }

    if (process.env.VIBE_SECURITY_STRICT_MODE !== undefined) {
      config.strictMode = process.env.VIBE_SECURITY_STRICT_MODE === 'true';
    }

    if (process.env.VIBE_SECURITY_PERFORMANCE_THRESHOLD !== undefined) {
      config.performanceThresholdMs = parseInt(process.env.VIBE_SECURITY_PERFORMANCE_THRESHOLD, 10);
    }

    if (process.env.VIBE_SECURITY_LOG_VIOLATIONS !== undefined) {
      config.logViolations = process.env.VIBE_SECURITY_LOG_VIOLATIONS === 'true';
    }

    // Path security settings
    if (process.env.VIBE_PATH_ALLOW_SYMLINKS !== undefined) {
      config.pathSecurity.allowSymlinks = process.env.VIBE_PATH_ALLOW_SYMLINKS === 'true';
    }

    if (process.env.VIBE_PATH_ALLOW_ABSOLUTE !== undefined) {
      config.pathSecurity.allowAbsolutePaths = process.env.VIBE_PATH_ALLOW_ABSOLUTE === 'true';
    }

    // Data sanitization settings
    if (process.env.VIBE_XSS_PROTECTION !== undefined) {
      config.dataSanitization.enableXssProtection = process.env.VIBE_XSS_PROTECTION === 'true';
    }

    if (process.env.VIBE_COMMAND_INJECTION_PROTECTION !== undefined) {
      config.dataSanitization.enableCommandInjectionProtection = process.env.VIBE_COMMAND_INJECTION_PROTECTION === 'true';
    }

    // Concurrent access settings
    if (process.env.VIBE_LOCK_TIMEOUT !== undefined) {
      config.concurrentAccess.defaultLockTimeout = parseInt(process.env.VIBE_LOCK_TIMEOUT, 10);
    }

    if (process.env.VIBE_DEADLOCK_DETECTION !== undefined) {
      config.concurrentAccess.enableDeadlockDetection = process.env.VIBE_DEADLOCK_DETECTION === 'true';
    }
  }

  /**
   * Get complete security configuration
   */
  getConfig(): UnifiedSecurityConfig {
    return { ...this.config };
  }

  /**
   * Get component-specific configuration
   */
  getPathSecurityConfig(): PathWhitelistConfig {
    return { ...this.config.pathSecurity };
  }

  getDataSanitizationConfig(): SanitizationConfig {
    return { ...this.config.dataSanitization };
  }

  getConcurrentAccessConfig(): ConcurrentAccessConfig {
    return { ...this.config.concurrentAccess };
  }

  getMiddlewareConfig(): SecurityMiddlewareConfig {
    return { ...this.config.middleware };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<UnifiedSecurityConfig>): void {
    this.config = { ...this.config, ...updates };
    this.clearCache();

    logger.info({ updates: Object.keys(updates) }, 'Security configuration updated');
  }

  /**
   * Get cached configuration value
   */
  getCachedValue<T>(key: string, factory: () => T): T {
    const now = Date.now();
    const cacheKey = `${key}_${this.config.environment}`;

    if (this.config.cacheSecurityResults &&
        this.configCache.has(cacheKey) &&
        (now - this.lastCacheUpdate) < (this.config.cacheTTLSeconds * 1000)) {
      const cachedValue = this.configCache.get(cacheKey) as T | undefined;
      if (cachedValue !== undefined) {
        return cachedValue;
      }
    }

    const value = factory();

    if (this.config.cacheSecurityResults) {
      this.configCache.set(cacheKey, value);
      this.lastCacheUpdate = now;
    }

    return value;
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.performanceThresholdMs < 1) {
      errors.push('Performance threshold must be at least 1ms');
    }

    if (this.config.concurrentAccess.defaultLockTimeout < 1000) {
      errors.push('Default lock timeout must be at least 1000ms');
    }

    if (this.config.dataSanitization.maxStringLength < 1) {
      errors.push('Max string length must be at least 1');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): {
    configurationValid: boolean;
    environment: string;
    strictMode: boolean;
    performanceThreshold: number;
    componentsEnabled: {
      pathSecurity: boolean;
      dataSanitization: boolean;
      concurrentAccess: boolean;
      middleware: boolean;
    };
  } {
    const validation = this.validateConfig();

    return {
      configurationValid: validation.valid,
      environment: this.config.environment,
      strictMode: this.config.strictMode,
      performanceThreshold: this.config.performanceThresholdMs,
      componentsEnabled: {
        pathSecurity: this.config.pathSecurity.allowedDirectories.length > 0,
        dataSanitization: this.config.dataSanitization.enableXssProtection,
        concurrentAccess: this.config.concurrentAccess.enableLockAuditTrail,
        middleware: this.config.middleware.enablePathValidation
      }
    };
  }
}

/**
 * Get security configuration instance
 */
export function getSecurityConfig(): SecurityConfigManager {
  return SecurityConfigManager.getInstance();
}

/**
 * Environment variable documentation
 */
export const SECURITY_ENV_VARS = {
  VIBE_SECURITY_ENABLED: 'Enable/disable security features (true/false)',
  VIBE_SECURITY_STRICT_MODE: 'Enable strict security mode (true/false)',
  VIBE_SECURITY_PERFORMANCE_THRESHOLD: 'Performance threshold in milliseconds',
  VIBE_SECURITY_LOG_VIOLATIONS: 'Log security violations (true/false)',
  VIBE_PATH_SECURITY_ENABLED: 'Enable path security validation (true/false)',
  VIBE_PATH_ALLOW_SYMLINKS: 'Allow symbolic links (true/false)',
  VIBE_DATA_SANITIZATION_ENABLED: 'Enable data sanitization (true/false)',
  VIBE_LOCK_TIMEOUT: 'Default lock timeout in milliseconds',
  VIBE_DEADLOCK_DETECTION: 'Enable deadlock detection (true/false)'
} as const;
