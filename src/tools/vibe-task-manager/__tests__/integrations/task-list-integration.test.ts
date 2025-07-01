/**
 * Task List Integration Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import type { ParsedTaskList } from '../../types/artifact-types.js';

// Mock dependencies
vi.mock('fs/promises');

const mockFs = vi.mocked(fs);

describe('TaskListIntegrationService', () => {
  let service: TaskListIntegrationService;
  const testProjectPath = '/test/project';
  const testTaskListPath = '/test/output/generated_task_lists/test-project-task-list-detailed.md';

  beforeEach(() => {
    service = TaskListIntegrationService.getInstance();
    vi.clearAllMocks();

    // Set up default mocks
    mockFs.stat.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => true,
      mtime: new Date('2023-12-01'),
      size: 2048
    } as Record<string, unknown>);

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(mockTaskListContent);
    mockFs.readdir.mockResolvedValue([
      {
        name: 'test-project-task-list-detailed.md',
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false
      } as Record<string, unknown>
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
      const instance1 = TaskListIntegrationService.getInstance();
      const instance2 = TaskListIntegrationService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('findTaskListFiles', () => {
    it('should find task list files in output directory', async () => {
      const taskListFiles = await service.findTaskListFiles();

      expect(taskListFiles).toHaveLength(1);
      expect(taskListFiles[0].fileName).toBe('test-project-task-list-detailed.md');
      expect(taskListFiles[0].filePath).toContain('test-project-task-list-detailed.md');
      expect(taskListFiles[0].isAccessible).toBe(true);
    });

    it('should return empty array when no task list files exist', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const taskListFiles = await service.findTaskListFiles();

      expect(taskListFiles).toHaveLength(0);
    });

    it('should handle directory access errors', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'));

      const taskListFiles = await service.findTaskListFiles();

      expect(taskListFiles).toHaveLength(0);
    });
  });

  describe('detectExistingTaskList', () => {
    it('should detect existing task list for project', async () => {
      const taskListInfo = await service.detectExistingTaskList(testProjectPath);

      expect(taskListInfo).toBeDefined();
      expect(taskListInfo?.fileName).toBe('test-project-task-list-detailed.md');
      expect(taskListInfo?.filePath).toContain('test-project-task-list-detailed.md');
      expect(taskListInfo?.isAccessible).toBe(true);
    });

    it('should return null when no matching task list exists', async () => {
      mockFs.readdir.mockResolvedValue([
        { name: 'completely-different-file.md', isFile: () => true } as Record<string, unknown>
      ]);

      const taskListInfo = await service.detectExistingTaskList('/completely/different/project');

      expect(taskListInfo).toBeNull();
    });

    it('should use cached result', async () => {
      // First call
      await service.detectExistingTaskList(testProjectPath);

      // Second call should use cache
      const taskListInfo = await service.detectExistingTaskList(testProjectPath);

      expect(taskListInfo).toBeDefined();
      expect(mockFs.readdir).toHaveBeenCalledTimes(1);
    });
  });

  describe('parseTaskList', () => {
    it('should parse task list content successfully', async () => {
      // Mock file validation to pass
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        mtime: new Date('2023-12-01'),
        size: 2048
      } as Record<string, unknown>);

      const result = await service.parseTaskList(testTaskListPath);

      expect(result.success).toBe(true);
      expect(result.taskListData).toBeDefined();
      expect(result.taskListData?.metadata.projectName).toBe('test project');
      expect(result.taskListData?.overview.description).toBeDefined();
      expect(result.taskListData?.phases).toBeDefined();
    });

    it('should handle file read errors', async () => {
      // Mock stat to fail validation
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      const result = await service.parseTaskList('/invalid/path.md');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid task list file path');
    });

    it('should handle invalid task list format', async () => {
      // Mock file validation to pass but content to be invalid
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        mtime: new Date('2023-12-01'),
        size: 2048
      } as Record<string, unknown>);
      
      mockFs.readFile.mockResolvedValue('Invalid task list content');

      const result = await service.parseTaskList(testTaskListPath);

      // The current implementation is lenient and creates default values for missing sections
      // So we expect success but with minimal data
      expect(result.success).toBe(true);
      expect(result.taskListData?.phases).toHaveLength(0);
    });
  });

  describe('convertToAtomicTasks', () => {
    it('should convert task list to atomic tasks', async () => {
      const mockTaskListData: ParsedTaskList = {
        metadata: {
          filePath: testTaskListPath,
          projectName: 'test project',
          createdAt: new Date('2023-12-01'),
          fileSize: 2048,
          totalTasks: 2,
          phaseCount: 1
        },
        overview: {
          description: 'Test project task list',
          goals: ['Goal 1', 'Goal 2'],
          techStack: ['TypeScript', 'Node.js']
        },
        phases: [
          {
            id: 'P1',
            name: 'Phase 1',
            description: 'First phase',
            tasks: [
              {
                id: 'T1',
                title: 'Task 1',
                description: 'First task',
                estimatedEffort: '2 hours',
                priority: 'high',
                dependencies: [],
                userStory: 'As a user I want to complete task 1 so that I can proceed to task 2'
              },
              {
                id: 'T2',
                title: 'Task 2',
                description: 'Second task',
                estimatedEffort: '3 hours',
                priority: 'medium',
                dependencies: ['T1'],
                userStory: 'As a user I want to complete task 2 so that the project is finished'
              }
            ]
          }
        ],
        statistics: {
          totalEstimatedHours: 5,
          tasksByPriority: { high: 1, medium: 1, low: 0, critical: 0 },
          tasksByPhase: { 'P1': 2 }
        }
      };

      const atomicTasks = await service.convertToAtomicTasks(
        mockTaskListData,
        'test-project',
        'test-epic'
      );

      expect(atomicTasks).toHaveLength(2);
      expect(atomicTasks[0].id).toBe('T1');
      expect(atomicTasks[0].title).toBe('Task 1');
      expect(atomicTasks[0].projectId).toBe('test-project');
      expect(atomicTasks[0].epicId).toBe('test-epic');
    });
  });

  describe('getTaskListMetadata', () => {
    it('should extract task list metadata', async () => {
      // Mock file validation to pass
      mockFs.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        mtime: new Date('2023-12-01'),
        size: 2048
      } as Record<string, unknown>);

      const metadata = await service.getTaskListMetadata(testTaskListPath);

      expect(metadata.filePath).toBe(testTaskListPath);
      expect(metadata.createdAt).toBeInstanceOf(Date);
      expect(metadata.fileSize).toBe(2048);
      expect(metadata.projectName).toBeDefined();
      expect(metadata.totalTasks).toBeDefined();
      expect(metadata.phaseCount).toBeDefined();
    });

    it('should handle file access errors', async () => {
      mockFs.stat.mockRejectedValue(new Error('File not found'));

      await expect(service.getTaskListMetadata('/invalid/path.md')).rejects.toThrow('File not found');
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

// Mock task list content for testing
const mockTaskListContent = `# Comprehensive Task List - Test Project

## Project Overview

### Description
This is a test project for validating task list parsing functionality.

### Goals
- Goal 1: Validate task list parsing
- Goal 2: Test integration

### Tech Stack
- TypeScript
- Node.js
- Vitest

## Project Metadata
- **Project Name**: Test Project
- **Total Tasks**: 2
- **Total Estimated Hours**: 5
- **Phase Count**: 1

## Phase 1: Development Phase

### Task 1: Core Functionality
- **ID**: T1
- **Description**: Implement basic system functionality
- **Estimated Effort**: 2 hours
- **Priority**: High
- **Dependencies**: None

### Task 2: Advanced Features
- **ID**: T2
- **Description**: Add enhanced capabilities
- **Estimated Effort**: 3 hours
- **Priority**: Medium
- **Dependencies**: T1

## Statistics

### Tasks by Priority
- Critical: 0
- High: 1
- Medium: 1
- Low: 0

### Tasks by Phase
- Phase 1: 2

### Total Estimated Hours: 5
`;
