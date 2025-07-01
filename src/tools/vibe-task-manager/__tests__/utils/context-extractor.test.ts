/**
 * Unit tests for Context Extractor
 * Tests dynamic project and epic ID extraction from various sources
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  extractProjectFromContext, 
  extractEpicFromContext,
  sanitizeProjectId,
  sanitizeEpicId
} from '../../utils/context-extractor.js';
import { CommandExecutionContext } from '../../nl/command-handlers.js';

// Mock dependencies
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

vi.mock('../../core/operations/task-operations.js', () => ({
  getTaskOperations: vi.fn(() => ({
    getTask: vi.fn()
  }))
}));

vi.mock('../../core/operations/project-operations.js', () => ({
  getProjectOperations: vi.fn(() => ({
    getProject: vi.fn()
  }))
}));

vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Context Extractor', () => {
  let mockContext: CommandExecutionContext;
  let mockExec: Record<string, unknown>;
  let mockReadFile: Record<string, unknown>;

  beforeEach(async () => {
    mockContext = {
      sessionId: 'test-session-123',
      currentProject: undefined,
      currentTask: undefined
    };

    const childProcess = await import('child_process');
    const fsPromises = await import('fs/promises');
    mockExec = vi.mocked(childProcess.exec);
    mockReadFile = vi.mocked(fsPromises.readFile);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('extractProjectFromContext', () => {
    it('should extract project from session context with highest priority', async () => {
      mockContext.currentProject = 'session-project-123';

      const result = await extractProjectFromContext(mockContext);

      expect(result.projectId).toBe('session-project-123');
      expect(result.projectName).toBe('session-project-123');
      expect(result.source).toBe('session');
      expect(result.confidence).toBe(0.95);
    });

    it('should extract project from git remote URL (HTTPS)', async () => {
      const { promisify } = await import('util');
      const execAsync = promisify(mockExec);
      
      vi.mocked(execAsync).mockResolvedValue({
        stdout: 'https://github.com/user/awesome-project.git\n',
        stderr: ''
      });

      const result = await extractProjectFromContext(mockContext, '/test/project');

      expect(result.projectId).toBe('awesome-project');
      expect(result.projectName).toBe('awesome-project');
      expect(result.source).toBe('git');
      expect(result.confidence).toBe(0.85);
    });

    it('should extract project from git remote URL (SSH)', async () => {
      const { promisify } = await import('util');
      const execAsync = promisify(mockExec);
      
      vi.mocked(execAsync).mockResolvedValue({
        stdout: 'git@github.com:user/my-cool-app.git\n',
        stderr: ''
      });

      const result = await extractProjectFromContext(mockContext, '/test/project');

      expect(result.projectId).toBe('my-cool-app');
      expect(result.projectName).toBe('my-cool-app');
      expect(result.source).toBe('git');
      expect(result.confidence).toBe(0.85);
    });

    it('should extract project from package.json', async () => {
      // Mock git failure
      const { promisify } = await import('util');
      const execAsync = promisify(mockExec);
      vi.mocked(execAsync).mockRejectedValue(new Error('Not a git repository'));

      // Mock package.json success
      mockReadFile.mockResolvedValue(JSON.stringify({
        name: '@company/web-application',
        version: '1.0.0'
      }));

      const result = await extractProjectFromContext(mockContext, '/test/project');

      expect(result.projectId).toBe('-company-web-application');
      expect(result.projectName).toBe('@company/web-application');
      expect(result.source).toBe('package');
      expect(result.confidence).toBe(0.75);
    });

    it('should extract project from directory name as fallback', async () => {
      // Mock git failure
      const { promisify } = await import('util');
      const execAsync = promisify(mockExec);
      vi.mocked(execAsync).mockRejectedValue(new Error('Not a git repository'));

      // Mock package.json failure
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await extractProjectFromContext(mockContext, '/test/My-Project-Name');

      expect(result.projectId).toBe('my-project-name');
      expect(result.projectName).toBe('My-Project-Name');
      expect(result.source).toBe('directory');
      expect(result.confidence).toBe(0.6);
    });

    it('should use ultimate fallback when all extraction methods fail', async () => {
      // Mock all failures
      const { promisify } = await import('util');
      const execAsync = promisify(mockExec);
      vi.mocked(execAsync).mockRejectedValue(new Error('Git error'));
      mockReadFile.mockRejectedValue(new Error('File error'));

      // Mock path.basename to throw error
      vi.doMock('path', () => ({
        basename: vi.fn(() => { throw new Error('Path error'); }),
        join: vi.fn()
      }));

      const result = await extractProjectFromContext(mockContext, '/test/project');

      expect(result.projectId).toBe('default-project');
      expect(result.projectName).toBe('Default Project');
      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe(0.1);
    });
  });

  describe('extractEpicFromContext', () => {
    it('should extract epic from current task in session', async () => {
      mockContext.currentTask = 'task-123';

      const { getTaskOperations } = await import('../../core/operations/task-operations.js');
      const mockTaskOps = {
        getTask: vi.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'task-123',
            epicId: 'epic-from-task'
          }
        })
      };
      vi.mocked(getTaskOperations).mockReturnValue(mockTaskOps as Record<string, unknown>);

      const result = await extractEpicFromContext(mockContext, 'test-project');

      expect(result.epicId).toBe('epic-from-task');
      expect(result.epicName).toBe('epic-from-task');
      expect(result.source).toBe('session');
      expect(result.confidence).toBe(0.9);
    });

    it('should extract epic from project when task has no epic', async () => {
      mockContext.currentTask = 'task-123';

      const { getTaskOperations } = await import('../../core/operations/task-operations.js');
      const mockTaskOps = {
        getTask: vi.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'task-123',
            epicId: null
          }
        })
      };
      vi.mocked(getTaskOperations).mockReturnValue(mockTaskOps as Record<string, unknown>);

      const { getProjectOperations } = await import('../../core/operations/project-operations.js');
      const mockProjectOps = {
        getProject: vi.fn().mockResolvedValue({
          success: true,
          data: {
            id: 'test-project',
            epicIds: ['project-epic-1', 'project-epic-2']
          }
        })
      };
      vi.mocked(getProjectOperations).mockReturnValue(mockProjectOps as Record<string, unknown>);

      const result = await extractEpicFromContext(mockContext, 'test-project');

      expect(result.epicId).toBe('project-epic-1');
      expect(result.epicName).toBe('project-epic-1');
      expect(result.source).toBe('project');
      expect(result.confidence).toBe(0.7);
    });

    it('should generate epic from project when no other sources available', async () => {
      const result = await extractEpicFromContext(mockContext, 'my-awesome-project');

      expect(result.epicId).toBe('my-awesome-project-main-epic');
      expect(result.epicName).toBe('my-awesome-project Main Epic');
      expect(result.source).toBe('default');
      expect(result.confidence).toBe(0.5);
    });

    it('should use fallback when all extraction methods fail', async () => {
      mockContext.currentTask = 'invalid-task';

      const { getTaskOperations } = await import('../../core/operations/task-operations.js');
      const mockTaskOps = {
        getTask: vi.fn().mockRejectedValue(new Error('Task not found'))
      };
      vi.mocked(getTaskOperations).mockReturnValue(mockTaskOps as Record<string, unknown>);

      const result = await extractEpicFromContext(mockContext, 'invalid-project');

      expect(result.epicId).toBe('default-epic');
      expect(result.epicName).toBe('Default Epic');
      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe(0.1);
    });
  });

  describe('sanitization functions', () => {
    it('should sanitize project IDs correctly', () => {
      expect(sanitizeProjectId('My Project Name!')).toBe('my-project-name-');
      expect(sanitizeProjectId('@company/web-app')).toBe('-company-web-app');
      expect(sanitizeProjectId('project--with--dashes')).toBe('project-with-dashes');
      expect(sanitizeProjectId('-leading-and-trailing-')).toBe('leading-and-trailing');
      expect(sanitizeProjectId('UPPERCASE_PROJECT')).toBe('uppercase-project');
    });

    it('should sanitize epic IDs correctly', () => {
      expect(sanitizeEpicId('Epic Name With Spaces')).toBe('epic-name-with-spaces');
      expect(sanitizeEpicId('epic@#$%^&*()')).toBe('epic----------');
      expect(sanitizeEpicId('multiple---dashes')).toBe('multiple-dashes');
      expect(sanitizeEpicId('-epic-id-')).toBe('epic-id');
    });

    it('should handle empty and special cases', () => {
      expect(sanitizeProjectId('')).toBe('');
      expect(sanitizeProjectId('---')).toBe('');
      expect(sanitizeEpicId('123')).toBe('123');
      expect(sanitizeEpicId('a')).toBe('a');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex git URL patterns', async () => {
      const testCases = [
        {
          url: 'https://gitlab.com/group/subgroup/project-name.git',
          expected: 'project-name'
        },
        {
          url: 'git@bitbucket.org:user/repository.git',
          expected: 'repository'
        },
        {
          url: 'https://github.com/user/project',
          expected: 'project'
        }
      ];

      for (const testCase of testCases) {
        const { promisify } = await import('util');
        const execAsync = promisify(mockExec);
        vi.mocked(execAsync).mockResolvedValue({
          stdout: testCase.url + '\n',
          stderr: ''
        });

        const result = await extractProjectFromContext(mockContext, '/test/project');
        expect(result.projectId).toBe(testCase.expected);
        expect(result.source).toBe('git');
      }
    });

    it('should prioritize session context over all other sources', async () => {
      mockContext.currentProject = 'session-project';

      // Set up git to return a different project
      const { promisify } = await import('util');
      const execAsync = promisify(mockExec);
      vi.mocked(execAsync).mockResolvedValue({
        stdout: 'https://github.com/user/git-project.git\n',
        stderr: ''
      });

      // Set up package.json to return yet another project
      mockReadFile.mockResolvedValue(JSON.stringify({
        name: 'package-project'
      }));

      const result = await extractProjectFromContext(mockContext, '/test/project');

      // Should still use session context despite other sources being available
      expect(result.projectId).toBe('session-project');
      expect(result.source).toBe('session');
      expect(result.confidence).toBe(0.95);
    });
  });
});
