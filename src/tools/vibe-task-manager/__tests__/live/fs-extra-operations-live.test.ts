import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DecompositionSummaryGenerator, SummaryConfig } from '../../services/decomposition-summary-generator.js';
import { DecompositionService } from '../../services/decomposition-service.js';
import { DecompositionSession } from '../../services/decomposition-service.js';
import { AtomicTask, TaskType, TaskPriority, TaskStatus } from '../../types/task.js';
import * as path from 'path';

// Mock fs-extra to track calls and simulate both success and failure scenarios
vi.mock('fs-extra', () => ({
  writeFile: vi.fn(),
  ensureDir: vi.fn(),
  default: {
    writeFile: vi.fn(),
    ensureDir: vi.fn()
  }
}));

// Mock config loader
vi.mock('../../utils/config-loader.js', () => ({
  getVibeTaskManagerOutputDir: vi.fn().mockReturnValue('/test/output'),
  getVibeTaskManagerConfig: vi.fn().mockResolvedValue({
    llm: {
      baseUrl: 'https://test.openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'test-model'
    }
  })
}));

describe('fs-extra File Writing Operations Tests', () => {
  let summaryGenerator: DecompositionSummaryGenerator;
  let mockSession: DecompositionSession;
  let mockWriteFile: any;
  let mockEnsureDir: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Get the mocked functions
    const fs = await import('fs-extra');
    mockWriteFile = vi.mocked(fs.writeFile);
    mockEnsureDir = vi.mocked(fs.ensureDir);

    // Setup default successful mock implementations
    mockEnsureDir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    // Create summary generator with test config
    const testConfig: Partial<SummaryConfig> = {
      includeTaskBreakdown: true,
      includeDependencyAnalysis: true,
      includePerformanceMetrics: true,
      includeVisualDiagrams: true,
      includeJsonExports: true
    };
    summaryGenerator = new DecompositionSummaryGenerator(testConfig);

    // Create mock session with test data
    mockSession = {
      id: 'test-session-001',
      taskId: 'test-task',
      projectId: 'test-project-001',
      status: 'completed',
      startTime: new Date('2024-01-01T10:00:00Z'),
      endTime: new Date('2024-01-01T10:05:00Z'),
      progress: 100,
      currentDepth: 0,
      maxDepth: 3,
      totalTasks: 2,
      processedTasks: 2,
      results: [{
        success: true,
        isAtomic: false,
        depth: 0,
        subTasks: [],
        originalTask: {} as AtomicTask
      }],
      persistedTasks: [
        {
          id: 'task-001',
          title: 'Test Task 1',
          description: 'First test task for fs-extra testing',
          type: 'development' as TaskType,
          priority: 'medium' as TaskPriority,
          status: 'pending' as TaskStatus,
          estimatedHours: 2,
          acceptanceCriteria: ['Should write files correctly'],
          tags: ['test', 'fs-extra'],
          dependencies: [],
          filePaths: ['/test/path/task1.yaml'],
          epicId: 'test-epic',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'task-002',
          title: 'Test Task 2',
          description: 'Second test task with dependencies',
          type: 'development' as TaskType,
          priority: 'high' as TaskPriority,
          status: 'pending' as TaskStatus,
          estimatedHours: 4,
          acceptanceCriteria: ['Should handle dependencies'],
          tags: ['test', 'dependencies'],
          dependencies: ['task-001'],
          filePaths: ['/test/path/task2.yaml'],
          epicId: 'test-epic',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DecompositionSummaryGenerator file operations', () => {
    it('should successfully write all summary files with correct fs-extra usage', async () => {
      // Act
      const result = await summaryGenerator.generateSessionSummary(mockSession);

      // Assert
      expect(result.success).toBe(true);
      expect(result.generatedFiles).toHaveLength(7); // Main summary, task breakdown, metrics, dependency analysis, 2 diagrams, 3 JSON files

      // Verify ensureDir was called to create output directory
      expect(mockEnsureDir).toHaveBeenCalledWith(
        expect.stringContaining('decomposition-sessions/test-project-001-test-session-001')
      );

      // Verify writeFile was called for each expected file with utf8 encoding
      expect(mockWriteFile).toHaveBeenCalledTimes(7);
      
      // Check specific file writes
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('session-summary.md'),
        expect.stringContaining('# Decomposition Session Summary'),
        'utf8'
      );

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('task-breakdown.md'),
        expect.stringContaining('# Detailed Task Breakdown'),
        'utf8'
      );

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('performance-metrics.md'),
        expect.stringContaining('# Performance Metrics'),
        'utf8'
      );

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('dependency-analysis.md'),
        expect.stringContaining('# Dependency Analysis'),
        'utf8'
      );

      // Verify JSON files are written with proper formatting
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('session-data.json'),
        expect.stringMatching(/^\{[\s\S]*\}$/), // Valid JSON format
        'utf8'
      );
    });

    it('should handle fs-extra writeFile errors gracefully', async () => {
      // Arrange - Mock writeFile to fail
      mockWriteFile.mockRejectedValue(new Error('Mock fs.writeFile error'));

      // Act
      const result = await summaryGenerator.generateSessionSummary(mockSession);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Mock fs.writeFile error');
      expect(result.generatedFiles).toHaveLength(0);
    });

    it('should handle ensureDir errors gracefully', async () => {
      // Arrange - Mock ensureDir to fail
      mockEnsureDir.mockRejectedValue(new Error('Mock ensureDir error'));

      // Act
      const result = await summaryGenerator.generateSessionSummary(mockSession);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Mock ensureDir error');
      expect(result.generatedFiles).toHaveLength(0);
    });

    it('should write files with correct content structure', async () => {
      // Act
      await summaryGenerator.generateSessionSummary(mockSession);

      // Assert - Check main summary content
      const mainSummaryCall = mockWriteFile.mock.calls.find(call => 
        call[0].includes('session-summary.md')
      );
      expect(mainSummaryCall).toBeDefined();
      const summaryContent = mainSummaryCall![1] as string;
      
      expect(summaryContent).toContain('# Decomposition Session Summary');
      expect(summaryContent).toContain('**Session ID:** test-session-001');
      expect(summaryContent).toContain('**Project ID:** test-project-001');
      expect(summaryContent).toContain('**Total Tasks Generated:** 2');
      expect(summaryContent).toContain('**Total Estimated Hours:** 6.0h');

      // Assert - Check task breakdown content
      const taskBreakdownCall = mockWriteFile.mock.calls.find(call => 
        call[0].includes('task-breakdown.md')
      );
      expect(taskBreakdownCall).toBeDefined();
      const breakdownContent = taskBreakdownCall![1] as string;
      
      expect(breakdownContent).toContain('# Detailed Task Breakdown');
      expect(breakdownContent).toContain('## Task 1: Test Task 1');
      expect(breakdownContent).toContain('## Task 2: Test Task 2');
      expect(breakdownContent).toContain('**Dependencies:**');
      expect(breakdownContent).toContain('- task-001');

      // Assert - Check JSON export structure
      const sessionDataCall = mockWriteFile.mock.calls.find(call => 
        call[0].includes('session-data.json')
      );
      expect(sessionDataCall).toBeDefined();
      const jsonContent = JSON.parse(sessionDataCall![1] as string);
      
      expect(jsonContent).toHaveProperty('session');
      expect(jsonContent).toHaveProperty('analysis');
      expect(jsonContent).toHaveProperty('tasks');
      expect(jsonContent.session.id).toBe('test-session-001');
      expect(jsonContent.tasks).toHaveLength(2);
    });

    it('should generate visual diagrams with proper Mermaid syntax', async () => {
      // Act
      await summaryGenerator.generateSessionSummary(mockSession);

      // Assert - Check task flow diagram
      const taskFlowCall = mockWriteFile.mock.calls.find(call => 
        call[0].includes('task-flow-diagram.md')
      );
      expect(taskFlowCall).toBeDefined();
      const flowContent = taskFlowCall![1] as string;
      
      expect(flowContent).toContain('# Task Flow Diagram');
      expect(flowContent).toContain('```mermaid');
      expect(flowContent).toContain('graph TD');
      expect(flowContent).toContain('Start([Decomposition Started])');

      // Assert - Check dependency diagram
      const dependencyDiagramCall = mockWriteFile.mock.calls.find(call => 
        call[0].includes('dependency-diagram.md')
      );
      expect(dependencyDiagramCall).toBeDefined();
      const dependencyContent = dependencyDiagramCall![1] as string;
      
      expect(dependencyContent).toContain('# Dependency Diagram');
      expect(dependencyContent).toContain('```mermaid');
      expect(dependencyContent).toContain('graph LR');
      expect(dependencyContent).toContain('classDef high fill:#ffcccc');
    });
  });

  describe('DecompositionService visual dependency graph operations', () => {
    let decompositionService: DecompositionService;

    beforeEach(() => {
      // Mock the config and other dependencies
      const mockConfig = {
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        model: 'test-model',
        geminiModel: 'test-gemini',
        perplexityModel: 'test-perplexity'
      };

      decompositionService = new DecompositionService(mockConfig);
    });

    it('should write visual dependency graphs with correct fs-extra usage', async () => {
      // Arrange - Mock dependency operations
      const mockDependencyOps = {
        generateDependencyGraph: vi.fn().mockResolvedValue({
          success: true,
          data: {
            projectId: 'test-project-001',
            nodes: new Map([
              ['task-001', { title: 'Test Task 1' }],
              ['task-002', { title: 'Test Task 2' }]
            ]),
            edges: [
              { fromTaskId: 'task-001', toTaskId: 'task-002', type: 'requires' }
            ],
            criticalPath: ['task-001', 'task-002'],
            executionOrder: ['task-001', 'task-002'],
            statistics: {
              totalTasks: 2,
              totalDependencies: 1,
              maxDepth: 2,
              orphanedTasks: []
            }
          }
        })
      };

      // Act - Call the private method through reflection
      const method = (decompositionService as any).generateAndSaveVisualDependencyGraphs;
      await method.call(decompositionService, mockSession, mockDependencyOps);

      // Assert
      expect(mockEnsureDir).toHaveBeenCalledWith(
        expect.stringContaining('/dependency-graphs')
      );

      expect(mockWriteFile).toHaveBeenCalledTimes(3);
      
      // Verify Mermaid diagram file
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringMatching(/.*-mermaid\.md$/),
        expect.stringContaining('# Task Dependency Graph'),
        'utf8'
      );

      // Verify summary file
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringMatching(/.*-summary\.md$/),
        expect.stringContaining('# Dependency Analysis Summary'),
        'utf8'
      );

      // Verify JSON graph file
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringMatching(/.*-graph\.json$/),
        expect.stringMatching(/^\{[\s\S]*\}$/),
        'utf8'
      );
    });

    it('should handle dependency graph generation errors gracefully', async () => {
      // Arrange - Mock dependency operations to fail
      const mockDependencyOps = {
        generateDependencyGraph: vi.fn().mockResolvedValue({
          success: false,
          error: 'Mock dependency graph generation error'
        })
      };

      // Act - Should not throw
      const method = (decompositionService as any).generateAndSaveVisualDependencyGraphs;
      await expect(
        method.call(decompositionService, mockSession, mockDependencyOps)
      ).resolves.not.toThrow();

      // Assert - No files should be written
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should handle fs-extra errors in visual dependency graph generation', async () => {
      // Arrange
      const mockDependencyOps = {
        generateDependencyGraph: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: new Map(), edges: [], criticalPath: [], executionOrder: [], statistics: {} }
        })
      };

      // Mock writeFile to fail
      mockWriteFile.mockRejectedValue(new Error('Mock writeFile error in dependency graphs'));

      // Act - Should not throw
      const method = (decompositionService as any).generateAndSaveVisualDependencyGraphs;
      await expect(
        method.call(decompositionService, mockSession, mockDependencyOps)
      ).resolves.not.toThrow();

      // Assert - ensureDir should still be called
      expect(mockEnsureDir).toHaveBeenCalled();
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty session data gracefully', async () => {
      // Arrange - Create session with no persisted tasks
      const emptySession: DecompositionSession = {
        ...mockSession,
        persistedTasks: []
      };

      // Act
      const result = await summaryGenerator.generateSessionSummary(emptySession);

      // Assert
      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalled();
      
      // Check that content handles empty data
      const taskBreakdownCall = mockWriteFile.mock.calls.find(call => 
        call[0].includes('task-breakdown.md')
      );
      const content = taskBreakdownCall![1] as string;
      expect(content).toContain('No tasks were generated in this session');
    });

    it('should handle partial file write failures', async () => {
      // Arrange - Mock some writes to succeed, others to fail
      let callCount = 0;
      mockWriteFile.mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          return Promise.resolve();
        } else {
          return Promise.reject(new Error('Partial write failure'));
        }
      });

      // Act
      const result = await summaryGenerator.generateSessionSummary(mockSession);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Partial write failure');
    });
  });
});
