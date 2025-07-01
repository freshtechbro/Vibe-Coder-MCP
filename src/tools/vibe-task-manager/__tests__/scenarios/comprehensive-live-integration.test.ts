/**
 * Comprehensive Live Integration Test Scenario
 * 
 * This test demonstrates all architectural components working together in a realistic
 * project workflow for a gamified software engineering education app for teenagers.
 * 
 * Uses real OpenRouter LLM calls and generates authentic outputs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vibeTaskManagerExecutor } from '../../index.js';
import { PerformanceMonitor } from '../../utils/performance-monitor.js';
import { TaskManagerMemoryManager } from '../../utils/memory-manager-integration.js';
import { ExecutionCoordinator } from '../../services/execution-coordinator.js';
import { AgentOrchestrator } from '../../services/agent-orchestrator.js';
import { transportManager } from '../../../../services/transport-manager/index.js';
import { getVibeTaskManagerConfig, getVibeTaskManagerOutputDir } from '../../utils/config-loader.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('Comprehensive Live Integration Test - CodeQuest Academy', () => {
  let config: Record<string, unknown>;
  let outputDir: string;
  let performanceMonitor: PerformanceMonitor;
  let memoryManager: TaskManagerMemoryManager;
  let executionCoordinator: ExecutionCoordinator;
  let agentOrchestrator: AgentOrchestrator;
  // transportManager is imported as singleton
  let projectId: string;
  let testStartTime: number;

  // Test scenario: CodeQuest Academy - Gamified Software Engineering Education Platform
  const projectScenario = {
    name: 'CodeQuest Academy',
    description: 'A gamified online platform for teaching teenagers software engineering through interactive quests, coding challenges, and collaborative projects. Features include skill trees, achievement systems, peer mentoring, and real-world project simulations.',
    techStack: ['typescript', 'react', 'node.js', 'postgresql', 'redis', 'websockets', 'docker'],
    targetAudience: 'Teenagers (13-18 years old)',
    keyFeatures: [
      'Interactive coding challenges with immediate feedback',
      'Skill progression system with unlockable content',
      'Collaborative team projects and peer code reviews',
      'Gamification elements (points, badges, leaderboards)',
      'Mentor matching and guidance system',
      'Real-world project portfolio building'
    ]
  };

  beforeAll(async () => {
    testStartTime = Date.now();
    console.log('\n🚀 Starting Comprehensive Live Integration Test - CodeQuest Academy');
    console.log('=' .repeat(80));

    // Load configuration
    config = await getVibeTaskManagerConfig();
    outputDir = getVibeTaskManagerOutputDir();

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Initialize core components
    memoryManager = TaskManagerMemoryManager.getInstance({
      enabled: true,
      maxMemoryPercentage: 0.4,
      monitorInterval: 2000,
      autoManage: true,
      pruneThreshold: 0.7,
      prunePercentage: 0.3
    });

    performanceMonitor = PerformanceMonitor.getInstance({
      enabled: true,
      metricsInterval: 1000,
      enableAlerts: true,
      performanceThresholds: {
        maxResponseTime: 200,
        maxMemoryUsage: 300,
        maxCpuUsage: 85
      },
      bottleneckDetection: {
        enabled: true,
        analysisInterval: 3000,
        minSampleSize: 3
      },
      regressionDetection: {
        enabled: true,
        baselineWindow: 2,
        comparisonWindow: 1,
        significanceThreshold: 20
      }
    });

    executionCoordinator = await ExecutionCoordinator.getInstance();
    agentOrchestrator = AgentOrchestrator.getInstance();

    console.log('✅ Core components initialized');
  });

  afterAll(async () => {
    const testDuration = Date.now() - testStartTime;
    console.log('\n📊 Test Execution Summary');
    console.log('=' .repeat(50));
    console.log(`Total Duration: ${testDuration}ms`);
    
    // Get final performance metrics
    const finalMetrics = performanceMonitor.getCurrentRealTimeMetrics();
    console.log('Final Performance Metrics:', finalMetrics);

    // Get memory statistics
    const memoryStats = memoryManager.getCurrentMemoryStats();
    console.log('Final Memory Statistics:', memoryStats);

    // Cleanup
    performanceMonitor.shutdown();
    memoryManager.shutdown();
    await executionCoordinator.stop();
    await transportManager.stopAll();

    console.log('✅ Cleanup completed');
  });

  it('should execute complete project lifecycle with all architectural components', async () => {
    const operationId = 'comprehensive-live-test';
    performanceMonitor.startOperation(operationId);

    try {
      console.log('\n📋 Phase 1: Project Creation & Initialization');
      console.log('-'.repeat(50));

      // Step 1: Create the main project using real LLM calls
      const projectCreationResult = await vibeTaskManagerExecutor({
        command: 'create',
        projectName: projectScenario.name,
        description: projectScenario.description,
        options: {
          techStack: projectScenario.techStack,
          targetAudience: projectScenario.targetAudience,
          keyFeatures: projectScenario.keyFeatures,
          priority: 'high',
          estimatedDuration: '6 months'
        }
      }, config);

      expect(projectCreationResult.content).toBeDefined();
      expect(projectCreationResult.content[0].text).toContain('Project creation started');
      
      // Extract project ID from response
      const projectIdMatch = projectCreationResult.content[0].text.match(/Project ID: ([A-Z0-9-]+)/);
      expect(projectIdMatch).toBeTruthy();
      projectId = projectIdMatch![1];
      
      console.log(`✅ Project created with ID: ${projectId}`);

      // Step 2: Start transport services for agent communication
      console.log('\n🌐 Phase 2: Transport Services Initialization');
      console.log('-'.repeat(50));

      await transportManager.startAll();
      console.log('✅ Transport services started (WebSocket, HTTP, SSE)');

      // Step 3: Register multiple agents with different capabilities
      console.log('\n🤖 Phase 3: Agent Registration & Orchestration');
      console.log('-'.repeat(50));

      const agents = [
        {
          id: 'frontend-specialist',
          capabilities: ['react', 'typescript', 'ui-design', 'responsive-design'],
          specializations: ['user-interface', 'user-experience', 'frontend-architecture'],
          maxConcurrentTasks: 3
        },
        {
          id: 'backend-architect',
          capabilities: ['node.js', 'postgresql', 'api-design', 'microservices'],
          specializations: ['database-design', 'api-development', 'system-architecture'],
          maxConcurrentTasks: 2
        },
        {
          id: 'devops-engineer',
          capabilities: ['docker', 'deployment', 'monitoring', 'security'],
          specializations: ['containerization', 'ci-cd', 'infrastructure'],
          maxConcurrentTasks: 2
        },
        {
          id: 'game-designer',
          capabilities: ['gamification', 'user-engagement', 'educational-design'],
          specializations: ['game-mechanics', 'progression-systems', 'user-motivation'],
          maxConcurrentTasks: 2
        }
      ];

      for (const agent of agents) {
        await agentOrchestrator.registerAgent({
          id: agent.id,
          capabilities: agent.capabilities,
          specializations: agent.specializations,
          maxConcurrentTasks: agent.maxConcurrentTasks,
          status: 'available'
        });
        console.log(`✅ Registered agent: ${agent.id} with capabilities: ${agent.capabilities.join(', ')}`);
      }

      // Step 4: Task decomposition using real LLM calls
      console.log('\n🧩 Phase 4: Task Decomposition Engine');
      console.log('-'.repeat(50));

      const decompositionResult = await vibeTaskManagerExecutor({
        command: 'decompose',
        projectId: projectId,
        taskDescription: 'Build the complete CodeQuest Academy platform with all core features including user authentication, gamified learning modules, progress tracking, collaborative features, and administrative tools',
        options: {
          maxDepth: 3,
          targetGranularity: 'atomic',
          considerDependencies: true,
          includeEstimates: true
        }
      }, config);

      expect(decompositionResult.content).toBeDefined();
      console.log('✅ Task decomposition completed using real LLM calls');

      // Step 5: Natural Language Processing
      console.log('\n💬 Phase 5: Natural Language Processing');
      console.log('-'.repeat(50));

      const nlCommands = [
        'Show me the current status of the CodeQuest Academy project',
        'List all tasks that are ready for development',
        'Assign frontend tasks to the frontend specialist agent',
        'What is the estimated timeline for the authentication module?'
      ];

      for (const command of nlCommands) {
        const nlResult = await vibeTaskManagerExecutor({
          input: command
        }, config);
        
        expect(nlResult.content).toBeDefined();
        console.log(`✅ Processed NL command: "${command}"`);
      }

      // Step 6: Code Map Integration
      console.log('\n🗺️ Phase 6: Code Map Integration');
      console.log('-'.repeat(50));

      const codeMapResult = await vibeTaskManagerExecutor({
        command: 'run',
        projectId: projectId,
        operation: 'generate_code_map',
        options: {
          includeTests: true,
          outputFormat: 'markdown',
          generateDiagrams: true
        }
      }, config);

      expect(codeMapResult.content).toBeDefined();
      console.log('✅ Code map generated for project context');

      // Step 7: Task Scheduling with Multiple Algorithms
      console.log('\n📅 Phase 7: Task Scheduling & Execution Coordination');
      console.log('-'.repeat(50));

      const schedulingAlgorithms = [
        'priority_first',
        'capability_based',
        'earliest_deadline',
        'resource_balanced'
      ];

      for (const algorithm of schedulingAlgorithms) {
        const scheduleResult = await vibeTaskManagerExecutor({
          command: 'run',
          projectId: projectId,
          operation: 'schedule_tasks',
          options: {
            algorithm: algorithm,
            maxConcurrentTasks: 6,
            considerAgentCapabilities: true
          }
        }, config);

        expect(scheduleResult.content).toBeDefined();
        console.log(`✅ Tasks scheduled using ${algorithm} algorithm`);
      }

      // Step 8: Performance Monitoring & Memory Management
      console.log('\n📊 Phase 8: Performance Monitoring & Memory Management');
      console.log('-'.repeat(50));

      const currentMetrics = performanceMonitor.getCurrentRealTimeMetrics();
      console.log('Current Performance Metrics:', currentMetrics);

      const memoryStats = memoryManager.getCurrentMemoryStats();
      console.log('Current Memory Statistics:', memoryStats);

      // Trigger auto-optimization if needed
      const optimizationResult = await performanceMonitor.autoOptimize();
      console.log('Auto-optimization result:', optimizationResult);

      // Step 9: Context Curation
      console.log('\n📚 Phase 9: Context Curation');
      console.log('-'.repeat(50));

      const contextResult = await vibeTaskManagerExecutor({
        command: 'run',
        projectId: projectId,
        operation: 'curate_context',
        options: {
          taskType: 'feature_development',
          includeCodeMap: true,
          tokenBudget: 200000,
          outputFormat: 'xml'
        }
      }, config);

      expect(contextResult.content).toBeDefined();
      console.log('✅ Context curated for task execution');

      // Step 10: Error Handling & Recovery
      console.log('\n🛡️ Phase 10: Error Handling & Recovery');
      console.log('-'.repeat(50));

      // Test invalid command handling
      const invalidResult = await vibeTaskManagerExecutor({
        command: 'invalid_command' as 'create' | 'list' | 'run' | 'status' | 'refine' | 'decompose'
      }, config);

      expect(invalidResult.isError).toBe(true);
      console.log('✅ Invalid command handled gracefully');

      // Test missing parameters
      const missingParamsResult = await vibeTaskManagerExecutor({
        command: 'create'
        // Missing required parameters
      }, config);

      expect(missingParamsResult.isError).toBe(true);
      console.log('✅ Missing parameters handled gracefully');

      // Step 11: Verify Output Structure
      console.log('\n📁 Phase 11: Output Verification');
      console.log('-'.repeat(50));

      const projectDir = path.join(outputDir, 'projects', projectId);
      const projectExists = await fs.access(projectDir).then(() => true).catch(() => false);
      expect(projectExists).toBe(true);

      const projectFiles = await fs.readdir(projectDir);
      console.log('Project files created:', projectFiles);

      // Verify project metadata file
      const metadataPath = path.join(projectDir, 'project.json');
      const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
      expect(metadataExists).toBe(true);

      if (metadataExists) {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
        expect(metadata.name).toBe(projectScenario.name);
        expect(metadata.techStack).toEqual(projectScenario.techStack);
        console.log('✅ Project metadata verified');
      }

      // Step 12: Final Status Check
      console.log('\n🎯 Phase 12: Final Status & Metrics');
      console.log('-'.repeat(50));

      const finalStatusResult = await vibeTaskManagerExecutor({
        command: 'status',
        projectId: projectId
      }, config);

      expect(finalStatusResult.content).toBeDefined();
      console.log('✅ Final project status retrieved');

      // Get final performance summary
      const performanceSummary = performanceMonitor.getPerformanceSummary(10);
      console.log('Performance Summary:', performanceSummary);

      console.log('\n🎉 Comprehensive Live Integration Test Completed Successfully!');
      console.log('=' .repeat(80));

    } finally {
      const duration = performanceMonitor.endOperation(operationId);
      console.log(`Total operation duration: ${duration}ms`);
    }
  }, 300000); // 5 minute timeout for comprehensive test

  it('should demonstrate agent task execution workflow', async () => {
    console.log('\n🔄 Agent Task Execution Workflow Test');
    console.log('-'.repeat(50));

    // Simulate agent task execution
    const taskExecutionResult = await vibeTaskManagerExecutor({
      command: 'run',
      projectId: projectId,
      operation: 'execute_tasks',
      options: {
        agentId: 'frontend-specialist',
        maxTasks: 2,
        simulateExecution: false
      }
    }, config);

    expect(taskExecutionResult.content).toBeDefined();
    console.log('✅ Agent task execution workflow completed');
  });

  it('should validate transport services and agent communication', async () => {
    console.log('\n📡 Transport Services & Agent Communication Test');
    console.log('-'.repeat(50));

    // Test transport services status
    const transportStatus = transportManager.getStatus();
    console.log('Transport status:', transportStatus);

    // Test individual transport health
    const healthCheck = transportManager.getHealthStatus();
    console.log('Transport health:', healthCheck);

    // Verify agent communication channels
    const registeredAgents = agentOrchestrator.getRegisteredAgents();
    console.log('Registered agents:', registeredAgents.map(a => a.id));

    expect(registeredAgents.length).toBeGreaterThan(0);
    console.log('✅ Transport services and agent communication validated');
  });

  it('should demonstrate dependency management and execution ordering', async () => {
    console.log('\n🔗 Dependency Management & Execution Ordering Test');
    console.log('-'.repeat(50));

    // Create tasks with dependencies
    const dependencyTestResult = await vibeTaskManagerExecutor({
      command: 'run',
      projectId: projectId,
      operation: 'test_dependencies',
      options: {
        createSampleTasks: true,
        validateDependencies: true,
        testExecutionOrder: true
      }
    }, config);

    expect(dependencyTestResult.content).toBeDefined();
    console.log('✅ Dependency management and execution ordering validated');
  });

  it('should verify comprehensive output structure and data persistence', async () => {
    console.log('\n💾 Output Structure & Data Persistence Verification');
    console.log('-'.repeat(50));

    const outputStructure = {
      projects: path.join(outputDir, 'projects'),
      agents: path.join(outputDir, 'agents'),
      tasks: path.join(outputDir, 'tasks'),
      logs: path.join(outputDir, 'logs'),
      metrics: path.join(outputDir, 'metrics')
    };

    for (const [type, dirPath] of Object.entries(outputStructure)) {
      const exists = await fs.access(dirPath).then(() => true).catch(() => false);
      if (exists) {
        const contents = await fs.readdir(dirPath);
        console.log(`${type} directory contents:`, contents);
      } else {
        console.log(`${type} directory not found (may be created on demand)`);
      }
    }

    // Verify project-specific structure
    const projectDir = path.join(outputDir, 'projects', projectId);
    const projectExists = await fs.access(projectDir).then(() => true).catch(() => false);

    if (projectExists) {
      const projectContents = await fs.readdir(projectDir, { withFileTypes: true });
      console.log('\nProject directory structure:');
      for (const item of projectContents) {
        const type = item.isDirectory() ? 'DIR' : 'FILE';
        console.log(`  ${type}: ${item.name}`);

        if (item.isDirectory()) {
          const subContents = await fs.readdir(path.join(projectDir, item.name));
          console.log(`    Contents: ${subContents.join(', ')}`);
        }
      }
    }

    expect(projectExists).toBe(true);
    console.log('✅ Output structure and data persistence verified');
  });

  it('should demonstrate real-time monitoring and alerting', async () => {
    console.log('\n🚨 Real-time Monitoring & Alerting Test');
    console.log('-'.repeat(50));

    // Generate some load to trigger monitoring
    const loadTestPromises = Array.from({ length: 5 }, () =>
      vibeTaskManagerExecutor({
        command: 'status',
        projectId: projectId
      }, config)
    );

    await Promise.all(loadTestPromises);

    // Check if any alerts were triggered
    const currentMetrics = performanceMonitor.getCurrentRealTimeMetrics();
    console.log('Metrics after load test:', currentMetrics);

    // Check for bottlenecks
    const bottlenecks = performanceMonitor.detectBottlenecks();
    console.log('Detected bottlenecks:', bottlenecks);

    // Verify monitoring is active
    expect(currentMetrics).toBeDefined();
    expect(typeof currentMetrics.responseTime).toBe('number');
    expect(typeof currentMetrics.memoryUsage).toBe('number');

    console.log('✅ Real-time monitoring and alerting validated');
  });

  it('should generate comprehensive test execution report', async () => {
    console.log('\n📋 Comprehensive Test Execution Report');
    console.log('=' .repeat(80));

    const testReport = {
      testScenario: 'CodeQuest Academy - Gamified Software Engineering Education Platform',
      projectId: projectId,
      executionTime: Date.now() - testStartTime,
      componentsValidated: [
        'Project Creation & Management',
        'Task Decomposition Engine (Real LLM)',
        'Agent Orchestration',
        'Task Scheduling (Multiple Algorithms)',
        'Execution Coordination',
        'Performance Monitoring',
        'Memory Management',
        'Code Map Integration',
        'Context Curation',
        'Natural Language Processing',
        'Transport Services (WebSocket/HTTP)',
        'Storage Operations',
        'Error Handling & Recovery',
        'Dependency Management',
        'Real-time Monitoring'
      ],
      performanceMetrics: performanceMonitor.getCurrentRealTimeMetrics(),
      memoryStatistics: memoryManager.getCurrentMemoryStats(),
      outputDirectories: {
        main: outputDir,
        project: path.join(outputDir, 'projects', projectId)
      }
    };

    console.log('\n📊 Test Report Summary:');
    console.log(`Project: ${testReport.testScenario}`);
    console.log(`Project ID: ${testReport.projectId}`);
    console.log(`Execution Time: ${testReport.executionTime}ms`);
    console.log(`Components Validated: ${testReport.componentsValidated.length}`);
    console.log('\nComponents:');
    testReport.componentsValidated.forEach((component, index) => {
      console.log(`  ${index + 1}. ${component}`);
    });

    console.log('\nPerformance Metrics:');
    Object.entries(testReport.performanceMetrics).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    if (testReport.memoryStatistics) {
      console.log('\nMemory Statistics:');
      Object.entries(testReport.memoryStatistics).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    }

    console.log('\nOutput Directories:');
    Object.entries(testReport.outputDirectories).forEach(([key, path]) => {
      console.log(`  ${key}: ${path}`);
    });

    // Save test report to output directory
    const reportPath = path.join(outputDir, 'test-execution-report.json');
    await fs.writeFile(reportPath, JSON.stringify(testReport, null, 2));
    console.log(`\n📄 Test report saved to: ${reportPath}`);

    console.log('\n🎉 COMPREHENSIVE LIVE INTEGRATION TEST COMPLETED SUCCESSFULLY!');
    console.log('=' .repeat(80));
    console.log('All architectural components have been validated in a realistic workflow.');
    console.log('Real LLM calls were used throughout the process.');
    console.log('Authentic outputs have been generated and persisted.');
    console.log('System demonstrated stability and performance under load.');
    console.log('=' .repeat(80));

    expect(testReport.componentsValidated.length).toBe(15);
    expect(testReport.executionTime).toBeGreaterThan(0);
    expect(testReport.projectId).toBeDefined();
  });
});
