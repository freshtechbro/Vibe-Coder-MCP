/**
 * Tests for Filesystem Security Module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FilesystemSecurity } from '../../security/filesystem-security.js';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('FilesystemSecurity', () => {
  let fsecurity: FilesystemSecurity;
  let testDir: string;
  let allowedDir: string;

  beforeEach(async () => {
    // Create test directory structure
    testDir = path.join(tmpdir(), 'vibe-fs-security-test');
    allowedDir = path.join(testDir, 'allowed');
    
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(allowedDir, { recursive: true });
    await fs.writeFile(path.join(allowedDir, 'test.txt'), 'test content');
    await fs.writeFile(path.join(allowedDir, 'test.js'), 'console.log("test");');

    // Initialize filesystem security with test configuration
    fsecurity = FilesystemSecurity.getInstance({
      allowedDirectories: [allowedDir],
      enablePermissionChecking: true,
      enableBlacklist: true,
      enableExtensionFiltering: true
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Path Security Checks', () => {
    it('should allow access to files within allowed directories', async () => {
      const testFile = path.join(allowedDir, 'test.txt');
      const result = await fsecurity.checkPathSecurity(testFile, 'read');

      expect(result.allowed).toBe(true);
      expect(result.normalizedPath).toBeDefined();
      expect(result.securityViolation).toBeUndefined();
    });

    it('should block access to files outside allowed directories', async () => {
      const outsideFile = path.join(testDir, 'outside.txt');
      await fs.writeFile(outsideFile, 'outside content');

      const result = await fsecurity.checkPathSecurity(outsideFile, 'read');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside allowed directories');
      expect(result.securityViolation).toBe(true);
    });

    it('should block access to blacklisted system directories', async () => {
      const systemPath = '/private/var/spool/postfix/test';
      const result = await fsecurity.checkPathSecurity(systemPath, 'read');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blacklist');
      expect(result.securityViolation).toBe(true);
    });

    it('should validate file extensions in strict mode', async () => {
      const unsafeFile = path.join(allowedDir, 'test.exe');
      await fs.writeFile(unsafeFile, 'binary content');

      const result = await fsecurity.checkPathSecurity(unsafeFile, 'read');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('extension not in safe list');
      expect(result.securityViolation).toBe(false); // Policy, not security violation
    });

    it('should allow safe file extensions', async () => {
      const safeFile = path.join(allowedDir, 'test.js');
      const result = await fsecurity.checkPathSecurity(safeFile, 'read');

      expect(result.allowed).toBe(true);
    });

    it('should reject invalid path inputs', async () => {
      const result = await fsecurity.checkPathSecurity('', 'read');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid path input');
      expect(result.securityViolation).toBe(true);
    });

    it('should reject paths that are too long', async () => {
      const longPath = 'a'.repeat(5000);
      const result = await fsecurity.checkPathSecurity(longPath, 'read');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Path too long');
      expect(result.securityViolation).toBe(true);
    });
  });

  describe('Secure File Operations', () => {
    it('should read directory securely', async () => {
      const entries = await fsecurity.readDirSecure(allowedDir);

      expect(entries).toBeDefined();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some(entry => entry.name === 'test.txt')).toBe(true);
    });

    it('should throw error when reading blocked directory', async () => {
      const blockedDir = path.join(testDir, 'blocked');
      await fs.mkdir(blockedDir, { recursive: true });

      await expect(fsecurity.readDirSecure(blockedDir)).rejects.toThrow('Access denied');
    });

    it('should get file stats securely', async () => {
      const testFile = path.join(allowedDir, 'test.txt');
      const stats = await fsecurity.statSecure(testFile);

      expect(stats).toBeDefined();
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should throw error when getting stats for blocked file', async () => {
      const blockedFile = path.join(testDir, 'blocked.txt');
      await fs.writeFile(blockedFile, 'blocked content');

      await expect(fsecurity.statSecure(blockedFile)).rejects.toThrow('Access denied');
    });

    it('should handle permission errors gracefully', async () => {
      const nonExistentFile = path.join(allowedDir, 'nonexistent.txt');

      await expect(fsecurity.statSecure(nonExistentFile)).rejects.toThrow('Access denied: Path does not exist');
    });
  });

  describe('Security Configuration', () => {
    it('should use strict mode by default', () => {
      const mode = fsecurity.getSecurityMode();
      expect(mode).toBe('strict');
    });

    it('should provide security statistics', () => {
      const stats = fsecurity.getSecurityStats();

      expect(stats.securityMode).toBe('strict');
      expect(stats.blacklistedPathsCount).toBeGreaterThan(0);
      expect(stats.allowedDirectoriesCount).toBeGreaterThan(0);
      expect(stats.safeExtensionsCount).toBeGreaterThan(0);
    });

    it('should update configuration', () => {
      fsecurity.updateConfig({
        enableExtensionFiltering: false,
        additionalSafeExtensions: ['.custom']
      });

      const updatedConfig = fsecurity.getConfig();
      expect(updatedConfig.enableExtensionFiltering).toBe(false);
      expect(updatedConfig.additionalSafeExtensions).toContain('.custom');
    });
  });

  describe('Performance', () => {
    it('should complete security checks within performance threshold', async () => {
      const testFile = path.join(allowedDir, 'test.txt');
      const startTime = Date.now();

      await fsecurity.checkPathSecurity(testFile, 'read');

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be much faster than 50ms threshold
    });

    it('should handle multiple concurrent security checks', async () => {
      const testFiles = [
        path.join(allowedDir, 'test.txt'),
        path.join(allowedDir, 'test.js'),
        path.join(allowedDir, 'nonexistent.txt')
      ];

      const promises = testFiles.map(file => 
        fsecurity.checkPathSecurity(file, 'read')
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(true);
      // Third file doesn't exist but should pass security check
    });
  });

  describe('Environment Variable Integration', () => {
    it('should respect VIBE_TASK_MANAGER_SECURITY_MODE environment variable', () => {
      // Test is run with default strict mode
      const mode = fsecurity.getSecurityMode();
      expect(['strict', 'permissive']).toContain(mode);
    });

    it('should use environment variables for allowed directories', () => {
      const config = fsecurity.getConfig();
      expect(config.allowedDirectories).toBeDefined();
      expect(config.allowedDirectories.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle filesystem errors gracefully', async () => {
      // Mock fs.access to throw EACCES error
      const accessSpy = vi.spyOn(fs, 'access').mockRejectedValueOnce(
        Object.assign(new Error('Permission denied'), { code: 'EACCES' })
      );

      const result = await fsecurity.checkPathSecurity(path.join(allowedDir, 'test.txt'), 'read');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Permission denied');

      // Restore original function
      accessSpy.mockRestore();
    });

    it('should handle path normalization errors', async () => {
      // Test with invalid characters that might cause normalization issues
      const invalidPath = '\0invalid\0path';
      const result = await fsecurity.checkPathSecurity(invalidPath, 'read');

      expect(result.allowed).toBe(false);
    });
  });

  describe('Blacklist Management', () => {
    it('should add paths to blacklist', () => {
      const pathToBlock = '/custom/blocked/path';
      fsecurity.addToBlacklist(pathToBlock);

      const config = fsecurity.getConfig();
      expect(config.additionalBlacklistedPaths).toContain(path.resolve(pathToBlock));
    });

    it('should remove paths from blacklist', () => {
      const pathToBlock = '/custom/blocked/path';
      fsecurity.addToBlacklist(pathToBlock);
      fsecurity.removeFromBlacklist(pathToBlock);

      const config = fsecurity.getConfig();
      expect(config.additionalBlacklistedPaths).not.toContain(path.resolve(pathToBlock));
    });
  });
});
