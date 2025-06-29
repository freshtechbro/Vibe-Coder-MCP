#!/usr/bin/env node

/**
 * Manual Validation Runner for Enhanced Task Decomposition
 * 
 * This script allows you to manually test and validate the enhanced features
 * with real-world scenarios and see the actual output.
 * 
 * Usage: npm run validate-enhancements
 */

import { DecompositionService } from '../services/decomposition-service.js';
import { AtomicTaskDetector } from '../core/atomic-detector.js';
import { AutoResearchDetector } from '../services/auto-research-detector.js';
import { ContextEnrichmentService } from '../services/context-enrichment-service.js';
import { getDependencyGraph } from '../core/dependency-graph.js';
import { getOpenRouterConfig } from '../../../utils/openrouter-config-manager.js';
import { AtomicTask, TaskPriority } from '../types/task.js';
import { ProjectContext } from '../types/project-context.js';
import logger from '../../../logger.js';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class ValidationRunner {
  private decompositionService!: DecompositionService;
  private atomicDetector!: AtomicTaskDetector;
  private autoResearchDetector!: AutoResearchDetector;
  private contextService!: ContextEnrichmentService;
  private config!: any;

  // Helper to create valid AtomicTask objects
  private createAtomicTask(partial: Partial<AtomicTask> & { id: string; title: string; description: string }): AtomicTask {
    return {
      id: partial.id,
      title: partial.title,
      description: partial.description,
      status: partial.status || 'pending',
      priority: partial.priority || 'medium',
      type: partial.type || 'development',
      estimatedHours: partial.estimatedHours || 1,
      actualHours: partial.actualHours,
      epicId: partial.epicId || 'default-epic',
      projectId: partial.projectId || 'default-project',
      dependencies: partial.dependencies || [],
      dependents: partial.dependents || [],
      filePaths: partial.filePaths || [],
      acceptanceCriteria: partial.acceptanceCriteria || [],
      testingRequirements: partial.testingRequirements || {
        unitTests: [],
        integrationTests: [],
        performanceTests: [],
        coverageTarget: 80
      },
      performanceCriteria: partial.performanceCriteria || {},
      qualityCriteria: partial.qualityCriteria || {
        codeQuality: [],
        documentation: [],
        typeScript: true,
        eslint: true
      },
      integrationCriteria: partial.integrationCriteria || {
        compatibility: [],
        patterns: []
      },
      validationMethods: partial.validationMethods || {
        automated: [],
        manual: []
      },
      assignedAgent: partial.assignedAgent,
      executionContext: partial.executionContext,
      createdAt: partial.createdAt || new Date(),
      updatedAt: partial.updatedAt || new Date(),
      startedAt: partial.startedAt,
      completedAt: partial.completedAt,
      createdBy: partial.createdBy || 'validation-runner',
      tags: partial.tags || [],
      metadata: partial.metadata || {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'validation-runner',
        tags: partial.tags || []
      }
    };
  }

  async initialize() {
    console.log(`${colors.cyan}🚀 Initializing Enhanced Decomposition Validator${colors.reset}`);
    
    this.config = await getOpenRouterConfig();
    this.decompositionService = DecompositionService.getInstance(this.config);
    this.atomicDetector = new AtomicTaskDetector(this.config);
    this.autoResearchDetector = AutoResearchDetector.getInstance();
    this.contextService = ContextEnrichmentService.getInstance();

    console.log(`${colors.green}✅ All services initialized successfully${colors.reset}\n`);
  }

  private log(title: string, data: any) {
    console.log(`${colors.bright}${colors.blue}📊 ${title}${colors.reset}`);
    console.log(JSON.stringify(data, null, 2));
    console.log('');
  }

  private separator(title: string) {
    console.log(`${colors.magenta}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}${title}${colors.reset}`);
    console.log(`${colors.magenta}${'='.repeat(60)}${colors.reset}\n`);
  }

  async testAutoResearchTrigger() {
    this.separator('AUTO-RESEARCH TRIGGER VALIDATION');

    const complexTask = this.createAtomicTask({
      id: 'MANUAL-TEST-001',
      title: 'Implement advanced machine learning pipeline with MLOps integration',
      description: 'Design and implement a sophisticated ML pipeline that includes data preprocessing, feature engineering, model training with hyperparameter optimization, model versioning, automated deployment, and monitoring with drift detection for a production recommendation system',
      type: 'development',
      priority: 'critical' as TaskPriority,
      estimatedHours: 16,
      status: 'pending',
      epicId: 'ml-platform-epic',
      projectId: 'ml-platform',
      acceptanceCriteria: [
        'ML pipeline processes 1M+ records per hour',
        'Model deployment is fully automated',
        'Drift detection alerts trigger retraining'
      ],
      tags: ['ml', 'mlops', 'pipeline', 'ai', 'production']
    });

    const projectContext: ProjectContext = {
      projectId: 'ml-platform',
      projectPath: process.cwd(),
      projectName: 'ML Platform',
      description: 'Machine learning platform for recommendation systems',
      languages: ['Python', 'TypeScript'],
      frameworks: ['TensorFlow', 'MLflow', 'Airflow'],
      buildTools: ['Docker', 'Kubernetes'],
      tools: ['pytest', 'black', 'mypy'],
      configFiles: ['pyproject.toml', 'docker-compose.yml'],
      entryPoints: ['src/main.py'],
      architecturalPatterns: ['microservices', 'event-driven'],
      existingTasks: [],
      codebaseSize: 'large',
      teamSize: 5,
      complexity: 'high',
      structure: {
        sourceDirectories: ['src'],
        testDirectories: ['tests'],
        docDirectories: ['docs'],
        buildDirectories: ['build', 'dist']
      },
      dependencies: {
        production: ['tensorflow', 'mlflow'],
        development: ['pytest', 'black'],
        external: ['openai', 'anthropic']
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0',
        source: 'manual'
      }
    };

    console.log(`${colors.yellow}🧪 Testing auto-research trigger with complex ML task...${colors.reset}\n`);

    try {
      const researchEvaluation = await this.autoResearchDetector.evaluateResearchNeed({
        task: complexTask,
        projectContext,
        projectPath: projectContext.projectPath || process.cwd()
      });

      this.log('Research Decision', {
        shouldTrigger: researchEvaluation.decision.shouldTriggerResearch,
        confidence: researchEvaluation.decision.confidence,
        primaryReason: researchEvaluation.decision.primaryReason,
        reasoning: researchEvaluation.decision.reasoning,
        recommendedScope: researchEvaluation.decision.recommendedScope
      });

      if (researchEvaluation.decision.shouldTriggerResearch) {
        console.log(`${colors.green}✅ Auto-research correctly triggered for complex task${colors.reset}`);
      } else {
        console.log(`${colors.red}❌ Auto-research should have triggered but didn't${colors.reset}`);
      }

      // Test enhanced validation with research
      console.log(`${colors.yellow}🔍 Testing enhanced validation with research integration...${colors.reset}\n`);
      
      const enhancedValidation = await this.atomicDetector.validateTaskEnhanced(
        complexTask,
        projectContext
      );

      this.log('Enhanced Validation Result', {
        isValid: enhancedValidation.analysis.isAtomic,
        confidence: enhancedValidation.analysis.confidence,
        researchTriggered: enhancedValidation.autoEnhancements.researchTriggered,
        contextGathered: enhancedValidation.autoEnhancements.contextGathered,
        qualityMetrics: enhancedValidation.qualityMetrics,
        recommendations: enhancedValidation.autoEnhancements.suggestedImprovements
      });

    } catch (error) {
      console.log(`${colors.red}❌ Auto-research test failed: ${error}${colors.reset}`);
    }
  }

  async testContextIntegration() {
    this.separator('CONTEXT INTEGRATION VALIDATION');

    console.log(`${colors.yellow}🔍 Testing context gathering with real codebase...${colors.reset}\n`);

    try {
      const contextResult = await this.contextService.gatherContext({
        taskDescription: 'Enhance the atomic task detector with new validation rules for better task quality assessment',
        projectPath: process.cwd(),
        contentKeywords: ['atomic', 'detector', 'validation', 'task'],
        maxFiles: 5,
        maxContentSize: 30000
      });

      this.log('Context Gathering Result', {
        filesFound: contextResult.contextFiles.length,
        totalSize: contextResult.summary.totalSize,
        averageRelevance: contextResult.summary.averageRelevance,
        topFileTypes: contextResult.summary.topFileTypes,
        processingTime: contextResult.metrics.totalTime
      });

      if (contextResult.contextFiles.length > 0) {
        console.log(`${colors.green}✅ Context gathering found relevant files${colors.reset}`);
        
        console.log(`${colors.cyan}📂 Found Files:${colors.reset}`);
        contextResult.contextFiles.slice(0, 3).forEach((file, index) => {
          console.log(`  ${index + 1}. ${file.filePath}`);
          console.log(`     Relevance: ${(file.relevance.overallScore * 100).toFixed(1)}%`);
          console.log(`     Size: ${file.charCount} chars`);
        });
        console.log('');
      } else {
        console.log(`${colors.yellow}⚠️ No relevant files found - this might be expected${colors.reset}`);
      }

    } catch (error) {
      console.log(`${colors.red}❌ Context integration test failed: ${error}${colors.reset}`);
    }
  }

  async testEnhancedDecomposition() {
    this.separator('ENHANCED DECOMPOSITION VALIDATION');

    const userStory = this.createAtomicTask({
      id: 'MANUAL-DECOMP-001',
      title: 'Build comprehensive user profile management system',
      description: 'Create a complete user profile management system that allows users to update their personal information, upload profile pictures, manage privacy settings, view activity history, and export their data in compliance with GDPR requirements',
      type: 'development',
      priority: 'high' as TaskPriority,
      estimatedHours: 20,
      status: 'pending',
      epicId: 'user-platform-epic',
      projectId: 'user-platform',
      acceptanceCriteria: [
        'Users can update profile information',
        'Profile picture upload and management works',
        'Privacy settings are configurable',
        'Activity history is viewable',
        'Data export complies with GDPR'
      ],
      tags: ['user-management', 'profile', 'gdpr', 'privacy']
    });

    const projectContext: ProjectContext = {
      projectId: 'user-platform',
      projectPath: process.cwd(),
      projectName: 'User Platform',
      description: 'User management and profile system',
      languages: ['TypeScript', 'React'],
      frameworks: ['Next.js', 'Express', 'PostgreSQL'],
      buildTools: ['npm', 'webpack'],
      tools: ['eslint', 'prettier', 'jest'],
      configFiles: ['package.json', 'tsconfig.json'],
      entryPoints: ['src/index.ts'],
      architecturalPatterns: ['mvc', 'rest-api'],
      existingTasks: [],
      codebaseSize: 'medium',
      teamSize: 3,
      complexity: 'medium',
      structure: {
        sourceDirectories: ['src'],
        testDirectories: ['__tests__'],
        docDirectories: ['docs'],
        buildDirectories: ['build']
      },
      dependencies: {
        production: ['react', 'next'],
        development: ['jest', 'eslint'],
        external: ['postgresql']
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0',
        source: 'manual'
      }
    };

    console.log(`${colors.yellow}🔨 Testing enhanced decomposition with user story...${colors.reset}\n`);

    try {
      const decompositionResult = await this.decompositionService.decomposeTask(
        userStory,
        projectContext
      );

      if (decompositionResult.success && decompositionResult.data) {
        this.log('Decomposition Result', {
          success: decompositionResult.success,
          taskCount: decompositionResult.data.length
        });

        console.log(`${colors.green}✅ Task successfully decomposed into ${decompositionResult.data.length} sub-tasks${colors.reset}\n`);

        console.log(`${colors.cyan}📋 Generated Tasks:${colors.reset}`);
        decompositionResult.data.forEach((task, index) => {
          console.log(`${colors.bright}${index + 1}. ${task.title}${colors.reset}`);
          console.log(`   Type: ${task.type} | Priority: ${task.priority} | Hours: ${task.estimatedHours}`);
          console.log(`   Description: ${task.description}`);
          if (task.filePaths && task.filePaths.length > 0) {
            console.log(`   Files: ${task.filePaths.join(', ')}`);
          }
          if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
            console.log(`   Acceptance: ${task.acceptanceCriteria[0]}`);
          }
          console.log('');
        });

        // Validate quality of decomposition
        const hasRealisticFiles = decompositionResult.data.some(t => t.filePaths && t.filePaths.length > 0);
        const hasVariedTypes = new Set(decompositionResult.data.map(t => t.type)).size > 1;
        const hasReasonableHours = decompositionResult.data.every(t => t.estimatedHours > 0 && t.estimatedHours <= 8);

        console.log(`${colors.blue}📊 Quality Assessment:${colors.reset}`);
        console.log(`   Realistic file paths: ${hasRealisticFiles ? '✅' : '❌'}`);
        console.log(`   Varied task types: ${hasVariedTypes ? '✅' : '❌'}`);
        console.log(`   Reasonable hours: ${hasReasonableHours ? '✅' : '❌'}`);

      } else {
        console.log(`${colors.red}❌ Decomposition failed: ${decompositionResult.error}${colors.reset}`);
      }

    } catch (error) {
      console.log(`${colors.red}❌ Enhanced decomposition test failed: ${error}${colors.reset}`);
    }
  }

  async testDependencyDetection() {
    this.separator('DEPENDENCY DETECTION VALIDATION');

    const relatedTasks: AtomicTask[] = [
      this.createAtomicTask({
        id: 'DEP-001',
        title: 'Create database schema for user profiles',
        description: 'Design and implement PostgreSQL schema for user profile data',
        type: 'development',
        priority: 'high' as TaskPriority,
        estimatedHours: 2,
        status: 'pending',
        epicId: 'user-profile-epic',
        projectId: 'user-platform',
        filePaths: ['migrations/001_create_user_profiles.sql']
      }),
      this.createAtomicTask({
        id: 'DEP-002',
        title: 'Implement User model with TypeORM',
        description: 'Create User entity class with TypeORM decorators for profile management',
        type: 'development',
        priority: 'high' as TaskPriority,
        estimatedHours: 1.5,
        status: 'pending',
        epicId: 'user-profile-epic',
        projectId: 'user-platform',
        filePaths: ['src/models/User.ts']
      }),
      this.createAtomicTask({
        id: 'DEP-003',
        title: 'Build user profile API endpoints',
        description: 'Create REST API endpoints for profile CRUD operations',
        type: 'development',
        priority: 'medium' as TaskPriority,
        estimatedHours: 3,
        status: 'pending',
        epicId: 'user-profile-epic',
        projectId: 'user-platform',
        filePaths: ['src/routes/profile.ts']
      }),
      this.createAtomicTask({
        id: 'DEP-004',
        title: 'Write integration tests for profile API',
        description: 'Create comprehensive integration tests for profile endpoints',
        type: 'testing',
        priority: 'medium' as TaskPriority,
        estimatedHours: 2,
        status: 'pending',
        epicId: 'user-profile-epic',
        projectId: 'user-platform',
        filePaths: ['src/routes/__tests__/profile.test.ts']
      })
    ];

    console.log(`${colors.yellow}🔗 Testing intelligent dependency detection...${colors.reset}\n`);

    try {
      const dependencyGraph = getDependencyGraph('manual-test-project');
      
      const dependencyResult = dependencyGraph.applyIntelligentDependencyDetection(relatedTasks);

      this.log('Dependency Detection Result', {
        appliedDependencies: dependencyResult.appliedDependencies,
        totalSuggestions: dependencyResult.suggestions.length,
        warnings: dependencyResult.warnings
      });

      if (dependencyResult.suggestions.length > 0) {
        console.log(`${colors.cyan}🔗 Detected Dependencies:${colors.reset}`);
        dependencyResult.suggestions.forEach(suggestion => {
          const fromTask = relatedTasks.find(t => t.id === suggestion.fromTaskId);
          const toTask = relatedTasks.find(t => t.id === suggestion.toTaskId);
          console.log(`   ${fromTask?.title} → ${toTask?.title}`);
          console.log(`   Confidence: ${(suggestion.confidence * 100).toFixed(1)}% | Reason: ${suggestion.reason}`);
          console.log('');
        });
      }

      // Test execution planning
      const executionPlan = dependencyGraph.getRecommendedExecutionOrder();
      
      console.log(`${colors.cyan}📅 Recommended Execution Order:${colors.reset}`);
      executionPlan.topologicalOrder.forEach((taskId, index) => {
        const task = relatedTasks.find(t => t.id === taskId);
        console.log(`   ${index + 1}. ${task?.title || taskId}`);
      });
      console.log(`   Total Estimated Duration: ${executionPlan.estimatedDuration} hours`);

      if (dependencyResult.appliedDependencies > 0) {
        console.log(`${colors.green}✅ Dependencies successfully detected and applied${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠️ No dependencies were auto-applied (might be expected)${colors.reset}`);
      }

    } catch (error) {
      console.log(`${colors.red}❌ Dependency detection test failed: ${error}${colors.reset}`);
    }
  }

  async runAllValidations() {
    try {
      await this.initialize();
      
      await this.testAutoResearchTrigger();
      await this.testContextIntegration();
      await this.testEnhancedDecomposition();
      await this.testDependencyDetection();

      this.separator('VALIDATION COMPLETE');
      console.log(`${colors.green}🎉 All manual validations completed!${colors.reset}`);
      console.log(`${colors.cyan}💡 Review the output above to verify that:${colors.reset}`);
      console.log(`   • Auto-research triggers for complex tasks`);
      console.log(`   • Context gathering finds relevant files`);
      console.log(`   • Task decomposition generates realistic tasks`);
      console.log(`   • Dependency detection identifies relationships`);
      console.log('');

    } catch (error) {
      console.log(`${colors.red}❌ Validation runner failed: ${error}${colors.reset}`);
      process.exit(1);
    }
  }
}

// Run the validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new ValidationRunner();
  runner.runAllValidations().catch(console.error);
}

export { ValidationRunner };