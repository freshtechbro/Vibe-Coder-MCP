/**
 * Output Artifact Validation Test
 * Validates that all output artifacts are properly generated and saved
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DecompositionSummaryGenerator } from '../../services/decomposition-summary-generator.js';
import { getProjectOperations } from '../../core/operations/project-operations.js';
import { getTaskOperations } from '../../core/operations/task-operations.js';
import type { DecompositionSession } from '../../types/task.js';
import type { CreateProjectParams } from '../../core/operations/project-operations.js';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../../../logger.js';

describe('Output Artifact Validation', () => {
  let testProjectId: string;
  let testSession: DecompositionSession;
  let outputBaseDir: string;

  beforeEach(async () => {
    // Create test project
    const projectOps = getProjectOperations();
    const projectParams: CreateProjectParams = {
      name: `Artifact-Test-${Date.now()}`,
      description: 'Test project for artifact validation',
      techStack: {
        languages: ['typescript', 'javascript'],
        frameworks: ['react', 'node.js'],
        tools: ['npm', 'git']
      }
    };

    const projectResult = await projectOps.createProject(projectParams, 'artifact-test');
    expect(projectResult.success).toBe(true);
    testProjectId = projectResult.data!.id;

    // Create test tasks
    const taskOps = getTaskOperations();
    const tasks = [];
    
    for (let i = 1; i <= 3; i++) {
      const taskResult = await taskOps.createTask({
        title: `Test Task ${i}`,
        description: `Description for test task ${i}`,
        type: 'development',
        priority: 'medium',
        projectId: testProjectId,
        estimatedHours: 2 + i,
        acceptanceCriteria: [`Criterion ${i}.1`, `Criterion ${i}.2`],
        tags: [`task-${i}`, 'test']
      }, 'artifact-test');
      
      if (taskResult.success) {
        tasks.push(taskResult.data!);
      }
    }

    // Create mock decomposition session
    testSession = {
      id: `test-session-${Date.now()}`,
      projectId: testProjectId,
      status: 'completed',
      progress: 100,
      startTime: new Date(Date.now() - 60000), // 1 minute ago
      endTime: new Date(),
      results: [],
      processedTasks: tasks.length,
      totalTasks: tasks.length,
      currentDepth: 1,
      persistedTasks: tasks,
      taskFiles: tasks.map(t => `${t.id}.yaml`),
      richResults: {
        tasks,
        files: tasks.map(t => `${t.id}.yaml`),
        summary: {
          totalTasks: tasks.length,
          totalHours: tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
          projectId: testProjectId,
          successfullyPersisted: tasks.length,
          totalGenerated: tasks.length
        }
      }
    };

    outputBaseDir = path.join(process.cwd(), 'VibeCoderOutput', 'vibe-task-manager');
    logger.info({ testProjectId, sessionId: testSession.id }, 'Test setup completed');
  });

  afterEach(async () => {
    // Cleanup test project
    if (testProjectId) {
      try {
        const projectOps = getProjectOperations();
        await projectOps.deleteProject(testProjectId, 'artifact-test-cleanup');
        logger.info({ testProjectId }, 'Test project cleaned up');
      } catch (error) {
        logger.warn({ err: error, testProjectId }, 'Failed to cleanup test project');
      }
    }

    // Cleanup test output directories
    try {
      const sessionDir = path.join(outputBaseDir, 'decomposition-sessions', testSession.id);
      if (await fs.pathExists(sessionDir)) {
        await fs.remove(sessionDir);
        logger.info({ sessionDir }, 'Test output directory cleaned up');
      }
    } catch (error) {
      logger.warn({ err: error }, 'Failed to cleanup test output directory');
    }
  });

  it('should generate all required output artifacts', async () => {
    const summaryGenerator = new DecompositionSummaryGenerator();
    
    // Generate session summary with all artifacts
    const result = await summaryGenerator.generateSessionSummary(testSession);
    
    expect(result.success).toBe(true);
    expect(result.outputDirectory).toBeDefined();
    expect(result.generatedFiles).toBeDefined();
    expect(result.generatedFiles.length).toBeGreaterThan(0);

    logger.info({
      outputDirectory: result.outputDirectory,
      filesGenerated: result.generatedFiles.length,
      files: result.generatedFiles
    }, 'Summary generation completed');

    // Verify output directory exists
    expect(await fs.pathExists(result.outputDirectory)).toBe(true);

    // Verify each generated file exists
    for (const filePath of result.generatedFiles) {
      expect(await fs.pathExists(filePath)).toBe(true);
      
      // Verify file has content
      const stats = await fs.stat(filePath);
      expect(stats.size).toBeGreaterThan(0);
      
      logger.debug({ filePath, size: stats.size }, 'Verified artifact file');
    }

    // Verify specific artifact types
    const fileNames = result.generatedFiles.map(f => path.basename(f));
    
    // Should have main summary
    expect(fileNames.some(name => name.includes('summary'))).toBe(true);
    
    // Should have task breakdown
    expect(fileNames.some(name => name.includes('task-breakdown'))).toBe(true);
    
    // Should have performance metrics
    expect(fileNames.some(name => name.includes('performance-metrics'))).toBe(true);
    
    // Should have dependency analysis
    expect(fileNames.some(name => name.includes('dependency-analysis'))).toBe(true);

    logger.info({
      sessionId: testSession.id,
      projectId: testProjectId,
      artifactsValidated: result.generatedFiles.length
    }, 'All output artifacts validated successfully');

  }, 60000); // 1 minute timeout

  it('should generate valid content in artifacts', async () => {
    const summaryGenerator = new DecompositionSummaryGenerator();
    const result = await summaryGenerator.generateSessionSummary(testSession);
    
    expect(result.success).toBe(true);
    
    // Check content of main summary file
    const summaryFile = result.generatedFiles.find(f => path.basename(f).includes('summary'));
    if (summaryFile) {
      const content = await fs.readFile(summaryFile, 'utf-8');
      expect(content).toContain('# Decomposition Session Summary');
      expect(content).toContain(testSession.id);
      expect(content).toContain(testProjectId);
      logger.info({ summaryFile, contentLength: content.length }, 'Summary content validated');
    }

    // Check content of task breakdown file
    const taskBreakdownFile = result.generatedFiles.find(f => path.basename(f).includes('task-breakdown'));
    if (taskBreakdownFile) {
      const content = await fs.readFile(taskBreakdownFile, 'utf-8');
      expect(content).toContain('# Task Breakdown');
      expect(content).toContain('Test Task 1');
      logger.info({ taskBreakdownFile, contentLength: content.length }, 'Task breakdown content validated');
    }

    // Check content of performance metrics file
    const metricsFile = result.generatedFiles.find(f => path.basename(f).includes('performance-metrics'));
    if (metricsFile) {
      const content = await fs.readFile(metricsFile, 'utf-8');
      expect(content).toContain('# Performance Metrics');
      expect(content).toContain('Total Tasks');
      logger.info({ metricsFile, contentLength: content.length }, 'Performance metrics content validated');
    }

  }, 30000);

  it('should handle artifact generation errors gracefully', async () => {
    // Test with invalid session data
    const invalidSession: DecompositionSession = {
      id: 'invalid-session',
      projectId: 'invalid-project',
      status: 'failed',
      progress: 0,
      startTime: new Date(),
      endTime: new Date(),
      results: [],
      processedTasks: 0,
      totalTasks: 0,
      currentDepth: 0,
      persistedTasks: [],
      taskFiles: []
    };

    const summaryGenerator = new DecompositionSummaryGenerator();
    const result = await summaryGenerator.generateSessionSummary(invalidSession);
    
    // Should handle gracefully without crashing
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    
    logger.info({ error: result.error }, 'Error handling validated');
  }, 15000);
});
