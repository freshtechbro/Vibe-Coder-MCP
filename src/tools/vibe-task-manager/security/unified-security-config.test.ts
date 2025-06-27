/**
 * Tests for Unified Security Configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UnifiedSecurityConfigManager, getUnifiedSecurityConfig } from './unified-security-config.js';
import { OpenRouterConfig } from '../../../types/workflow.js';

describe('UnifiedSecurityConfigManager', () => {
  let configManager: UnifiedSecurityConfigManager;

  beforeEach(() => {
    configManager = UnifiedSecurityConfigManager.getInstance();
    // Reset the configuration before each test
    configManager.reset();
  });

  afterEach(() => {
    // Clean up after each test
    configManager.reset();
  });

  describe('MCP Configuration Integration', () => {
    it('should initialize from MCP client config', () => {
      const mockMCPConfig: OpenRouterConfig = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
        tools: {
          'vibe-task-manager': {
            allowedReadDirectory: '/test/read/directory',
            allowedWriteDirectory: '/test/write/directory',
            securityMode: 'strict'
          }
        },
        config: {},
        llm_mapping: {}
      };

      configManager.initializeFromMCPConfig(mockMCPConfig);
      const config = configManager.getConfig();

      expect(config.allowedReadDirectory).toBe('/test/read/directory');
      expect(config.allowedWriteDirectory).toBe('/test/write/directory');
      expect(config.securityMode).toBe('strict');
      expect(config.allowedDirectories).toContain('/test/read/directory');
      expect(config.allowedDirectories).toContain('/test/write/directory');
    });

    it('should fall back to environment variables when MCP config is not available', () => {
      // Set environment variables
      process.env.VIBE_TASK_MANAGER_READ_DIR = '/env/read/directory';
      process.env.VIBE_CODER_OUTPUT_DIR = '/env/write/directory';
      process.env.VIBE_TASK_MANAGER_SECURITY_MODE = 'permissive';

      const mockMCPConfig: OpenRouterConfig = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
        tools: {},
        config: {},
        llm_mapping: {}
      };

      configManager.initializeFromMCPConfig(mockMCPConfig);
      const config = configManager.getConfig();

      expect(config.allowedReadDirectory).toBe('/env/read/directory');
      expect(config.allowedWriteDirectory).toBe('/env/write/directory');
      expect(config.securityMode).toBe('permissive');

      // Clean up environment variables
      delete process.env.VIBE_TASK_MANAGER_READ_DIR;
      delete process.env.VIBE_CODER_OUTPUT_DIR;
      delete process.env.VIBE_TASK_MANAGER_SECURITY_MODE;
    });

    it('should provide component-specific configurations', () => {
      const mockMCPConfig: OpenRouterConfig = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
        tools: {
          'vibe-task-manager': {
            allowedReadDirectory: '/test/read',
            allowedWriteDirectory: '/test/write',
            securityMode: 'strict'
          }
        },
        config: {},
        llm_mapping: {}
      };

      configManager.initializeFromMCPConfig(mockMCPConfig);

      const filesystemConfig = configManager.getFilesystemSecurityConfig();
      expect(filesystemConfig.allowedDirectories).toContain('/test/read');
      expect(filesystemConfig.allowedDirectories).toContain('/test/write');
      expect(filesystemConfig.securityMode).toBe('strict');

      const pathValidatorConfig = configManager.getPathValidatorConfig();
      expect(pathValidatorConfig.allowedDirectories).toContain('/test/read');
      expect(pathValidatorConfig.allowedDirectories).toContain('/test/write');

      const securityManagerConfig = configManager.getSecurityManagerConfig();
      expect(securityManagerConfig.pathSecurity.allowedDirectories).toContain('/test/read');
      expect(securityManagerConfig.pathSecurity.allowedDirectories).toContain('/test/write');
      expect(securityManagerConfig.strictMode).toBe(true);
    });
  });

  describe('Path Validation', () => {
    beforeEach(() => {
      const mockMCPConfig: OpenRouterConfig = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'gemini-pro',
        perplexityModel: 'pplx-7b-online',
        tools: {
          'vibe-task-manager': {
            allowedReadDirectory: '/allowed/read',
            allowedWriteDirectory: '/allowed/write',
            securityMode: 'strict'
          }
        },
        config: {},
        llm_mapping: {}
      };

      configManager.initializeFromMCPConfig(mockMCPConfig);
    });

    it('should validate read paths correctly', () => {
      expect(configManager.isPathAllowed('/allowed/read/file.txt', 'read')).toBe(true);
      expect(configManager.isPathAllowed('/allowed/read/subdir/file.txt', 'read')).toBe(true);
      expect(configManager.isPathAllowed('/forbidden/file.txt', 'read')).toBe(false);
    });

    it('should validate write paths correctly', () => {
      expect(configManager.isPathAllowed('/allowed/write/file.txt', 'write')).toBe(true);
      expect(configManager.isPathAllowed('/allowed/write/subdir/file.txt', 'write')).toBe(true);
      expect(configManager.isPathAllowed('/forbidden/file.txt', 'write')).toBe(false);
    });
  });

  describe('Configuration Status', () => {
    it('should report correct status when not initialized', () => {
      const status = configManager.getConfigStatus();
      expect(status.initialized).toBe(false);
      expect(status.mcpConfigPresent).toBe(false);
    });

    it('should report correct status when initialized', () => {
      const mockMCPConfig: OpenRouterConfig = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
        tools: {
          'vibe-task-manager': {
            allowedReadDirectory: '/test/read',
            allowedWriteDirectory: '/test/write',
            securityMode: 'strict'
          }
        },
        config: {},
        llm_mapping: {}
      };

      configManager.initializeFromMCPConfig(mockMCPConfig);
      const status = configManager.getConfigStatus();

      expect(status.initialized).toBe(true);
      expect(status.mcpConfigPresent).toBe(true);
      expect(status.allowedReadDirectory).toBe('/test/read');
      expect(status.allowedWriteDirectory).toBe('/test/write');
      expect(status.securityMode).toBe('strict');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getUnifiedSecurityConfig();
      const instance2 = getUnifiedSecurityConfig();
      expect(instance1).toBe(instance2);
    });
  });
});
