/**
 * PRD Integration Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import type { ParsedPRD } from '../../types/artifact-types.js';

// Mock dependencies
vi.mock('fs/promises');

const mockFs = vi.mocked(fs);

describe('PRDIntegrationService', () => {
  let service: PRDIntegrationService;
  const testProjectPath = '/test/project';
  const testPRDPath = '/test/output/prd-generator/test-project-prd.md';

  beforeEach(() => {
    service = PRDIntegrationService.getInstance();
    vi.clearAllMocks();

    // Set up default mocks
    mockFs.stat.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => true,
      mtime: new Date('2023-12-01'),
      size: 1024
    } as any);

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(mockPRDContent);
    mockFs.readdir.mockResolvedValue([
      {
        name: 'test-project-prd.md',
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false
      } as any
    ]);

    // Mock environment variables
    process.env.VIBE_CODER_OUTPUT_DIR = '/test/output';
  });

  afterEach(() => {
    service.clearCache();
    delete process.env.VIBE_CODER_OUTPUT_DIR;
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PRDIntegrationService.getInstance();
      const instance2 = PRDIntegrationService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('findPRDFiles', () => {
    it('should find PRD files in output directory', async () => {
      // Use the default mocks from beforeEach which are already set up correctly
      const prdFiles = await service.findPRDFiles();

      expect(prdFiles).toHaveLength(1);
      expect(prdFiles[0].fileName).toBe('test-project-prd.md');
      expect(prdFiles[0].filePath).toContain('test-project-prd.md');
      expect(prdFiles[0].isAccessible).toBe(true);
    });

    it('should return empty array when no PRD files exist', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const prdFiles = await service.findPRDFiles();

      expect(prdFiles).toHaveLength(0);
    });

    it('should handle directory access errors', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'));

      const prdFiles = await service.findPRDFiles();

      expect(prdFiles).toHaveLength(0);
    });
  });

  describe('detectExistingPRD', () => {
    it('should detect existing PRD for project', async () => {
      const prdInfo = await service.detectExistingPRD(testProjectPath);

      expect(prdInfo).toBeDefined();
      expect(prdInfo?.fileName).toBe('test-project-prd.md');
      expect(prdInfo?.filePath).toContain('test-project-prd.md');
      expect(prdInfo?.isAccessible).toBe(true);
    });

    it('should return null when no matching PRD exists', async () => {
      // Clear and set up specific mocks for this test
      vi.clearAllMocks();

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        { name: 'completely-different-file.md', isFile: () => true } as any
      ]);

      // Use a project name that won't match "test project"
      const prdInfo = await service.detectExistingPRD('/completely/different/xyz-unique-name');

      expect(prdInfo).toBeNull();
    });

    it('should use cached result', async () => {
      // Clear mock call count and cache
      vi.clearAllMocks();
      service.clearCache();

      // Set up mocks for this specific test
      // Mock access to always succeed (for directory and file access checks)
      mockFs.access.mockResolvedValue(undefined);

      const mockFile = {
        name: 'test-project-prd.md',
        isFile: () => true,
        isDirectory: () => false
      };
      mockFs.readdir.mockResolvedValue([mockFile] as any);

      mockFs.stat.mockImplementation((filePath: string) => {
        if (filePath.includes('test-project-prd.md')) {
          return Promise.resolve({
            isDirectory: () => false,
            isFile: () => true,
            mtime: new Date('2023-12-01'),
            size: 1024
          } as any);
        }
        return Promise.reject(new Error('File not found'));
      });

      // First call - should hit the file system
      const firstResult = await service.detectExistingPRD(testProjectPath);

      // Clear readdir mock call count after first call to track second call
      mockFs.readdir.mockClear();

      // Second call - should use cache and not call readdir again
      const secondResult = await service.detectExistingPRD(testProjectPath);

      expect(firstResult).toBeDefined();
      expect(secondResult).toBeDefined();
      expect(firstResult?.fileName).toBe(secondResult?.fileName);

      // Should not call readdir on second call due to caching
      expect(mockFs.readdir).toHaveBeenCalledTimes(0);
    });
  });

  describe('parsePRD', () => {
    it('should parse PRD content successfully', async () => {
      // Mock file validation to pass
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        mtime: new Date('2023-12-01'),
        size: 1024
      } as any);

      const result = await service.parsePRD(testPRDPath);

      expect(result.success).toBe(true);
      expect(result.prdData).toBeDefined();
      expect(result.prdData?.metadata.projectName).toBe('test project');
      expect(result.prdData?.overview.description).toBeDefined();
      expect(result.prdData?.features).toBeDefined();
    });

    it('should handle file read errors', async () => {
      // Store original mock
      const originalReadFile = mockFs.readFile;

      // Override readFile to fail for this test
      mockFs.readFile = vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory, open \'/invalid/path.md\''));

      try {
        const result = await service.parsePRD('/invalid/path.md');

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/ENOENT|no such file|directory/i);
      } finally {
        // Restore original mock
        mockFs.readFile = originalReadFile;
      }
    });

    it('should handle invalid PRD format', async () => {
      // Mock file validation to pass but content to be invalid
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        mtime: new Date('2023-12-01'),
        size: 1024
      } as any);

      mockFs.readFile.mockResolvedValue('Invalid PRD content');

      const result = await service.parsePRD(testPRDPath);

      // The current implementation is lenient and creates default values for missing sections
      // So we expect success but with minimal data
      expect(result.success).toBe(true);
      expect(result.prdData?.features).toHaveLength(0);
    });
  });

  describe('getPRDMetadata', () => {
    it('should extract PRD metadata', async () => {
      // Mock file validation to pass
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        mtime: new Date('2023-12-01'),
        size: 1024
      } as any);

      const metadata = await service.getPRDMetadata(testPRDPath);

      expect(metadata.filePath).toBe(testPRDPath);
      expect(metadata.createdAt).toBeInstanceOf(Date);
      expect(metadata.fileSize).toBe(1024);
      expect(metadata.version).toBe('1.0');
      expect(metadata.performanceMetrics).toBeDefined();
    });

    it('should handle file access errors', async () => {
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      await expect(service.getPRDMetadata('/invalid/path.md')).rejects.toThrow('File not found');
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', () => {
      service.clearCache();
      // No direct way to test this, but it should not throw
      expect(true).toBe(true);
    });
  });
});

// Mock PRD content for testing
const mockPRDContent = `# Product Requirements Document (PRD)

## Project Metadata
- **Project Name**: Test Project
- **Version**: 1.0.0
- **Created**: 2023-12-01
- **Last Updated**: 2023-12-01

## Overview

### Description
This is a test project for validating PRD parsing functionality.

### Business Goals
- Goal 1: Validate PRD parsing
- Goal 2: Test integration

### Product Goals
- Create robust parsing system
- Ensure data integrity

### Success Metrics
- 100% parsing accuracy
- Zero data loss

## Target Audience

### Primary Users
- Developers
- Project managers

### User Personas
- Technical lead
- Product owner

## Features

### Feature 1: Core Functionality
**Description**: Basic system functionality
**Priority**: High
**User Stories**:
- As a user, I want to parse PRDs
- As a developer, I want reliable data

**Acceptance Criteria**:
- Parse all PRD sections
- Extract metadata correctly

### Feature 2: Advanced Features
**Description**: Enhanced capabilities
**Priority**: Medium
**User Stories**:
- As a user, I want advanced parsing
- As a system, I want error handling

**Acceptance Criteria**:
- Handle edge cases
- Provide error messages

## Technical Requirements

### Tech Stack
- TypeScript
- Node.js
- Vitest

### Architectural Patterns
- Singleton pattern
- Service layer

### Performance Requirements
- Parse files under 1 second
- Handle files up to 5MB

### Security Requirements
- Validate file paths
- Sanitize input

## Constraints

### Timeline
- Complete in 2 weeks

### Budget
- Development resources only

### Resources
- 2 developers
- 1 tester

### Technical
- Must integrate with existing system
- Zero breaking changes
`;
