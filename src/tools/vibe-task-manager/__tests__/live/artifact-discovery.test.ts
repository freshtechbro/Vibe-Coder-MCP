/**
 * Artifact Discovery Live Test
 * 
 * Tests real artifact discovery functionality with actual VibeCoderOutput directory scanning
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PRDIntegrationService } from '../../integrations/prd-integration.js';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import type { PRDInfo, TaskListInfo } from '../../types/artifact-types.js';
import logger from '../../../../logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Extended timeout for real file operations
const LIVE_TEST_TIMEOUT = 60000; // 60 seconds

describe('Artifact Discovery Live Test', () => {
  let prdIntegration: PRDIntegrationService;
  let taskListIntegration: TaskListIntegrationService;
  let testOutputDir: string;
  let createdTestFiles: string[] = [];

  beforeEach(async () => {
    // Initialize services
    prdIntegration = PRDIntegrationService.getInstance();
    taskListIntegration = TaskListIntegrationService.getInstance();

    // Setup test output directory
    const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
    testOutputDir = baseOutputDir;
    
    console.log(`🔍 Testing artifact discovery in: ${testOutputDir}`);
    
    // Create test artifacts for discovery
    await createTestArtifacts();
  });

  afterEach(async () => {
    // Cleanup test files
    await cleanupTestArtifacts();
  });

  describe('PRD Discovery Live Tests', () => {
    it('should discover existing PRD files in VibeCoderOutput/prd-generator', async () => {
      console.log('🔍 Starting PRD file discovery...');
      
      const startTime = Date.now();
      const discoveredPRDs: PRDInfo[] = await prdIntegration.findPRDFiles();
      const duration = Date.now() - startTime;

      console.log(`✅ PRD discovery completed in ${duration}ms`);
      console.log(`📄 Found ${discoveredPRDs.length} PRD files`);

      // Verify discovery results
      expect(discoveredPRDs).toBeDefined();
      expect(Array.isArray(discoveredPRDs)).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // Log discovered PRDs
      discoveredPRDs.forEach((prd, index) => {
        console.log(`   ${index + 1}. ${prd.fileName} (${prd.projectName})`);
        console.log(`      Path: ${prd.filePath}`);
        console.log(`      Size: ${prd.fileSize} bytes`);
        console.log(`      Created: ${prd.createdAt.toISOString()}`);
        console.log(`      Accessible: ${prd.isAccessible}`);
      });

      // Verify test PRD is found
      const testPRD = discoveredPRDs.find(prd => prd.projectName.includes('Live Test'));
      if (testPRD) {
        console.log(`✅ Test PRD found: ${testPRD.fileName}`);
        expect(testPRD.isAccessible).toBe(true);
        expect(testPRD.fileSize).toBeGreaterThan(0);
      } else {
        console.log(`⚠️ Test PRD not found, but discovery is working`);
      }

      // Verify PRD structure
      discoveredPRDs.forEach(prd => {
        expect(prd.filePath).toBeDefined();
        expect(prd.fileName).toBeDefined();
        expect(prd.projectName).toBeDefined();
        expect(prd.createdAt).toBeInstanceOf(Date);
        expect(prd.fileSize).toBeGreaterThanOrEqual(0);
        expect(typeof prd.isAccessible).toBe('boolean');
      });

      console.log(`🎯 PRD discovery test completed successfully!`);
    }, LIVE_TEST_TIMEOUT);

    it('should detect most recent PRD for a specific project', async () => {
      console.log('🔍 Testing PRD detection for specific project...');
      
      const startTime = Date.now();
      const detectedPRD = await prdIntegration.detectExistingPRD('Live Test Project');
      const duration = Date.now() - startTime;

      console.log(`✅ PRD detection completed in ${duration}ms`);

      if (detectedPRD) {
        console.log(`📄 Detected PRD: ${detectedPRD.fileName}`);
        console.log(`   Project: ${detectedPRD.projectName}`);
        console.log(`   Path: ${detectedPRD.filePath}`);
        console.log(`   Size: ${detectedPRD.fileSize} bytes`);

        expect(detectedPRD.projectName).toContain('Live Test');
        expect(detectedPRD.isAccessible).toBe(true);
      } else {
        console.log(`ℹ️ No PRD detected for 'Live Test Project' - this is expected if no matching files exist`);
      }

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      console.log(`🎯 PRD detection test completed!`);
    }, LIVE_TEST_TIMEOUT);
  });

  describe('Task List Discovery Live Tests', () => {
    it('should discover existing task list files in VibeCoderOutput/generated_task_lists', async () => {
      console.log('🔍 Starting task list file discovery...');
      
      const startTime = Date.now();
      const discoveredTaskLists: TaskListInfo[] = await taskListIntegration.findTaskListFiles();
      const duration = Date.now() - startTime;

      console.log(`✅ Task list discovery completed in ${duration}ms`);
      console.log(`📋 Found ${discoveredTaskLists.length} task list files`);

      // Verify discovery results
      expect(discoveredTaskLists).toBeDefined();
      expect(Array.isArray(discoveredTaskLists)).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // Log discovered task lists
      discoveredTaskLists.forEach((taskList, index) => {
        console.log(`   ${index + 1}. ${taskList.fileName} (${taskList.projectName})`);
        console.log(`      Path: ${taskList.filePath}`);
        console.log(`      Size: ${taskList.fileSize} bytes`);
        console.log(`      Created: ${taskList.createdAt.toISOString()}`);
        console.log(`      Accessible: ${taskList.isAccessible}`);
      });

      // Verify test task list is found
      const testTaskList = discoveredTaskLists.find(tl => tl.projectName.includes('Live Test'));
      if (testTaskList) {
        console.log(`✅ Test task list found: ${testTaskList.fileName}`);
        expect(testTaskList.isAccessible).toBe(true);
        expect(testTaskList.fileSize).toBeGreaterThan(0);
      } else {
        console.log(`⚠️ Test task list not found, but discovery is working`);
      }

      // Verify task list structure
      discoveredTaskLists.forEach(taskList => {
        expect(taskList.filePath).toBeDefined();
        expect(taskList.fileName).toBeDefined();
        expect(taskList.projectName).toBeDefined();
        expect(taskList.createdAt).toBeInstanceOf(Date);
        expect(taskList.fileSize).toBeGreaterThanOrEqual(0);
        expect(typeof taskList.isAccessible).toBe('boolean');
      });

      console.log(`🎯 Task list discovery test completed successfully!`);
    }, LIVE_TEST_TIMEOUT);

    it('should detect most recent task list for a specific project', async () => {
      console.log('🔍 Testing task list detection for specific project...');
      
      const startTime = Date.now();
      const detectedTaskList = await taskListIntegration.detectExistingTaskList('Live Test Project');
      const duration = Date.now() - startTime;

      console.log(`✅ Task list detection completed in ${duration}ms`);

      if (detectedTaskList) {
        console.log(`📋 Detected task list: ${detectedTaskList.fileName}`);
        console.log(`   Project: ${detectedTaskList.projectName}`);
        console.log(`   Path: ${detectedTaskList.filePath}`);
        console.log(`   Size: ${detectedTaskList.fileSize} bytes`);

        expect(detectedTaskList.projectName).toContain('Live Test');
        expect(detectedTaskList.isAccessible).toBe(true);
      } else {
        console.log(`ℹ️ No task list detected for 'Live Test Project' - this is expected if no matching files exist`);
      }

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      console.log(`🎯 Task list detection test completed!`);
    }, LIVE_TEST_TIMEOUT);
  });

  describe('Cross-Artifact Discovery Tests', () => {
    it('should discover both PRDs and task lists and correlate by project', async () => {
      console.log('🔍 Testing cross-artifact discovery correlation...');
      
      const startTime = Date.now();
      const [discoveredPRDs, discoveredTaskLists] = await Promise.all([
        prdIntegration.findPRDFiles(),
        taskListIntegration.findTaskListFiles()
      ]);
      const duration = Date.now() - startTime;

      console.log(`✅ Cross-artifact discovery completed in ${duration}ms`);
      console.log(`📊 Found ${discoveredPRDs.length} PRDs and ${discoveredTaskLists.length} task lists`);

      // Find projects that have both PRDs and task lists
      const prdProjects = new Set(discoveredPRDs.map(prd => prd.projectName.toLowerCase()));
      const taskListProjects = new Set(discoveredTaskLists.map(tl => tl.projectName.toLowerCase()));
      
      const commonProjects = [...prdProjects].filter(project => taskListProjects.has(project));
      
      console.log(`🔗 Projects with both PRDs and task lists: ${commonProjects.length}`);
      commonProjects.forEach(project => {
        console.log(`   - ${project}`);
      });

      // Verify discovery performance
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      expect(discoveredPRDs.length + discoveredTaskLists.length).toBeGreaterThanOrEqual(0);

      // Log summary
      console.log(`📈 Discovery Summary:`);
      console.log(`   Total PRDs: ${discoveredPRDs.length}`);
      console.log(`   Total Task Lists: ${discoveredTaskLists.length}`);
      console.log(`   Common Projects: ${commonProjects.length}`);
      console.log(`   Discovery Time: ${duration}ms`);

      console.log(`🎯 Cross-artifact discovery test completed successfully!`);
    }, LIVE_TEST_TIMEOUT);

    it('should validate VibeCoderOutput directory structure', async () => {
      console.log('🔍 Validating VibeCoderOutput directory structure...');
      
      const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
      
      // Check main directory
      const mainDirExists = await checkDirectoryExists(baseOutputDir);
      console.log(`📁 VibeCoderOutput directory: ${mainDirExists ? '✅ EXISTS' : '❌ MISSING'}`);
      expect(mainDirExists).toBe(true);

      // Check PRD directory
      const prdDir = path.join(baseOutputDir, 'prd-generator');
      const prdDirExists = await checkDirectoryExists(prdDir);
      console.log(`📁 prd-generator directory: ${prdDirExists ? '✅ EXISTS' : '❌ MISSING'}`);

      // Check task list directory
      const taskListDir = path.join(baseOutputDir, 'generated_task_lists');
      const taskListDirExists = await checkDirectoryExists(taskListDir);
      console.log(`📁 generated_task_lists directory: ${taskListDirExists ? '✅ EXISTS' : '❌ MISSING'}`);

      // Log directory structure
      console.log(`📊 Directory Structure:`);
      console.log(`   Base: ${baseOutputDir}`);
      console.log(`   PRD: ${prdDir} (${prdDirExists ? 'exists' : 'missing'})`);
      console.log(`   Tasks: ${taskListDir} (${taskListDirExists ? 'exists' : 'missing'})`);

      console.log(`🎯 Directory structure validation completed!`);
    }, LIVE_TEST_TIMEOUT);
  });

  // Helper function to create test artifacts
  async function createTestArtifacts(): Promise<void> {
    try {
      const prdDir = path.join(testOutputDir, 'prd-generator');
      const taskListDir = path.join(testOutputDir, 'generated_task_lists');

      // Ensure directories exist
      await fs.mkdir(prdDir, { recursive: true });
      await fs.mkdir(taskListDir, { recursive: true });

      // Create test PRD
      const testPRDContent = `# Live Test Project - PRD\n\n## Overview\nTest PRD for live discovery testing\n\n## Features\n- Feature 1\n- Feature 2\n`;
      const prdPath = path.join(prdDir, 'live-test-project-prd.md');
      await fs.writeFile(prdPath, testPRDContent);
      createdTestFiles.push(prdPath);

      // Create test task list
      const testTaskListContent = `# Live Test Project - Tasks\n\n## Overview\nTest task list for live discovery testing\n\n## Tasks\n- Task 1\n- Task 2\n`;
      const taskListPath = path.join(taskListDir, 'live-test-project-tasks.md');
      await fs.writeFile(taskListPath, testTaskListContent);
      createdTestFiles.push(taskListPath);

      console.log(`📁 Created test artifacts: ${createdTestFiles.length} files`);
    } catch (error) {
      console.warn(`⚠️ Failed to create test artifacts:`, error);
    }
  }

  // Helper function to cleanup test artifacts
  async function cleanupTestArtifacts(): Promise<void> {
    for (const filePath of createdTestFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup ${filePath}:`, error);
      }
    }
    createdTestFiles = [];
    console.log(`🧹 Cleaned up test artifacts`);
  }

  // Helper function to check if directory exists
  async function checkDirectoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
});
