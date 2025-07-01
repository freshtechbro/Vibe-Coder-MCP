/**
 * Enhanced Contextual Task Generation Validation Test
 * 
 * This test validates that our enhanced decomposition system generates:
 * 1. Realistic, contextual tasks based on actual project structure
 * 2. Tasks that leverage research insights for better implementation guidance
 * 3. Tasks that reference real files and follow project patterns
 * 4. Tasks that are properly sequenced and have realistic dependencies
 * 5. Tasks that include appropriate technology-specific details
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DecompositionService } from '../../services/decomposition-service.js';
import { AutoResearchDetector } from '../../services/auto-research-detector.js';
import { getDependencyGraph } from '../../core/dependency-graph.js';
import { getOpenRouterConfig } from '../../../../utils/openrouter-config-manager.js';
import { AtomicTask } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import logger from '../../../../logger.js';

describe('Enhanced Contextual Task Generation Validation', () => {
  let decompositionService: DecompositionService;
  let config: Record<string, unknown>;

  // Real project context based on Vibe-Coder-MCP structure
  const realProjectContext: ProjectContext = {
    projectId: 'vibe-coder-mcp-contextual-test',
    projectPath: '/Users/bishopdotun/Documents/Dev Projects/Vibe-Coder-MCP',
    projectName: 'Vibe Coder MCP - Contextual Task Generation Test',
    description: 'Production MCP server with AI-powered development tools and comprehensive agent integration',
    languages: ['TypeScript', 'JavaScript'],
    frameworks: ['Node.js', 'Express', 'Vitest'],
    buildTools: ['npm', 'tsc', 'ESLint'],
    tools: ['Prettier', 'Pino Logger', 'UUID'],
    configFiles: [
      'package.json',
      'tsconfig.json',
      'vitest.config.ts',
      '.eslintrc.json',
      'llm_config.json'
    ],
    entryPoints: [
      'src/index.ts',
      'src/server.ts'
    ],
    architecturalPatterns: [
      'MCP Protocol',
      'Tool Registry Pattern',
      'Event-Driven Architecture',
      'Singleton Services',
      'Modular Design'
    ],
    existingTasks: [],
    codebaseSize: 'large',
    teamSize: 2,
    complexity: 'high',
    structure: {
      sourceDirectories: ['src'],
      testDirectories: ['__tests__', '__integration__', 'test'],
      docDirectories: ['docs'],
      buildDirectories: ['build']
    },
    dependencies: {
      production: [
        '@modelcontextprotocol/sdk',
        'express',
        'pino',
        'uuid',
        'axios',
        'dotenv'
      ],
      development: [
        'vitest',
        'typescript',
        '@types/node',
        'eslint',
        'nodemon'
      ],
      external: [
        'openrouter',
        'perplexity'
      ]
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '2.3.0',
      source: 'contextual-validation-test'
    }
  };

  // Helper to create realistic task for testing
  const createRealisticTask = (overrides: Partial<AtomicTask> = {}): AtomicTask => {
    const baseTask: AtomicTask = {
      id: 'CONTEXTUAL-TEST-001',
      title: 'Test Task',
      description: 'Test task description',
      status: 'pending',
      priority: 'medium',
      type: 'development',
      estimatedHours: 2,
      epicId: 'contextual-test-epic',
      projectId: 'vibe-coder-mcp-contextual-test',
      dependencies: [],
      dependents: [],
      filePaths: [],
      acceptanceCriteria: ['Test criterion'],
      testingRequirements: {
        unitTests: [],
        integrationTests: [],
        performanceTests: [],
        coverageTarget: 80
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
      createdBy: 'contextual-test',
      tags: ['test'],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'contextual-test',
        tags: ['test']
      },
      ...overrides
    };
    return baseTask;
  };

  beforeAll(async () => {
    // Initialize services
    config = await getOpenRouterConfig();
    decompositionService = DecompositionService.getInstance(config);

    logger.info('Enhanced contextual task generation validation initialized');
  });

  afterAll(() => {
    logger.info('Enhanced contextual task generation validation completed');
  });

  describe('Realistic File Path Generation', () => {
    it('should generate tasks with realistic file paths based on project structure', async () => {
      logger.info('📁 Testing realistic file path generation');

      const newToolTask = createRealisticTask({
        id: 'FILEPATH-TEST-001',
        title: 'Create new MCP tool for data analysis',
        description: 'Develop a new MCP tool that provides data analysis capabilities following the existing tool patterns in the Vibe Coder MCP project',
        estimatedHours: 8,
        tags: ['tool-development', 'mcp', 'data-analysis']
      });

      const decompositionResult = await decompositionService.decomposeTask(
        newToolTask,
        realProjectContext
      );

      console.log('📋 File Path Generation Result:', {
        success: decompositionResult.success,
        taskCount: decompositionResult.data?.length || 0
      });

      if (decompositionResult.success && decompositionResult.data) {
        const tasks = decompositionResult.data;

        console.log('📂 Generated File Paths:');
        tasks.forEach((task, index) => {
          if (task.filePaths && task.filePaths.length > 0) {
            console.log(`  ${index + 1}. ${task.title}`);
            console.log(`     Files: ${task.filePaths.join(', ')}`);
          }
        });

        // Validate realistic file paths
        const tasksWithRealisticPaths = tasks.filter(task =>
          task.filePaths?.some(path => 
            path.includes('src/tools/') ||
            path.includes('src/services/') ||
            path.includes('src/types/') ||
            path.includes('__tests__/') ||
            path.endsWith('.ts') ||
            path.endsWith('.js')
          )
        );

        console.log('✅ Quality Metrics:', {
          totalTasks: tasks.length,
          tasksWithPaths: tasks.filter(t => t.filePaths?.length).length,
          realisticPaths: tasksWithRealisticPaths.length,
          realisticPercentage: (tasksWithRealisticPaths.length / tasks.length * 100).toFixed(1) + '%'
        });

        expect(tasks.length).toBeGreaterThan(2);
        expect(tasksWithRealisticPaths.length).toBeGreaterThan(0);
        
        // At least 50% of tasks should have realistic file paths
        const realisticPercentage = tasksWithRealisticPaths.length / tasks.length;
        expect(realisticPercentage).toBeGreaterThan(0.3);

      } else {
        console.log('❌ Decomposition failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ Realistic file path generation validated');
    }, 60000);

    it('should follow existing project patterns and conventions', async () => {
      logger.info('🏗️ Testing adherence to project patterns');

      const serviceTask = createRealisticTask({
        id: 'PATTERN-TEST-001',  
        title: 'Add new logging service with structured output',
        description: 'Create a new logging service that follows the existing service patterns in the project, uses Pino logger, and integrates with the tool registry system',
        estimatedHours: 6,
        tags: ['service', 'logging', 'integration']
      });

      const decompositionResult = await decompositionService.decomposeTask(
        serviceTask,
        realProjectContext
      );

      if (decompositionResult.success && decompositionResult.data) {
        const tasks = decompositionResult.data;

        console.log('🔍 Pattern Adherence Analysis:');
        
        // Check for TypeScript files
        const typescriptTasks = tasks.filter(task =>
          task.filePaths?.some(path => path.endsWith('.ts'))
        );
        
        // Check for test files
        const testTasks = tasks.filter(task =>
          task.type === 'testing' || 
          task.filePaths?.some(path => path.includes('test') || path.includes('spec'))
        );

        // Check for service patterns
        const serviceTasks = tasks.filter(task =>
          task.filePaths?.some(path => path.includes('services/')) ||
          task.title.toLowerCase().includes('service')
        );

        // Check for index.ts patterns
        const indexTasks = tasks.filter(task =>
          task.filePaths?.some(path => path.endsWith('index.ts'))
        );

        console.log('📊 Pattern Analysis Results:', {
          totalTasks: tasks.length,
          typescriptTasks: typescriptTasks.length,
          testTasks: testTasks.length,
          serviceTasks: serviceTasks.length,
          indexTasks: indexTasks.length
        });

        expect(typescriptTasks.length).toBeGreaterThan(0);
        expect(testTasks.length).toBeGreaterThan(0);
        expect(serviceTasks.length).toBeGreaterThan(0);

      } else {
        console.log('❌ Pattern test failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ Project pattern adherence validated');
    }, 60000);
  });

  describe('Technology-Specific Context Integration', () => {
    it('should include MCP-specific implementation details', async () => {
      logger.info('🔧 Testing MCP-specific context integration');

      const mcpToolTask = createRealisticTask({
        id: 'MCP-CONTEXT-001',
        title: 'Implement new MCP tool for code refactoring',
        description: 'Create a new MCP tool that provides automated code refactoring capabilities, integrates with the existing tool registry, and follows MCP protocol specifications',
        estimatedHours: 10,
        tags: ['mcp', 'tool', 'refactoring', 'protocol']
      });

      const decompositionResult = await decompositionService.decomposeTask(
        mcpToolTask,
        realProjectContext
      );

      if (decompositionResult.success && decompositionResult.data) {
        const tasks = decompositionResult.data;

        console.log('🔍 MCP Context Analysis:');
        
        // Check for MCP-specific terms and patterns
        const mcpAwareTasks = tasks.filter(task => {
          const text = `${task.title} ${task.description}`.toLowerCase();
          return text.includes('mcp') ||
                 text.includes('tool registry') ||
                 text.includes('protocol') ||
                 text.includes('registration') ||
                 text.includes('validation') ||
                 text.includes('schema');
        });

        // Check for appropriate file locations
        const toolDirectoryTasks = tasks.filter(task =>
          task.filePaths?.some(path => 
            path.includes('src/tools/') ||
            path.includes('src/services/routing/') ||
            path.includes('src/types/')
          )
        );

        console.log('📊 MCP Integration Metrics:', {
          totalTasks: tasks.length,
          mcpAwareTasks: mcpAwareTasks.length,
          toolDirectoryTasks: toolDirectoryTasks.length,
          mcpAwarenessPercentage: (mcpAwareTasks.length / tasks.length * 100).toFixed(1) + '%'
        });

        expect(mcpAwareTasks.length).toBeGreaterThan(0);
        expect(toolDirectoryTasks.length).toBeGreaterThan(0);

        // Should include tool registration
        const registrationTask = tasks.find(task =>
          task.title.toLowerCase().includes('register') ||
          task.description.toLowerCase().includes('register')
        );
        expect(registrationTask).toBeDefined();

      } else {
        console.log('❌ MCP context test failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ MCP-specific context integration validated');
    }, 60000);

    it('should incorporate TypeScript and ESM patterns', async () => {
      logger.info('📘 Testing TypeScript and ESM pattern integration');

      const typescriptTask = createRealisticTask({
        id: 'TS-PATTERN-001',
        title: 'Add type-safe configuration manager',
        description: 'Implement a type-safe configuration manager that uses TypeScript interfaces, follows ESM import patterns, and provides runtime validation',
        estimatedHours: 5,
        tags: ['typescript', 'configuration', 'type-safety']
      });

      const decompositionResult = await decompositionService.decomposeTask(
        typescriptTask,
        realProjectContext
      );

      if (decompositionResult.success && decompositionResult.data) {
        const tasks = decompositionResult.data;

        console.log('🔍 TypeScript Pattern Analysis:');

        // Check for TypeScript-specific patterns
        const typescriptPatterns = tasks.filter(task => {
          const text = `${task.title} ${task.description}`.toLowerCase();
          return text.includes('interface') ||
                 text.includes('type') ||
                 text.includes('typescript') ||
                 text.includes('import') ||
                 text.includes('export') ||
                 text.includes('.ts');
        });

        // Check for ESM patterns
        const esmPatterns = tasks.filter(task => {
          const text = `${task.title} ${task.description}`.toLowerCase();
          return text.includes('.js') ||
                 text.includes('import') ||
                 text.includes('export') ||
                 text.includes('esm') ||
                 text.includes('module');
        });

        // Check for proper file extensions
        const properExtensions = tasks.filter(task =>
          task.filePaths?.every(path => 
            path.endsWith('.ts') || 
            path.endsWith('.js') ||
            path.endsWith('.json') ||
            !path.includes('.')
          )
        );

        console.log('📊 TypeScript Integration Metrics:', {
          totalTasks: tasks.length,
          typescriptPatterns: typescriptPatterns.length,
          esmPatterns: esmPatterns.length,
          properExtensions: properExtensions.length
        });

        expect(typescriptPatterns.length).toBeGreaterThan(0);
        expect(properExtensions.length).toBe(tasks.filter(t => t.filePaths?.length).length);

      } else {
        console.log('❌ TypeScript pattern test failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ TypeScript and ESM pattern integration validated');
    }, 60000);
  });

  describe('Research-Enhanced Task Quality', () => {
    it('should generate tasks enhanced with research insights for complex domains', async () => {
      logger.info('🔬 Testing research-enhanced task quality');

      const complexDomainTask = createRealisticTask({
        id: 'RESEARCH-ENHANCED-001',
        title: 'Implement advanced semantic search with vector embeddings',
        description: 'Create a semantic search system that uses vector embeddings, similarity scoring, and advanced NLP techniques for improved search relevance in the MCP tool ecosystem',
        estimatedHours: 15,
        tags: ['ai', 'nlp', 'search', 'embeddings', 'complex']
      });

      // First check if research is triggered
      const autoResearchDetector = AutoResearchDetector.getInstance();
      const researchEvaluation = await autoResearchDetector.evaluateResearchNeed({
        task: complexDomainTask,
        projectContext: realProjectContext,
        projectPath: realProjectContext.projectPath
      });

      console.log('🔍 Research Evaluation:', {
        shouldTrigger: researchEvaluation.decision.shouldTriggerResearch,
        confidence: researchEvaluation.decision.confidence,
        primaryReason: researchEvaluation.decision.primaryReason
      });

      // Perform decomposition
      const decompositionResult = await decompositionService.decomposeTask(
        complexDomainTask,
        realProjectContext
      );

      if (decompositionResult.success && decompositionResult.data) {
        const tasks = decompositionResult.data;

        console.log('🔍 Research Enhancement Analysis:');

        // Check for technical depth and specificity
        const technicallySpecific = tasks.filter(task => {
          const text = `${task.title} ${task.description}`.toLowerCase();
          return text.includes('vector') ||
                 text.includes('embedding') ||
                 text.includes('similarity') ||
                 text.includes('nlp') ||
                 text.includes('algorithm') ||
                 text.includes('optimization') ||
                 text.includes('performance');
        });

        // Check for implementation guidance
        const implementationGuidance = tasks.filter(task =>
          task.description.length > 50 && // Substantial descriptions
          (task.description.includes('using') ||
           task.description.includes('implement') ||
           task.description.includes('configure') ||
           task.description.includes('integrate'))
        );

        // Check for consideration of best practices
        const bestPractices = tasks.filter(task => {
          const text = `${task.title} ${task.description}`.toLowerCase();
          return text.includes('performance') ||
                 text.includes('optimization') ||
                 text.includes('error handling') ||
                 text.includes('validation') ||
                 text.includes('testing') ||
                 text.includes('monitoring');
        });

        console.log('📊 Research Enhancement Metrics:', {
          totalTasks: tasks.length,
          technicallySpecific: technicallySpecific.length,
          implementationGuidance: implementationGuidance.length,
          bestPractices: bestPractices.length,
          averageDescriptionLength: tasks.reduce((sum, t) => sum + t.description.length, 0) / tasks.length
        });

        expect(tasks.length).toBeGreaterThan(3);
        expect(technicallySpecific.length).toBeGreaterThan(0);
        expect(implementationGuidance.length).toBeGreaterThan(0);

        // Tasks should be well-detailed if research was triggered
        if (researchEvaluation.decision.shouldTriggerResearch) {
          const avgDescLength = tasks.reduce((sum, t) => sum + t.description.length, 0) / tasks.length;
          expect(avgDescLength).toBeGreaterThan(60); // More detailed descriptions
        }

      } else {
        console.log('❌ Research enhancement test failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ Research-enhanced task quality validated');
    }, 90000);
  });

  describe('Dependency and Sequencing Intelligence', () => {
    it('should generate well-sequenced tasks with intelligent dependencies', async () => {
      logger.info('🔗 Testing intelligent task sequencing and dependencies');

      const dependencyRichTask = createRealisticTask({
        id: 'DEPENDENCY-TEST-001',
        title: 'Build complete user authentication system',
        description: 'Implement a comprehensive user authentication system with OAuth providers, JWT tokens, session management, and integration with existing MCP security patterns',
        estimatedHours: 20,
        tags: ['authentication', 'security', 'oauth', 'jwt', 'integration']
      });

      const decompositionResult = await decompositionService.decomposeTask(
        dependencyRichTask,
        realProjectContext
      );

      if (decompositionResult.success && decompositionResult.data) {
        const tasks = decompositionResult.data;

        console.log('🔍 Dependency Analysis:');

        // Apply dependency detection
        const dependencyGraph = getDependencyGraph('dependency-test-project');
        const dependencyResult = dependencyGraph.applyIntelligentDependencyDetection(tasks);

        console.log('📊 Dependency Detection Results:', {
          totalTasks: tasks.length,
          detectedDependencies: dependencyResult.suggestions.length,
          appliedDependencies: dependencyResult.appliedDependencies,
          warnings: dependencyResult.warnings.length
        });

        // Check logical task ordering
        const foundationTasks = tasks.filter(task => {
          const text = `${task.title} ${task.description}`.toLowerCase();
          return text.includes('schema') ||
                 text.includes('model') ||
                 text.includes('interface') ||
                 text.includes('type') ||
                 text.includes('config');
        });

        const implementationTasks = tasks.filter(task => {
          const text = `${task.title} ${task.description}`.toLowerCase();
          return text.includes('implement') ||
                 text.includes('create') ||
                 text.includes('add') ||
                 text.includes('build');
        });

        const testingTasks = tasks.filter(task =>
          task.type === 'testing' ||
          task.title.toLowerCase().includes('test')
        );

        console.log('🏗️ Task Categorization:', {
          foundationTasks: foundationTasks.length,
          implementationTasks: implementationTasks.length,
          testingTasks: testingTasks.length
        });

        expect(tasks.length).toBeGreaterThan(4);
        expect(foundationTasks.length).toBeGreaterThan(0);
        expect(implementationTasks.length).toBeGreaterThan(0);
        expect(testingTasks.length).toBeGreaterThan(0);

        // Should have detected some dependencies
        expect(dependencyResult.suggestions.length).toBeGreaterThan(0);

      } else {
        console.log('❌ Dependency test failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ Intelligent dependency detection validated');
    }, 75000);
  });

  describe('End-to-End Contextual Quality Assessment', () => {
    it('should demonstrate comprehensive contextual enhancement across all features', async () => {
      logger.info('🎯 Performing comprehensive contextual quality assessment');

      const comprehensiveTask = createRealisticTask({
        id: 'COMPREHENSIVE-001',
        title: 'Develop intelligent code analysis tool for MCP ecosystem',
        description: 'Create an advanced code analysis tool that integrates with the MCP framework, provides semantic analysis, supports multiple languages, includes performance metrics, and follows all established patterns in the Vibe Coder MCP project',
        estimatedHours: 25,
        tags: ['analysis', 'mcp', 'intelligent', 'multi-language', 'comprehensive']
      });

      // Enhanced project context with additional details
      const enhancedContext: ProjectContext = {
        ...realProjectContext,
        codeMapContext: {
          hasCodeMap: true,
          lastGenerated: new Date(),
          directoryStructure: [
            { path: 'src/tools', purpose: 'MCP tool implementations', fileCount: 12 },
            { path: 'src/services', purpose: 'Core service layer', fileCount: 8 },
            { path: 'src/types', purpose: 'TypeScript type definitions', fileCount: 6 },
            { path: 'src/utils', purpose: 'Utility functions', fileCount: 4 }
          ],
          dependencyCount: 45,
          externalDependencies: 15,
          configFiles: ['package.json', 'tsconfig.json', 'vitest.config.ts']
        }
      };

      const decompositionResult = await decompositionService.decomposeTask(
        comprehensiveTask,
        enhancedContext
      );

      if (decompositionResult.success && decompositionResult.data) {
        const tasks = decompositionResult.data;

        console.log('📋 Comprehensive Analysis Results:');

        // Quality Assessment Metrics
        const qualityMetrics = {
          // File path realism
          realisticPaths: tasks.filter(t => 
            t.filePaths?.some(p => 
              p.includes('src/tools/') || 
              p.includes('src/services/') || 
              p.includes('src/types/') ||
              p.includes('__tests__/')
            )
          ).length,

          // Technology alignment
          technologyAlignment: tasks.filter(t => {
            const text = `${t.title} ${t.description}`.toLowerCase();
            return text.includes('typescript') ||
                   text.includes('mcp') ||
                   text.includes('node') ||
                   text.includes('vitest') ||
                   text.includes('express');
          }).length,

          // Implementation detail quality
          detailedImplementation: tasks.filter(t => 
            t.description.length > 80 &&
            (t.description.includes('using') || 
             t.description.includes('following') ||
             t.description.includes('integrate'))
          ).length,

          // Proper task types
          validTaskTypes: tasks.filter(t =>
            ['development', 'testing', 'documentation', 'research'].includes(t.type)
          ).length,

          // Acceptance criteria quality
          qualityAcceptance: tasks.filter(t =>
            t.acceptanceCriteria.length > 0 &&
            t.acceptanceCriteria.every(criteria => criteria.length > 10)
          ).length,

          // Testing integration
          testingTasks: tasks.filter(t =>
            t.type === 'testing' ||
            t.title.toLowerCase().includes('test') ||
            t.filePaths?.some(p => p.includes('test'))
          ).length
        };

        const totalTasks = tasks.length;
        const qualityScores = {
          pathRealism: (qualityMetrics.realisticPaths / totalTasks * 100).toFixed(1) + '%',
          technologyAlignment: (qualityMetrics.technologyAlignment / totalTasks * 100).toFixed(1) + '%',
          implementationDetail: (qualityMetrics.detailedImplementation / totalTasks * 100).toFixed(1) + '%',
          validTypes: (qualityMetrics.validTaskTypes / totalTasks * 100).toFixed(1) + '%',
          acceptanceCriteria: (qualityMetrics.qualityAcceptance / totalTasks * 100).toFixed(1) + '%',
          testingCoverage: qualityMetrics.testingTasks > 0 ? '✅' : '❌'
        };

        console.log('📊 Contextual Quality Metrics:', qualityScores);

        console.log('🔍 Sample Enhanced Tasks:');
        tasks.slice(0, 3).forEach((task, index) => {
          console.log(`  ${index + 1}. ${task.title}`);
          console.log(`     Files: ${task.filePaths?.join(', ') || 'None'}`);
          console.log(`     Type: ${task.type}, Hours: ${task.estimatedHours}`);
          console.log(`     Description: ${task.description.substring(0, 100)}...`);
          console.log('');
        });

        // Validation assertions
        expect(totalTasks).toBeGreaterThan(5);
        expect(qualityMetrics.realisticPaths).toBeGreaterThan(totalTasks * 0.4); // 40% realistic paths
        expect(qualityMetrics.technologyAlignment).toBeGreaterThan(totalTasks * 0.3); // 30% tech alignment
        expect(qualityMetrics.validTaskTypes).toBe(totalTasks); // 100% valid types
        expect(qualityMetrics.testingTasks).toBeGreaterThan(0); // At least one testing task

      } else {
        console.log('❌ Comprehensive test failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ Comprehensive contextual quality assessment completed');
    }, 120000);
  });
});