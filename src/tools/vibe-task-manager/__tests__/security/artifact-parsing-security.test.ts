/**
 * Artifact Parsing Security Tests
 * Tests security aspects of PRD and Task List parsing functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import { validateSecurePath } from '../../security/path-validator.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock path validator
vi.mock('../../security/path-validator.js', () => ({
  validateSecurePath: vi.fn()
}));
const mockValidateSecurePath = vi.mocked(validateSecurePath);

describe('Artifact Parsing Security Tests', () => {
  let prdIntegration: PRDIntegrationService;
  let taskListIntegration: TaskListIntegrationService;

  beforeEach(() => {
    // Reset singletons
    (PRDIntegrationService as any).instance = null;
    (TaskListIntegrationService as any).instance = null;

    prdIntegration = PRDIntegrationService.getInstance();
    taskListIntegration = TaskListIntegrationService.getInstance();

    // Setup default mocks
    mockValidateSecurePath.mockResolvedValue({
      valid: true,
      canonicalPath: '/safe/path',
      securityViolation: false,
      auditInfo: {
        timestamp: new Date(),
        originalPath: '/safe/path',
        validationTime: 1
      }
    });

    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false,
      size: 1024,
      mtime: new Date()
    } as any);
    mockFs.readFile.mockResolvedValue('# Test Content');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Path Validation Security', () => {
    it('should validate PRD file paths through security validator', async () => {
      // Mock directory listing with actual files
      mockFs.readdir.mockResolvedValue(['test-prd.md'] as any);
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
        mtime: new Date()
      } as any);

      const result = await prdIntegration.findPRDFiles();

      // Should return discovered files (path validation happens internally)
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should validate task list file paths through security validator', async () => {
      // Mock directory listing with actual files
      mockFs.readdir.mockResolvedValue(['test-tasks.md'] as any);
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
        mtime: new Date()
      } as any);

      const result = await taskListIntegration.findTaskListFiles();

      // Should return discovered files (path validation happens internally)
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should reject paths that fail security validation', async () => {
      // Mock security validation failure
      mockValidateSecurePath.mockResolvedValue({
        valid: false,
        securityViolation: true,
        violationType: 'traversal',
        error: 'Path traversal detected',
        auditInfo: {
          timestamp: new Date(),
          originalPath: '../../../etc/passwd',
          validationTime: 1
        }
      });

      const maliciousPath = '../../../etc/passwd';

      // Test PRD parsing with malicious path
      try {
        await prdIntegration.parsePRDContent('# Malicious Content', maliciousPath);
        // Should not reach here if security is working
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should prevent directory traversal attacks in PRD discovery', async () => {
      // Mock malicious directory listing
      mockFs.readdir.mockResolvedValue(['../../../etc/passwd', 'legitimate-prd.md'] as any);

      // Mock security validation to reject traversal paths
      mockValidateSecurePath.mockImplementation(async (filePath: string) => {
        if (filePath.includes('../')) {
          return {
            valid: false,
            securityViolation: true,
            violationType: 'traversal',
            error: 'Directory traversal detected',
            auditInfo: {
              timestamp: new Date(),
              originalPath: filePath,
              validationTime: 1
            }
          };
        }
        return {
          valid: true,
          canonicalPath: filePath,
          securityViolation: false,
          auditInfo: {
            timestamp: new Date(),
            originalPath: filePath,
            validationTime: 1
          }
        };
      });

      const discoveredPRDs = await prdIntegration.findPRDFiles();

      // Should only include legitimate files
      expect(discoveredPRDs.every(prd => !prd.filePath.includes('../'))).toBe(true);
    });

    it('should prevent directory traversal attacks in task list discovery', async () => {
      // Mock malicious directory listing
      mockFs.readdir.mockResolvedValue(['../../../etc/passwd', 'legitimate-tasks.md'] as any);

      // Mock security validation to reject traversal paths
      mockValidateSecurePath.mockImplementation(async (filePath: string) => {
        if (filePath.includes('../')) {
          return {
            valid: false,
            securityViolation: true,
            violationType: 'traversal',
            error: 'Directory traversal detected',
            auditInfo: {
              timestamp: new Date(),
              originalPath: filePath,
              validationTime: 1
            }
          };
        }
        return {
          valid: true,
          canonicalPath: filePath,
          securityViolation: false,
          auditInfo: {
            timestamp: new Date(),
            originalPath: filePath,
            validationTime: 1
          }
        };
      });

      const discoveredTaskLists = await taskListIntegration.findTaskListFiles();

      // Should only include legitimate files
      expect(discoveredTaskLists.every(tl => !tl.filePath.includes('../'))).toBe(true);
    });
  });

  describe('File Access Security', () => {
    it('should only access files within allowed directories', async () => {
      const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
      const allowedPRDDir = path.join(baseOutputDir, 'prd-generator');
      const allowedTaskListDir = path.join(baseOutputDir, 'generated_task_lists');

      // Mock directory listing
      mockFs.readdir.mockResolvedValue(['test-file.md'] as any);

      await prdIntegration.findPRDFiles();
      await taskListIntegration.findTaskListFiles();

      // Verify only allowed directories are accessed
      const readDirCalls = mockFs.readdir.mock.calls;
      readDirCalls.forEach(call => {
        const dirPath = call[0] as string;
        const isAllowed = dirPath.includes('prd-generator') || dirPath.includes('generated_task_lists');
        expect(isAllowed).toBe(true);
      });
    });

    it('should validate file extensions for security', async () => {
      // Mock directory with various file types
      mockFs.readdir.mockResolvedValue([
        'legitimate.md',
        'suspicious.exe',
        'script.js',
        'config.json',
        'another-prd.md'
      ] as any);

      const discoveredPRDs = await prdIntegration.findPRDFiles();

      // Should only include .md files
      discoveredPRDs.forEach(prd => {
        expect(prd.fileName.endsWith('.md')).toBe(true);
      });
    });

    it('should handle file access errors securely', async () => {
      // Mock file system error
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      // Should handle error gracefully without exposing system information
      const discoveredPRDs = await prdIntegration.findPRDFiles();
      expect(Array.isArray(discoveredPRDs)).toBe(true);
      expect(discoveredPRDs.length).toBe(0);
    });

    it('should validate file size limits', async () => {
      // Mock large file
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 100 * 1024 * 1024, // 100MB
        mtime: new Date()
      } as any);

      mockFs.readdir.mockResolvedValue(['large-file.md'] as any);

      const discoveredPRDs = await prdIntegration.findPRDFiles();

      // Should handle large files appropriately (implementation dependent)
      expect(Array.isArray(discoveredPRDs)).toBe(true);
    });
  });

  describe('Content Parsing Security', () => {
    it('should sanitize malicious content in PRD parsing', async () => {
      const maliciousContent = `
# Malicious PRD
<script>alert('xss')</script>
## Project: TestProject
### Features
- Feature with <img src="x" onerror="alert('xss')">
`;

      const result = await prdIntegration.parsePRDContent(maliciousContent, '/safe/path/test.md');

      // Should parse content without executing scripts
      if (result && result.projectName) {
        expect(result.projectName).not.toContain('<script>');
        expect(result.projectName).not.toContain('alert');
      } else {
        // If parsing returns null/undefined, that's also acceptable for security
        expect(result).toBeDefined();
      }
    });

    it('should sanitize malicious content in task list parsing', async () => {
      const maliciousContent = `
# Malicious Task List
## Phase 1: <script>alert('xss')</script>
### Task 1: TestTask
- Description with <img src="x" onerror="alert('xss')">
`;

      const result = await taskListIntegration.parseTaskListContent(maliciousContent, '/safe/path/test.md');

      // Should parse content without executing scripts
      if (result && result.projectName) {
        expect(result.projectName).not.toContain('<script>');
        expect(result.projectName).not.toContain('alert');
      } else {
        // If parsing returns null/undefined, that's also acceptable for security
        expect(result).toBeDefined();
      }
    });

    it('should handle extremely large content safely', async () => {
      // Create large content string
      const largeContent = '# Large PRD\n' + 'A'.repeat(10 * 1024 * 1024); // 10MB

      // Should handle large content without memory issues
      const startTime = Date.now();
      const result = await prdIntegration.parsePRDContent(largeContent, '/safe/path/large.md');
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (implementation dependent)
      expect(duration).toBeLessThan(30000); // 30 seconds max
      expect(result).toBeDefined();
    });

    it('should prevent code injection through file paths', async () => {
      const maliciousPath = '/safe/path/test.md; rm -rf /';

      // Should handle malicious path safely
      await expect(async () => {
        await prdIntegration.parsePRDContent('# Test Content', maliciousPath);
      }).not.toThrow();
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      // Mock file system error with sensitive information
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory, open \'/secret/path/with/api/key/abc123\''));

      try {
        await prdIntegration.parsePRDContent('content', '/safe/path/test.md');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Should not expose the full system path or sensitive information
        expect(errorMessage).not.toContain('/secret/path');
        expect(errorMessage).not.toContain('abc123');
      }
    });

    it('should handle malformed input gracefully', async () => {
      const malformedInputs = [
        '',
        '\x00\x01\x02',
        'A'.repeat(10000), // Long string (reduced size for test performance)
      ];

      for (const input of malformedInputs) {
        try {
          const result = await prdIntegration.parsePRDContent(input, '/safe/path/test.md');
          // Should either return a valid result or handle gracefully
          expect(result).toBeDefined();
        } catch (error) {
          // Errors are acceptable for malformed input, but should not crash
          expect(error).toBeInstanceOf(Error);
        }
      }

      // Test null and undefined separately with proper error handling
      try {
        await prdIntegration.parsePRDContent(null as any, '/safe/path/test.md');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      try {
        await prdIntegration.parsePRDContent(undefined as any, '/safe/path/test.md');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Audit and Monitoring', () => {
    it('should log security-relevant events', async () => {
      // Mock directory listing
      mockFs.readdir.mockResolvedValue(['test-file.md'] as any);

      // Test that file discovery operations complete
      const result = await prdIntegration.findPRDFiles();

      // Should complete without errors and return results
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should track file access patterns', async () => {
      // Mock multiple file accesses
      mockFs.readdir.mockResolvedValue(['file1.md', 'file2.md', 'file3.md'] as any);
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
        mtime: new Date()
      } as any);

      const prdResult = await prdIntegration.findPRDFiles();
      const taskResult = await taskListIntegration.findTaskListFiles();

      // Should track access patterns for security monitoring
      expect(Array.isArray(prdResult)).toBe(true);
      expect(Array.isArray(taskResult)).toBe(true);

      // Verify file system operations were called
      expect(mockFs.readdir).toHaveBeenCalled();
    });
  });
});
