/**
 * Codemap Generation Integration Validation Test
 * 
 * This test validates that:
 * 1. Codemap generation integrates correctly with task decomposition
 * 2. Generated codemaps provide valuable context for task creation
 * 3. Real codebase structure influences task suggestions
 * 4. Performance meets acceptable thresholds
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CodeMapIntegrationService } from '../../integrations/code-map-integration.js';
import { ContextEnrichmentService } from '../../services/context-enrichment-service.js';
import { DecompositionService } from '../../services/decomposition-service.js';
import { getOpenRouterConfig } from '../../../../utils/openrouter-config-manager.js';
import { AtomicTask, TaskPriority } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import logger from '../../../../logger.js';

describe('Codemap Generation Integration Validation', () => {
  let codeMapService: CodeMapIntegrationService;
  let contextService: ContextEnrichmentService;
  let decompositionService: DecompositionService;
  let config: any;

  // Real project context for testing
  const testProjectPath = '/Users/bishopdotun/Documents/Dev Projects/Vibe-Coder-MCP';
  
  const testProjectContext: ProjectContext = {
    projectId: 'vibe-coder-mcp-codemap-test',
    projectPath: testProjectPath,
    projectName: 'Vibe Coder MCP - Codemap Integration Test',
    description: 'Testing codemap integration with real codebase structure',
    languages: ['TypeScript', 'JavaScript'],
    frameworks: ['Node.js', 'Vitest', 'Express'],
    buildTools: ['npm', 'tsc'],
    tools: ['ESLint', 'Prettier'],
    configFiles: ['package.json', 'tsconfig.json', 'vitest.config.ts'],
    entryPoints: ['src/index.ts'],
    architecturalPatterns: ['mvc', 'singleton', 'modular'],
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
      production: ['@modelcontextprotocol/sdk', 'express', 'pino'],
      development: ['vitest', 'typescript', 'eslint'],
      external: ['openrouter']
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '2.3.0',
      source: 'codemap-validation-test'
    }
  };

  beforeAll(async () => {
    // Initialize services
    config = await getOpenRouterConfig();
    codeMapService = CodeMapIntegrationService.getInstance();
    contextService = ContextEnrichmentService.getInstance();
    decompositionService = DecompositionService.getInstance(config);

    logger.info('Codemap integration validation test suite initialized');
  });

  afterAll(() => {
    logger.info('Codemap integration validation test suite completed');
  });

  describe('Codemap Generation', () => {
    it('should generate codemap for real project successfully', async () => {
      logger.info('🗺️ Testing codemap generation for real project');

      const codeMapResult = await codeMapService.generateCodeMap(testProjectPath, {
        excludePatterns: ['node_modules', 'build', '.git'],
        maxDepth: 5,
        includeTests: true,
        generateDiagram: false // Skip diagram for faster test
      });

      console.log('📊 Codemap Generation Result:', {
        success: codeMapResult.success,
        filePath: codeMapResult.filePath,
        generationTime: codeMapResult.generationTime,
        jobId: codeMapResult.jobId
      });

      expect(codeMapResult.success).toBe(true);
      expect(codeMapResult.filePath).toBeDefined();
      expect(codeMapResult.generationTime).toBeLessThan(60000); // Should complete in under 1 minute
      expect(codeMapResult.jobId).toBeDefined();

      logger.info({ 
        success: codeMapResult.success, 
        generationTime: codeMapResult.generationTime 
      }, '✅ Codemap generation completed successfully');
    }, 90000);

    it('should extract meaningful project structure information', async () => {
      logger.info('🏗️ Testing project structure extraction from codemap');

      // First ensure we have a codemap
      const codeMapResult = await codeMapService.generateCodeMap(testProjectPath, {
        excludePatterns: ['node_modules', 'build', '.git'],
        maxDepth: 3,
        generateDiagram: false
      });

      expect(codeMapResult.success).toBe(true);

      // Test architecture extraction
      const architectureInfo = await codeMapService.extractArchitecturalInfo(testProjectPath);

      console.log('🏛️ Extracted Architecture Information:', {
        directoryCount: architectureInfo.directoryStructure.length,
        patterns: architectureInfo.patterns,
        entryPoints: architectureInfo.entryPoints,
        frameworks: architectureInfo.frameworks,
        languages: architectureInfo.languages
      });

      expect(architectureInfo.directoryStructure.length).toBeGreaterThan(5);
      expect(architectureInfo.languages).toContain('TypeScript');
      expect(architectureInfo.entryPoints.length).toBeGreaterThan(0);
      expect(architectureInfo.configFiles.length).toBeGreaterThan(2);

      // Should identify key directories
      const srcDirExists = architectureInfo.directoryStructure.some(dir => 
        dir.path.includes('src')
      );
      expect(srcDirExists).toBe(true);

      logger.info('✅ Project structure extraction successful');
    }, 60000);

    it('should detect dependencies and relationships', async () => {
      logger.info('🔗 Testing dependency detection from codemap');

      const dependencies = await codeMapService.extractDependencyInfo(testProjectPath);

      console.log('📦 Dependency Analysis:', {
        totalDependencies: dependencies.length,
        externalDependencies: dependencies.filter(d => d.isExternal).length,
        internalDependencies: dependencies.filter(d => !d.isExternal).length,
        importTypes: [...new Set(dependencies.map(d => d.type))]
      });

      expect(dependencies.length).toBeGreaterThan(10);
      
      // Should find external dependencies
      const externalDeps = dependencies.filter(d => d.isExternal);
      expect(externalDeps.length).toBeGreaterThan(3);
      
      // Should find internal dependencies
      const internalDeps = dependencies.filter(d => !d.isExternal);
      expect(internalDeps.length).toBeGreaterThan(5);

      // Should identify common import types
      const importTypes = new Set(dependencies.map(d => d.type));
      expect(importTypes.has('import')).toBe(true);

      logger.info('✅ Dependency detection successful');
    }, 45000);
  });

  describe('Context Enhancement with Codemap', () => {
    it('should enhance context gathering using codemap data', async () => {
      logger.info('🔍 Testing context enhancement with codemap integration');

      // Create a task that should benefit from codemap context
      const contextAwareTask = {
        id: 'CODEMAP-TEST-001',
        title: 'Add new validation rules to atomic task detector',
        description: 'Enhance the existing AtomicTaskDetector class with additional validation rules for better task quality assessment',
        type: 'development' as const,
        priority: 'medium' as TaskPriority,
        estimatedHours: 3,
        status: 'pending' as const,
        epicId: 'validation-enhancement-epic',
        projectId: 'vibe-coder-mcp-codemap-test',
        dependencies: [],
        dependents: [],
        filePaths: ['src/tools/vibe-task-manager/core/atomic-detector.ts'],
        acceptanceCriteria: [
          'New validation rules integrated into existing AtomicTaskDetector class'
        ],
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
        createdBy: 'codemap-test',
        tags: ['validation', 'enhancement', 'codemap-test'],
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'codemap-test',
          tags: ['validation', 'enhancement']
        }
      };

      // Test context gathering with codemap integration
      const contextResult = await contextService.gatherContext({
        taskDescription: contextAwareTask.description,
        projectPath: testProjectPath,
        contentKeywords: ['atomic', 'detector', 'validation', 'task'],
        maxFiles: 8,
        maxContentSize: 40000,
        useCodeMapIntegration: true
      });

      console.log('📂 Context Enhancement Result:', {
        filesFound: contextResult.contextFiles.length,
        totalSize: contextResult.summary.totalSize,
        averageRelevance: contextResult.summary.averageRelevance,
        topFileTypes: contextResult.summary.topFileTypes,
        codemapUsed: contextResult.metadata?.codeMapIntegration || false
      });

      expect(contextResult.contextFiles.length).toBeGreaterThan(0);
      expect(contextResult.summary.averageRelevance).toBeGreaterThan(0.3);

      // Should find the actual atomic detector file
      const foundAtomicDetector = contextResult.contextFiles.some(file =>
        file.filePath.includes('atomic-detector')
      );
      expect(foundAtomicDetector).toBe(true);

      // Should have reasonable relevance scores
      const highRelevanceFiles = contextResult.contextFiles.filter(file =>
        file.relevance && file.relevance.overallScore > 0.6
      );
      expect(highRelevanceFiles.length).toBeGreaterThan(0);

      logger.info('✅ Context enhancement with codemap successful');
    }, 60000);

    it('should improve task decomposition with codemap context', async () => {
      logger.info('🔨 Testing task decomposition enhancement with codemap');

      // Create a complex task that should benefit from codemap insights
      const complexTask: AtomicTask = {
        id: 'CODEMAP-DECOMP-001',
        title: 'Implement comprehensive logging system for task manager',
        description: 'Create a unified logging system that integrates with the existing Vibe Task Manager, supports structured logging, includes performance metrics, and follows the established patterns in the codebase',
        type: 'development',
        priority: 'high' as TaskPriority,
        estimatedHours: 12,
        status: 'pending',
        epicId: 'logging-system-epic',
        projectId: 'vibe-coder-mcp-codemap-test',
        dependencies: [],
        dependents: [],
        filePaths: [],
        acceptanceCriteria: [
          'Unified logging interface created',
          'Integration with existing task manager services',
          'Performance metrics included',
          'Follows established codebase patterns'
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
        createdBy: 'codemap-test',
        tags: ['logging', 'integration', 'performance'],
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'codemap-test',
          tags: ['logging', 'integration']
        }
      };

      // Enhanced project context with codemap integration
      const enhancedContext: ProjectContext = {
        ...testProjectContext,
        codeMapContext: {
          hasCodeMap: true,
          lastGenerated: new Date(),
          directoryStructure: [
            { path: 'src/tools/vibe-task-manager', purpose: 'Task management core', fileCount: 25 },
            { path: 'src/tools/vibe-task-manager/services', purpose: 'Service layer', fileCount: 8 },
            { path: 'src/tools/vibe-task-manager/core', purpose: 'Core logic', fileCount: 6 },
            { path: 'src/logger.ts', purpose: 'Logging utilities', fileCount: 1 }
          ],
          dependencyCount: 45,
          externalDependencies: 12,
          configFiles: ['package.json', 'tsconfig.json', 'vitest.config.ts']
        }
      };

      // Test decomposition with codemap-enhanced context
      const decompositionResult = await decompositionService.decomposeTask(
        complexTask,
        enhancedContext
      );

      console.log('📋 Enhanced Decomposition Result:', {
        success: decompositionResult.success,
        taskCount: decompositionResult.data?.length || 0,
        hasContextualTasks: decompositionResult.data?.some(task => 
          task.filePaths?.some(path => path.includes('src/tools/vibe-task-manager'))
        ) || false
      });

      if (decompositionResult.success && decompositionResult.data) {
        const tasks = decompositionResult.data;

        console.log('🔍 Generated Tasks with Codemap Context:');
        tasks.forEach((task, index) => {
          console.log(`  ${index + 1}. ${task.title}`);
          console.log(`     Files: ${task.filePaths?.join(', ') || 'None specified'}`);
          console.log(`     Type: ${task.type}, Hours: ${task.estimatedHours}`);
        });

        // Validate that decomposition benefits from codemap
        expect(tasks.length).toBeGreaterThan(2);
        expect(tasks.length).toBeLessThan(12); // Should be well-decomposed

        // Should have realistic file paths based on actual project structure
        const tasksWithRealisticPaths = tasks.filter(task =>
          task.filePaths?.some(path => 
            path.includes('src/tools/vibe-task-manager') || 
            path.includes('src/logger') ||
            path.includes('src/services')
          )
        );
        expect(tasksWithRealisticPaths.length).toBeGreaterThan(0);

        // Should follow established patterns
        const tasksWithValidTypes = tasks.filter(task =>
          ['development', 'testing', 'documentation'].includes(task.type)
        );
        expect(tasksWithValidTypes.length).toBe(tasks.length);

      } else {
        console.log('❌ Decomposition failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ Task decomposition with codemap enhancement successful');
    }, 90000);
  });

  describe('Performance and Validation', () => {
    it('should validate codemap quality and integrity', async () => {
      logger.info('✅ Testing codemap validation and quality assessment');

      // Generate a fresh codemap
      const codeMapResult = await codeMapService.generateCodeMap(testProjectPath, {
        excludePatterns: ['node_modules', 'build'],
        maxDepth: 4
      });

      expect(codeMapResult.success).toBe(true);

      // Validate the generated codemap
      const validationResult = await codeMapService.validateCodeMapIntegrity(testProjectPath);

      console.log('🔍 Codemap Validation Result:', {
        isValid: validationResult.isValid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
        integrityScore: validationResult.integrityScore
      });

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.integrityScore).toBeGreaterThan(0.7);
      expect(validationResult.errors.length).toBe(0);

      logger.info('✅ Codemap validation successful');
    }, 60000);

    it('should handle codemap staleness detection and refresh', async () => {
      logger.info('⏰ Testing codemap staleness detection and refresh');

      // Check if existing codemap is stale
      const codeMapInfo = await codeMapService.detectExistingCodeMap(testProjectPath);

      console.log('📅 Codemap Staleness Check:', {
        exists: !!codeMapInfo,
        isStale: codeMapInfo?.isStale || false,
        age: codeMapInfo ? Date.now() - codeMapInfo.generatedAt.getTime() : 0
      });

      // If stale, should trigger refresh
      if (codeMapInfo?.isStale) {
        const refreshResult = await codeMapService.refreshCodeMap(testProjectPath);
        expect(refreshResult.success).toBe(true);
        logger.info('✅ Stale codemap refreshed successfully');
      } else {
        logger.info('ℹ️ Codemap is fresh, no refresh needed');
      }

      // Verify we have a valid, fresh codemap
      const updatedInfo = await codeMapService.detectExistingCodeMap(testProjectPath);
      expect(updatedInfo).toBeDefined();
      expect(updatedInfo!.isStale).toBe(false);

      logger.info('✅ Codemap staleness handling successful');
    }, 45000);

    it('should maintain acceptable performance metrics', async () => {
      logger.info('⚡ Testing codemap generation performance metrics');

      const codeMapMetadata = await codeMapService.getCodeMapMetadata(testProjectPath);
      const performanceMetrics = codeMapMetadata.performanceMetrics;

      console.log('📊 Performance Metrics:', {
        generationTime: performanceMetrics?.generationTime,
        parseTime: performanceMetrics?.parseTime,
        fileCount: performanceMetrics?.fileCount,
        lineCount: performanceMetrics?.lineCount,
        avgTimePerFile: performanceMetrics?.generationTime && performanceMetrics?.fileCount ?
          performanceMetrics.generationTime / performanceMetrics.fileCount : 0
      });

      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics!.generationTime).toBeLessThan(120000); // Under 2 minutes
      expect(performanceMetrics!.fileCount).toBeGreaterThan(50); // Should process significant files
      
      // Performance should be reasonable
      if (performanceMetrics!.fileCount > 0) {
        const avgTimePerFile = performanceMetrics!.generationTime / performanceMetrics!.fileCount;
        expect(avgTimePerFile).toBeLessThan(1000); // Under 1 second per file on average
      }

      logger.info('✅ Performance metrics within acceptable bounds');
    }, 30000);
  });

  describe('Integration Health Check', () => {
    it('should verify end-to-end codemap integration workflow', async () => {
      logger.info('🩺 Performing comprehensive codemap integration health check');

      const healthCheck = {
        codeMapGeneration: false,
        architectureExtraction: false,
        contextEnhancement: false,
        decompositionIntegration: false,
        performanceMetrics: false
      };

      try {
        // Test 1: Code map generation
        const codeMapResult = await codeMapService.generateCodeMap(testProjectPath, {
          excludePatterns: ['node_modules'],
          maxDepth: 3,
          generateDiagram: false
        });
        healthCheck.codeMapGeneration = codeMapResult.success;

        // Test 2: Architecture extraction
        if (codeMapResult.success) {
          const architectureInfo = await codeMapService.extractArchitecturalInfo(testProjectPath);
          healthCheck.architectureExtraction = architectureInfo.directoryStructure.length > 0;
        }

        // Test 3: Context enhancement
        const contextResult = await contextService.gatherContext({
          taskDescription: 'Test context gathering with codemap',
          projectPath: testProjectPath,
          maxFiles: 3,
          useCodeMapIntegration: true
        });
        healthCheck.contextEnhancement = contextResult.contextFiles.length > 0;

        // Test 4: Decomposition integration
        const simpleTask: AtomicTask = {
          id: 'HEALTH-CODEMAP-001',
          title: 'Simple test task for codemap integration',
          description: 'A test task to verify codemap integration in decomposition',
          type: 'development',
          priority: 'low' as TaskPriority,
          estimatedHours: 0.5,
          status: 'pending',
          epicId: 'health-epic',
          projectId: 'health-test',
          dependencies: [],
          dependents: [],
          filePaths: [],
          acceptanceCriteria: ['Test passes'],
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
          createdBy: 'health-check',
          tags: ['health', 'test'],
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'health-check',
            tags: ['health']
          }
        };

        const decompositionResult = await decompositionService.decomposeTask(
          simpleTask,
          testProjectContext
        );
        healthCheck.decompositionIntegration = decompositionResult.success;

        // Test 5: Performance metrics
        const codeMapMetadata = await codeMapService.getCodeMapMetadata(testProjectPath);
        healthCheck.performanceMetrics = !!codeMapMetadata.performanceMetrics;

      } catch (error) {
        logger.error({ err: error }, 'Health check failed');
      }

      console.log('🩺 Codemap Integration Health Check Results:', healthCheck);

      // Verify all systems are operational
      Object.entries(healthCheck).forEach(([system, healthy]) => {
        expect(healthy).toBe(true);
      });

      logger.info('✅ All codemap integration features verified and working correctly');
    }, 120000);
  });
});