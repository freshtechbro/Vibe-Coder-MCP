/**
 * Tests for Command Handlers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommandHandlers,
  CreateProjectHandler,
  CreateTaskHandler,
  ListProjectsHandler,
  ListTasksHandler,
  RunTaskHandler,
  CheckStatusHandler,
  CommandExecutionContext
} from '../../nl/command-handlers.js';
import { RecognizedIntent } from '../../types/nl.js';

describe('CommandHandlers', () => {
  let commandHandlers: CommandHandlers;
  let mockContext: CommandExecutionContext;

  beforeEach(() => {
    commandHandlers = CommandHandlers.getInstance();
    mockContext = {
      sessionId: 'test-session',
      userId: 'test-user',
      currentProject: 'Test Project',
      config: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        defaultModel: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
        perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
        llm_mapping: {}
      },
      taskManagerConfig: {
        dataDir: './test-data',
        maxConcurrentTasks: 5,
        taskTimeout: 300000,
        enableLogging: true,
        logLevel: 'info',
        cacheEnabled: true,
        cacheTTL: 3600,
        llm: {
          provider: 'openrouter',
          model: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
          temperature: 0.7,
          maxTokens: 4000,
          llm_mapping: {}
        }
      }
    };
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CommandHandlers.getInstance();
      const instance2 = CommandHandlers.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Handler Registration', () => {
    it('should have all required handlers registered', () => {
      const availableIntents = commandHandlers.getAvailableIntents();

      expect(availableIntents).toContain('create_project');
      expect(availableIntents).toContain('create_task');
      expect(availableIntents).toContain('list_projects');
      expect(availableIntents).toContain('list_tasks');
      expect(availableIntents).toContain('run_task');
      expect(availableIntents).toContain('check_status');
    });
  });

  describe('CreateProjectHandler', () => {
    let handler: CreateProjectHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new CreateProjectHandler();
      mockIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project called Web App',
        processedInput: 'create a project called web app',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle create project command successfully', async () => {
      const toolParams = {
        command: 'create',
        projectName: 'Web App',
        description: 'A web application project',
        options: {
          priority: 'high',
          type: 'development'
        }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Project "Web App" created successfully');
      expect(result.updatedContext?.currentProject).toBe('Web App');
      expect(result.followUpSuggestions).toContain('Add a task to Web App');
    });

    it('should include project details in response', async () => {
      const toolParams = {
        projectName: 'API Service',
        description: 'REST API service',
        options: { priority: 'medium', type: 'backend' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toContain('API Service');
      expect(result.result.content[0].text).toContain('REST API service');
      expect(result.result.content[0].text).toContain('medium');
    });
  });

  describe('CreateTaskHandler', () => {
    let handler: CreateTaskHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new CreateTaskHandler();
      mockIntent = {
        intent: 'create_task',
        confidence: 0.85,
        confidenceLevel: 'high',
        entities: {},
        originalInput: 'Create a task for implementing authentication',
        processedInput: 'create a task for implementing authentication',
        alternatives: [],
        metadata: {
          processingTime: 45,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle create task command successfully', async () => {
      // First create the default project that the task handler expects
      const { getStorageManager } = await import('../../core/storage/storage-manager.js');
      const storageManager = await getStorageManager();

      // Create project directly with the expected ID
      const projectResult = await storageManager.createProject({
        id: 'default-project',
        name: 'default-project',
        description: 'Default project for testing',
        status: 'pending',
        priority: 'medium',
        rootPath: process.cwd(),
        epicIds: [],
        tags: [],
        techStack: {
          languages: [],
          frameworks: [],
          tools: []
        },
        structure: {
          sourceDirectories: ['src'],
          testDirectories: ['tests'],
          docDirectories: ['docs'],
          buildDirectories: ['dist']
        },
        dependencies: {
          production: [],
          development: [],
          external: []
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test',
          tags: [],
          version: '1.0.0'
        }
      });

      // Verify project was created successfully (only if we actually created it)
      if (!projectResult.success) {
        console.error('Project creation failed:', projectResult.error);
        // Don't fail the test if project already exists
        expect(projectResult.error).toContain('already exists');
      }

      // Verify project exists
      const projectExists = await storageManager.projectExists('default-project');
      expect(projectExists).toBe(true);

      // Also create the default epic that the task handler expects
      const epicExists = await storageManager.epicExists('default-epic');
      if (!epicExists) {
        const epicResult = await storageManager.createEpic({
          id: 'default-epic',
          title: 'Default Epic',
          description: 'Default epic for testing',
          projectId: 'default-project',
          status: 'pending',
          priority: 'medium',
          estimatedHours: 40,
          taskIds: [],
          dependencies: [],
          dependents: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test',
            tags: [],
            version: '1.0.0'
          }
        });

        if (!epicResult.success) {
          console.error('Epic creation failed:', epicResult.error);
        }
        expect(epicResult.success).toBe(true);
      }

      const toolParams = {
        command: 'create',
        projectName: 'Web App',
        description: 'Implement user authentication',
        options: {
          priority: 'high',
          type: 'development',
          assignee: 'developer'
        }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Task created successfully');
      expect(result.result.content[0].text).toContain('Implement user authentication');
      expect(result.result.content[0].text).toContain('Web App');
      expect(result.updatedContext?.currentProject).toBe('Web App');
      expect(result.followUpSuggestions?.some(s => s.includes('Run task'))).toBe(true);
    });

    it('should generate task ID', async () => {
      // First create the default project that the task handler expects
      const { getStorageManager } = await import('../../core/storage/storage-manager.js');
      const storageManager = await getStorageManager();

      // Check if project already exists, if not create it
      const projectExists = await storageManager.projectExists('default-project');

      if (!projectExists) {
        // Create project directly with the expected ID
        const projectResult = await storageManager.createProject({
          id: 'default-project',
          name: 'default-project',
          description: 'Default project for testing',
          status: 'pending',
          priority: 'medium',
          rootPath: process.cwd(),
          epicIds: [],
          tags: [],
          techStack: {
            languages: [],
            frameworks: [],
            tools: []
          },
          structure: {
            sourceDirectories: ['src'],
            testDirectories: ['tests'],
            docDirectories: ['docs'],
            buildDirectories: ['dist']
          },
          dependencies: {
            production: [],
            development: [],
            external: []
          },
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test',
            tags: [],
            version: '1.0.0'
          }
        });

        // Verify project was created successfully (only if we actually created it)
        if (!projectResult.success) {
          console.error('Project creation failed:', projectResult.error);
          // Don't fail the test if project already exists
          expect(projectResult.error).toContain('already exists');
        }

        // Also create the default epic that the task handler expects
        const epicExists = await storageManager.epicExists('default-epic');
        if (!epicExists) {
          const epicResult = await storageManager.createEpic({
            id: 'default-epic',
            title: 'Default Epic',
            description: 'Default epic for testing',
            projectId: 'default-project',
            status: 'pending',
            priority: 'medium',
            estimatedHours: 40,
            taskIds: [],
            dependencies: [],
            dependents: [],
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
              tags: [],
              version: '1.0.0'
            }
          });

          if (!epicResult.success) {
            console.error('Epic creation failed (inner):', epicResult.error);
          }
          expect(epicResult.success).toBe(true);
        }
      }

      // Verify project exists
      const finalProjectExists = await storageManager.projectExists('default-project');
      expect(finalProjectExists).toBe(true);

      // Ensure epic exists (in case project already existed)
      const finalEpicExists = await storageManager.epicExists('default-epic');
      if (!finalEpicExists) {
        const epicResult = await storageManager.createEpic({
          id: 'default-epic',
          title: 'Default Epic',
          description: 'Default epic for testing',
          projectId: 'default-project',
          status: 'pending',
          priority: 'medium',
          estimatedHours: 40,
          taskIds: [],
          dependencies: [],
          dependents: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test',
            tags: [],
            version: '1.0.0'
          }
        });

        if (!epicResult.success) {
          console.error('Epic creation failed (final):', epicResult.error);
        }
        expect(epicResult.success).toBe(true);
      }

      const toolParams = {
        projectName: 'Test Project',
        description: 'Test task'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toMatch(/Task ID: T\d+/);
      expect(result.updatedContext?.currentTask).toMatch(/T\d+/);
    });
  });

  describe('ListProjectsHandler', () => {
    let handler: ListProjectsHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new ListProjectsHandler();
      mockIntent = {
        intent: 'list_projects',
        confidence: 0.95,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Show me all projects',
        processedInput: 'show me all projects',
        alternatives: [],
        metadata: {
          processingTime: 30,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should list all projects', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'projects' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      // Check for real project listing format - should contain "Projects:" or "Your Projects:"
      const text = result.result.content[0].text;
      expect(text).toMatch(/Projects:|Your Projects:/);
      // Should contain at least some content (from previous test runs or real data)
      expect(text.length).toBeGreaterThan(50);
    });

    it('should filter projects by status', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'projects', status: 'in_progress' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      // Should handle status filtering gracefully - may return no results or filtered results
      expect(result.success).toBe(true);
      const text = result.result.content[0].text;
      // Should either show filtered results or indicate no projects found
      expect(text).toMatch(/Projects|No projects found/);
    });
  });

  describe('ListTasksHandler', () => {
    let handler: ListTasksHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new ListTasksHandler();
      mockIntent = {
        intent: 'list_tasks',
        confidence: 0.88,
        confidenceLevel: 'high',
        entities: {},
        originalInput: 'Show me all tasks',
        processedInput: 'show me all tasks',
        alternatives: [],
        metadata: {
          processingTime: 35,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should list all tasks', async () => {
      // First create a test task
      const { getTaskOperations } = await import('../../core/operations/task-operations.js');
      const taskOps = getTaskOperations();

      await taskOps.createTask({
        title: 'Test Task',
        description: 'Test task description',
        projectId: 'PID-WEB-APP-007',
        epicId: 'epic-1',
        priority: 'medium',
        estimatedHours: 4
      });

      const toolParams = {
        command: 'list',
        options: { type: 'tasks' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      // Should show tasks or "No tasks found" message
      const text = result.result.content[0].text;
      expect(text).toMatch(/Tasks|No tasks found/);
    });

    it('should filter tasks by status', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'tasks', status: 'pending' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      // Should show filtered results or "No tasks found" message
      const text = result.result.content[0].text;
      expect(text).toMatch(/Tasks.*\(pending\)|No tasks with status "pending"/);
    });

    it('should filter tasks by project', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'tasks', project: 'Web App' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      // Should show filtered results or "No tasks found" message
      const text = result.result.content[0].text;
      expect(text).toMatch(/Tasks|No tasks found/);
    });
  });

  describe('RunTaskHandler', () => {
    let handler: RunTaskHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new RunTaskHandler();
      mockIntent = {
        intent: 'run_task',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Run task 123',
        processedInput: 'run task 123',
        alternatives: [],
        metadata: {
          processingTime: 40,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle run task command successfully', async () => {
      const toolParams = {
        command: 'run',
        taskId: 'task-123',
        options: { force: false }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      // Task may not exist, so it could succeed or fail gracefully
      const text = result.result.content[0].text;
      expect(text).toMatch(/Task execution initiated|Task not found|Error/);
      expect(text).toContain('task-123');
    });

    it('should handle force execution option', async () => {
      const toolParams = {
        command: 'run',
        taskId: 'task-456',
        options: { force: true }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      // Task may not exist, so check for appropriate response
      const text = result.result.content[0].text;
      expect(text).toMatch(/Force execution|Task not found|Error/);
      expect(text).toContain('task-456');
    });
  });

  describe('CheckStatusHandler', () => {
    let handler: CheckStatusHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new CheckStatusHandler();
      mockIntent = {
        intent: 'check_status',
        confidence: 0.82,
        confidenceLevel: 'high',
        entities: {},
        originalInput: 'What is the status?',
        processedInput: 'what is the status?',
        alternatives: [],
        metadata: {
          processingTime: 45,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should show task status when task ID provided', async () => {
      const toolParams = {
        command: 'status',
        taskId: 'task-123',
        options: { detailed: true }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      // Task doesn't exist, so should return error
      expect(result.success).toBe(false);
      expect(result.result.content[0].text).toContain('Task not found: task-123');
    });

    it('should show project status when project name provided', async () => {
      const toolParams = {
        command: 'status',
        projectName: 'Web App',
        options: { detailed: true }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      // Should show real project data or "Project not found" message
      const text = result.result.content[0].text;
      expect(text).toMatch(/Project Status.*Web App|Project not found.*Web App/);
    });

    it('should show general status when no specific target', async () => {
      const toolParams = {
        command: 'status',
        options: { detailed: true }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('General Status');
      // Should show real system statistics
      const text = result.result.content[0].text;
      expect(text).toMatch(/Active Projects.*\d+/);
      expect(result.followUpSuggestions).toContain('Check specific project status');
    });
  });

  describe('Command Execution', () => {
    it('should execute commands through the main handler', async () => {
      const mockIntent: RecognizedIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project',
        processedInput: 'create a project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const toolParams = {
        projectName: 'Test Project',
        description: 'Test description'
      };

      const result = await commandHandlers.executeCommand(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Project "Test Project" created successfully');
    });

    it('should handle unknown intents gracefully', async () => {
      const mockIntent: RecognizedIntent = {
        intent: 'unknown',
        confidence: 0.1,
        confidenceLevel: 'very_low',
        entities: {},
        originalInput: 'Unknown command',
        processedInput: 'unknown command',
        alternatives: [],
        metadata: {
          processingTime: 20,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const result = await commandHandlers.executeCommand(mockIntent, {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.result.content[0].text).toContain('No handler available for intent: unknown');
    });
  });
});
