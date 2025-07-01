/**
 * Enhanced Metadata and Tagging System Tests
 * 
 * Comprehensive test suite for the enhanced metadata and tagging system
 * including tag management, metadata service, and integration capabilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TagManagementService } from '../../services/tag-management-service.js';
import { MetadataService, MetadataEnrichmentOptions } from '../../services/metadata-service.js';
import { 
  BaseTag
} from '../../types/metadata-types.js';
import { AtomicTask, TaskType, TaskPriority, TaskStatus } from '../../types/task.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';
import { createMockConfig } from '../utils/test-setup.js';

// Mock LLM helper
vi.mock('../../../../utils/llmHelper.js', () => ({
  performFormatAwareLlmCall: vi.fn()
}));

// Mock config loader
vi.mock('../../utils/config-loader.js', () => ({
  getLLMModelForOperation: vi.fn().mockResolvedValue('test-model')
}));

// Mock storage manager
vi.mock('../../core/storage/storage-manager.js', () => ({
  getStorageManager: vi.fn().mockResolvedValue({
    getProject: vi.fn().mockResolvedValue({ success: true, data: null }),
    updateProject: vi.fn().mockResolvedValue({ success: true })
  })
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Enhanced Metadata and Tagging System', () => {
  let mockConfig: OpenRouterConfig;
  let tagService: TagManagementService;
  let metadataService: MetadataService;
  let mockTask: AtomicTask;
  let mockPerformFormatAwareLlmCall: Record<string, unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    mockConfig = createMockConfig();
    tagService = TagManagementService.getInstance(mockConfig);
    metadataService = MetadataService.getInstance(mockConfig);
    
    // Setup LLM mock
    mockPerformFormatAwareLlmCall = await import('../../../../utils/llmHelper.js').then(
      module => module.performFormatAwareLlmCall
    );
    
    mockTask = {
      id: 'T001',
      title: 'Implement user authentication system',
      description: 'Create a secure user authentication system with JWT tokens, password hashing, and session management',
      type: 'development' as TaskType,
      priority: 'high' as TaskPriority,
      status: 'pending' as TaskStatus,
      projectId: 'PID-TEST-001',
      epicId: 'E001',
      estimatedHours: 8,
      actualHours: 0,
      filePaths: ['src/auth/auth.service.ts', 'src/auth/jwt.util.ts', 'src/auth/password.util.ts'],
      acceptanceCriteria: [
        'Users can login with email/password',
        'JWT tokens are generated and validated',
        'Passwords are securely hashed',
        'Session management works correctly'
      ],
      testingRequirements: {
        unitTests: ['auth.service.test.ts', 'jwt.util.test.ts'],
        integrationTests: ['auth.integration.test.ts'],
        performanceTests: ['auth.performance.test.ts'],
        coverageTarget: 90
      },
      performanceCriteria: {
        responseTime: '< 200ms',
        memoryUsage: '< 100MB',
        throughput: '> 1000 req/s'
      },
      qualityCriteria: {
        codeQuality: ['eslint', 'prettier'],
        documentation: ['jsdoc', 'readme'],
        typeScript: true,
        eslint: true
      },
      integrationCriteria: {
        compatibility: ['node-16+', 'browser'],
        patterns: ['oauth2', 'jwt']
      },
      validationMethods: {
        automated: ['unit-tests', 'integration-tests'],
        manual: ['security-review', 'usability-testing']
      },
      dependencies: ['T000-database-setup'],
      dependents: ['T002-user-profile'],
      assignedAgent: 'auth-specialist',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: ['auth', 'security', 'backend'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: ['auth', 'security', 'backend']
      }
    };
  });

  afterEach(async () => {
    await tagService.cleanup();
    await metadataService.cleanup();
  });

  describe('Tag Management Service', () => {
    describe('Tag Creation and Validation', () => {
      it('should create a functional tag successfully', async () => {
        const tag = await tagService.createTag('authentication', 'functional', {
          source: 'user',
          confidence: 0.9
        });

        expect(tag).toBeDefined();
        expect(tag.value).toBe('authentication');
        expect(tag.category).toBe('functional');
        expect(tag.confidence).toBe(0.9);
        expect(tag.source).toBe('user');
        expect(tag.createdAt).toBeInstanceOf(Date);
      });

      it('should validate tag naming conventions', async () => {
        const invalidTag: BaseTag = {
          id: 'test-id',
          value: 'Invalid Tag!',
          category: 'functional',
          confidence: 1.0,
          source: 'user',
          createdAt: new Date()
        };

        const validation = await tagService.validateTag(invalidTag);
        
        expect(validation.isValid).toBe(false);
        expect(validation.issues).toHaveLength(1);
        expect(validation.issues[0].type).toBe('naming_convention');
        expect(validation.suggestions).toHaveLength(1);
      });

      it('should prevent duplicate tags', async () => {
        // Create first tag
        await tagService.createTag('auth', 'functional');
        
        // Try to create duplicate
        await expect(
          tagService.createTag('auth', 'functional')
        ).rejects.toThrow('Invalid tag');
      });

      it('should support hierarchical tags', async () => {
        const parentTag = await tagService.createTag('security', 'functional');
        const childTag = await tagService.createTag('encryption', 'functional', {
          parentId: parentTag.id
        });

        expect(childTag.parentId).toBe(parentTag.id);
      });
    });

    describe('Tag Suggestions', () => {
      it('should suggest functional tags based on content', async () => {
        const suggestions = await tagService.suggestTags({
          title: 'Implement user authentication',
          description: 'Create login and registration with OAuth2',
          type: 'development'
        }, {
          maxSuggestions: 5,
          useAI: false // Disable AI for predictable testing
        });

        expect(suggestions).toBeDefined();
        expect(Array.isArray(suggestions)).toBe(true);
        
        // Should suggest auth-related tags
        const authSuggestion = suggestions.find(s => 
          s.tag.value.includes('auth') || s.tag.value.includes('login')
        );
        expect(authSuggestion).toBeDefined();
        
        if (authSuggestion) {
          expect(authSuggestion.confidence).toBeGreaterThan(0);
          expect(authSuggestion.source).toBe('pattern');
        }
      });

      it('should provide AI-powered tag suggestions', async () => {
        mockPerformFormatAwareLlmCall.mockResolvedValue(JSON.stringify({
          suggestions: [
            {
              tag: 'authentication',
              category: 'functional',
              confidence: 0.9,
              reasoning: 'Task involves user authentication functionality'
            },
            {
              tag: 'jwt',
              category: 'technical',
              confidence: 0.8,
              reasoning: 'JWT tokens mentioned in description'
            },
            {
              tag: 'high-priority',
              category: 'business',
              confidence: 0.7,
              reasoning: 'Authentication is typically high priority'
            }
          ]
        }));

        const suggestions = await tagService.suggestTags({
          title: mockTask.title,
          description: mockTask.description,
          type: mockTask.type
        }, {
          maxSuggestions: 10,
          useAI: true
        });

        expect(suggestions.length).toBeGreaterThan(0);
        
        const aiSuggestions = suggestions.filter(s => s.source === 'ai');
        
        expect(aiSuggestions.length).toBeGreaterThan(0);
        
        // AI should provide some suggestions (jwt and high-priority in our mock)
        const jwtSuggestion = aiSuggestions.find(s => s.tag.value === 'jwt');
        expect(jwtSuggestion).toBeDefined();
        expect(jwtSuggestion?.confidence).toBe(0.8);
        expect(jwtSuggestion?.tag.category).toBe('technical');
        
        // Check that authentication is in the overall suggestions (from pattern or AI)
        const authSuggestion = suggestions.find(s => s.tag.value === 'authentication');
        expect(authSuggestion).toBeDefined();
        expect(authSuggestion?.tag.category).toBe('functional');
      });

      it('should filter suggestions by category', async () => {
        const suggestions = await tagService.suggestTags({
          title: 'React component with TypeScript',
          description: 'Build UI component using React and TypeScript',
          type: 'development'
        }, {
          categories: ['technical'],
          useAI: false
        });

        // All suggestions should be technical
        suggestions.forEach(suggestion => {
          expect(suggestion.tag.category).toBe('technical');
        });
      });
    });

    describe('Tag Enhancement and Categorization', () => {
      it('should enhance tag collection with intelligent categorization', async () => {
        const collection = await tagService.enhanceTagCollection({
          title: mockTask.title,
          description: mockTask.description,
          type: mockTask.type
        }, mockTask.tags);

        expect(collection).toBeDefined();
        expect(collection.functional).toBeDefined();
        expect(collection.technical).toBeDefined();
        expect(collection.business).toBeDefined();
        expect(collection.process).toBeDefined();
        expect(collection.quality).toBeDefined();
        expect(collection.custom).toBeDefined();
        expect(collection.generated).toBeDefined();

        // Should have some functional tags for auth-related content
        expect(collection.functional.length).toBeGreaterThan(0);
      });

      it('should categorize existing tags correctly', async () => {
        const collection = await tagService.enhanceTagCollection({
          title: 'Build React components',
          description: 'Create reusable UI components with TypeScript',
          type: 'development'
        }, ['react', 'typescript', 'high-priority', 'frontend']);

        // Check that tags are properly categorized
        const functionalTags = collection.functional.map(t => t.value);
        const technicalTags = collection.technical.map(t => t.value);
        const businessTags = collection.business.map(t => t.value);

        expect(functionalTags).toContain('frontend');
        expect(technicalTags).toContain('react');
        expect(technicalTags).toContain('typescript');
        expect(businessTags).toContain('high-priority');
      });
    });

    describe('Tag Search and Analytics', () => {
      beforeEach(async () => {
        // Create some test tags
        await tagService.createTag('auth', 'functional', { source: 'user' });
        await tagService.createTag('react', 'technical', { source: 'user' });
        await tagService.createTag('high-priority', 'business', { source: 'user' });
        await tagService.createTag('testing', 'process', { source: 'system' });
      });

      it('should search tags by query', async () => {
        const results = await tagService.searchTags({
          query: 'auth'
        });

        expect(results.length).toBeGreaterThan(0);
        const authTag = results.find(t => t.value === 'auth');
        expect(authTag).toBeDefined();
      });

      it('should filter tags by category', async () => {
        const results = await tagService.searchTags({
          categories: ['technical', 'functional']
        });

        results.forEach(tag => {
          expect(['technical', 'functional']).toContain(tag.category);
        });
      });

      it('should filter tags by source', async () => {
        const results = await tagService.searchTags({
          sources: ['user']
        });

        results.forEach(tag => {
          expect(tag.source).toBe('user');
        });
      });

      it('should provide tag analytics', async () => {
        const analytics = await tagService.getTagAnalytics({
          entityType: 'task'
        });

        expect(analytics).toBeDefined();
        expect(analytics.popular).toBeDefined();
        expect(analytics.trends).toBeDefined();
        expect(analytics.distribution).toBeDefined();
        expect(analytics.relationships).toBeDefined();
        expect(analytics.orphaned).toBeDefined();
        expect(analytics.period).toBeDefined();
        expect(analytics.period.start).toBeInstanceOf(Date);
        expect(analytics.period.end).toBeInstanceOf(Date);
      });
    });
  });

  describe('Metadata Service', () => {
    describe('Task Metadata Creation', () => {
      it('should create comprehensive task metadata', async () => {
        const options: MetadataEnrichmentOptions = {
          useAI: false,
          analyzeComplexity: true,
          estimatePerformance: true,
          assessQuality: true,
          enhanceTags: true
        };

        const metadata = await metadataService.createTaskMetadata(mockTask, options);

        expect(metadata).toBeDefined();
        expect(metadata.createdAt).toBeInstanceOf(Date);
        expect(metadata.createdBy).toBe(mockTask.createdBy);
        expect(metadata.version).toBe(1);
        expect(metadata.lifecycle).toBe('draft');
        
        // Check tag collection
        expect(metadata.tags).toBeDefined();
        expect(metadata.tags.functional).toBeDefined();
        expect(metadata.tags.technical).toBeDefined();
        
        // Check complexity analysis
        expect(metadata.complexity).toBeDefined();
        expect(metadata.complexity.overallScore).toBeGreaterThan(0);
        expect(metadata.complexity.technical).toBeGreaterThan(0);
        expect(metadata.complexity.business).toBeGreaterThan(0);
        expect(metadata.complexity.integration).toBeGreaterThan(0);
        
        // Check performance estimation
        expect(metadata.performance).toBeDefined();
        expect(metadata.performance.estimatedTime).toBe(mockTask.estimatedHours * 60);
        expect(metadata.performance.targets).toBeDefined();
        expect(metadata.performance.metrics).toBeDefined();
        
        // Check quality assessment
        expect(metadata.quality).toBeDefined();
        expect(metadata.quality.score).toBeGreaterThan(0);
        expect(metadata.quality.dimensions).toBeDefined();
        expect(metadata.quality.dimensions.testCoverage).toBe(0.9); // 90% coverage target
        expect(metadata.quality.gates).toBeDefined();
        
        // Check collaboration metadata
        expect(metadata.collaboration).toBeDefined();
        expect(metadata.collaboration.assignees).toContain(mockTask.assignedAgent);
        
        // Check integration metadata
        expect(metadata.integration).toBeDefined();
        expect(metadata.integration.dependencies.internal).toEqual(mockTask.dependencies);
      });

      it('should handle metadata creation with minimal options', async () => {
        const options: MetadataEnrichmentOptions = {
          useAI: false,
          analyzeComplexity: false,
          estimatePerformance: false,
          assessQuality: false,
          enhanceTags: false
        };

        const metadata = await metadataService.createTaskMetadata(mockTask, options);

        expect(metadata).toBeDefined();
        expect(metadata.complexity.overallScore).toBe(0.5); // Default value
        expect(metadata.performance.estimatedTime).toBe(mockTask.estimatedHours * 60);
        expect(metadata.quality.score).toBe(0.8); // Default value
      });

      it('should analyze task complexity correctly', async () => {
        const complexTask: AtomicTask = {
          ...mockTask,
          priority: 'critical',
          filePaths: Array.from({ length: 10 }, (_, i) => `file${i}.ts`),
          dependencies: ['T001', 'T002', 'T003', 'T004'],
          testingRequirements: {
            ...mockTask.testingRequirements,
            coverageTarget: 95,
            unitTests: ['test1.ts', 'test2.ts', 'test3.ts']
          }
        };

        const metadata = await metadataService.createTaskMetadata(complexTask, {
          analyzeComplexity: true
        });

        expect(metadata.complexity.overallScore).toBeGreaterThan(0.5);
        expect(metadata.complexity.technical).toBeGreaterThan(0.5);
        expect(metadata.complexity.business).toBeGreaterThan(0.5);
        expect(metadata.complexity.integration).toBeGreaterThan(0.5);
        expect(metadata.complexity.factors.length).toBeGreaterThan(0);
      });
    });

    describe('Metadata Validation', () => {
      it('should validate complete metadata successfully', async () => {
        const metadata = await metadataService.createTaskMetadata(mockTask);
        const validation = await metadataService.validateMetadata(metadata);

        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      });

      it('should identify metadata validation errors', async () => {
        const invalidMetadata: Record<string, unknown> = {
          // Missing required fields
          version: 0, // Invalid version
          lifecycle: 'invalid_lifecycle' // Invalid lifecycle
        };

        const validation = await metadataService.validateMetadata(invalidMetadata);

        expect(validation.isValid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
        
        const versionError = validation.errors.find(e => e.field === 'version');
        expect(versionError).toBeDefined();
        
        const lifecycleError = validation.errors.find(e => e.field === 'lifecycle');
        expect(lifecycleError).toBeDefined();
      });

      it('should provide metadata improvement suggestions', async () => {
        const basicMetadata = await metadataService.createTaskMetadata({
          ...mockTask,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test-user',
            tags: []
          }
        });

        const validation = await metadataService.validateMetadata(basicMetadata);

        expect(validation.suggestions.length).toBeGreaterThan(0);
        const attributeSuggestion = validation.suggestions.find(s => s.field === 'attributes');
        expect(attributeSuggestion).toBeDefined();
      });
    });

    describe('Metadata Updates and Change Tracking', () => {
      it('should update metadata and track changes', async () => {
        const originalMetadata = await metadataService.createTaskMetadata(mockTask);
        
        const updates = {
          lifecycle: 'active' as const,
          attributes: {
            'custom-attr': 'custom-value'
          }
        };

        const updatedMetadata = await metadataService.updateMetadata(
          mockTask.id,
          updates,
          'update-user',
          'Activating task'
        );

        expect(updatedMetadata.lifecycle).toBe('active');
        expect(updatedMetadata.attributes['custom-attr']).toBe('custom-value');
        expect(updatedMetadata.version).toBe(originalMetadata.version + 1);
        expect(updatedMetadata.updatedBy).toBe('update-user');

        // Check change history
        const changes = metadataService.getChangeHistory(mockTask.id);
        expect(changes.length).toBeGreaterThan(0);
        
        const lifecycleChange = changes.find(c => c.field === 'lifecycle');
        expect(lifecycleChange).toBeDefined();
        expect(lifecycleChange?.newValue).toBe('active');
        expect(lifecycleChange?.reason).toBe('Activating task');
      });

      it('should handle metadata updates for non-existent entities', async () => {
        await expect(
          metadataService.updateMetadata('non-existent', {}, 'user')
        ).rejects.toThrow('Metadata not found');
      });
    });

    describe('Metadata Search and Analytics', () => {
      beforeEach(async () => {
        // Create test metadata
        await metadataService.createTaskMetadata(mockTask);
        await metadataService.createTaskMetadata({
          ...mockTask,
          id: 'T002',
          priority: 'low',
          createdBy: 'user2'
        });
      });

      it('should search metadata with filters', async () => {
        const results = await metadataService.searchMetadata({
          createdBy: ['test-user'],
          lifecycles: ['draft']
        });

        expect(results.length).toBeGreaterThan(0);
        results.forEach(metadata => {
          expect(metadata.createdBy).toBe('test-user');
          expect(metadata.lifecycle).toBe('draft');
        });
      });

      it('should provide comprehensive metadata analytics', async () => {
        const analytics = await metadataService.getMetadataAnalytics();

        expect(analytics).toBeDefined();
        expect(analytics.totalEntities).toBeGreaterThan(0);
        expect(analytics.completeness).toBeDefined();
        expect(analytics.completeness.average).toBeGreaterThanOrEqual(0);
        expect(analytics.completeness.average).toBeLessThanOrEqual(1);
        expect(analytics.changeFrequency).toBeDefined();
        expect(analytics.activeUsers).toBeDefined();
        expect(analytics.commonAttributes).toBeDefined();
        expect(analytics.quality).toBeDefined();
      });

      it('should filter analytics by date range', async () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const analytics = await metadataService.getMetadataAnalytics({
          dateRange: {
            start: yesterday,
            end: tomorrow
          }
        });

        expect(analytics.totalEntities).toBeGreaterThan(0);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should integrate tag management with metadata service', async () => {
      // Create task metadata with enhanced tagging
      const metadata = await metadataService.createTaskMetadata(mockTask, {
        enhanceTags: true,
        useAI: false
      });

      // Verify that tags were properly categorized
      expect(metadata.tags).toBeDefined();
      expect(metadata.tags.functional.length + 
             metadata.tags.technical.length + 
             metadata.tags.business.length).toBeGreaterThan(0);

      // Test tag suggestions for related content
      const suggestions = await tagService.suggestTags({
        title: 'User profile management',
        description: 'Manage user profiles with authentication integration',
        type: 'development'
      }, { useAI: false });

      // Should suggest auth-related tags since we created auth metadata
      const authRelated = suggestions.some(s => 
        s.tag.value.includes('auth') || 
        s.tag.value.includes('user') ||
        s.tag.value.includes('profile')
      );
      expect(authRelated).toBe(true);
    });

    it('should handle complex workflow with multiple entities', async () => {
      // Create multiple tasks with different characteristics
      const tasks = [
        {
          ...mockTask,
          id: 'T001',
          title: 'Authentication service',
          type: 'development' as TaskType,
          priority: 'high' as TaskPriority
        },
        {
          ...mockTask,
          id: 'T002',
          title: 'API documentation',
          type: 'documentation' as TaskType,
          priority: 'medium' as TaskPriority
        },
        {
          ...mockTask,
          id: 'T003',
          title: 'Performance testing',
          type: 'testing' as TaskType,
          priority: 'low' as TaskPriority
        }
      ];

      // Create metadata for all tasks
      const metadataList = await Promise.all(
        tasks.map(task => metadataService.createTaskMetadata(task, {
          analyzeComplexity: true,
          enhanceTags: true
        }))
      );

      expect(metadataList).toHaveLength(3);

      // Verify different complexity scores based on task types
      const devTaskMetadata = metadataList[0];
      const docTaskMetadata = metadataList[1];
      const testTaskMetadata = metadataList[2];

      expect(devTaskMetadata.complexity.business).toBeGreaterThan(docTaskMetadata.complexity.business);
      expect(devTaskMetadata.tags.functional.length).toBeGreaterThan(0);
      expect(docTaskMetadata.tags.process.length).toBeGreaterThan(0);
      expect(testTaskMetadata.tags.quality.length).toBeGreaterThan(0);

      // Test analytics across all entities
      const analytics = await metadataService.getMetadataAnalytics();
      expect(analytics.totalEntities).toBe(3);
    });

    it('should maintain performance with large datasets', async () => {
      // Create many tasks quickly to test performance
      const startTime = Date.now();
      
      const tasks = Array.from({ length: 20 }, (_, i) => ({
        ...mockTask,
        id: `T${i.toString().padStart(3, '0')}`,
        title: `Test task ${i}`,
        tags: [`tag-${i}`, 'common-tag']
      }));

      const metadataPromises = tasks.map(task => 
        metadataService.createTaskMetadata(task, {
          useAI: false, // Disable AI for speed
          analyzeComplexity: true,
          enhanceTags: true
        })
      );

      const metadataList = await Promise.all(metadataPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(metadataList).toHaveLength(20);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Test search performance
      const searchStart = Date.now();
      const searchResults = await metadataService.searchMetadata({
        lifecycles: ['draft']
      });
      const searchDuration = Date.now() - searchStart;

      expect(searchResults.length).toBe(20);
      expect(searchDuration).toBeLessThan(1000); // Search should be fast
    });
  });
});