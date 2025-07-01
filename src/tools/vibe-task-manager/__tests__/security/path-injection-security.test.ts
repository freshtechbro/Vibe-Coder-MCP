/**
 * Path Injection Security Tests
 * 
 * Comprehensive security tests to verify path injection attacks are blocked
 * and sensitive information is not exposed in error messages.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import { FileUtils } from '../../utils/file-utils.js';
import { validateSecurePath } from '../../utils/path-security-validator.js';

describe('Path Injection Security Tests', () => {
  let tempDir: string;
  let legitimateFile: string;
  let prdService: PRDIntegrationService;
  let taskListService: TaskListIntegrationService;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-test-'));
    legitimateFile = path.join(tempDir, 'legitimate.md');
    await fs.writeFile(legitimateFile, '# Legitimate Content');

    // Get service instances
    prdService = PRDIntegrationService.getInstance();
    taskListService = TaskListIntegrationService.getInstance();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Path Traversal Attack Prevention', () => {
    const maliciousPaths = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '/etc/passwd',
      '/proc/version',
      '/sys/kernel/version',
      '~/.ssh/id_rsa',
      '../../../../root/.bash_history',
      '../../../var/log/auth.log',
      '..%2f..%2f..%2fetc%2fpasswd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '....//....//....//etc/passwd',
      '..\\..\\..\\etc\\passwd'
    ];

    it('should block path traversal attacks in validateSecurePath', async () => {
      for (const maliciousPath of maliciousPaths) {
        const result = await validateSecurePath(maliciousPath);
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toMatch(/traversal|outside allowed|dangerous|does not exist/i);
        
        // Ensure no sensitive information is leaked in error messages
        expect(result.error).not.toContain('passwd');
        expect(result.error).not.toContain('shadow');
        expect(result.error).not.toContain('ssh');
      }
    });

    it('should block path traversal attacks in FileUtils', async () => {
      for (const maliciousPath of maliciousPaths) {
        const result = await FileUtils.readFile(maliciousPath);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toMatch(/invalid|security|traversal|outside/i);
        
        // Ensure no sensitive information is leaked
        expect(result.error).not.toContain('passwd');
        expect(result.error).not.toContain('shadow');
      }
    });

    it('should block path traversal attacks in PRD Integration', async () => {
      for (const maliciousPath of maliciousPaths) {
        const result = await prdService.parsePRD(maliciousPath);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toMatch(/invalid|security|validation/i);
        
        // Ensure no sensitive information is leaked
        expect(result.error).not.toContain('passwd');
        expect(result.error).not.toContain('shadow');
      }
    });

    it('should block path traversal attacks in Task List Integration', async () => {
      for (const maliciousPath of maliciousPaths) {
        const result = await taskListService.parseTaskList(maliciousPath);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toMatch(/invalid|security|validation/i);
        
        // Ensure no sensitive information is leaked
        expect(result.error).not.toContain('passwd');
        expect(result.error).not.toContain('shadow');
      }
    });
  });

  describe('Null Byte Injection Prevention', () => {
    const nullBytePaths = [
      'legitimate.md\0',
      'legitimate\0.md',
      '\0legitimate.md',
      'legit\0imate.md',
      'legitimate.md\0.txt'
    ];

    it('should block null byte injection attacks', async () => {
      for (const nullBytePath of nullBytePaths) {
        const result = await validateSecurePath(nullBytePath);
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('null bytes');
      }
    });
  });

  describe('Dangerous Character Prevention', () => {
    const dangerousPaths = [
      'file<script>.md',
      'file>output.md',
      'file|pipe.md',
      'file"quote.md',
      'file?query.md',
      'file*wildcard.md',
      'file\x00control.md',
      'file\x1fcontrol.md'
    ];

    it('should block dangerous characters', async () => {
      for (const dangerousPath of dangerousPaths) {
        const result = await validateSecurePath(dangerousPath);
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toMatch(/dangerous characters|null bytes/i);
      }
    });
  });

  describe('File Extension Validation', () => {
    const disallowedExtensions = [
      'malicious.exe',
      'script.bat',
      'payload.sh',
      'virus.com',
      'trojan.scr',
      'backdoor.pif'
    ];

    it('should block disallowed file extensions', async () => {
      for (const disallowedFile of disallowedExtensions) {
        const filePath = path.join(tempDir, disallowedFile);
        await fs.writeFile(filePath, 'malicious content');
        
        const result = await FileUtils.readFile(filePath);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toMatch(/extension.*not allowed|outside allowed/i);
      }
    });
  });

  describe('Symlink Attack Prevention', () => {
    it('should block symlink attacks when symlinks are disabled', async () => {
      const targetFile = path.join(tempDir, 'target.md');
      const symlinkFile = path.join(tempDir, 'symlink.md');
      
      await fs.writeFile(targetFile, 'target content');
      
      try {
        await fs.symlink(targetFile, symlinkFile);
        
        const result = await validateSecurePath(symlinkFile);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Symbolic links are not allowed');
      } catch {
        // Skip test if symlinks not supported on this system
        console.log('Skipping symlink test - not supported on this system');
      }
    });
  });

  describe('Directory vs File Validation', () => {
    it('should reject directory paths when expecting files', async () => {
      const result = await validateSecurePath(tempDir);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/must point to a file|outside allowed/i);
    });
  });

  describe('Information Disclosure Prevention', () => {
    it('should not leak sensitive system information in error messages', async () => {
      const sensitiveAttempts = [
        '/etc/passwd',
        '/etc/shadow',
        '/proc/version',
        '/sys/kernel/version',
        '~/.ssh/id_rsa',
        '/var/log/auth.log'
      ];

      for (const sensitivePath of sensitiveAttempts) {
        const result = await validateSecurePath(sensitivePath);
        
        expect(result.isValid).toBe(false);
        
        // Check that error messages don't contain sensitive information
        const errorMessage = result.error?.toLowerCase() || '';
        expect(errorMessage).not.toContain('passwd');
        expect(errorMessage).not.toContain('shadow');
        expect(errorMessage).not.toContain('ssh');
        expect(errorMessage).not.toContain('auth.log');
        expect(errorMessage).not.toContain('kernel');
        expect(errorMessage).not.toContain('proc');
        expect(errorMessage).not.toContain('sys');
      }
    });

    it('should not expose internal file system structure', async () => {
      const result = await validateSecurePath('/nonexistent/path/file.md');
      
      expect(result.isValid).toBe(false);
      
      // Error should be generic, not exposing internal paths
      const errorMessage = result.error?.toLowerCase() || '';
      expect(errorMessage).not.toContain('/nonexistent');
      expect(errorMessage).not.toContain('internal');
      expect(errorMessage).not.toContain('system');
    });
  });

  describe('Performance and DoS Prevention', () => {
    it('should handle extremely long paths efficiently', async () => {
      const longPath = 'a'.repeat(10000) + '.md';
      
      const startTime = Date.now();
      const result = await validateSecurePath(longPath);
      const duration = Date.now() - startTime;
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle many validation requests efficiently', async () => {
      const requests = Array(100).fill(0).map((_, i) => 
        validateSecurePath(`../../../etc/passwd${i}`)
      );
      
      const startTime = Date.now();
      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;
      
      // All should be rejected
      results.forEach(result => {
        expect(result.isValid).toBe(false);
      });
      
      // Should complete efficiently
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty and whitespace-only paths', async () => {
      const edgeCases = ['', ' ', '\t', '\n', '\r\n'];
      
      for (const edgeCase of edgeCases) {
        const result = await validateSecurePath(edgeCase);
        expect(result.isValid).toBe(false);
        expect(result.error).toMatch(/non-empty string|does not exist|dangerous characters/i);
      }
    });

    it('should handle Unicode and special encoding attacks', async () => {
      const unicodeAttacks = [
        'file\u202e.md', // Right-to-left override
        'file\ufeff.md', // Byte order mark
        'file\u200b.md', // Zero-width space
        'file\u2028.md', // Line separator
        'file\u2029.md'  // Paragraph separator
      ];

      for (const unicodeAttack of unicodeAttacks) {
        const result = await validateSecurePath(unicodeAttack);
        expect(result.isValid).toBe(false);
      }
    });
  });
});
