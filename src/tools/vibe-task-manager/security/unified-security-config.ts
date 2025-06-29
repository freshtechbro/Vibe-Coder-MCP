/**
 * Unified Security Configuration Service for Vibe Task Manager
 *
 * This service coordinates all security components to ensure they use the same
 * MCP client-approved configuration. It follows the Code Map Generator pattern
 * for loading configuration from MCP client config.
 */

import path from 'path';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { extractVibeTaskManagerSecurityConfig, VibeTaskManagerSecurityConfig } from '../utils/config-loader.js';
import logger from '../../../logger.js';

/**
 * Unified security configuration that all security components should use
 */
export interface UnifiedSecurityConfiguration {
  // MCP-approved directories
  allowedReadDirectory: string;
  allowedWriteDirectory: string;

  // Security mode
  securityMode: 'strict' | 'permissive';

  // Derived configurations for different security components
  allowedDirectories: string[];

  // Performance settings
  performanceThresholdMs: number;

  // Security features
  enablePermissionChecking: boolean;
  enableBlacklist: boolean;
  enableExtensionFiltering: boolean;
  maxPathLength: number;

  // Code-map-generator compatibility aliases
  allowedDir?: string; // Alias for allowedReadDirectory
  outputDir?: string;  // Alias for allowedWriteDirectory

  // Service-specific boundaries
  serviceBoundaries: {
    vibeTaskManager: {
      readDir: string;
      writeDir: string;
    };
    codeMapGenerator: {
      allowedDir: string;
      outputDir: string;
    };
    contextCurator: {
      readDir: string;
      outputDir: string;
    };
  };
}

/**
 * Unified Security Configuration Manager
 *
 * This singleton service ensures all security components use the same
 * MCP client-approved configuration.
 */
export class UnifiedSecurityConfigManager {
  private static instance: UnifiedSecurityConfigManager | null = null;
  private config: UnifiedSecurityConfiguration | null = null;
  private mcpConfig: OpenRouterConfig | null = null;

  private constructor() {
    logger.info('Unified Security Configuration Manager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): UnifiedSecurityConfigManager {
    if (!UnifiedSecurityConfigManager.instance) {
      UnifiedSecurityConfigManager.instance = new UnifiedSecurityConfigManager();
    }
    return UnifiedSecurityConfigManager.instance;
  }

  /**
   * Initialize the security configuration from MCP client config
   * This should be called during server startup
   */
  initializeFromMCPConfig(mcpConfig: OpenRouterConfig): void {
    this.mcpConfig = mcpConfig;

    try {
      // Extract security configuration using the same pattern as Code Map Generator
      const securityConfig = extractVibeTaskManagerSecurityConfig(mcpConfig);

      // Create unified configuration
      this.config = {
        allowedReadDirectory: securityConfig.allowedReadDirectory,
        allowedWriteDirectory: securityConfig.allowedWriteDirectory,
        securityMode: securityConfig.securityMode,

        // Derived configurations
        allowedDirectories: [
          securityConfig.allowedReadDirectory,
          securityConfig.allowedWriteDirectory
        ],

        // Performance settings aligned with Epic 6.2 targets
        performanceThresholdMs: 50,

        // Security features based on mode
        enablePermissionChecking: true,
        enableBlacklist: true,
        enableExtensionFiltering: securityConfig.securityMode === 'strict',
        maxPathLength: 4096,

        // Code-map-generator compatibility aliases
        allowedDir: securityConfig.allowedReadDirectory,
        outputDir: securityConfig.allowedWriteDirectory,

        // Service-specific boundaries for all services
        serviceBoundaries: {
          vibeTaskManager: {
            readDir: securityConfig.allowedReadDirectory,
            writeDir: securityConfig.allowedWriteDirectory
          },
          codeMapGenerator: {
            allowedDir: securityConfig.allowedReadDirectory,
            outputDir: securityConfig.allowedWriteDirectory
          },
          contextCurator: {
            readDir: securityConfig.allowedReadDirectory,
            outputDir: securityConfig.allowedWriteDirectory
          }
        }
      };

      logger.info({
        allowedReadDirectory: this.config.allowedReadDirectory,
        allowedWriteDirectory: this.config.allowedWriteDirectory,
        securityMode: this.config.securityMode,
        allowedDirectories: this.config.allowedDirectories
      }, 'Unified security configuration initialized from MCP client config');

    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize security configuration from MCP client config');
      throw error;
    }
  }

  /**
   * Get the unified security configuration
   * Throws error if not initialized
   */
  getConfig(): UnifiedSecurityConfiguration {
    if (!this.config) {
      throw new Error('Unified security configuration not initialized. Call initializeFromMCPConfig() first.');
    }
    return { ...this.config };
  }

  /**
   * Get configuration for FilesystemSecurity component
   */
  getFilesystemSecurityConfig(): {
    allowedDirectories: string[];
    securityMode: 'strict' | 'permissive';
    enablePermissionChecking: boolean;
    enableBlacklist: boolean;
    enableExtensionFiltering: boolean;
    maxPathLength: number;
    performanceThresholdMs: number;
  } {
    const config = this.getConfig();
    return {
      allowedDirectories: config.allowedDirectories,
      securityMode: config.securityMode,
      enablePermissionChecking: config.enablePermissionChecking,
      enableBlacklist: config.enableBlacklist,
      enableExtensionFiltering: config.enableExtensionFiltering,
      maxPathLength: config.maxPathLength,
      performanceThresholdMs: config.performanceThresholdMs
    };
  }

  /**
   * Get configuration for PathSecurityValidator component
   */
  getPathValidatorConfig(): {
    allowedDirectories: string[];
    maxPathLength: number;
  } {
    const config = this.getConfig();
    return {
      allowedDirectories: config.allowedDirectories,
      maxPathLength: config.maxPathLength
    };
  }

  /**
   * Get configuration for SecurityConfigManager component
   */
  getSecurityManagerConfig(): {
    pathSecurity: {
      allowedDirectories: string[];
    };
    strictMode: boolean;
    performanceThresholdMs: number;
  } {
    const config = this.getConfig();
    return {
      pathSecurity: {
        allowedDirectories: config.allowedDirectories
      },
      strictMode: config.securityMode === 'strict',
      performanceThresholdMs: config.performanceThresholdMs
    };
  }

  /**
   * Get configuration for Code Map Generator (compatibility)
   */
  getCodeMapGeneratorConfig(): {
    allowedDir: string;
    outputDir: string;
    securityMode: 'strict' | 'permissive';
  } {
    const config = this.getConfig();
    return {
      allowedDir: config.allowedReadDirectory,
      outputDir: config.allowedWriteDirectory,
      securityMode: config.securityMode
    };
  }

  /**
   * Get configuration for Context Curator
   */
  getContextCuratorConfig(): {
    readDir: string;
    outputDir: string;
    allowedDirectories: string[];
    securityMode: 'strict' | 'permissive';
  } {
    const config = this.getConfig();
    return {
      readDir: config.allowedReadDirectory,
      outputDir: config.allowedWriteDirectory,
      allowedDirectories: config.allowedDirectories,
      securityMode: config.securityMode
    };
  }

  /**
   * Get configuration for Vibe Task Manager Security Validator
   */
  getVibeTaskManagerSecurityValidatorConfig(): {
    readDir: string;
    writeDir: string;
    securityMode: 'strict' | 'permissive';
  } {
    const config = this.getConfig();
    return {
      readDir: config.allowedReadDirectory,
      writeDir: config.allowedWriteDirectory,
      securityMode: config.securityMode
    };
  }

  /**
   * Get service-specific boundaries
   */
  getServiceBoundaries(serviceName: 'vibeTaskManager' | 'codeMapGenerator' | 'contextCurator'): {
    readDir?: string;
    writeDir?: string;
    allowedDir?: string;
    outputDir?: string;
  } {
    const config = this.getConfig();
    const boundaries = config.serviceBoundaries[serviceName];

    if (!boundaries) {
      throw new Error(`Service boundaries not found for service: ${serviceName}`);
    }

    return boundaries;
  }

  /**
   * Validate that a path is within allowed directories
   */
  isPathAllowed(filePath: string, operation: 'read' | 'write' = 'read'): boolean {
    const config = this.getConfig();

    try {
      const resolvedPath = path.resolve(filePath);

      if (operation === 'read') {
        return resolvedPath.startsWith(config.allowedReadDirectory);
      } else {
        return resolvedPath.startsWith(config.allowedWriteDirectory);
      }
    } catch (error) {
      logger.error({ err: error, filePath, operation }, 'Error validating path');
      return false;
    }
  }

  /**
   * Get configuration status for debugging
   */
  getConfigStatus(): {
    initialized: boolean;
    mcpConfigPresent: boolean;
    allowedReadDirectory?: string;
    allowedWriteDirectory?: string;
    securityMode?: string;
  } {
    return {
      initialized: this.config !== null,
      mcpConfigPresent: this.mcpConfig !== null,
      allowedReadDirectory: this.config?.allowedReadDirectory,
      allowedWriteDirectory: this.config?.allowedWriteDirectory,
      securityMode: this.config?.securityMode
    };
  }

  /**
   * Reset configuration (for testing purposes)
   */
  reset(): void {
    this.config = null;
    this.mcpConfig = null;
    logger.debug('Unified security configuration reset');
  }
}

/**
 * Convenience function to get the unified security configuration manager
 */
export function getUnifiedSecurityConfig(): UnifiedSecurityConfigManager {
  return UnifiedSecurityConfigManager.getInstance();
}
