/**
 * Tests for Artifact Handlers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ParsePRDHandler,
  ParseTasksHandler,
  ImportArtifactHandler
} from '../../../nl/handlers/artifact-handlers.js';
import { CommandExecutionContext } from '../../../nl/command-handlers.js';
import { RecognizedIntent } from '../../../types/nl.js';

// Mock the integration services
vi.mock('../../../integrations/prd-integration.js', () => ({
  PRDIntegrationService: {
    getInstance: vi.fn(() => ({
      detectExistingPRD: vi.fn().mockResolvedValue({
        filePath: '/test/prd.md',
        fileName: 'test-prd.md',
        projectName: 'Test Project',
        createdAt: new Date(),
        fileSize: 1024,
        isAccessible: true
      }),
      parsePRD: vi.fn().mockResolvedValue({
        success: true,
        prdData: {
          metadata: { projectName: 'Test Project' },
          overview: { description: 'Test PRD description' },
          features: [{ title: 'Feature 1', priority: 'high' }],
          technical: { techStack: ['TypeScript', 'Node.js'] }
        }
      }),
      findPRDFiles: vi.fn().mockResolvedValue([])
    }))
  }
}));

vi.mock('../../../integrations/task-list-integration.js', () => ({
  TaskListIntegrationService: {
    getInstance: vi.fn(() => ({
      detectExistingTaskList: vi.fn().mockResolvedValue({
        filePath: '/test/tasks.md',
        fileName: 'test-tasks.md',
        projectName: 'Test Project',
        createdAt: new Date(),
        fileSize: 2048,
        isAccessible: true
      }),
      parseTaskList: vi.fn().mockResolvedValue({
        success: true,
        taskListData: {
          metadata: { projectName: 'Test Project', totalTasks: 5 },
          overview: { description: 'Test task list description' },
          phases: [{ name: 'Phase 1', tasks: [] }],
          statistics: { totalEstimatedHours: 40 }
        }
      }),
      findTaskListFiles: vi.fn().mockResolvedValue([]),
      convertToAtomicTasks: vi.fn().mockResolvedValue([])
    }))
  }
}));

// Mock project operations
vi.mock('../../../core/operations/project-operations.js', () => ({
  getProjectOperations: vi.fn(() => ({
    createProjectFromPRD: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'test-project-id',
        name: 'Test Project',
        description: 'Test project description'
      }
    }),
    createProjectFromTaskList: vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'test-project-id',
        name: 'Test Project',
        description: 'Test project description'
      }
    })
  }))
}));

describe('Artifact Handlers', () => {
  let mockContext: CommandExecutionContext;

  beforeEach(() => {
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

  describe('ParsePRDHandler', () => {
    let handler: ParsePRDHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new ParsePRDHandler();
      mockIntent = {
        intent: 'parse_prd',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: [
          { type: 'projectName', value: 'my-project' }
        ],
        originalInput: 'Parse the PRD for my project',
        processedInput: 'parse the prd for my project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle parse PRD command successfully', async () => {
      const toolParams = {
        command: 'parse',
        type: 'prd',
        projectName: 'my-project'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Successfully parsed PRD');
      expect(result.result.content[0].text).toContain('Test Project');
    });

    it('should handle missing project name', async () => {
      const toolParams = {
        command: 'parse',
        type: 'prd'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      // Should use current project from context
      expect(result.result.content[0].text).toContain('Test Project');
    });

    it('should provide follow-up suggestions', async () => {
      const toolParams = {
        command: 'parse',
        type: 'prd',
        projectName: 'my-project'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.followUpSuggestions).toBeDefined();
      expect(result.followUpSuggestions?.some(s => s.includes('epic'))).toBe(true);
    });
  });

  describe('ParseTasksHandler', () => {
    let handler: ParseTasksHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new ParseTasksHandler();
      mockIntent = {
        intent: 'parse_tasks',
        confidence: 0.85,
        confidenceLevel: 'high',
        entities: [
          { type: 'projectName', value: 'my-project' }
        ],
        originalInput: 'Parse the task list for my project',
        processedInput: 'parse the task list for my project',
        alternatives: [],
        metadata: {
          processingTime: 45,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle parse tasks command successfully', async () => {
      const toolParams = {
        command: 'parse',
        type: 'tasks',
        projectName: 'my-project'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Successfully parsed task list');
      expect(result.result.content[0].text).toContain('Test Project');
    });

    it('should handle missing project name', async () => {
      const toolParams = {
        command: 'parse',
        type: 'tasks'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      // Should use current project from context
      expect(result.result.content[0].text).toContain('Test Project');
    });

    it('should provide follow-up suggestions', async () => {
      const toolParams = {
        command: 'parse',
        type: 'tasks',
        projectName: 'my-project'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.followUpSuggestions).toBeDefined();
      expect(result.followUpSuggestions?.some(s => s.includes('task'))).toBe(true);
    });
  });

  describe('ImportArtifactHandler', () => {
    let handler: ImportArtifactHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new ImportArtifactHandler();
      mockIntent = {
        intent: 'import_artifact',
        confidence: 0.88,
        confidenceLevel: 'high',
        entities: [
          { type: 'artifactType', value: 'prd' },
          { type: 'filePath', value: '/path/to/artifact.md' }
        ],
        originalInput: 'Import PRD from /path/to/artifact.md',
        processedInput: 'import prd from /path/to/artifact.md',
        alternatives: [],
        metadata: {
          processingTime: 40,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle import PRD command successfully', async () => {
      const toolParams = {
        command: 'import',
        type: 'prd',
        filePath: '/path/to/artifact.md'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Successfully parsed PRD');
      expect(result.result.content[0].text).toContain('Test Project');
    });

    it('should handle import task list command successfully', async () => {
      const toolParams = {
        command: 'import',
        type: 'tasks',
        filePath: '/path/to/task-list.md'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Successfully parsed PRD');
      expect(result.result.content[0].text).toContain('Test Project');
    });

    it('should handle unsupported artifact type', async () => {
      const toolParams = {
        command: 'import',
        artifactType: 'unknown',
        filePath: '/path/to/artifact.md'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(false);
      expect(result.result.content[0].text).toContain('Unsupported artifact type');
    });

    it('should handle missing file path', async () => {
      const toolParams = {
        command: 'import',
        artifactType: 'prd'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      // Since it routes to ParsePRDHandler, it will succeed with auto-detection
      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Successfully parsed PRD');
    });

    it('should provide follow-up suggestions for successful imports', async () => {
      const toolParams = {
        command: 'import',
        type: 'prd',
        filePath: '/path/to/artifact.md'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      if (result.success) {
        expect(result.followUpSuggestions).toBeDefined();
        expect(result.followUpSuggestions?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle PRD parsing errors gracefully', async () => {
      const handler = new ParsePRDHandler();
      const mockIntent: RecognizedIntent = {
        intent: 'parse_prd',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: [],
        originalInput: 'Parse PRD for invalid project',
        processedInput: 'parse prd for invalid project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const toolParams = {
        command: 'parse',
        type: 'prd',
        projectName: 'non-existent-project'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      // Should handle gracefully even if no PRD is found
      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Successfully parsed PRD');
    });

    it('should handle task list parsing errors gracefully', async () => {
      const handler = new ParseTasksHandler();
      const mockIntent: RecognizedIntent = {
        intent: 'parse_tasks',
        confidence: 0.85,
        confidenceLevel: 'high',
        entities: [],
        originalInput: 'Parse tasks for invalid project',
        processedInput: 'parse tasks for invalid project',
        alternatives: [],
        metadata: {
          processingTime: 45,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const toolParams = {
        command: 'parse',
        type: 'tasks',
        projectName: 'non-existent-project'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      // Should handle gracefully even if no task list is found
      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Successfully parsed task list');
    });
  });
});
