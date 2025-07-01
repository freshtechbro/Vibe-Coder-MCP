/**
 * Progress Tracking Integration Test
 * 
 * This test validates that progress tracking is properly integrated across
 * all vibe task manager components and provides meaningful progress updates.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DecompositionService } from '../services/decomposition-service.js';
import { ProgressTracker, ProgressEventData, ProgressEvent } from '../services/progress-tracker.js';
import { getOpenRouterConfig } from '../../../utils/openrouter-config-manager.js';
import { AtomicTask, TaskPriority } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';
import logger from '../../../logger.js';

describe('Progress Tracking Integration', () => {
  let decompositionService: DecompositionService;
  let progressTracker: ProgressTracker;
  let config: Record<string, unknown>;

  // Test project context
  const testProjectContext: ProjectContext = {
    projectId: 'progress-tracking-test',
    projectPath: '/Users/bishopdotun/Documents/Dev Projects/Vibe-Coder-MCP',
    projectName: 'Progress Tracking Integration Test',
    description: 'Testing comprehensive progress tracking across all vibe task manager components',
    languages: ['TypeScript'],
    frameworks: ['Node.js', 'Vitest'],
    buildTools: ['npm', 'tsc'],
    tools: ['ESLint'],
    configFiles: ['package.json', 'tsconfig.json'],
    entryPoints: ['src/index.ts'],
    architecturalPatterns: ['singleton', 'event-driven'],
    existingTasks: [],
    codebaseSize: 'large',
    teamSize: 2,
    complexity: 'high',
    structure: {
      sourceDirectories: ['src'],
      testDirectories: ['__tests__'],
      docDirectories: ['docs'],
      buildDirectories: ['build']
    },
    dependencies: {
      production: ['typescript'],
      development: ['vitest'],
      external: []
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      source: 'progress-tracking-test'
    }
  };

  // Helper to create test task
  const createTestTask = (overrides: Partial<AtomicTask> = {}): AtomicTask => ({
    id: 'PROGRESS-TEST-001',
    title: 'Implement comprehensive user authentication system',
    description: 'Create a complete authentication system with OAuth integration, JWT tokens, password reset, and user profile management',
    type: 'development',
    priority: 'high' as TaskPriority,
    estimatedHours: 12,
    status: 'pending',
    epicId: 'auth-epic',
    projectId: 'progress-tracking-test',
    dependencies: [],
    dependents: [],
    filePaths: [],
    acceptanceCriteria: [
      'OAuth integration working',
      'JWT tokens properly managed',
      'Password reset functionality',
      'User profile management'
    ],
    testingRequirements: {
      unitTests: [],
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
    },
    validationMethods: {
      automated: [],
      manual: []
    },
    createdBy: 'progress-test',
    tags: ['authentication', 'security', 'oauth'],
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'progress-test',
      tags: ['auth']
    },
    ...overrides
  });

  beforeAll(async () => {
    config = await getOpenRouterConfig();
    decompositionService = DecompositionService.getInstance(config);
    progressTracker = ProgressTracker.getInstance();
    
    logger.info('Progress tracking integration test suite initialized');
  });

  afterAll(() => {
    logger.info('Progress tracking integration test suite completed');
  });

  describe('Decomposition Progress Tracking', () => {
    it('should provide comprehensive progress updates during task decomposition', async () => {
      const progressEvents: ProgressEventData[] = [];
      const progressCallback = (progress: ProgressEventData) => {
        progressEvents.push(progress);
        console.log(`📊 Progress Update: ${progress.progressPercentage}% - ${progress.message}`);
      };

      // Add event listeners for different progress events
      const eventTypes: ProgressEvent[] = [
        'decomposition_started',
        'decomposition_progress',
        'decomposition_completed',
        'research_triggered',
        'research_completed',
        'context_gathering_started',
        'context_gathering_completed',
        'validation_started',
        'validation_completed',
        'dependency_detection_started',
        'dependency_detection_completed'
      ];

      const capturedEvents: { [key in ProgressEvent]?: ProgressEventData[] } = {};
      eventTypes.forEach(eventType => {
        capturedEvents[eventType] = [];
        progressTracker.addEventListener(eventType, (data) => {
          capturedEvents[eventType]!.push(data);
        });
      });

      const testTask = createTestTask();
      
      console.log('🚀 Starting comprehensive decomposition with progress tracking...');
      const startTime = Date.now();

      const result = await decompositionService.decomposeTask(
        testTask,
        testProjectContext,
        progressCallback
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`⏱️ Total decomposition time: ${totalTime}ms`);
      console.log(`📈 Total progress events captured: ${progressEvents.length}`);

      // Validate decomposition result
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.length).toBeGreaterThan(0);

      // Validate progress tracking coverage
      expect(progressEvents.length).toBeGreaterThan(5); // Should have multiple progress updates

      // Check for essential progress events
      const startEvents = progressEvents.filter(e => e.event === 'decomposition_started');
      const completedEvents = progressEvents.filter(e => e.event === 'decomposition_completed');
      
      expect(startEvents.length).toBeGreaterThan(0);
      expect(completedEvents.length).toBeGreaterThan(0);

      // Validate progress percentage progression
      const progressPercentages = progressEvents
        .filter(e => e.progressPercentage !== undefined)
        .map(e => e.progressPercentage!)
        .sort((a, b) => a - b);

      expect(progressPercentages.length).toBeGreaterThan(0);
      expect(progressPercentages[0]).toBeGreaterThanOrEqual(0);
      expect(progressPercentages[progressPercentages.length - 1]).toBe(100);

      // Validate component coverage
      const components = new Set(progressEvents.map(e => e.componentName).filter(Boolean));
      console.log('🔧 Components with progress tracking:', Array.from(components));

      expect(components.has('DecompositionService')).toBe(true);
      expect(components.size).toBeGreaterThan(1); // Multiple components should report progress

      // Check for meaningful messages
      const messagesWithContent = progressEvents.filter(e => 
        e.message && e.message.length > 10
      );
      expect(messagesWithContent.length).toBeGreaterThan(3);

      console.log('✅ Progress tracking validation completed successfully');
    }, 45000);

    it('should track progress for each decomposition phase correctly', async () => {
      const phaseProgress: { [phase: string]: ProgressEventData[] } = {
        research: [],
        context_gathering: [],
        decomposition: [],
        validation: [],
        dependency_detection: []
      };

      const phaseTracker = (progress: ProgressEventData) => {
        if (progress.decompositionProgress?.phase) {
          const phase = progress.decompositionProgress.phase;
          phaseProgress[phase].push(progress);
        }
      };

      const testTask = createTestTask({
        id: 'PHASE-TEST-001',
        title: 'Complex machine learning model optimization',
        description: 'Implement advanced neural network optimization techniques including pruning, quantization, and dynamic inference optimization for production deployment'
      });

      console.log('🔄 Testing phase-specific progress tracking...');

      const result = await decompositionService.decomposeTask(
        testTask,
        testProjectContext,
        phaseTracker
      );

      expect(result.success).toBe(true);

      // Validate each phase has progress tracking
      console.log('📊 Phase Progress Summary:');
      Object.entries(phaseProgress).forEach(([phase, events]) => {
        console.log(`  ${phase}: ${events.length} events`);
        if (events.length > 0) {
          const progressValues = events.map(e => e.decompositionProgress?.progress || 0);
          console.log(`    Progress range: ${Math.min(...progressValues)}% - ${Math.max(...progressValues)}%`);
        }
      });

      // At least some phases should have progress events
      const phasesWithProgress = Object.values(phaseProgress).filter(events => events.length > 0);
      expect(phasesWithProgress.length).toBeGreaterThan(2);

      console.log('✅ Phase-specific progress tracking validated');
    }, 30000);
  });

  describe('Component-Level Progress Tracking', () => {
    it('should track progress across all vibe task manager components', async () => {
      const componentProgress: { [component: string]: ProgressEventData[] } = {};

      const componentTracker = (progress: ProgressEventData) => {
        if (progress.componentName) {
          if (!componentProgress[progress.componentName]) {
            componentProgress[progress.componentName] = [];
          }
          componentProgress[progress.componentName].push(progress);
        }
      };

      const testTask = createTestTask({
        id: 'COMPONENT-TEST-001',
        title: 'Build comprehensive data pipeline with real-time processing',
        description: 'Design and implement a scalable data pipeline that handles real-time data ingestion, processing, transformation, and analytics with monitoring and alerting capabilities'
      });

      console.log('🔧 Testing component-level progress tracking...');

      const result = await decompositionService.decomposeTask(
        testTask,
        testProjectContext,
        componentTracker
      );

      expect(result.success).toBe(true);

      console.log('📈 Component Progress Summary:');
      Object.entries(componentProgress).forEach(([component, events]) => {
        console.log(`  ${component}: ${events.length} progress events`);
        
        // Show sample messages from each component
        const sampleMessages = events
          .map(e => e.message)
          .filter(Boolean)
          .slice(0, 2);
        
        sampleMessages.forEach(msg => {
          console.log(`    - ${msg}`);
        });
      });

      // Validate key components are tracked
      const trackedComponents = Object.keys(componentProgress);
      expect(trackedComponents).toContain('DecompositionService');
      
      // Should have multiple components reporting progress
      expect(trackedComponents.length).toBeGreaterThan(1);

      // Each component should have meaningful progress updates
      Object.values(componentProgress).forEach(events => {
        expect(events.length).toBeGreaterThan(0);
        
        // Check for meaningful messages
        const meaningfulMessages = events.filter(e => 
          e.message && e.message.length > 15
        );
        expect(meaningfulMessages.length).toBeGreaterThan(0);
      });

      console.log('✅ Component-level progress tracking validated');
    }, 30000);

    it('should provide real-time progress monitoring capabilities', async () => {
      const progressTracker = ProgressTracker.getInstance();
      const realTimeUpdates: ProgressEventData[] = [];

      // Set up real-time monitoring
      const monitorInterval = setInterval(() => {
        // In a real implementation, this would check active operations
        // For testing, we'll simulate checking component progress
        progressTracker.getComponentProgress('DecompositionService', 'progress-tracking-test');
        
        // This is a placeholder - in real implementation it would return actual progress
      }, 100);

      const progressLogger = (progress: ProgressEventData) => {
        realTimeUpdates.push(progress);
        
        // Log real-time updates with timestamps
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${progress.progressPercentage}% - ${progress.componentName}: ${progress.message}`);
      };

      const testTask = createTestTask({
        id: 'REALTIME-TEST-001',
        title: 'Implement real-time collaboration features',
        description: 'Build real-time collaboration capabilities including live document editing, presence indicators, comment threads, and conflict resolution'
      });

      console.log('⏱️ Testing real-time progress monitoring...');

      const result = await decompositionService.decomposeTask(
        testTask,
        testProjectContext,
        progressLogger
      );

      clearInterval(monitorInterval);

      expect(result.success).toBe(true);
      expect(realTimeUpdates.length).toBeGreaterThan(0);

      // Validate timing of updates
      const timestamps = realTimeUpdates.map(u => u.timestamp.getTime());
      const timeDiffs = timestamps.slice(1).map((time, i) => time - timestamps[i]);
      
      // Updates should be reasonably spaced (not all at once)
      const reasonableSpacing = timeDiffs.filter(diff => diff > 50); // At least 50ms apart
      expect(reasonableSpacing.length).toBeGreaterThan(realTimeUpdates.length * 0.3); // At least 30% properly spaced

      console.log(`📊 Real-time updates: ${realTimeUpdates.length} events over ${timestamps[timestamps.length - 1] - timestamps[0]}ms`);
      console.log('✅ Real-time progress monitoring validated');
    }, 25000);
  });

  describe('Progress Event Quality', () => {
    it('should provide meaningful and informative progress messages', async () => {
      const progressMessages: string[] = [];

      const messageTracker = (progress: ProgressEventData) => {
        if (progress.message) {
          progressMessages.push(progress.message);
        }
      };

      const testTask = createTestTask({
        id: 'MESSAGE-TEST-001',
        title: 'Create advanced analytics dashboard',
        description: 'Build a comprehensive analytics dashboard with real-time metrics, custom visualizations, data filtering, and export capabilities'
      });

      console.log('💬 Testing progress message quality...');

      const result = await decompositionService.decomposeTask(
        testTask,
        testProjectContext,
        messageTracker
      );

      expect(result.success).toBe(true);
      expect(progressMessages.length).toBeGreaterThan(3);

      console.log('📝 Progress Messages Quality Analysis:');
      
      // Analyze message quality
      const messageAnalysis = {
        total: progressMessages.length,
        meaningful: progressMessages.filter(msg => msg.length > 20).length,
        specific: progressMessages.filter(msg => 
          msg.includes('task') || 
          msg.includes('decomposition') || 
          msg.includes('analysis') ||
          msg.includes('processing')
        ).length,
        actionOriented: progressMessages.filter(msg =>
          msg.includes('Starting') ||
          msg.includes('Processing') ||
          msg.includes('Analyzing') ||
          msg.includes('Completing') ||
          msg.includes('Generating')
        ).length
      };

      console.log(`  Total messages: ${messageAnalysis.total}`);
      console.log(`  Meaningful (>20 chars): ${messageAnalysis.meaningful} (${(messageAnalysis.meaningful/messageAnalysis.total*100).toFixed(1)}%)`);
      console.log(`  Task-specific: ${messageAnalysis.specific} (${(messageAnalysis.specific/messageAnalysis.total*100).toFixed(1)}%)`);
      console.log(`  Action-oriented: ${messageAnalysis.actionOriented} (${(messageAnalysis.actionOriented/messageAnalysis.total*100).toFixed(1)}%)`);

      // Quality assertions
      expect(messageAnalysis.meaningful).toBeGreaterThan(messageAnalysis.total * 0.7); // 70% should be meaningful
      expect(messageAnalysis.specific).toBeGreaterThan(messageAnalysis.total * 0.5); // 50% should be task-specific
      expect(messageAnalysis.actionOriented).toBeGreaterThan(messageAnalysis.total * 0.4); // 40% should be action-oriented

      // Show sample high-quality messages
      console.log('\n📋 Sample Progress Messages:');
      progressMessages.slice(0, 5).forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg}`);
      });

      console.log('✅ Progress message quality validated');
    }, 20000);
  });
});