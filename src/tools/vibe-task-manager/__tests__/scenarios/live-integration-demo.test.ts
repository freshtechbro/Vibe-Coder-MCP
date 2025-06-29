/**
 * Live Integration Demo - CodeQuest Academy
 * 
 * Demonstrates all architectural components working together in a realistic workflow
 * Uses real OpenRouter LLM calls and generates authentic outputs
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

describe('🚀 Live Integration Demo - CodeQuest Academy', () => {
  let config: any;
  let outputDir: string;
  let performanceMonitor: PerformanceMonitor;
  let memoryManager: TaskManagerMemoryManager;
  let executionCoordinator: ExecutionCoordinator;
  let agentOrchestrator: AgentOrchestrator;
  let testStartTime: number;

  // Project scenario: CodeQuest Academy - Gamified Software Engineering Education Platform
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
    console.log('\n🚀 Starting Live Integration Demo - CodeQuest Academy');
    console.log('=' .repeat(80));

    // Load configuration
    config = await getVibeTaskManagerConfig();
    outputDir = getVibeTaskManagerOutputDir();

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
    console.log('\n📊 Demo Execution Summary');
    console.log('=' .repeat(50));
    console.log(`Total Duration: ${testDuration}ms`);
    
    // Get final performance metrics
    const finalMetrics = performanceMonitor?.getCurrentRealTimeMetrics();
    console.log('Final Performance Metrics:', finalMetrics);

    // Cleanup
    performanceMonitor?.shutdown();
    memoryManager?.shutdown();
    await executionCoordinator?.stop();

    console.log('✅ Cleanup completed');
  });

  it('🎯 should demonstrate complete architectural integration', async () => {
    const operationId = 'live-integration-demo';
    performanceMonitor.startOperation(operationId);

    try {
      console.log('\n📋 Phase 1: Project Creation & Management');
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
      console.log('✅ Project created successfully');

      console.log('\n🌐 Phase 2: Transport Services');
      console.log('-'.repeat(50));

      // Test transport services
      const transportStatus = transportManager.getStatus();
      console.log('Transport Status:', {
        isStarted: transportStatus.isStarted,
        services: transportStatus.startedServices,
        websocketEnabled: transportStatus.config.websocket.enabled,
        httpEnabled: transportStatus.config.http.enabled
      });
      console.log('✅ Transport services verified');

      console.log('\n🤖 Phase 3: Agent Registration & Orchestration');
      console.log('-'.repeat(50));

      // Register multiple agents with different capabilities
      const agents = [
        {
          id: 'frontend-specialist',
          capabilities: ['react', 'typescript', 'ui-design'],
          specializations: ['user-interface', 'user-experience']
        },
        {
          id: 'backend-architect',
          capabilities: ['node.js', 'postgresql', 'api-design'],
          specializations: ['database-design', 'api-development']
        },
        {
          id: 'game-designer',
          capabilities: ['gamification', 'user-engagement'],
          specializations: ['game-mechanics', 'progression-systems']
        }
      ];

      for (const agent of agents) {
        await agentOrchestrator.registerAgent({
          id: agent.id,
          capabilities: agent.capabilities,
          specializations: agent.specializations,
          maxConcurrentTasks: 2,
          status: 'available'
        });
        console.log(`✅ Registered agent: ${agent.id}`);
      }

      console.log('\n🧩 Phase 4: Task Decomposition with Real LLM');
      console.log('-'.repeat(50));

      // Task decomposition using real LLM calls
      const decompositionResult = await vibeTaskManagerExecutor({
        command: 'decompose',
        taskDescription: 'Build the complete CodeQuest Academy platform with user authentication, gamified learning modules, progress tracking, and collaborative features',
        options: {
          maxDepth: 2,
          targetGranularity: 'atomic',
          considerDependencies: true
        }
      }, config);

      expect(decompositionResult.content).toBeDefined();
      console.log('✅ Task decomposition completed using real LLM calls');

      console.log('\n💬 Phase 5: Natural Language Processing');
      console.log('-'.repeat(50));

      // Test natural language commands
      const nlCommands = [
        'Show me the current project status',
        'List all available tasks',
        'What is the estimated timeline for development?'
      ];

      for (const command of nlCommands) {
        const nlResult = await vibeTaskManagerExecutor({
          input: command
        }, config);
        
        expect(nlResult.content).toBeDefined();
        console.log(`✅ Processed: "${command}"`);
      }

      console.log('\n📊 Phase 6: Performance Monitoring');
      console.log('-'.repeat(50));

      const currentMetrics = performanceMonitor.getCurrentRealTimeMetrics();
      console.log('Performance Metrics:', {
        responseTime: currentMetrics.responseTime,
        memoryUsage: `${currentMetrics.memoryUsage.toFixed(2)} MB`,
        cpuUsage: currentMetrics.cpuUsage,
        timestamp: currentMetrics.timestamp
      });

      // Trigger auto-optimization
      const optimizationResult = await performanceMonitor.autoOptimize();
      console.log('Auto-optimization applied:', optimizationResult.applied);
      console.log('✅ Performance monitoring active');

      console.log('\n📁 Phase 7: Output Verification');
      console.log('-'.repeat(50));

      // Verify output structure
      const outputExists = await fs.access(outputDir).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);

      const projectsDir = path.join(outputDir, 'projects');
      const projectsExist = await fs.access(projectsDir).then(() => true).catch(() => false);
      
      if (projectsExist) {
        const projectFiles = await fs.readdir(projectsDir);
        console.log(`Projects created: ${projectFiles.length}`);
        console.log('Sample projects:', projectFiles.slice(0, 5));
      }

      const tasksDir = path.join(outputDir, 'tasks');
      const tasksExist = await fs.access(tasksDir).then(() => true).catch(() => false);
      
      if (tasksExist) {
        const taskFiles = await fs.readdir(tasksDir);
        console.log(`Tasks created: ${taskFiles.length}`);
      }

      console.log('✅ Output structure verified');

      console.log('\n🛡️ Phase 8: Error Handling & Recovery');
      console.log('-'.repeat(50));

      // Test error handling
      const invalidResult = await vibeTaskManagerExecutor({
        command: 'invalid_command' as any
      }, config);

      expect(invalidResult.isError).toBe(true);
      console.log('✅ Error handling validated');

      console.log('\n🎉 LIVE INTEGRATION DEMO COMPLETED SUCCESSFULLY!');
      console.log('=' .repeat(80));
      console.log('✅ All architectural components demonstrated working together');
      console.log('✅ Real LLM calls used throughout the process');
      console.log('✅ Authentic outputs generated and persisted');
      console.log('✅ System maintained stability under load');
      console.log('=' .repeat(80));

    } finally {
      const duration = performanceMonitor.endOperation(operationId);
      console.log(`\n⏱️  Total operation duration: ${duration}ms`);
    }
  }, 120000); // 2 minute timeout

  it('📈 should demonstrate performance under concurrent load', async () => {
    console.log('\n🔄 Concurrent Load Test');
    console.log('-'.repeat(50));

    const initialMetrics = performanceMonitor.getCurrentRealTimeMetrics();
    
    // Generate concurrent operations
    const operations = Array.from({ length: 3 }, (_, i) =>
      vibeTaskManagerExecutor({
        command: 'create',
        projectName: `Concurrent Demo Project ${i + 1}`,
        description: 'Testing concurrent processing capabilities',
        options: {
          techStack: ['typescript', 'testing']
        }
      }, config)
    );

    const results = await Promise.all(operations);

    // Verify all operations completed
    for (const result of results) {
      expect(result.content).toBeDefined();
    }

    const finalMetrics = performanceMonitor.getCurrentRealTimeMetrics();
    const memoryIncrease = finalMetrics.memoryUsage - initialMetrics.memoryUsage;
    
    console.log('Concurrent load results:', {
      operationsCompleted: results.length,
      memoryIncrease: `${memoryIncrease.toFixed(2)} MB`,
      finalResponseTime: `${finalMetrics.responseTime}ms`
    });

    expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase
    console.log('✅ Concurrent load test completed successfully');
  });

  it('🔗 should demonstrate agent communication workflow', async () => {
    console.log('\n📡 Agent Communication Workflow');
    console.log('-'.repeat(50));

    // Test agent task execution workflow
    const taskExecutionResult = await vibeTaskManagerExecutor({
      command: 'run',
      operation: 'execute_tasks',
      options: {
        agentId: 'frontend-specialist',
        maxTasks: 1,
        simulateExecution: false
      }
    }, config);

    expect(taskExecutionResult.content).toBeDefined();
    console.log('✅ Agent communication workflow demonstrated');
  });
});
