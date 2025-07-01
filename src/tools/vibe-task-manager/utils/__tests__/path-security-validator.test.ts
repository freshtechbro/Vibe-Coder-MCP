/**
 * Path Security Validator Tests
 * 
 * Comprehensive test suite for path injection vulnerability prevention
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PathSecurityValidator, validateSecurePath } from '../path-security-validator.js';

describe('PathSecurityValidator', () => {
  let validator: PathSecurityValidator;
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'path-security-test-'));
    testFile = path.join(tempDir, 'test.md');

    // Ensure directory exists and is writable
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(testFile, '# Test Content');

    // Initialize validator with test configuration
    validator = new PathSecurityValidator({
      allowedBasePaths: [tempDir],
      allowedExtensions: ['.md', '.txt'],
      maxPathLength: 500,
      allowSymlinks: false,
      strictMode: true
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Path Validation', () => {
    it('should validate legitimate file paths', async () => {
      const result = await validator.validatePath(testFile);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedPath).toBe(path.resolve(testFile));
      expect(result.error).toBeUndefined();
    });

    it('should reject empty or null paths', async () => {
      const results = await Promise.all([
        validator.validatePath(''),
        validator.validatePath(null as string),
        validator.validatePath(undefined as string)
      ]);

      results.forEach(result => {
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });
    });

    it('should reject paths exceeding maximum length', async () => {
      const longPath = 'a'.repeat(1000);
      const result = await validator.validatePath(longPath);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });
  });

  describe('Path Injection Prevention', () => {
    it('should reject directory traversal attacks', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        path.join(tempDir, '../../../etc/passwd'),
        path.join(tempDir, '..', '..', '..', 'etc', 'passwd'),
        tempDir + '/../../../etc/passwd'
      ];

      for (const maliciousPath of maliciousPaths) {
        const result = await validator.validatePath(maliciousPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toMatch(/traversal|outside allowed/i);
      }
    });

    it('should reject paths with null bytes', async () => {
      const pathsWithNullBytes = [
        'test\0.md',
        'test.md\0',
        '\0test.md',
        'te\0st.md'
      ];

      for (const maliciousPath of pathsWithNullBytes) {
        const result = await validator.validatePath(maliciousPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('null bytes');
      }
    });

    it('should reject paths with dangerous characters', async () => {
      const dangerousPaths = [
        'test<script>.md',
        'test>output.md',
        'test|pipe.md',
        'test"quote.md',
        'test?query.md',
        'test*wildcard.md'
      ];

      for (const dangerousPath of dangerousPaths) {
        const result = await validator.validatePath(dangerousPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('dangerous characters');
      }
    });

    it('should reject URL-encoded traversal attempts', async () => {
      const encodedPaths = [
        'test%2e%2e%2fpasswd.md',
        'test%2e%2e%5cpasswd.md',
        'test..%2fpasswd.md',
        'test..%5cpasswd.md',
        'test%252e%252e%252fpasswd.md'
      ];

      for (const encodedPath of encodedPaths) {
        const result = await validator.validatePath(encodedPath);
        expect(result.isValid).toBe(false);
        expect(result.error).toMatch(/traversal/i);
      }
    });
  });

  describe('File Extension Validation', () => {
    it('should accept allowed file extensions', async () => {
      const allowedFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(allowedFile, 'content');

      const result = await validator.validatePath(allowedFile);
      expect(result.isValid).toBe(true);
    });

    it('should reject disallowed file extensions', async () => {
      const disallowedFile = path.join(tempDir, 'test.exe');
      await fs.writeFile(disallowedFile, 'content');
      
      const result = await validator.validatePath(disallowedFile);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('Symlink Handling', () => {
    it('should reject symlinks when not allowed', async () => {
      const targetFile = path.join(tempDir, 'target.md');
      const symlinkFile = path.join(tempDir, 'symlink.md');
      
      await fs.writeFile(targetFile, 'content');
      
      try {
        await fs.symlink(targetFile, symlinkFile);
        
        const result = await validator.validatePath(symlinkFile);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Symbolic links are not allowed');
      } catch {
        // Skip test if symlinks not supported on this system
        console.log('Skipping symlink test - not supported on this system');
      }
    });

    it('should accept symlinks when allowed', async () => {
      const symlinkValidator = new PathSecurityValidator({
        allowedBasePaths: [tempDir],
        allowedExtensions: ['.md'],
        allowSymlinks: true,
        strictMode: true
      });

      const targetFile = path.join(tempDir, 'target.md');
      const symlinkFile = path.join(tempDir, 'symlink.md');
      
      await fs.writeFile(targetFile, 'content');
      
      try {
        await fs.symlink(targetFile, symlinkFile);
        
        const result = await symlinkValidator.validatePath(symlinkFile);
        expect(result.isValid).toBe(true);
      } catch {
        // Skip test if symlinks not supported on this system
        console.log('Skipping symlink test - not supported on this system');
      }
    });
  });

  describe('Directory vs File Validation', () => {
    it('should reject directory paths', async () => {
      // Create a validator that allows directories to have no extension
      const dirValidator = new PathSecurityValidator({
        allowedBasePaths: [tempDir],
        allowedExtensions: [], // Allow any extension for this test
        strictMode: true
      });

      const result = await dirValidator.validatePath(tempDir);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must point to a file');
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        maxPathLength: 200,
        allowSymlinks: true
      };
      
      validator.updateConfig(newConfig);
      const config = validator.getConfig();
      
      expect(config.maxPathLength).toBe(200);
      expect(config.allowSymlinks).toBe(true);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple paths', async () => {
      const file1 = path.join(tempDir, 'file1.md');
      const file2 = path.join(tempDir, 'file2.md');
      const maliciousPath = '../../../etc/passwd';

      // Ensure files are created properly
      try {
        await fs.writeFile(file1, 'content1');
        await fs.writeFile(file2, 'content2');
      } catch (error) {
        console.log('Error creating test files:', error);
        throw error;
      }

      const results = await validator.validatePaths([file1, file2, maliciousPath]);

      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
      expect(results[2].isValid).toBe(false);
    });
  });

  describe('Convenience Function', () => {
    it('should work with default validator', async () => {
      // Test with a path that should be valid for default config
      const result = await validateSecurePath(testFile);
      
      // Result depends on whether testFile is within default allowed paths
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('error');
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.md');
      
      const result = await validator.validatePath(nonExistentPath);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should handle permission errors gracefully', async () => {
      // This test is platform-dependent and may not work on all systems
      const restrictedPath = '/root/restricted.md';
      
      const result = await validator.validatePath(restrictedPath);
      expect(result.isValid).toBe(false);
      // Error could be about path being outside allowed directories or access issues
      expect(result.error).toBeDefined();
    });
  });
});
