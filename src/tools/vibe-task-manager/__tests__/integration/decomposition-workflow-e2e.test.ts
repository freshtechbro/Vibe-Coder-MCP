/**
 * End-to-End Decomposition Workflow Test
 * Tests the complete decomposition workflow with all our fixes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getProjectOperations } from '../../core/operations/project-operations.js';
import { getDecompositionService } from '../../services/decomposition-service.js';
import { getTaskOperations } from '../../core/operations/task-operations.js';
import { getEpicService } from '../../services/epic-service.js';
import type { CreateProjectParams } from '../../core/operations/project-operations.js';
import type { AtomicTask } from '../../types/task.js';
import logger from '../../../../logger.js';

describe('End-to-End Decomposition Workflow', () => {
  let projectId: string;
  let testProjectName: string;

  beforeEach(async () => {
    testProjectName = `E2E-Test-${Date.now()}`;
    logger.info({ testProjectName }, 'Starting E2E decomposition workflow test');
  });

  afterEach(async () => {
    // Cleanup test project if created
    if (projectId) {
      try {
        const projectOps = getProjectOperations();
        await projectOps.deleteProject(projectId, 'test-cleanup');
        logger.info({ projectId, testProjectName }, 'Test project cleaned up');
      } catch (error) {
        logger.warn({ err: error, projectId }, 'Failed to cleanup test project');
      }
    }
  });

  it('should execute complete decomposition workflow with all fixes', async () => {
    // Step 1: Create project with enhanced agent configuration
    const projectOps = getProjectOperations();
    const createParams: CreateProjectParams = {
      name: testProjectName,
      description: 'E2E test project for decomposition workflow',
      techStack: {
        languages: ['typescript', 'javascript'],
        frameworks: ['react', 'node.js'],
        tools: ['npm', 'git', 'docker']
      },
      tags: ['e2e-test', 'decomposition-workflow']
    };

    const projectResult = await projectOps.createProject(createParams, 'e2e-test');
    expect(projectResult.success).toBe(true);
    expect(projectResult.data).toBeDefined();
    
    projectId = projectResult.data!.id;
    logger.info({ projectId, agentConfig: projectResult.data!.config.agentConfig }, 'Project created with enhanced agent configuration');

    // Verify agent configuration was enhanced based on tech stack
    expect(projectResult.data!.config.agentConfig.defaultAgent).not.toBe('default-agent');
    expect(projectResult.data!.config.agentConfig.agentCapabilities).toBeDefined();

    // Step 2: Create a complex task for decomposition
    const taskOps = getTaskOperations();
    const complexTask: Partial<AtomicTask> = {
      title: 'Build User Authentication System',
      description: 'Create a complete user authentication system with login, registration, password reset, and user profile management features',
      type: 'development',
      priority: 'high',
      projectId,
      estimatedHours: 20,
      acceptanceCriteria: [
        'Users can register with email and password',
        'Users can login and logout',
        'Password reset functionality works',
        'User profile management is available'
      ],
      tags: ['authentication', 'security', 'user-management']
    };

    const taskResult = await taskOps.createTask(complexTask, 'e2e-test');
    expect(taskResult.success).toBe(true);
    expect(taskResult.data).toBeDefined();

    const taskId = taskResult.data!.id;
    logger.info({ taskId, projectId }, 'Complex task created for decomposition');

    // Step 3: Execute decomposition with epic generation
    const decompositionService = getDecompositionService();
    const decompositionResult = await decompositionService.decomposeTask({
      task: taskResult.data!,
      context: {
        projectId,
        projectName: testProjectName,
        techStack: createParams.techStack!,
        requirements: complexTask.acceptanceCriteria || []
      }
    });

    expect(decompositionResult.success).toBe(true);
    expect(decompositionResult.data).toBeDefined();
    
    const session = decompositionResult.data!;
    logger.info({ 
      sessionId: session.id, 
      status: session.status,
      persistedTasksCount: session.persistedTasks?.length || 0
    }, 'Decomposition completed');

    // Verify decomposition results
    expect(session.status).toBe('completed');
    expect(session.persistedTasks).toBeDefined();
    expect(session.persistedTasks!.length).toBeGreaterThan(0);

    // Step 4: Verify epic generation worked
    const epicService = getEpicService();
    const epicsResult = await epicService.listEpics({ projectId });
    expect(epicsResult.success).toBe(true);
    expect(epicsResult.data).toBeDefined();
    expect(epicsResult.data!.length).toBeGreaterThan(0);

    logger.info({ 
      epicsCount: epicsResult.data!.length,
      epicIds: epicsResult.data!.map(e => e.id)
    }, 'Epics generated successfully');

    // Verify tasks have proper epic assignments (not default-epic)
    const tasksWithEpics = session.persistedTasks!.filter(task => 
      task.epicId && task.epicId !== 'default-epic'
    );
    expect(tasksWithEpics.length).toBeGreaterThan(0);

    // Step 5: Verify dependency analysis
    if (session.persistedTasks!.length > 1) {
      // Check if dependencies were created
      const { getDependencyOperations } = await import('../../core/operations/dependency-operations.js');
      const dependencyOps = getDependencyOperations();
      const dependenciesResult = await dependencyOps.listDependencies({ projectId });
      
      if (dependenciesResult.success && dependenciesResult.data!.length > 0) {
        logger.info({ 
          dependenciesCount: dependenciesResult.data!.length 
        }, 'Dependencies created successfully');
      }
    }

    // Step 6: Verify output generation
    expect(session.taskFiles).toBeDefined();
    expect(session.taskFiles!.length).toBeGreaterThan(0);

    logger.info({
      projectId,
      sessionId: session.id,
      tasksGenerated: session.persistedTasks!.length,
      epicsGenerated: epicsResult.data!.length,
      filesGenerated: session.taskFiles!.length,
      agentUsed: projectResult.data!.config.agentConfig.defaultAgent
    }, 'E2E decomposition workflow completed successfully');

    // Final verification: All components working together
    expect(session.richResults).toBeDefined();
    expect(session.richResults!.summary.totalTasks).toBe(session.persistedTasks!.length);
    expect(session.richResults!.summary.projectId).toBe(projectId);

  }, 120000); // 2 minute timeout for full workflow

  it('should handle workflow failures gracefully', async () => {
    // Test error handling in the workflow
    const decompositionService = getDecompositionService();
    
    // Try to decompose with invalid data
    const invalidResult = await decompositionService.decomposeTask({
      task: {
        id: 'invalid-task',
        title: '',
        description: '',
        type: 'development',
        status: 'pending',
        priority: 'medium',
        projectId: 'invalid-project',
        estimatedHours: 0,
        acceptanceCriteria: [],
        tags: [],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test',
          version: '1.0.0'
        }
      } as AtomicTask,
      context: {
        projectId: 'invalid-project',
        projectName: 'Invalid Project',
        techStack: { languages: [], frameworks: [], tools: [] },
        requirements: []
      }
    });

    // Should handle gracefully without crashing
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toBeDefined();
    
    logger.info({ error: invalidResult.error }, 'Workflow error handling verified');
  }, 30000);
});
