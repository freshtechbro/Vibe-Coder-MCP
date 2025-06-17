/**
 * Artifact Import Integration Tests for Vibe Task Manager
 * Tests PRD and Task List import functionality with real file operations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import { ProjectOperations } from '../../core/operations/project-operations.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import type { ParsedPRD, ParsedTaskList, ProjectContext } from '../../types/index.js';
import logger from '../../../../logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Test timeout for real file operations
const TEST_TIMEOUT = 60000; // 60 seconds

describe('Vibe Task Manager - Artifact Import Integration Tests', () => {
  let prdIntegration: PRDIntegrationService;
  let taskListIntegration: TaskListIntegrationService;
  let projectOps: ProjectOperations;
  let testOutputDir: string;
  let mockPRDPath: string;
  let mockTaskListPath: string;

  beforeAll(async () => {
    // Initialize services
    prdIntegration = PRDIntegrationService.getInstance();
    taskListIntegration = TaskListIntegrationService.getInstance();
    projectOps = new ProjectOperations();

    // Setup test output directory
    const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
    testOutputDir = path.join(baseOutputDir, 'test-artifacts');
    
    await fs.mkdir(testOutputDir, { recursive: true });
    await fs.mkdir(path.join(testOutputDir, 'prd-generator'), { recursive: true });
    await fs.mkdir(path.join(testOutputDir, 'generated_task_lists'), { recursive: true });

    // Create test artifacts
    await createTestArtifacts();

    logger.info('Starting artifact import integration tests');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test files
    try {
      await cleanupTestArtifacts();
    } catch (error) {
      logger.warn({ err: error }, 'Error during cleanup');
    }
  });

  describe('1. PRD Import Integration', () => {
    it('should discover PRD files in VibeCoderOutput directory', async () => {
      const startTime = Date.now();
      const discoveredPRDs = await prdIntegration.findPRDFiles();
      const duration = Date.now() - startTime;

      expect(discoveredPRDs).toBeDefined();
      expect(Array.isArray(discoveredPRDs)).toBe(true);
      expect(discoveredPRDs.length).toBeGreaterThanOrEqual(1);
      expect(duration).toBeLessThan(5000);

      // Verify test PRD is found
      const testPRD = discoveredPRDs.find(prd => prd.projectName.includes('Integration Test'));
      expect(testPRD).toBeDefined();
      expect(testPRD!.filePath).toContain('integration-test-prd.md');

      logger.info({
        discoveredPRDs: discoveredPRDs.length,
        testPRDFound: !!testPRD,
        duration
      }, 'PRD file discovery completed');
    });

    it('should parse PRD content successfully', async () => {
      const prdContent = await fs.readFile(mockPRDPath, 'utf-8');
      
      const startTime = Date.now();
      const parsedPRD: ParsedPRD = await prdIntegration.parsePRDContent(prdContent, mockPRDPath);
      const duration = Date.now() - startTime;

      expect(parsedPRD).toBeDefined();
      expect(parsedPRD.projectName).toBe('Integration Test Project');
      expect(parsedPRD.features).toBeDefined();
      expect(parsedPRD.features.length).toBeGreaterThan(0);
      expect(parsedPRD.technicalRequirements).toBeDefined();
      expect(duration).toBeLessThan(3000);

      logger.info({
        projectName: parsedPRD.projectName,
        featuresCount: parsedPRD.features.length,
        technicalReqsCount: Object.keys(parsedPRD.technicalRequirements).length,
        duration
      }, 'PRD content parsed successfully');
    });

    it('should create project context from PRD', async () => {
      const prdContent = await fs.readFile(mockPRDPath, 'utf-8');
      const parsedPRD = await prdIntegration.parsePRDContent(prdContent, mockPRDPath);

      const startTime = Date.now();
      const projectContext: ProjectContext = await projectOps.createProjectFromPRD(parsedPRD);
      const duration = Date.now() - startTime;

      expect(projectContext).toBeDefined();
      expect(projectContext.projectName).toBe('Integration Test Project');
      expect(projectContext.description).toContain('integration testing');
      expect(projectContext.languages).toContain('typescript');
      expect(projectContext.frameworks).toContain('react');
      expect(duration).toBeLessThan(2000);

      logger.info({
        projectName: projectContext.projectName,
        languages: projectContext.languages,
        frameworks: projectContext.frameworks,
        duration
      }, 'Project context created from PRD');
    });
  });

  describe('2. Task List Import Integration', () => {
    it('should discover task list files in VibeCoderOutput directory', async () => {
      const startTime = Date.now();
      const discoveredTaskLists = await taskListIntegration.findTaskListFiles();
      const duration = Date.now() - startTime;

      expect(discoveredTaskLists).toBeDefined();
      expect(Array.isArray(discoveredTaskLists)).toBe(true);
      expect(discoveredTaskLists.length).toBeGreaterThanOrEqual(1);
      expect(duration).toBeLessThan(5000);

      // Verify test task list is found
      const testTaskList = discoveredTaskLists.find(tl => tl.projectName.includes('Integration Test'));
      expect(testTaskList).toBeDefined();
      expect(testTaskList!.filePath).toContain('integration-test-tasks.md');

      logger.info({
        discoveredTaskLists: discoveredTaskLists.length,
        testTaskListFound: !!testTaskList,
        duration
      }, 'Task list file discovery completed');
    });

    it('should parse task list content successfully', async () => {
      const taskListContent = await fs.readFile(mockTaskListPath, 'utf-8');
      
      const startTime = Date.now();
      const parsedTaskList: ParsedTaskList = await taskListIntegration.parseTaskListContent(taskListContent, mockTaskListPath);
      const duration = Date.now() - startTime;

      expect(parsedTaskList).toBeDefined();
      expect(parsedTaskList.projectName).toBe('Integration Test Project');
      expect(parsedTaskList.phases).toBeDefined();
      expect(parsedTaskList.phases.length).toBeGreaterThan(0);
      expect(parsedTaskList.statistics).toBeDefined();
      expect(parsedTaskList.statistics.totalTasks).toBeGreaterThan(0);
      expect(duration).toBeLessThan(3000);

      logger.info({
        projectName: parsedTaskList.projectName,
        phasesCount: parsedTaskList.phases.length,
        totalTasks: parsedTaskList.statistics.totalTasks,
        totalHours: parsedTaskList.statistics.totalEstimatedHours,
        duration
      }, 'Task list content parsed successfully');
    });

    it('should convert task list to atomic tasks', async () => {
      const taskListContent = await fs.readFile(mockTaskListPath, 'utf-8');
      const parsedTaskList = await taskListIntegration.parseTaskListContent(taskListContent, mockTaskListPath);

      // Create project context for conversion
      const projectContext: ProjectContext = {
        projectPath: '/test/integration-project',
        projectName: 'Integration Test Project',
        description: 'Test project for integration testing',
        languages: ['typescript'],
        frameworks: ['react'],
        buildTools: ['npm'],
        tools: ['vscode'],
        configFiles: ['package.json'],
        entryPoints: ['src/index.ts'],
        architecturalPatterns: ['mvc'],
        codebaseSize: 'medium',
        teamSize: 2,
        complexity: 'medium',
        existingTasks: [],
        structure: {
          sourceDirectories: ['src'],
          testDirectories: ['src/__tests__'],
          docDirectories: ['docs'],
          buildDirectories: ['dist']
        },
        dependencies: {
          production: ['react'],
          development: ['typescript'],
          external: []
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          source: 'artifact-import-test' as const
        }
      };

      const startTime = Date.now();
      const atomicTasks = await taskListIntegration.convertToAtomicTasks(parsedTaskList, projectContext);
      const duration = Date.now() - startTime;

      expect(atomicTasks).toBeDefined();
      expect(Array.isArray(atomicTasks)).toBe(true);
      expect(atomicTasks.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000);

      // Validate atomic task structure
      atomicTasks.forEach(task => {
        expect(task.id).toBeDefined();
        expect(task.title).toBeDefined();
        expect(task.description).toBeDefined();
        expect(task.estimatedHours).toBeGreaterThan(0);
        expect(task.projectId).toBeDefined();
      });

      logger.info({
        atomicTasksCount: atomicTasks.length,
        totalEstimatedHours: atomicTasks.reduce((sum, t) => sum + t.estimatedHours, 0),
        duration
      }, 'Task list converted to atomic tasks');
    });
  });

  describe('3. Cross-Artifact Integration', () => {
    it('should handle PRD and task list from same project', async () => {
      // Parse both artifacts
      const prdContent = await fs.readFile(mockPRDPath, 'utf-8');
      const taskListContent = await fs.readFile(mockTaskListPath, 'utf-8');

      const parsedPRD = await prdIntegration.parsePRDContent(prdContent, mockPRDPath);
      const parsedTaskList = await taskListIntegration.parseTaskListContent(taskListContent, mockTaskListPath);

      // Verify they reference the same project
      expect(parsedPRD.projectName).toBe(parsedTaskList.projectName);
      expect(parsedPRD.projectName).toBe('Integration Test Project');

      // Create project context from PRD
      const projectContext = await projectOps.createProjectFromPRD(parsedPRD);

      // Convert task list using PRD-derived context
      const atomicTasks = await taskListIntegration.convertToAtomicTasks(parsedTaskList, projectContext);

      expect(atomicTasks.length).toBeGreaterThan(0);
      expect(atomicTasks.every(task => task.projectId === projectContext.projectName.toLowerCase().replace(/\s+/g, '-'))).toBe(true);

      logger.info({
        prdProjectName: parsedPRD.projectName,
        taskListProjectName: parsedTaskList.projectName,
        projectContextName: projectContext.projectName,
        atomicTasksGenerated: atomicTasks.length,
        crossArtifactIntegration: 'SUCCESS'
      }, 'Cross-artifact integration completed');
    });

    it('should validate artifact consistency', async () => {
      const config = await getVibeTaskManagerConfig();
      
      expect(config).toBeDefined();
      expect(prdIntegration).toBeDefined();
      expect(taskListIntegration).toBeDefined();
      expect(projectOps).toBeDefined();

      logger.info({
        configLoaded: !!config,
        prdIntegrationReady: !!prdIntegration,
        taskListIntegrationReady: !!taskListIntegration,
        projectOpsReady: !!projectOps,
        integrationStatus: 'READY'
      }, 'All artifact import components validated');
    });
  });

  // Helper function to create test artifacts
  async function createTestArtifacts(): Promise<void> {
    // Create test PRD
    const prdContent = `# Integration Test Project - Product Requirements Document

## Project Overview
**Project Name**: Integration Test Project
**Description**: A test project for integration testing of artifact import functionality

## Features
### 1. User Authentication
- Secure login system
- User registration
- Password reset functionality

### 2. Dashboard
- User dashboard with analytics
- Real-time data updates
- Customizable widgets

## Technical Requirements
- **Platform**: React with TypeScript
- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **Authentication**: JWT tokens
- **Testing**: Jest and React Testing Library

## Success Criteria
- Successful user authentication
- Responsive dashboard interface
- Comprehensive test coverage
`;

    // Create test task list
    const taskListContent = `# Integration Test Project - Task List

## Project Overview
**Project Name**: Integration Test Project
**Description**: Task breakdown for integration testing project

## Phase 1: Setup (8 hours)
### 1.1 Project Initialization (4 hours)
- Set up project structure
- Configure development environment
- Initialize Git repository

### 1.2 Authentication Setup (4 hours)
- Implement user authentication
- Set up JWT token management
- Create login/register forms

## Phase 2: Dashboard (12 hours)
### 2.1 Dashboard Components (6 hours)
- Create dashboard layout
- Implement data visualization
- Add responsive design

### 2.2 Real-time Features (6 hours)
- Set up WebSocket connections
- Implement real-time updates
- Add notification system

## Statistics
- **Total Tasks**: 4
- **Total Estimated Hours**: 20
- **Average Task Size**: 5 hours
- **Phases**: 2
`;

    mockPRDPath = path.join(testOutputDir, 'prd-generator', 'integration-test-prd.md');
    mockTaskListPath = path.join(testOutputDir, 'generated_task_lists', 'integration-test-tasks.md');

    await fs.writeFile(mockPRDPath, prdContent);
    await fs.writeFile(mockTaskListPath, taskListContent);

    logger.info({
      prdPath: mockPRDPath,
      taskListPath: mockTaskListPath
    }, 'Test artifacts created');
  }

  // Helper function to cleanup test artifacts
  async function cleanupTestArtifacts(): Promise<void> {
    try {
      if (mockPRDPath) await fs.unlink(mockPRDPath);
      if (mockTaskListPath) await fs.unlink(mockTaskListPath);
      await fs.rmdir(testOutputDir, { recursive: true });
      
      logger.info('Test artifacts cleaned up');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to cleanup test artifacts');
    }
  }
});
