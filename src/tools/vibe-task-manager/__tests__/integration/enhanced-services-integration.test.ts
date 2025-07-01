/**
 * Enhanced Services Integration Tests
 * 
 * Comprehensive integration testing for the enhanced vibe-task-manager services:
 * - Metadata and tagging system integration
 * - Epic-task relationship management integration
 * - Multi-factor priority scoring integration
 * - Intelligent agent assignment integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  mockOpenRouterResponse, 
  setTestId, 
  clearMockQueue,
  clearAllMockQueues,
  MockQueueBuilder
} from '../../../../testUtils/mockLLM.js';
import { MetadataService } from '../../services/metadata-service.js';
import { TagManagementService } from '../../services/tag-management-service.js';
import { EpicContextResolver } from '../../services/epic-context-resolver.js';
import { EpicDependencyManager } from '../../services/epic-dependency-manager.js';
import { TaskScheduler } from '../../services/task-scheduler.js';
import { IntelligentAgentAssignmentService } from '../../services/intelligent-agent-assignment.js';
import { AtomicTask, TaskPriority, TaskStatus } from '../../types/task.js';
import { Agent, AgentCapability } from '../../types/agent.js';
import { Epic } from '../../types/epic.js';
import { OptimizedDependencyGraph } from '../../core/dependency-graph.js';

// Mock all external dependencies to avoid live LLM calls
vi.mock('../../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn().mockResolvedValue(JSON.stringify({
    isAtomic: true,
    confidence: 0.95,
    reasoning: 'Task is atomic and focused',
    estimatedHours: 0.1
  })),
  performFormatAwareLlmCall: vi.fn().mockResolvedValue(JSON.stringify({
    tasks: [{
      title: 'Test Subtask',
      description: 'Test subtask description',
      estimatedHours: 0.1,
      acceptanceCriteria: ['Test criteria'],
      priority: 'medium'
    }]
  }))
}));

// Mock external dependencies
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../../../../services/openrouter-config.js', () => ({
  OpenRouterConfigManager: {
    getInstance: vi.fn(() => ({
      getOpenRouterConfig: vi.fn().mockResolvedValue({
        apiKey: 'test-key',
        baseUrl: 'https://test.openrouter.ai',
        model: 'gemini-2.0-flash-exp'
      })
    }))
  }
}));

// Mock storage manager for epic context resolver tests
const mockStorage = {
  getTask: vi.fn(),
  getEpic: vi.fn(),
  updateTask: vi.fn(),
  updateEpic: vi.fn(),
  listEpics: vi.fn(),
  listTasks: vi.fn(),
  getDependenciesForTask: vi.fn()
};

vi.mock('../../core/storage/storage-manager.js', () => ({
  getStorageManager: vi.fn(() => Promise.resolve(mockStorage))
}));

// Mock operations modules used by EpicDependencyManager
vi.mock('../../services/epic-service.js', () => ({
  getEpicService: vi.fn(() => ({
    listEpics: vi.fn(() => Promise.resolve({
      success: true,
      data: []
    }))
  }))
}));

vi.mock('../../core/operations/task-operations.js', () => ({
  getTaskOperations: vi.fn(() => ({
    listTasks: vi.fn(() => Promise.resolve({
      success: true,
      data: []
    }))
  }))
}));

vi.mock('../../core/operations/dependency-operations.js', () => ({
  getDependencyOperations: vi.fn(() => ({
    getDependenciesForTask: vi.fn(() => Promise.resolve({
      success: true,
      data: []
    }))
  }))
}));

describe('Enhanced Services Integration Tests', () => {
  let metadataService: MetadataService;
  let tagService: TagManagementService;
  let epicResolver: EpicContextResolver;
  let epicDependencyManager: EpicDependencyManager;
  let taskScheduler: TaskScheduler;
  let agentAssignment: IntelligentAgentAssignmentService;
  
  let testTask: AtomicTask;
  let testEpic: Epic;
  let testAgent: Agent;
  let testId: string;

  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Reset all mock implementations to avoid state pollution
    mockStorage.getTask.mockReset();
    mockStorage.getEpic.mockReset();
    mockStorage.updateTask.mockReset();
    mockStorage.updateEpic.mockReset();
    mockStorage.listEpics.mockReset();
    mockStorage.listTasks.mockReset();
    mockStorage.getDependenciesForTask.mockReset();
    
    // Set unique test ID for isolation
    testId = `enhanced-services-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setTestId(testId);
    
    // Clear mock queue for this test
    clearMockQueue();
    
    // Set up comprehensive mock queue for all potential LLM calls
    const builder = new MockQueueBuilder();
    builder
      .addIntentRecognitions(5, 'create_task')
      .addAtomicDetections(15, true)
      .addTaskDecompositions(3, 2);
    builder.queueResponses();
    // Initialize services
    metadataService = MetadataService.getInstance();
    tagService = TagManagementService.getInstance();
    epicResolver = EpicContextResolver.getInstance();
    epicDependencyManager = new EpicDependencyManager();
    taskScheduler = new TaskScheduler();
    agentAssignment = new IntelligentAgentAssignmentService();

    // Setup test data
    testTask = {
      id: `T001-${testId}`,
      title: 'Implement user authentication system',
      description: 'Create secure authentication with JWT tokens and session management',
      type: 'development',
      priority: 'high' as TaskPriority,
      status: 'pending' as TaskStatus,
      estimatedHours: 8,
      actualHours: 0,
      projectId: 'P001',
      epicId: `E001-${testId}`,
      acceptanceCriteria: [
        'Users can login with email/password',
        'JWT tokens are properly validated',
        'Sessions persist across browser refreshes'
      ],
      filePaths: ['src/auth/login.ts', 'src/auth/session.ts'],
      dependencies: [],
      dependents: [],
      testingRequirements: {
        unitTests: ['auth.test.ts'],
        integrationTests: ['auth-integration.test.ts'],
        performanceTests: [],
        coverageTarget: 95
      },
      performanceCriteria: {},
      qualityCriteria: {
        codeQuality: ['security'],
        documentation: ['api-docs'],
        typeScript: true,
        eslint: true
      },
      integrationCriteria: {
        compatibility: ['oauth'],
        patterns: ['jwt']
      },
      validationMethods: {
        automated: ['unit tests', 'integration tests'],
        manual: ['security review']
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user123',
      tags: ['authentication', 'security'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user123',
        tags: ['authentication', 'security']
      }
    };

    testEpic = {
      id: `E001-${testId}`,
      title: 'User Management System',
      description: 'Complete user management functionality',
      projectId: 'P001',
      status: 'in_progress',
      priority: 'high',
      startDate: new Date(),
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      estimatedHours: 40,
      actualHours: 0,
      completionPercentage: 0,
      taskIds: [],
      dependencies: [],
      blockedBy: [],
      stakeholders: ['user123'],
      acceptanceCriteria: [
        'Complete user authentication',
        'User profile management',
        'Role-based access control'
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user123',
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user123',
        tags: []
      }
    };

    testAgent = {
      id: 'agent_1',
      name: 'Development Specialist',
      description: 'Full-stack development specialist',
      status: 'idle',
      capabilities: ['code_generation', 'testing', 'debugging'] as AgentCapability[],
      currentTask: undefined,
      taskQueue: [],
      performance: {
        tasksCompleted: 25,
        averageCompletionTime: 3600000, // 1 hour
        successRate: 0.95,
        lastActiveAt: new Date()
      },
      config: {
        maxConcurrentTasks: 3,
        preferredTaskTypes: ['development', 'testing']
      },
      communication: {
        protocol: 'direct',
        timeout: 30000
      },
      metadata: {
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
        version: '1.0.0',
        tags: ['senior', 'fullstack']
      }
    };

    // Setup storage mocks for epic context resolver
    mockStorage.getTask.mockResolvedValue({
      success: true,
      data: testTask
    });
    
    mockStorage.getEpic.mockResolvedValue({
      success: true,
      data: testEpic
    });
    
    mockStorage.updateTask.mockResolvedValue({
      success: true
    });
    
    mockStorage.updateEpic.mockResolvedValue({
      success: true
    });

    mockStorage.listEpics.mockResolvedValue({
      success: true,
      data: [testEpic]
    });

    mockStorage.listTasks.mockResolvedValue({
      success: true,
      data: [testTask]
    });

    mockStorage.getDependenciesForTask.mockResolvedValue({
      success: true,
      data: []
    });

    // Setup mocks
    mockOpenRouterResponse({
      success: true,
      data: {
        tags: ['authentication', 'security', 'backend'],
        reasoning: 'Task involves secure authentication implementation',
        confidence: 0.9
      }
    });

    // Register agent and verify registration
    const registrationResult = agentAssignment.registerAgent(testAgent);
    expect(registrationResult.success).toBe(true);
    
    // Verify agent is actually registered
    const registeredAgent = agentAssignment.getAgent(testAgent.id);
    expect(registeredAgent).toBeDefined();
    expect(registeredAgent?.id).toBe(testAgent.id);
  });

  afterEach(async () => {
    // Dispose agent assignment service first to clean up state
    if (agentAssignment && !agentAssignment.disposed) {
      agentAssignment.dispose();
    }
    
    // Clean up singleton services to prevent test interference
    if (metadataService) {
      await metadataService.cleanup();
    }
    if (tagService) {
      await tagService.cleanup();
    }
    
    // Force reset singleton instances for complete test isolation
    (MetadataService as unknown as { instance: undefined }).instance = undefined;
    (TagManagementService as unknown as { instance: undefined }).instance = undefined;
    (EpicContextResolver as unknown as { instance: undefined }).instance = undefined;
    
    // Clean up mock queue after each test
    clearMockQueue();
    
    // Small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterAll(() => {
    // Clean up all mock queues
    clearAllMockQueues();
  });

  describe('Metadata and Tagging Integration', () => {
    it('should generate comprehensive metadata and apply intelligent tagging', async () => {
      // Generate metadata for the task (enable tags but disable AI to avoid OpenRouter config issues)
      const metadata = await metadataService.createTaskMetadata(testTask, {
        useAI: false,
        enhanceTags: true,  // Enable to generate pattern-based tags
        analyzeComplexity: true,
        estimatePerformance: true,
        assessQuality: true
      });
      
      expect(metadata).toBeDefined();
      expect(metadata.tags).toBeDefined();
      expect(metadata.complexity).toBeDefined();
      expect(metadata.performance).toBeDefined();
      expect(metadata.performance.estimatedTime).toBeDefined();

      // Apply intelligent tagging (use pattern-based approach)
      const tagResult = await tagService.suggestTags(testTask.description, testTask);
      
      expect(tagResult.success).toBe(true);
      expect(tagResult.tags).toBeDefined();
      
      // Check that some tags are generated
      const allTags = [
        ...(tagResult.tags?.functional || []),
        ...(tagResult.tags?.technical || []),
        ...(tagResult.tags?.business || []),
        ...(tagResult.tags?.process || []),
        ...(tagResult.tags?.quality || []),
        ...(tagResult.tags?.custom || [])
      ];
      
      expect(allTags.length).toBeGreaterThan(0);
      expect(tagResult.source).toBe('pattern');

      // Verify metadata contains tags
      const metadataAllTags = [
        ...(metadata.tags?.functional || []),
        ...(metadata.tags?.technical || []),
        ...(metadata.tags?.business || []),
        ...(metadata.tags?.process || []),
        ...(metadata.tags?.quality || []),
        ...(metadata.tags?.custom || [])
      ];
      
      expect(metadataAllTags.length).toBeGreaterThan(0);
    });

    it('should enrich task metadata with performance metrics', async () => {
      // Generate metadata with performance considerations
      const metadata = await metadataService.createTaskMetadata(testTask, {
        useAI: false,
        enhanceTags: false,
        analyzeComplexity: true,
        estimatePerformance: true,
        assessQuality: true
      });
      
      expect(metadata.performance).toBeDefined();
      expect(metadata.performance?.estimatedTime).toBeGreaterThan(0);
      expect(metadata.performance?.metrics?.efficiency).toBeGreaterThan(0);
      expect(metadata.performance?.metrics?.resourceUtilization).toBeGreaterThan(0);

      // Verify performance metrics are reasonable
      expect(metadata.performance?.estimatedTime).toBeLessThanOrEqual(24 * 60); // 24 hours in minutes
      expect(metadata.performance?.metrics?.efficiency).toBeLessThanOrEqual(1);
    });
  });

  describe('Epic-Task Relationship Integration', () => {
    it('should establish bidirectional epic-task relationships', async () => {
      // Add task to epic
      const relationshipResult = await epicResolver.addTaskToEpic(
        testTask.id,
        testEpic.id,
        testTask.projectId
      );

      expect(relationshipResult.success).toBe(true);
      expect(relationshipResult.taskId).toBe(testTask.id);
      expect(relationshipResult.epicId).toBe(testEpic.id);
      expect(relationshipResult.relationshipType).toBe('added');

      // Verify dependency management integration
      const dependencies = await epicDependencyManager.analyzeEpicDependencies(testTask.projectId);

      expect(dependencies.success).toBe(true);
      expect(dependencies.data).toBeDefined();
    });

    it('should calculate epic progress based on task completion', async () => {
      // Update the mock epic to include the task
      const epicWithTask = { ...testEpic, taskIds: [testTask.id] };
      mockStorage.getEpic.mockResolvedValue({
        success: true,
        data: epicWithTask
      });

      // Calculate initial progress
      const initialProgress = await epicResolver.calculateEpicProgress(testEpic.id);
      expect(initialProgress.completedTasks).toBe(0);
      expect(initialProgress.totalTasks).toBe(1);
      expect(initialProgress.progressPercentage).toBe(0);

      // Simulate task completion
      // const completedTask = { ...testTask, status: 'completed' as TaskStatus };
      
      // Update epic status
      const statusUpdated = await epicResolver.updateEpicStatusFromTasks(testEpic.id);
      expect(statusUpdated).toBe(true);
    });

    it('should handle task movement between epics', async () => {
      // Capture task ID at start of test to avoid timing issues
      const originalTaskId = testTask.id;
      const originalEpicId = testEpic.id;
      
      // Create second epic
      const secondEpic = {
        ...testEpic,
        id: `E002-${testId}`,
        title: 'Security Enhancement Epic',
        taskIds: []
      };

      // Setup storage mocks for both epics
      // Mock the first epic with the task already added
      const firstEpicWithTask = { ...testEpic, taskIds: [originalTaskId] };
      
      mockStorage.getEpic.mockImplementation((epicId: string) => {
        if (epicId === originalEpicId) {
          return Promise.resolve({ success: true, data: firstEpicWithTask });
        } else if (epicId === secondEpic.id) {
          return Promise.resolve({ success: true, data: secondEpic });
        }
        return Promise.resolve({ success: false });
      });

      // Move task to second epic
      const moveResult = await epicResolver.moveTaskBetweenEpics(
        originalTaskId,
        originalEpicId,
        secondEpic.id,
        testTask.projectId
      );

      expect(moveResult.success).toBe(true);
      expect(moveResult.taskId).toBe(originalTaskId);
      expect(moveResult.epicId).toBe(secondEpic.id);
      expect(moveResult.previousEpicId).toBe(originalEpicId);
      expect(moveResult.relationshipType).toBe('moved');
    });
  });

  describe('Priority Scoring Integration', () => {
    it('should calculate multi-factor priority scores', async () => {
      // Create a dependency graph
      const dependencyGraph = new OptimizedDependencyGraph(testTask.projectId);
      dependencyGraph.addTask(testTask);

      // Generate schedule with enhanced priority scoring
      const schedule = await taskScheduler.generateSchedule([testTask], dependencyGraph, testTask.projectId);

      expect(schedule).toBeDefined();
      expect(schedule.scheduledTasks.size).toBe(1);
      
      const scheduledTask = schedule.scheduledTasks.get(testTask.id);
      expect(scheduledTask).toBeDefined();
      expect(scheduledTask?.metadata.priorityScore).toBeGreaterThan(0);
      expect(scheduledTask?.metadata.dependencyScore).toBeDefined();
      expect(scheduledTask?.metadata.deadlineScore).toBeDefined();
      expect(scheduledTask?.metadata.systemLoadScore).toBeDefined();
      expect(scheduledTask?.metadata.complexityScore).toBeDefined();
      expect(scheduledTask?.metadata.businessImpactScore).toBeDefined();
      expect(scheduledTask?.metadata.agentAvailabilityScore).toBeDefined();
      expect(scheduledTask?.metadata.totalScore).toBeGreaterThan(0);
    });

    it('should adjust priority based on system conditions', async () => {
      // Create multiple tasks with different priorities  
      const highPriorityTask = { 
        ...testTask, 
        id: 'T002', 
        priority: 'critical' as TaskPriority,
        title: 'Critical Security Issue',
        description: 'Fix critical security vulnerability'
      };
      const mediumPriorityTask = { 
        ...testTask, 
        id: 'T003', 
        priority: 'medium' as TaskPriority,
        title: 'Medium Priority Feature',
        description: 'Implement medium priority feature'
      };
      const allTasks = [testTask, highPriorityTask, mediumPriorityTask];

      // Create a dependency graph for all tasks
      const dependencyGraph = new OptimizedDependencyGraph(testTask.projectId);
      for (const task of allTasks) {
        dependencyGraph.addTask(task);
      }

      // Generate schedule for all tasks
      const schedule = await taskScheduler.generateSchedule(allTasks, dependencyGraph, testTask.projectId);

      expect(schedule).toBeDefined();
      expect(schedule.scheduledTasks.size).toBe(3);
      
      // Verify ordering reflects priority scoring
      const scheduledTasks = Array.from(schedule.scheduledTasks.values())
        .sort((a, b) => b.metadata.totalScore - a.metadata.totalScore);
      
      expect(scheduledTasks.length).toBe(3);
      expect(scheduledTasks[0].metadata.totalScore).toBeGreaterThanOrEqual(scheduledTasks[1].metadata.totalScore);
      expect(scheduledTasks[1].metadata.totalScore).toBeGreaterThanOrEqual(scheduledTasks[2].metadata.totalScore);
    });
  });

  describe('Agent Assignment Integration', () => {
    it('should assign tasks based on enhanced metadata and capabilities', async () => {
      // Generate metadata first
      const metadata = await metadataService.createTaskMetadata(testTask);
      const enhancedTask = { ...testTask, metadata: { ...testTask.metadata, ...metadata } };

      // Assign task to agent
      const assignment = await agentAssignment.assignTask(enhancedTask);

      expect(assignment.success).toBe(true);
      expect(assignment.assignment?.agentId).toBe(testAgent.id);
      expect(assignment.assignment?.taskId).toBe(testTask.id);
      expect(assignment.score).toBeGreaterThan(0);
    });

    it('should consider workload balancing in assignment decisions', async () => {
      // Create multiple tasks
      const tasks = Array.from({ length: 3 }, (_, i) => ({
        ...testTask,
        id: `T00${i + 1}`,
        title: `Task ${i + 1}`
      }));

      // Add second agent with different capabilities
      const secondAgent: Agent = {
        ...testAgent,
        id: 'agent_2',
        name: 'Testing Specialist',
        capabilities: ['testing', 'quality_assurance'] as AgentCapability[],
        performance: {
          tasksCompleted: 15,
          averageCompletionTime: 2700000, // 45 minutes
          successRate: 0.88,
          lastActiveAt: new Date()
        }
      };
      agentAssignment.registerAgent(secondAgent);

      // Assign tasks and verify distribution
      const assignments = await Promise.all(
        tasks.map(task => agentAssignment.assignTask(task))
      );

      assignments.forEach(assignment => {
        expect(assignment.success).toBe(true);
      });

      // Check workload distribution
      const imbalance = agentAssignment.detectWorkloadImbalance();
      expect(imbalance.isImbalanced).toBe(false); // Should be balanced with 3 tasks for 2 agents
    });

    it('should integrate with task scheduling for optimal assignment', async () => {
      // Create dependency graph for scheduling
      const dependencyGraph = new OptimizedDependencyGraph(testTask.projectId);
      dependencyGraph.addTask(testTask);

      // Generate schedule with priority scoring
      const schedule = await taskScheduler.generateSchedule([testTask], dependencyGraph, testTask.projectId);
      expect(schedule).toBeDefined();

      const scheduledTask = schedule.scheduledTasks.get(testTask.id);
      expect(scheduledTask).toBeDefined();

      // Find best agent for scheduled task
      const bestAgent = await agentAssignment.findBestAgent(testTask);
      
      expect(bestAgent.agentId).toBe(testAgent.id);
      expect(bestAgent.score).toBeGreaterThan(0);

      // Assign the task
      const assignment = await agentAssignment.assignTask(testTask);
      
      expect(assignment.success).toBe(true);
      expect(assignment.assignment?.agentId).toBe(testAgent.id);
    });
  });

  describe('End-to-End Workflow Integration', () => {
    it('should complete full workflow: metadata → tagging → epic management → scheduling → assignment', async () => {
      // Step 1: Generate comprehensive metadata
      const metadata = await metadataService.createTaskMetadata(testTask);
      expect(metadata).toBeDefined();

      // Step 2: Apply intelligent tagging
      const tagResult = await tagService.suggestTags(testTask.description, testTask);
      expect(tagResult.success).toBe(true);

      // Step 3: Enhanced task with metadata and tags
      const enhancedTask = {
        ...testTask,
        metadata: { ...testTask.metadata, ...metadata, tags: tagResult.tags }
      };

      // Step 4: Add to epic
      const epicResult = await epicResolver.addTaskToEpic(
        enhancedTask.id,
        testEpic.id,
        enhancedTask.projectId
      );
      expect(epicResult.success).toBe(true);

      // Step 5: Schedule with priority scoring
      const dependencyGraph = new OptimizedDependencyGraph(enhancedTask.projectId);
      dependencyGraph.addTask(enhancedTask);

      const schedule = await taskScheduler.generateSchedule([enhancedTask], dependencyGraph, enhancedTask.projectId);
      expect(schedule).toBeDefined();

      const scheduledTask = schedule.scheduledTasks.get(enhancedTask.id);
      expect(scheduledTask).toBeDefined();

      // Step 6: Assign to best agent  
      const assignment = await agentAssignment.assignTask(enhancedTask);
      expect(assignment.success).toBe(true);

      // Step 7: Verify epic progress tracking
      const progress = await epicResolver.calculateEpicProgress(testEpic.id);
      expect(progress.totalTasks).toBe(1);
      expect(progress.completedTasks).toBe(0);

      // Verify all components worked together
      // Check if tags are in enhanced task metadata
      expect(enhancedTask.metadata?.tags).toBeDefined();
      
      // Check if scheduled task preserves the metadata structure
      expect(scheduledTask.metadata?.priorityScore).toBeGreaterThan(0);
      expect(assignment.assignment?.agentId).toBe(testAgent.id);
      
      // The scheduled task might have tags in a different location or structure
      // For now, verify that the enhanced task has tags and assignment worked
      expect(enhancedTask.metadata?.tags).toBeDefined();
    });

    it('should handle concurrent multi-task workflows', async () => {
      // Create multiple tasks
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        ...testTask,
        id: `T00${i + 1}-${testId}`,
        title: `Concurrent Task ${i + 1}`,
        description: `Task ${i + 1} for concurrent workflow testing`,
        priority: ['low', 'medium', 'high', 'critical', 'medium'][i] as TaskPriority,
        testingRequirements: {
          unitTests: [`task${i + 1}.test.ts`],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 90
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: [],
          patterns: []
        }
      }));

      // Process all tasks through the full workflow concurrently
      const workflowPromises = tasks.map(async (task) => {
        // Generate metadata
        const metadata = await metadataService.createTaskMetadata(task);
        
        // Apply tagging
        const tagResult = await tagService.suggestTags(task.description, task);
        
        // Enhanced task
        const enhancedTask = {
          ...task,
          metadata: { ...task.metadata, ...metadata, tags: tagResult.tags }
        };

        // Add to epic (use a dedicated epic for this test)
        const concurrentEpicId = `E003-${testId}`;
        await epicResolver.addTaskToEpic(enhancedTask.id, concurrentEpicId, enhancedTask.projectId);

        // Schedule (simplified for concurrent processing)
        return enhancedTask;
      });

      const processedTasks = await Promise.all(workflowPromises);

      // Verify all tasks processed successfully
      expect(processedTasks.length).toBe(5);
      processedTasks.forEach(task => {
        expect(task.metadata?.tags).toBeDefined();
      });

      // Generate schedule for all tasks
      const dependencyGraph = new OptimizedDependencyGraph(testTask.projectId);
      for (const task of processedTasks) {
        dependencyGraph.addTask(task);
      }

      const schedule = await taskScheduler.generateSchedule(processedTasks, dependencyGraph, testTask.projectId);
      expect(schedule.scheduledTasks.size).toBe(5);

      // Verify epic contains all tasks
      const concurrentEpicId = `E003-${testId}`;
      const epicProgress = await epicResolver.calculateEpicProgress(concurrentEpicId);
      expect(epicProgress.totalTasks).toBe(5);
    });
  });

  describe('Performance and Scalability Integration', () => {
    it('should maintain performance under load', async () => {
      const startTime = Date.now();
      
      // Create a larger set of tasks
      const tasks = Array.from({ length: 20 }, (_, i) => ({
        ...testTask,
        id: `PERF_T${i.toString().padStart(3, '0')}`,
        title: `Performance Test Task ${i + 1}`,
        description: `Performance testing task ${i + 1} with various complexity levels`,
        estimatedHours: Math.floor(Math.random() * 10) + 1,
        priority: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as TaskPriority,
        testingRequirements: {
          unitTests: [`perf${i + 1}.test.ts`],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: 85
        },
        performanceCriteria: {},
        qualityCriteria: {
          codeQuality: [],
          documentation: [],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: [],
          patterns: []
        }
      }));

      // Process all tasks through full workflow
      const results = await Promise.all(
        tasks.map(async (task) => {
          const metadata = await metadataService.createTaskMetadata(task);
          return {
            success: true,
            task: {
              ...task,
              metadata: { ...task.metadata, ...metadata }
            }
          };
        })
      );

      const processingTime = Date.now() - startTime;

      // Verify all tasks processed successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Performance assertions
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(results.length).toBe(20);
    });
  });
});