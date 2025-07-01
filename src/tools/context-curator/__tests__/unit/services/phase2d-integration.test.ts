/**
 * Phase 2D Enhanced Intent Analysis Integration Tests
 * 
 * Tests the integration of enhanced analysis data from Phase 2 into downstream phases
 * (Phase 3: Prompt Refinement, Phase 5: Relevance Scoring, Phase 6: Meta-Prompt Generation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextCuratorService } from '../../../services/context-curator-service.js';
import type { ProjectTypeAnalysisResult, LanguageAnalysisResult } from '../../../types/llm-tasks.js';

/**
 * Extended interface to access private methods for testing
 */
interface ContextCuratorServiceWithPrivateMethods extends ContextCuratorService {
  getEnhancedPriorityWeights(strategy: string, projectAnalysis?: ProjectTypeAnalysisResult): { semantic: number; keyword: number; structural: number };
  getProjectSpecificFilters(projectAnalysis?: ProjectTypeAnalysisResult): string[];
  getAdaptiveThreshold(languageAnalysis?: LanguageAnalysisResult): number;
  deriveConstraintsFromProject(projectAnalysis?: ProjectTypeAnalysisResult): string[];
  deriveQualityRequirements(languageAnalysis?: LanguageAnalysisResult): string[];
  inferTeamExpertise(projectAnalysis?: ProjectTypeAnalysisResult): string[];
  getFrameworkGuidelines(frameworkStack?: string[]): string[];
}

describe('Phase 2D Enhanced Intent Analysis Integration', () => {
  let service: ContextCuratorServiceWithPrivateMethods;

  beforeEach(() => {
    service = ContextCuratorService.getInstance() as ContextCuratorServiceWithPrivateMethods;
  });

  describe('Enhanced Priority Weights', () => {
    it('should adjust weights for React applications', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'React Application',
        secondaryTypes: ['Frontend'],
        confidence: 0.9,
        evidence: ['react', 'jsx', 'components'],
        frameworkStack: ['React', 'TypeScript'],
        architectureStyle: ['SPA'],
        developmentEnvironment: ['npm', 'Webpack']
      };

      // Access private method for testing
      const weights = service.getEnhancedPriorityWeights('semantic_similarity', projectAnalysis);

      expect(weights).toHaveProperty('semantic');
      expect(weights).toHaveProperty('keyword');
      expect(weights).toHaveProperty('structural');
      expect(weights.semantic).toBeGreaterThan(0.7); // Enhanced for frontend
      expect(weights.structural).toBeLessThanOrEqual(0.1); // Reduced for frontend
    });

    it('should adjust weights for Node.js backend applications', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'Node.js Backend',
        secondaryTypes: ['Backend'],
        confidence: 0.85,
        evidence: ['express', 'node', 'api'],
        frameworkStack: ['Express.js', 'TypeScript'],
        architectureStyle: ['REST API'],
        developmentEnvironment: ['npm', 'Docker']
      };

      const weights = service.getEnhancedPriorityWeights('structural_importance', projectAnalysis);

      expect(weights.structural).toBeGreaterThan(0.3); // Enhanced for backend
      expect(weights.semantic).toBe(0.2); // Base weight maintained
      expect(weights.keyword).toBe(0.1); // Base weight maintained
    });

    it('should return base weights for unknown project types', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'Unknown Project',
        secondaryTypes: [],
        confidence: 0.5,
        evidence: [],
        frameworkStack: [],
        architectureStyle: [],
        developmentEnvironment: []
      };

      const weights = service.getEnhancedPriorityWeights('semantic_similarity', projectAnalysis);

      // Should match base weights for semantic_similarity
      expect(weights.semantic).toBe(0.7);
      expect(weights.keyword).toBe(0.2);
      expect(weights.structural).toBe(0.1);
    });
  });

  describe('Project-Specific Category Filters', () => {
    it('should generate frontend filters for React applications', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'React Application',
        secondaryTypes: ['Frontend'],
        confidence: 0.9,
        evidence: ['react', 'jsx'],
        frameworkStack: ['React'],
        architectureStyle: ['SPA'],
        developmentEnvironment: ['npm']
      };

      const filters = service.getProjectSpecificFilters(projectAnalysis);

      expect(filters).toContain('components');
      expect(filters).toContain('styles');
      expect(filters).toContain('hooks');
    });

    it('should generate backend filters for API applications', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'Node.js Backend',
        secondaryTypes: ['Backend'],
        confidence: 0.85,
        evidence: ['express', 'api'],
        frameworkStack: ['Express.js'],
        architectureStyle: ['REST API'],
        developmentEnvironment: ['npm']
      };

      const filters = service.getProjectSpecificFilters(projectAnalysis);

      expect(filters).toContain('api');
      expect(filters).toContain('controllers');
      expect(filters).toContain('services');
      expect(filters).toContain('middleware');
    });

    it('should include framework-specific filters', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'Python Backend',
        secondaryTypes: ['Backend'],
        confidence: 0.9,
        evidence: ['django', 'python'],
        frameworkStack: ['Django'],
        architectureStyle: ['MVT'],
        developmentEnvironment: ['pip']
      };

      const filters = service.getProjectSpecificFilters(projectAnalysis);

      expect(filters).toContain('models');
      expect(filters).toContain('views');
      expect(filters).toContain('serializers');
      expect(filters).toContain('urls');
    });
  });

  describe('Adaptive Relevance Threshold', () => {
    it('should lower threshold for projects with good grammar support', () => {
      const languageAnalysis: LanguageAnalysisResult = {
        languages: ['TypeScript', 'JavaScript'],
        fileExtensions: ['.ts', '.js'],
        grammarSupport: { 'TypeScript': true, 'JavaScript': true },
        languageDistribution: { 'TypeScript': 80, 'JavaScript': 20 },
        primaryLanguage: 'TypeScript',
        secondaryLanguages: ['JavaScript'],
        frameworkIndicators: ['React'],
        buildSystemIndicators: ['npm'],
        languageConfidence: { 'TypeScript': 0.9, 'JavaScript': 0.8 },
        totalFilesAnalyzed: 100
      };

      const threshold = service.getAdaptiveThreshold(languageAnalysis);

      expect(threshold).toBeLessThanOrEqual(0.3); // Lower threshold for good grammar support
      expect(threshold).toBeGreaterThan(0.2); // But not too low
    });

    it('should raise threshold for projects with many languages', () => {
      const languageAnalysis: LanguageAnalysisResult = {
        languages: ['JavaScript', 'Python', 'Java', 'C++', 'Go', 'Rust'],
        fileExtensions: ['.js', '.py', '.java', '.cpp', '.go', '.rs'],
        grammarSupport: { 'JavaScript': true, 'Python': true, 'Java': false, 'C++': false, 'Go': false, 'Rust': false },
        languageDistribution: { 'JavaScript': 30, 'Python': 25, 'Java': 15, 'C++': 10, 'Go': 10, 'Rust': 10 },
        primaryLanguage: 'JavaScript',
        secondaryLanguages: ['Python', 'Java', 'C++', 'Go'],
        frameworkIndicators: [],
        buildSystemIndicators: [],
        languageConfidence: { 'JavaScript': 0.7, 'Python': 0.6 },
        totalFilesAnalyzed: 200
      };

      const threshold = service.getAdaptiveThreshold(languageAnalysis);

      expect(threshold).toBeGreaterThan(0.3); // Higher threshold for many languages
    });

    it('should return default threshold when no language analysis is provided', () => {
      const threshold = service.getAdaptiveThreshold(undefined);

      expect(threshold).toBe(0.3); // Default threshold
    });
  });

  describe('Technical Constraints Derivation', () => {
    it('should derive React-specific constraints', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'React Application',
        secondaryTypes: ['Frontend'],
        confidence: 0.9,
        evidence: ['react', 'jsx'],
        frameworkStack: ['React'],
        architectureStyle: ['SPA'],
        developmentEnvironment: ['npm']
      };

      const constraints = service.deriveConstraintsFromProject(projectAnalysis);

      expect(constraints).toContain('Follow React hooks patterns');
      expect(constraints).toContain('Use functional components');
      expect(constraints).toContain('Maintain component purity');
    });

    it('should derive microservices constraints', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'Node.js Backend',
        secondaryTypes: ['Backend'],
        confidence: 0.85,
        evidence: ['microservice', 'docker'],
        frameworkStack: ['Express.js'],
        architectureStyle: ['Microservices'],
        developmentEnvironment: ['Docker', 'Kubernetes']
      };

      const constraints = service.deriveConstraintsFromProject(projectAnalysis);

      expect(constraints).toContain('Maintain service boundaries');
      expect(constraints).toContain('Use async communication');
      expect(constraints).toContain('Ensure service independence');
    });
  });

  describe('Quality Requirements Derivation', () => {
    it('should derive TypeScript-specific quality requirements', () => {
      const languageAnalysis: LanguageAnalysisResult = {
        languages: ['TypeScript'],
        fileExtensions: ['.ts'],
        grammarSupport: { 'TypeScript': true },
        languageDistribution: { 'TypeScript': 100 },
        primaryLanguage: 'TypeScript',
        secondaryLanguages: [],
        frameworkIndicators: ['React'],
        buildSystemIndicators: ['npm'],
        languageConfidence: { 'TypeScript': 0.95 },
        totalFilesAnalyzed: 50
      };

      const requirements = service.deriveQualityRequirements(languageAnalysis);

      expect(requirements).toContain('Maintain strict typing');
      expect(requirements).toContain('Use proper interfaces');
      expect(requirements).toContain('Avoid any types');
    });

    it('should derive Python-specific quality requirements', () => {
      const languageAnalysis: LanguageAnalysisResult = {
        languages: ['Python'],
        fileExtensions: ['.py'],
        grammarSupport: { 'Python': true },
        languageDistribution: { 'Python': 100 },
        primaryLanguage: 'Python',
        secondaryLanguages: [],
        frameworkIndicators: ['Django'],
        buildSystemIndicators: ['pip'],
        languageConfidence: { 'Python': 0.9 },
        totalFilesAnalyzed: 75
      };

      const requirements = service.deriveQualityRequirements(languageAnalysis);

      expect(requirements).toContain('Follow PEP 8 style guide');
      expect(requirements).toContain('Use type hints');
      expect(requirements).toContain('Maintain docstring standards');
    });
  });

  describe('Team Expertise Inference', () => {
    it('should infer frontend expertise for React projects', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'React Application',
        secondaryTypes: ['Frontend'],
        confidence: 0.9,
        evidence: ['react', 'jsx'],
        frameworkStack: ['React', 'TypeScript'],
        architectureStyle: ['SPA'],
        developmentEnvironment: ['npm']
      };

      const expertise = service.inferTeamExpertise(projectAnalysis);

      expect(expertise).toContain('Frontend Development');
      expect(expertise).toContain('UI/UX Design');
      expect(expertise).toContain('React Development');
      expect(expertise).toContain('TypeScript Development');
      expect(expertise).toContain('SPA Architecture');
    });

    it('should infer backend expertise for API projects', () => {
      const projectAnalysis: ProjectTypeAnalysisResult = {
        projectType: 'Node.js Backend',
        secondaryTypes: ['Backend'],
        confidence: 0.85,
        evidence: ['express', 'api'],
        frameworkStack: ['Express.js'],
        architectureStyle: ['REST API', 'Microservices'],
        developmentEnvironment: ['Docker']
      };

      const expertise = service.inferTeamExpertise(projectAnalysis);

      expect(expertise).toContain('Backend Development');
      expect(expertise).toContain('API Design');
      expect(expertise).toContain('Express.js Development');
      expect(expertise).toContain('REST API Architecture');
      expect(expertise).toContain('Microservices Architecture');
    });
  });

  describe('Framework Guidelines Generation', () => {
    it('should generate React guidelines', () => {
      const frameworkStack = ['React'];

      const guidelines = service.getFrameworkGuidelines(frameworkStack);

      expect(guidelines).toContain('Use functional components with hooks');
      expect(guidelines).toContain('Implement proper error boundaries');
      expect(guidelines).toContain('Follow React performance best practices');
    });

    it('should generate Django guidelines', () => {
      const frameworkStack = ['Django'];

      const guidelines = service.getFrameworkGuidelines(frameworkStack);

      expect(guidelines).toContain('Follow Django project structure');
      expect(guidelines).toContain('Use Django ORM best practices');
      expect(guidelines).toContain('Implement proper security measures');
    });

    it('should handle multiple frameworks', () => {
      const frameworkStack = ['React', 'Django'];

      const guidelines = service.getFrameworkGuidelines(frameworkStack);

      expect(guidelines.length).toBeGreaterThan(3); // Should have guidelines from both frameworks
      expect(guidelines).toContain('Use functional components with hooks'); // React
      expect(guidelines).toContain('Follow Django project structure'); // Django
    });

    it('should return empty array for undefined framework stack', () => {
      const guidelines = service.getFrameworkGuidelines(undefined);

      expect(guidelines).toEqual([]);
    });
  });
});
