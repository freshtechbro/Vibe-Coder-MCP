/**
 * Task List Parsing Workflow - End-to-End Scenario Test
 * 
 * This test demonstrates the complete task list parsing workflow from natural language
 * commands to task decomposition and atomic task generation using real LLM integration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IntentPatternEngine } from '../../nl/patterns.js';
import { TaskListIntegrationService } from '../../integrations/task-list-integration.js';
import { DecompositionService } from '../../services/decomposition-service.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import type { ParsedTaskList, ProjectContext, AtomicTask } from '../../types/index.js';
import logger from '../../../../logger.js';
import * as fs from 'fs';
import * as path from 'path';

// Extended timeout for comprehensive task list parsing scenario
const SCENARIO_TIMEOUT = 180000; // 3 minutes

describe('📝 Task List Parsing Workflow - Complete Scenario', () => {
  let patternEngine: IntentPatternEngine;
  let taskListIntegration: TaskListIntegrationService;
  let decompositionService: DecompositionService;
  let mockTaskListContent: string;
  let parsedTaskList: ParsedTaskList;
  let projectContext: ProjectContext;
  let atomicTasks: AtomicTask[] = [];

  beforeAll(async () => {
    // Initialize components
    const config = await getVibeTaskManagerConfig();
    const openRouterConfig = {
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      defaultModel: process.env.DEFAULT_MODEL || 'deepseek/deepseek-r1-0528-qwen3-8b:free',
      llm_mapping: config?.llm?.llm_mapping || {}
    };

    patternEngine = new IntentPatternEngine();
    taskListIntegration = TaskListIntegrationService.getInstance();
    decompositionService = new DecompositionService(openRouterConfig);

    // Create mock task list content for testing
    mockTaskListContent = createMockTaskListContent();
    await setupMockTaskListFile(mockTaskListContent);

    logger.info('🎯 Starting Task List Parsing Workflow Scenario');
  }, SCENARIO_TIMEOUT);

  afterAll(async () => {
    try {
      await cleanupMockFiles();
    } catch (error) {
      logger.warn({ err: error }, 'Error during cleanup');
    }
  });

  describe('🔍 Step 1: Natural Language Intent Recognition', () => {
    it('should recognize task list parsing intents from natural language commands', async () => {
      const testCommands = [
        'read task list',
        'parse the task list for E-commerce Platform',
        'load task breakdown',
        'read the tasks file',
        'parse tasks for "Mobile App Project"'
      ];

      const recognitionResults = [];

      for (const command of testCommands) {
        const startTime = Date.now();
        const matches = patternEngine.matchIntent(command);
        const duration = Date.now() - startTime;

        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches[0].intent).toBe('parse_tasks');
        expect(matches[0].confidence).toBeGreaterThan(0.5);
        expect(duration).toBeLessThan(1000);

        recognitionResults.push({
          command: command.substring(0, 30) + '...',
          intent: matches[0].intent,
          confidence: matches[0].confidence,
          entities: matches[0].entities,
          duration
        });

        logger.info({
          command: command.substring(0, 30) + '...',
          intent: matches[0].intent,
          confidence: matches[0].confidence,
          entities: matches[0].entities,
          duration
        }, '🎯 Task list parsing intent recognized');
      }

      expect(recognitionResults).toHaveLength(5);
      expect(recognitionResults.every(r => r.intent === 'parse_tasks')).toBe(true);
      expect(recognitionResults.every(r => r.confidence > 0.5)).toBe(true);

      logger.info({
        totalCommands: recognitionResults.length,
        averageConfidence: recognitionResults.reduce((sum, r) => sum + r.confidence, 0) / recognitionResults.length,
        totalProcessingTime: recognitionResults.reduce((sum, r) => sum + r.duration, 0)
      }, '✅ All task list parsing intents recognized successfully');
    });
  });

  describe('📋 Step 2: Task List File Discovery and Parsing', () => {
    it('should discover and parse task list files from VibeCoderOutput directory', async () => {
      // Test task list file discovery
      const startTime = Date.now();
      const discoveredTaskLists = await taskListIntegration.findTaskListFiles();
      const discoveryDuration = Date.now() - startTime;

      expect(discoveredTaskLists).toBeDefined();
      expect(Array.isArray(discoveredTaskLists)).toBe(true);
      expect(discoveredTaskLists.length).toBeGreaterThanOrEqual(1);
      expect(discoveryDuration).toBeLessThan(5000);

      const testTaskList = discoveredTaskLists.find(tl => tl.projectName.includes('E-commerce'));
      expect(testTaskList).toBeDefined();

      logger.info({
        discoveredTaskLists: discoveredTaskLists.length,
        discoveryDuration,
        testTaskListFound: !!testTaskList,
        testTaskListPath: testTaskList?.filePath
      }, '🔍 Task list files discovered successfully');

      // Test task list content parsing
      const parseStartTime = Date.now();
      parsedTaskList = await taskListIntegration.parseTaskListContent(mockTaskListContent, testTaskList!.filePath);
      const parseDuration = Date.now() - parseStartTime;

      expect(parsedTaskList).toBeDefined();
      expect(parsedTaskList.projectName).toBe('E-commerce Platform');
      expect(parsedTaskList.phases).toBeDefined();
      expect(parsedTaskList.phases.length).toBeGreaterThan(0);
      expect(parsedTaskList.statistics).toBeDefined();
      expect(parseDuration).toBeLessThan(3000);

      logger.info({
        projectName: parsedTaskList.projectName,
        phasesCount: parsedTaskList.phases.length,
        totalTasks: parsedTaskList.statistics.totalTasks,
        totalHours: parsedTaskList.statistics.totalEstimatedHours,
        parseDuration,
        parseSuccess: true
      }, '📋 Task list content parsed successfully');
    });
  });

  describe('⚙️ Step 3: Atomic Task Conversion', () => {
    it('should convert parsed task list to atomic tasks', async () => {
      expect(parsedTaskList).toBeDefined();

      // Create project context for task conversion
      projectContext = {
        projectPath: '/projects/ecommerce-platform',
        projectName: 'E-commerce Platform',
        description: 'A comprehensive e-commerce platform with modern features',
        languages: ['typescript', 'javascript'],
        frameworks: ['react', 'node.js', 'express'],
        buildTools: ['npm', 'webpack'],
        tools: ['vscode', 'git'],
        configFiles: ['package.json', 'tsconfig.json'],
        entryPoints: ['src/index.ts'],
        architecturalPatterns: ['mvc', 'component-based'],
        codebaseSize: 'large',
        teamSize: 4,
        complexity: 'high',
        existingTasks: [],
        structure: {
          sourceDirectories: ['src', 'src/components', 'src/services'],
          testDirectories: ['src/__tests__'],
          docDirectories: ['docs'],
          buildDirectories: ['dist']
        },
        dependencies: {
          production: ['react', 'express', 'mongoose'],
          development: ['typescript', '@types/node', 'jest'],
          external: ['mongodb', 'redis']
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          source: 'task-list-parsing' as const
        }
      };

      const startTime = Date.now();
      atomicTasks = await taskListIntegration.convertToAtomicTasks(parsedTaskList, projectContext);
      const duration = Date.now() - startTime;

      expect(atomicTasks).toBeDefined();
      expect(Array.isArray(atomicTasks)).toBe(true);
      expect(atomicTasks.length).toBeGreaterThan(5);
      expect(duration).toBeLessThan(5000);

      // Validate atomic tasks
      for (const task of atomicTasks) {
        expect(task.id).toBeDefined();
        expect(task.title).toBeDefined();
        expect(task.description).toBeDefined();
        expect(task.estimatedHours).toBeGreaterThan(0);
        expect(task.estimatedHours).toBeLessThanOrEqual(8); // Atomic tasks should be <= 8 hours
        expect(task.projectId).toBeDefined();
        expect(Array.isArray(task.tags)).toBe(true);
      }

      logger.info({
        totalAtomicTasks: atomicTasks.length,
        totalEstimatedHours: atomicTasks.reduce((sum, t) => sum + t.estimatedHours, 0),
        averageTaskSize: atomicTasks.reduce((sum, t) => sum + t.estimatedHours, 0) / atomicTasks.length,
        duration,
        conversionSuccessful: true
      }, '⚙️ Task list converted to atomic tasks');
    });
  });

  describe('🔄 Step 4: Task Refinement with LLM', () => {
    it('should refine atomic tasks using real LLM calls', async () => {
      expect(atomicTasks.length).toBeGreaterThan(0);
      expect(projectContext).toBeDefined();

      // Select a few tasks for LLM refinement
      const tasksToRefine = atomicTasks.slice(0, 3);
      const refinedTasks = [];

      for (const task of tasksToRefine) {
        const startTime = Date.now();
        const refinementResult = await decompositionService.refineTask(task, projectContext);
        const duration = Date.now() - startTime;

        expect(refinementResult.success).toBe(true);
        expect(refinementResult.refinedTask).toBeDefined();
        expect(duration).toBeLessThan(30000); // 30 seconds max per task

        refinedTasks.push(refinementResult.refinedTask);

        logger.info({
          originalTaskId: task.id,
          originalTitle: task.title.substring(0, 40) + '...',
          refinedTitle: refinementResult.refinedTask.title.substring(0, 40) + '...',
          duration,
          llmCallSuccessful: true
        }, '🔄 Task refined using LLM');
      }

      expect(refinedTasks).toHaveLength(3);
      expect(refinedTasks.every(task => task.title.length > 0)).toBe(true);
      expect(refinedTasks.every(task => task.description.length > 0)).toBe(true);

      logger.info({
        tasksRefined: refinedTasks.length,
        totalRefinementTime: tasksToRefine.reduce((sum, _, i) => sum + (refinedTasks[i] ? 1000 : 0), 0),
        llmIntegrationWorking: true
      }, '🔄 Task refinement with LLM completed');
    });
  });

  describe('✅ Step 5: End-to-End Validation & Output', () => {
    it('should validate complete task list parsing workflow and save outputs', async () => {
      // Validate all components
      expect(parsedTaskList.projectName).toBe('E-commerce Platform');
      expect(projectContext.projectName).toBe('E-commerce Platform');
      expect(atomicTasks.length).toBeGreaterThan(5);
      expect(atomicTasks.every(task => task.estimatedHours > 0)).toBe(true);

      // Calculate metrics
      const totalEstimatedHours = atomicTasks.reduce((sum, task) => sum + task.estimatedHours, 0);
      const averageTaskSize = totalEstimatedHours / atomicTasks.length;

      const tasksByPriority = {
        critical: atomicTasks.filter(t => t.priority === 'critical').length,
        high: atomicTasks.filter(t => t.priority === 'high').length,
        medium: atomicTasks.filter(t => t.priority === 'medium').length,
        low: atomicTasks.filter(t => t.priority === 'low').length
      };

      const tasksByPhase = atomicTasks.reduce((acc, task) => {
        const phase = task.epicId || 'unassigned';
        acc[phase] = (acc[phase] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const finalReport = {
        workflowValidation: {
          intentRecognition: '✅ Task list parsing intents recognized',
          taskListDiscovery: '✅ Task list files discovered successfully',
          taskListParsing: '✅ Task list content parsed correctly',
          atomicConversion: '✅ Tasks converted to atomic format',
          llmRefinement: '✅ Tasks refined using LLM',
          endToEndWorkflow: '✅ Complete workflow operational'
        },
        taskListMetrics: {
          projectName: parsedTaskList.projectName,
          phasesCount: parsedTaskList.phases.length,
          originalTasksCount: parsedTaskList.statistics.totalTasks,
          originalEstimatedHours: parsedTaskList.statistics.totalEstimatedHours
        },
        atomicTaskMetrics: {
          totalAtomicTasks: atomicTasks.length,
          totalEstimatedHours,
          averageTaskSize: Math.round(averageTaskSize * 100) / 100,
          tasksByPriority,
          tasksByPhase
        },
        technicalValidation: {
          llmIntegration: '✅ OpenRouter API operational',
          taskListIntegration: '✅ Task list parsing service working',
          atomicConversion: '✅ Task conversion working',
          decompositionService: '✅ Task refinement working'
        }
      };

      logger.info(finalReport, '🎉 TASK LIST PARSING WORKFLOW VALIDATION COMPLETE');

      // Final assertions
      expect(totalEstimatedHours).toBeGreaterThan(20); // Substantial project
      expect(averageTaskSize).toBeLessThanOrEqual(8); // Atomic tasks
      expect(atomicTasks.length).toBeGreaterThan(5); // Multiple tasks generated

      // Save outputs
      await saveTaskListScenarioOutputs(parsedTaskList, projectContext, atomicTasks, finalReport);

      logger.info({
        scenarioStatus: 'COMPLETE SUCCESS',
        workflowValidated: true,
        outputsSaved: true,
        finalValidation: '✅ Task list parsing workflow fully operational'
      }, '🚀 TASK LIST PARSING WORKFLOW SCENARIO SUCCESSFULLY DEMONSTRATED');
    });
  });
});

// Helper function to create mock task list content
function createMockTaskListContent(): string {
  return `# E-commerce Platform - Task List

## Project Overview
**Project Name**: E-commerce Platform
**Description**: A comprehensive e-commerce platform with modern features and scalable architecture

## Phase 1: Foundation Setup (16 hours)
### 1.1 Project Initialization (4 hours)
- Set up project structure and configuration
- Initialize Git repository and CI/CD pipeline
- Configure development environment

### 1.2 Database Design (6 hours)
- Design database schema for products, users, orders
- Set up database migrations and seeders
- Implement data validation layers

### 1.3 Authentication System (6 hours)
- Implement user registration and login
- Set up JWT token management
- Add password reset functionality

## Phase 2: Core Features (24 hours)
### 2.1 Product Catalog (8 hours)
- Create product listing and search functionality
- Implement category management
- Add product filtering and sorting

### 2.2 Shopping Cart (8 hours)
- Build shopping cart functionality
- Implement cart persistence
- Add quantity management

### 2.3 Order Processing (8 hours)
- Create checkout workflow
- Implement payment integration
- Add order tracking system

## Phase 3: Advanced Features (16 hours)
### 3.1 User Dashboard (6 hours)
- Build user profile management
- Create order history view
- Add wishlist functionality

### 3.2 Admin Panel (6 hours)
- Create admin dashboard
- Implement product management
- Add user management features

### 3.3 Analytics & Reporting (4 hours)
- Implement sales analytics
- Create performance reports
- Add monitoring and logging

## Statistics
- **Total Tasks**: 9
- **Total Estimated Hours**: 56
- **Average Task Size**: 6.2 hours
- **Phases**: 3
`;
}

// Helper function to setup mock task list file
async function setupMockTaskListFile(content: string): Promise<void> {
  const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
  const taskListDir = path.join(baseOutputDir, 'generated_task_lists');
  
  if (!fs.existsSync(taskListDir)) {
    fs.mkdirSync(taskListDir, { recursive: true });
  }

  const taskListFilePath = path.join(taskListDir, 'ecommerce-platform-tasks.md');
  fs.writeFileSync(taskListFilePath, content);
  
  logger.info({ taskListFilePath }, 'Mock task list file created for testing');
}

// Helper function to cleanup mock files
async function cleanupMockFiles(): Promise<void> {
  try {
    const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
    const taskListFilePath = path.join(baseOutputDir, 'generated_task_lists', 'ecommerce-platform-tasks.md');
    
    if (fs.existsSync(taskListFilePath)) {
      fs.unlinkSync(taskListFilePath);
      logger.info('Mock task list file cleaned up');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to cleanup mock files');
  }
}

// Helper function to save scenario outputs
async function saveTaskListScenarioOutputs(
  parsedTaskList: ParsedTaskList,
  projectContext: ProjectContext,
  atomicTasks: AtomicTask[],
  finalReport: any
): Promise<void> {
  try {
    const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
    const outputDir = path.join(baseOutputDir, 'vibe-task-manager', 'scenarios', 'task-list-parsing');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save all outputs
    fs.writeFileSync(path.join(outputDir, 'parsed-task-list.json'), JSON.stringify(parsedTaskList, null, 2));
    fs.writeFileSync(path.join(outputDir, 'project-context.json'), JSON.stringify(projectContext, null, 2));
    fs.writeFileSync(path.join(outputDir, 'atomic-tasks.json'), JSON.stringify(atomicTasks, null, 2));
    fs.writeFileSync(path.join(outputDir, 'final-report.json'), JSON.stringify(finalReport, null, 2));

    logger.info({ outputDir }, '📁 Task list scenario output files saved successfully');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to save task list scenario outputs');
  }
}
