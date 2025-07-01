/**
 * Dependency Detection Validation Test
 * 
 * This test validates that our intelligent dependency detection system:
 * 1. Identifies logical dependencies between related tasks
 * 2. Suggests appropriate dependency types (blocks, enables, requires)
 * 3. Provides execution order recommendations
 * 4. Handles complex multi-layered dependency scenarios
 * 5. Integrates seamlessly with task decomposition workflow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDependencyGraph } from '../../core/dependency-graph.js';
import { DecompositionService } from '../../services/decomposition-service.js';
import { getOpenRouterConfig } from '../../../../utils/openrouter-config-manager.js';
import { AtomicTask } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import logger from '../../../../logger.js';

describe('Dependency Detection Validation', () => {
  let decompositionService: DecompositionService;
  let config: Record<string, unknown>;

  // Helper to create realistic task for testing
  const createTask = (
    id: string, 
    title: string, 
    description: string, 
    overrides: Partial<AtomicTask> = {}
  ): AtomicTask => ({
    id,
    title,
    description,
    status: 'pending',
    priority: 'medium',
    type: 'development',
    estimatedHours: 2,
    epicId: 'dependency-test-epic',
    projectId: 'dependency-test-project',
    dependencies: [],
    dependents: [],
    filePaths: [],
    acceptanceCriteria: [`${title} completed successfully`],
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
    createdBy: 'dependency-test',
    tags: ['dependency-test'],
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'dependency-test',
      tags: ['dependency-test']
    },
    ...overrides
  });

  const testProjectContext: ProjectContext = {
    projectId: 'dependency-test-project',
    projectPath: '/Users/bishopdotun/Documents/Dev Projects/Vibe-Coder-MCP',
    projectName: 'Dependency Detection Test Project',
    description: 'Testing intelligent dependency detection capabilities',
    languages: ['TypeScript'],
    frameworks: ['Node.js', 'Express'],
    buildTools: ['npm', 'tsc'],
    tools: ['ESLint', 'Vitest'],
    configFiles: ['package.json', 'tsconfig.json'],
    entryPoints: ['src/index.ts'],
    architecturalPatterns: ['mvc', 'service-layer'],
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
      production: ['express', 'typescript'],
      development: ['vitest', 'eslint'],
      external: []
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      source: 'dependency-test'
    }
  };

  beforeAll(async () => {
    config = await getOpenRouterConfig();
    decompositionService = DecompositionService.getInstance(config);
    logger.info('Dependency detection validation test suite initialized');
  });

  afterAll(() => {
    logger.info('Dependency detection validation test suite completed');
  });

  describe('Basic Dependency Detection', () => {
    it('should detect sequential dependencies in database-related tasks', async () => {
      logger.info('🔗 Testing sequential database dependency detection');

      const databaseTasks: AtomicTask[] = [
        createTask(
          'DB-001',
          'Design user database schema',
          'Create PostgreSQL schema for user management with proper indexing and constraints',
          {
            type: 'development',
            estimatedHours: 3,
            filePaths: ['migrations/001_create_users_table.sql'],
            tags: ['database', 'schema', 'users']
          }
        ),
        createTask(
          'DB-002', 
          'Implement User model with TypeORM',
          'Create User entity class with TypeORM decorators and validation rules',
          {
            type: 'development',
            estimatedHours: 2,
            filePaths: ['src/models/User.ts'],
            tags: ['model', 'typeorm', 'users']
          }
        ),
        createTask(
          'DB-003',
          'Create user repository pattern',
          'Implement repository pattern for user data access with CRUD operations',
          {
            type: 'development',
            estimatedHours: 2.5,
            filePaths: ['src/repositories/UserRepository.ts'],
            tags: ['repository', 'data-access', 'users']
          }
        ),
        createTask(
          'DB-004',
          'Build user service layer',
          'Create service layer for user business logic using the repository pattern',
          {
            type: 'development',
            estimatedHours: 3,
            filePaths: ['src/services/UserService.ts'],
            tags: ['service', 'business-logic', 'users']
          }
        )
      ];

      const dependencyGraph = getDependencyGraph('database-test-project');
      const result = dependencyGraph.applyIntelligentDependencyDetection(databaseTasks);

      console.log('📊 Database Dependency Detection Results:', {
        totalTasks: databaseTasks.length,
        detectedDependencies: result.suggestions.length,
        appliedDependencies: result.appliedDependencies,
        warnings: result.warnings
      });

      console.log('🔗 Detected Dependencies:');
      result.suggestions.forEach(suggestion => {
        const fromTask = databaseTasks.find(t => t.id === suggestion.fromTaskId);
        const toTask = databaseTasks.find(t => t.id === suggestion.toTaskId);
        console.log(`  ${fromTask?.title} → ${toTask?.title}`);
        console.log(`    Type: ${suggestion.dependencyType}, Confidence: ${(suggestion.confidence * 100).toFixed(1)}%`);
        console.log(`    Reason: ${suggestion.reason}`);
      });

      // Validate detection results
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.appliedDependencies).toBeGreaterThan(0);

      // Should detect schema → model dependency
      const schemaToModel = result.suggestions.find(s => 
        s.fromTaskId === 'DB-001' && s.toTaskId === 'DB-002'
      );
      expect(schemaToModel).toBeDefined();
      expect(schemaToModel?.confidence).toBeGreaterThan(0.7);

      // Should detect model → repository dependency
      const modelToRepo = result.suggestions.find(s =>
        s.fromTaskId === 'DB-002' && s.toTaskId === 'DB-003'
      );
      expect(modelToRepo).toBeDefined();

      logger.info('✅ Sequential database dependency detection validated');
    });

    it('should detect API endpoint dependencies', async () => {
      logger.info('🌐 Testing API endpoint dependency detection');

      const apiTasks: AtomicTask[] = [
        createTask(
          'API-001',
          'Create authentication middleware',
          'Implement JWT authentication middleware for protecting API routes',
          {
            type: 'development',
            estimatedHours: 2,
            filePaths: ['src/middleware/auth.ts'],
            tags: ['auth', 'middleware', 'jwt']
          }
        ),
        createTask(
          'API-002',
          'Build user registration endpoint',
          'Create POST /api/users/register endpoint with validation and error handling',
          {
            type: 'development',
            estimatedHours: 3,
            filePaths: ['src/routes/users.ts'],
            tags: ['api', 'registration', 'validation']
          }
        ),
        createTask(
          'API-003',
          'Implement user profile endpoints',
          'Create protected user profile CRUD endpoints using authentication middleware',
          {
            type: 'development',
            estimatedHours: 4,
            filePaths: ['src/routes/profile.ts'],
            tags: ['api', 'profile', 'crud', 'protected']
          }
        ),
        createTask(
          'API-004',
          'Add API rate limiting',
          'Implement rate limiting middleware for all API endpoints',
          {
            type: 'development',
            estimatedHours: 1.5,
            filePaths: ['src/middleware/rateLimiter.ts'],
            tags: ['middleware', 'rate-limiting', 'security']
          }
        )
      ];

      const dependencyGraph = getDependencyGraph('api-test-project');
      const result = dependencyGraph.applyIntelligentDependencyDetection(apiTasks);

      console.log('📊 API Dependency Detection Results:', {
        totalTasks: apiTasks.length,
        detectedDependencies: result.suggestions.length,
        appliedDependencies: result.appliedDependencies
      });

      // Should detect auth middleware → protected endpoints dependency
      const authToProfile = result.suggestions.find(s =>
        s.fromTaskId === 'API-001' && s.toTaskId === 'API-003'
      );
      expect(authToProfile).toBeDefined();
      expect(authToProfile?.dependencyType).toBe('blocks');

      logger.info('✅ API endpoint dependency detection validated');
    });
  });

  describe('Complex Multi-Layer Dependencies', () => {
    it('should handle complex full-stack feature dependencies', async () => {
      logger.info('🏗️ Testing complex full-stack dependency detection');

      const fullStackTasks: AtomicTask[] = [
        // Database Layer
        createTask(
          'FS-001',
          'Create orders database schema',
          'Design PostgreSQL schema for order management system',
          {
            type: 'development',
            estimatedHours: 3,
            filePaths: ['migrations/002_create_orders.sql'],
            tags: ['database', 'orders', 'schema']
          }
        ),
        createTask(
          'FS-002',
          'Implement Order model',
          'Create TypeORM Order entity with relationships to User and Product',
          {
            type: 'development',
            estimatedHours: 2,
            filePaths: ['src/models/Order.ts'],
            tags: ['model', 'orders', 'typeorm']
          }
        ),
        // Service Layer
        createTask(
          'FS-003',
          'Build order processing service',
          'Create order processing service with payment integration and inventory checks',
          {
            type: 'development',
            estimatedHours: 5,
            filePaths: ['src/services/OrderService.ts'],
            tags: ['service', 'orders', 'payment', 'inventory']
          }
        ),
        createTask(
          'FS-004',
          'Implement notification service',
          'Create email and SMS notification service for order updates',
          {
            type: 'development',
            estimatedHours: 3,
            filePaths: ['src/services/NotificationService.ts'],
            tags: ['service', 'notifications', 'email', 'sms']
          }
        ),
        // API Layer
        createTask(
          'FS-005',
          'Create order API endpoints',
          'Build REST API endpoints for order management using order service',
          {
            type: 'development',
            estimatedHours: 4,
            filePaths: ['src/routes/orders.ts'],
            tags: ['api', 'orders', 'rest']
          }
        ),
        // Frontend Layer
        createTask(
          'FS-006',
          'Build order management UI',
          'Create React components for order creation and tracking',
          {
            type: 'development',
            estimatedHours: 6,
            filePaths: ['src/components/OrderManagement.tsx'],
            tags: ['frontend', 'react', 'ui', 'orders']
          }
        ),
        // Testing Layer
        createTask(
          'FS-007',
          'Write integration tests',
          'Create comprehensive integration tests for order processing workflow',
          {
            type: 'testing',
            estimatedHours: 4,
            filePaths: ['src/__tests__/integration/orders.test.ts'],
            tags: ['testing', 'integration', 'orders']
          }
        ),
        createTask(
          'FS-008',
          'Add end-to-end tests',
          'Create E2E tests for complete order flow from UI to database',
          {
            type: 'testing',
            estimatedHours: 3,
            filePaths: ['tests/e2e/order-flow.test.ts'],
            tags: ['testing', 'e2e', 'orders']
          }
        )
      ];

      const dependencyGraph = getDependencyGraph('fullstack-test-project');
      const result = dependencyGraph.applyIntelligentDependencyDetection(fullStackTasks);

      console.log('📊 Full-Stack Dependency Results:', {
        totalTasks: fullStackTasks.length,
        detectedDependencies: result.suggestions.length,
        appliedDependencies: result.appliedDependencies,
        warnings: result.warnings.length
      });

      // Analyze dependency layers
      const layerDependencies = {
        database: result.suggestions.filter(s => s.fromTaskId.startsWith('FS-001')),
        model: result.suggestions.filter(s => s.fromTaskId.startsWith('FS-002')),
        service: result.suggestions.filter(s => s.fromTaskId.includes('003') || s.fromTaskId.includes('004')),
        api: result.suggestions.filter(s => s.fromTaskId.startsWith('FS-005')),
        frontend: result.suggestions.filter(s => s.fromTaskId.startsWith('FS-006')),
        testing: result.suggestions.filter(s => s.fromTaskId.includes('007') || s.fromTaskId.includes('008'))
      };

      console.log('🏗️ Dependency Layer Analysis:', {
        databaseDeps: layerDependencies.database.length,
        modelDeps: layerDependencies.model.length,
        serviceDeps: layerDependencies.service.length,
        apiDeps: layerDependencies.api.length,
        frontendDeps: layerDependencies.frontend.length,
        testingDeps: layerDependencies.testing.length
      });

      // Validate architectural flow
      expect(result.suggestions.length).toBeGreaterThan(3);
      expect(result.appliedDependencies).toBeGreaterThan(0);

      // Should detect foundational dependencies
      const schemaToModel = result.suggestions.find(s => 
        s.fromTaskId === 'FS-001' && s.toTaskId === 'FS-002'
      );
      expect(schemaToModel).toBeDefined();

      logger.info('✅ Complex full-stack dependency detection validated');
    });

    it('should generate optimal execution order', async () => {
      logger.info('📅 Testing execution order optimization');

      const complexTasks: AtomicTask[] = [
        createTask('EXEC-001', 'Setup project configuration', 'Initialize project configuration files', {
          estimatedHours: 1,
          filePaths: ['package.json', 'tsconfig.json'],
          tags: ['setup', 'config']
        }),
        createTask('EXEC-002', 'Create utility functions', 'Implement common utility functions', {
          estimatedHours: 2,
          filePaths: ['src/utils/index.ts'],
          tags: ['utils', 'helpers']
        }),
        createTask('EXEC-003', 'Build data models', 'Create TypeScript interfaces and types', {
          estimatedHours: 3,
          filePaths: ['src/types/index.ts'],
          tags: ['types', 'models']
        }),
        createTask('EXEC-004', 'Implement business logic', 'Create service layer using models and utilities', {
          estimatedHours: 5,
          filePaths: ['src/services/BusinessService.ts'],
          tags: ['service', 'logic']
        }),
        createTask('EXEC-005', 'Create API layer', 'Build REST endpoints using business services', {
          estimatedHours: 4,
          filePaths: ['src/routes/api.ts'],
          tags: ['api', 'routes']
        }),
        createTask('EXEC-006', 'Add comprehensive tests', 'Write tests for all layers', {
          type: 'testing',
          estimatedHours: 6,
          filePaths: ['src/__tests__/comprehensive.test.ts'],
          tags: ['testing', 'validation']
        })
      ];

      const dependencyGraph = getDependencyGraph('execution-test-project');
      dependencyGraph.applyIntelligentDependencyDetection(complexTasks);

      // Get execution order
      const executionPlan = dependencyGraph.getRecommendedExecutionOrder();

      console.log('📅 Execution Plan Analysis:', {
        totalTasks: complexTasks.length,
        executionOrder: executionPlan.topologicalOrder,
        estimatedDuration: executionPlan.estimatedDuration,
        parallelBatches: executionPlan.parallelBatches.length
      });

      console.log('🔄 Recommended Execution Order:');
      executionPlan.topologicalOrder.forEach((taskId, index) => {
        const task = complexTasks.find(t => t.id === taskId);
        console.log(`  ${index + 1}. ${task?.title || taskId} (${task?.estimatedHours}h)`);
      });

      // Validate execution order logic
      expect(executionPlan.topologicalOrder.length).toBe(complexTasks.length);
      expect(executionPlan.estimatedDuration).toBeGreaterThan(0);

      // Config should come first (foundational)
      expect(executionPlan.topologicalOrder[0]).toBe('EXEC-001');

      // Testing should come last (depends on everything)
      expect(executionPlan.topologicalOrder[executionPlan.topologicalOrder.length - 1]).toBe('EXEC-006');

      logger.info('✅ Execution order optimization validated');
    });
  });

  describe('Integration with Task Decomposition', () => {
    it('should integrate dependency detection with decomposition workflow', async () => {
      logger.info('🔄 Testing dependency detection integration with decomposition');

      const complexSystemTask = createTask(
        'INTEGRATED-001',
        'Build user management system',
        'Create a complete user management system with authentication, profile management, and admin controls',
        {
          estimatedHours: 20,
          tags: ['user-management', 'auth', 'admin', 'comprehensive']
        }
      );

      // Test decomposition with dependency detection
      const decompositionResult = await decompositionService.decomposeTask(
        complexSystemTask,
        testProjectContext
      );

      if (decompositionResult.success && decompositionResult.data) {
        const decomposedTasks = decompositionResult.data;

        console.log('📊 Integrated Decomposition Results:', {
          originalTask: complexSystemTask.title,
          decomposedTaskCount: decomposedTasks.length,
          averageHoursPerTask: (decomposedTasks.reduce((sum, t) => sum + t.estimatedHours, 0) / decomposedTasks.length).toFixed(1)
        });

        // Apply dependency detection to decomposed tasks
        const dependencyGraph = getDependencyGraph('integrated-test-project');
        const dependencyResult = dependencyGraph.applyIntelligentDependencyDetection(decomposedTasks);

        console.log('🔗 Post-Decomposition Dependency Detection:', {
          decomposedTasks: decomposedTasks.length,
          detectedDependencies: dependencyResult.suggestions.length,
          appliedDependencies: dependencyResult.appliedDependencies,
          warnings: dependencyResult.warnings.length
        });

        // Validate integration results
        expect(decomposedTasks.length).toBeGreaterThan(2);
        expect(dependencyResult.suggestions.length).toBeGreaterThanOrEqual(0);

        // Check if dependencies were detected between decomposed tasks
        if (dependencyResult.suggestions.length > 0) {
          console.log('🔍 Sample Dependencies:');
          dependencyResult.suggestions.slice(0, 3).forEach(suggestion => {
            const fromTask = decomposedTasks.find(t => t.id === suggestion.fromTaskId);
            const toTask = decomposedTasks.find(t => t.id === suggestion.toTaskId);
            console.log(`  ${fromTask?.title} → ${toTask?.title}`);
            console.log(`    Confidence: ${(suggestion.confidence * 100).toFixed(1)}%`);
          });
        }

      } else {
        console.log('❌ Decomposition failed:', decompositionResult.error);
      }

      expect(decompositionResult.success).toBe(true);
      logger.info('✅ Dependency detection integration with decomposition validated');
    }, 90000);
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large task sets efficiently', async () => {
      logger.info('⚡ Testing performance with large task sets');

      // Generate a larger set of interconnected tasks
      const largeTasks: AtomicTask[] = [];
      for (let i = 1; i <= 15; i++) {
        largeTasks.push(createTask(
          `PERF-${i.toString().padStart(3, '0')}`,
          `Task ${i}: Module ${Math.ceil(i / 3)} Component ${((i - 1) % 3) + 1}`,
          `Implement component ${((i - 1) % 3) + 1} of module ${Math.ceil(i / 3)}`,
          {
            estimatedHours: Math.random() * 4 + 1,
            filePaths: [`src/modules/module${Math.ceil(i / 3)}/component${((i - 1) % 3) + 1}.ts`],
            tags: [`module-${Math.ceil(i / 3)}`, `component-${((i - 1) % 3) + 1}`]
          }
        ));
      }

      const startTime = Date.now();
      const dependencyGraph = getDependencyGraph('performance-test-project');
      const result = dependencyGraph.applyIntelligentDependencyDetection(largeTasks);
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      const executionPlan = dependencyGraph.getRecommendedExecutionOrder();

      console.log('⚡ Performance Metrics:', {
        taskCount: largeTasks.length,
        executionTime: `${executionTime}ms`,
        avgTimePerTask: `${(executionTime / largeTasks.length).toFixed(1)}ms`,
        detectedDependencies: result.suggestions.length,
        appliedDependencies: result.appliedDependencies,
        executionOrderTime: `${Date.now() - endTime}ms`
      });

      // Performance assertions
      expect(executionTime).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
      expect(executionPlan.topologicalOrder.length).toBe(largeTasks.length);

      logger.info('✅ Performance with large task sets validated');
    });

    it('should handle edge cases gracefully', async () => {
      logger.info('🛡️ Testing edge case handling');

      // Test with empty task list
      const emptyGraph = getDependencyGraph('empty-test-project');
      const emptyResult = emptyGraph.applyIntelligentDependencyDetection([]);
      expect(emptyResult.suggestions.length).toBe(0);
      expect(emptyResult.appliedDependencies).toBe(0);

      // Test with single task
      const singleTask = [createTask('SINGLE-001', 'Single task', 'A standalone task')];
      const singleResult = emptyGraph.applyIntelligentDependencyDetection(singleTask);
      expect(singleResult.suggestions.length).toBe(0);
      expect(singleResult.appliedDependencies).toBe(0);

      // Test with duplicate task IDs
      const duplicateTasks = [
        createTask('DUP-001', 'First task', 'First description'),
        createTask('DUP-001', 'Duplicate task', 'Different description')
      ];
      const duplicateResult = emptyGraph.applyIntelligentDependencyDetection(duplicateTasks);
      expect(duplicateResult.warnings.length).toBeGreaterThan(0);

      console.log('🛡️ Edge Case Results:', {
        emptyTasksOk: emptyResult.suggestions.length === 0,
        singleTaskOk: singleResult.suggestions.length === 0,
        duplicateWarnings: duplicateResult.warnings.length
      });

      logger.info('✅ Edge case handling validated');
    });
  });
});