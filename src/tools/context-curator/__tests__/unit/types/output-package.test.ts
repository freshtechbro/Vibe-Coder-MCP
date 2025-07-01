import { describe, it, expect } from 'vitest';
import {
  contextPackageSchema,
  packageMetadataSchema,
  processedFileSchema,
  fileReferenceSchema,
  contentSectionSchema,
  fileRelevanceScoreSchema,
  functionRelevanceScoreSchema,
  classRelevanceScoreSchema,
  xmlSerializableSchema,
  type ContextPackage,
  type PackageMetadata,
  type ProcessedFile,
  type FileReference,
  type ContentSection,
  type FileRelevanceScore,
  type FunctionRelevanceScore,
  type ClassRelevanceScore,
  type XMLSerializable,
  validateContextPackage,
  validatePackageMetadata,
  validateProcessedFile,
  validateFileReference,
  validateFileRelevanceScore
} from '../../../types/output-package.js';

describe('Output Package Type Definitions', () => {
  describe('PackageMetadata Schema', () => {
    it('should validate valid package metadata', () => {
      const validMetadata: PackageMetadata = {
        generationTimestamp: new Date(),
        targetDirectory: '/path/to/project',
        originalPrompt: 'Implement user authentication',
        refinedPrompt: 'Implement user authentication with JWT tokens',
        totalTokenEstimate: 15000,
        processingTimeMs: 5000,
        taskType: 'feature_addition',
        version: '1.0.0',
        formatVersion: '1.0.0',
        toolVersion: '1.0.0',
        codemapCacheUsed: true,
        filesAnalyzed: 50,
        filesIncluded: 25
      };

      expect(() => packageMetadataSchema.parse(validMetadata)).not.toThrow();
      expect(validatePackageMetadata(validMetadata)).toBe(true);
    });

    it('should reject invalid token estimates', () => {
      const invalidMetadata = {
        generationTimestamp: new Date(),
        targetDirectory: '/path/to/project',
        originalPrompt: 'test',
        refinedPrompt: 'test refined',
        totalTokenEstimate: -100, // Invalid: negative tokens
        processingTimeMs: 1000,
        taskType: 'feature_addition',
        version: '1.0.0',
        formatVersion: '1.0.0',
        toolVersion: '1.0.0',
        codemapCacheUsed: true,
        filesAnalyzed: 10,
        filesIncluded: 5
      };

      expect(() => packageMetadataSchema.parse(invalidMetadata)).toThrow();
      expect(validatePackageMetadata(invalidMetadata)).toBe(false);
    });

    it('should reject empty prompts', () => {
      const invalidMetadata = {
        generationTimestamp: new Date(),
        targetDirectory: '/path/to/project',
        originalPrompt: '', // Invalid: empty prompt
        refinedPrompt: 'test refined',
        totalTokenEstimate: 1000,
        processingTimeMs: 1000,
        taskType: 'feature_addition',
        version: '1.0.0',
        formatVersion: '1.0.0',
        toolVersion: '1.0.0',
        codemapCacheUsed: true,
        filesAnalyzed: 10,
        filesIncluded: 5
      };

      expect(() => packageMetadataSchema.parse(invalidMetadata)).toThrow();
      expect(validatePackageMetadata(invalidMetadata)).toBe(false);
    });
  });

  describe('ContentSection Schema', () => {
    it('should validate valid content sections', () => {
      const fullSection: ContentSection = {
        type: 'full',
        startLine: 1,
        endLine: 100,
        content: 'function test() { return true; }',
        tokenCount: 25,
        description: 'Complete function implementation'
      };

      const optimizedSection: ContentSection = {
        type: 'optimized',
        startLine: 101,
        endLine: 500,
        content: '// Optimized content summary',
        tokenCount: 10,
        description: 'Utility functions (optimized)',
        originalTokenCount: 200
      };

      expect(() => contentSectionSchema.parse(fullSection)).not.toThrow();
      expect(() => contentSectionSchema.parse(optimizedSection)).not.toThrow();
    });

    it('should reject invalid line numbers', () => {
      const invalidSection = {
        type: 'full',
        startLine: 0, // Invalid: line numbers start at 1
        endLine: 100,
        content: 'test',
        tokenCount: 10,
        description: 'test'
      };

      expect(() => contentSectionSchema.parse(invalidSection)).toThrow();
    });

    it('should reject start line greater than end line', () => {
      const invalidSection = {
        type: 'full',
        startLine: 100,
        endLine: 50, // Invalid: start > end
        content: 'test',
        tokenCount: 10,
        description: 'test'
      };

      expect(() => contentSectionSchema.parse(invalidSection)).toThrow();
    });
  });

  describe('FunctionRelevanceScore Schema', () => {
    it('should validate valid function relevance scores', () => {
      const validScore: FunctionRelevanceScore = {
        functionName: 'authenticateUser',
        relevanceScore: 0.9,
        confidence: 0.85,
        reasoning: 'Core authentication function',
        modificationLikelihood: 'high',
        lineNumbers: { start: 10, end: 25 },
        complexity: 'medium',
        dependencies: ['validateToken', 'getUserData']
      };

      expect(() => functionRelevanceScoreSchema.parse(validScore)).not.toThrow();
    });

    it('should reject invalid relevance scores', () => {
      const invalidScore = {
        functionName: 'test',
        relevanceScore: 1.5, // Invalid: > 1
        confidence: 0.8,
        reasoning: 'test',
        modificationLikelihood: 'medium',
        lineNumbers: { start: 1, end: 10 },
        complexity: 'low',
        dependencies: []
      };

      expect(() => functionRelevanceScoreSchema.parse(invalidScore)).toThrow();
    });

    it('should reject empty function names', () => {
      const invalidScore = {
        functionName: '', // Invalid: empty name
        relevanceScore: 0.8,
        confidence: 0.7,
        reasoning: 'test',
        modificationLikelihood: 'medium',
        lineNumbers: { start: 1, end: 10 },
        complexity: 'low',
        dependencies: []
      };

      expect(() => functionRelevanceScoreSchema.parse(invalidScore)).toThrow();
    });
  });

  describe('ClassRelevanceScore Schema', () => {
    it('should validate valid class relevance scores', () => {
      const validScore: ClassRelevanceScore = {
        className: 'AuthenticationService',
        relevanceScore: 0.95,
        confidence: 0.9,
        reasoning: 'Main authentication service class',
        modificationLikelihood: 'very_high',
        lineNumbers: { start: 1, end: 200 },
        complexity: 'high',
        methods: [
          {
            methodName: 'login',
            relevanceScore: 0.9,
            modificationLikelihood: 'high',
            lineNumbers: { start: 50, end: 80 }
          }
        ],
        properties: [
          {
            propertyName: 'tokenSecret',
            relevanceScore: 0.7,
            modificationLikelihood: 'medium',
            lineNumber: 10
          }
        ],
        inheritance: {
          extends: 'BaseService',
          implements: ['IAuthenticationService']
        }
      };

      expect(() => classRelevanceScoreSchema.parse(validScore)).not.toThrow();
    });

    it('should reject invalid method relevance scores', () => {
      const invalidScore = {
        className: 'TestClass',
        relevanceScore: 0.8,
        confidence: 0.7,
        reasoning: 'test',
        modificationLikelihood: 'medium',
        lineNumbers: { start: 1, end: 100 },
        complexity: 'low',
        methods: [
          {
            methodName: 'test',
            relevanceScore: 2.0, // Invalid: > 1
            modificationLikelihood: 'medium',
            lineNumbers: { start: 10, end: 20 }
          }
        ],
        properties: [],
        inheritance: { extends: null, implements: [] }
      };

      expect(() => classRelevanceScoreSchema.parse(invalidScore)).toThrow();
    });
  });

  describe('FileRelevanceScore Schema', () => {
    it('should validate valid file relevance scores', () => {
      const validScore: FileRelevanceScore = {
        overall: 0.9,
        confidence: 0.85,
        modificationLikelihood: 'high',
        reasoning: ['Contains authentication logic', 'Core business functionality'],
        categories: ['authentication', 'security'],
        functions: [
          {
            functionName: 'login',
            relevanceScore: 0.9,
            confidence: 0.8,
            reasoning: 'Main login function',
            modificationLikelihood: 'high',
            lineNumbers: { start: 10, end: 30 },
            complexity: 'medium',
            dependencies: []
          }
        ],
        classes: [
          {
            className: 'AuthService',
            relevanceScore: 0.95,
            confidence: 0.9,
            reasoning: 'Core auth service',
            modificationLikelihood: 'very_high',
            lineNumbers: { start: 1, end: 100 },
            complexity: 'high',
            methods: [],
            properties: [],
            inheritance: { extends: null, implements: [] }
          }
        ],
        imports: ['jwt', 'bcrypt'],
        exports: ['AuthService', 'login']
      };

      expect(() => fileRelevanceScoreSchema.parse(validScore)).not.toThrow();
      expect(validateFileRelevanceScore(validScore)).toBe(true);
    });

    it('should reject empty reasoning array', () => {
      const invalidScore = {
        overall: 0.8,
        confidence: 0.7,
        modificationLikelihood: 'medium',
        reasoning: [], // Invalid: empty reasoning
        categories: ['test'],
        functions: [],
        classes: [],
        imports: [],
        exports: []
      };

      expect(() => fileRelevanceScoreSchema.parse(invalidScore)).toThrow();
      expect(validateFileRelevanceScore(invalidScore)).toBe(false);
    });

    it('should reject empty categories array', () => {
      const invalidScore = {
        overall: 0.8,
        confidence: 0.7,
        modificationLikelihood: 'medium',
        reasoning: ['test'],
        categories: [], // Invalid: empty categories
        functions: [],
        classes: [],
        imports: [],
        exports: []
      };

      expect(() => fileRelevanceScoreSchema.parse(invalidScore)).toThrow();
      expect(validateFileRelevanceScore(invalidScore)).toBe(false);
    });
  });

  describe('ProcessedFile Schema', () => {
    it('should validate valid processed files', () => {
      const validFile: ProcessedFile = {
        path: 'src/auth/login.ts',
        content: 'export const login = () => {};',
        isOptimized: false,
        totalLines: 50,
        tokenEstimate: 200,
        contentSections: [
          {
            type: 'full',
            startLine: 1,
            endLine: 50,
            content: 'export const login = () => {};',
            tokenCount: 200,
            description: 'Complete file content'
          }
        ],
        relevanceScore: {
          overall: 0.9,
          confidence: 0.85,
          modificationLikelihood: 'high',
          reasoning: ['Authentication logic'],
          categories: ['auth'],
          functions: [],
          classes: [],
          imports: [],
          exports: []
        },
        reasoning: 'Core authentication file that needs modification',
        language: 'typescript',
        lastModified: new Date(),
        size: 1024
      };

      expect(() => processedFileSchema.parse(validFile)).not.toThrow();
      expect(validateProcessedFile(validFile)).toBe(true);
    });

    it('should validate optimized files', () => {
      const optimizedFile: ProcessedFile = {
        path: 'src/large-file.ts',
        content: 'Optimized content summary',
        isOptimized: true,
        totalLines: 2000,
        fullContentLines: 1000,
        optimizedLines: 1000,
        tokenEstimate: 500,
        contentSections: [
          {
            type: 'full',
            startLine: 1,
            endLine: 1000,
            content: 'Full content for first 1000 lines',
            tokenCount: 400,
            description: 'Unoptimized section'
          },
          {
            type: 'optimized',
            startLine: 1001,
            endLine: 2000,
            content: 'Optimized summary',
            tokenCount: 100,
            description: 'Optimized section',
            originalTokenCount: 800
          }
        ],
        relevanceScore: {
          overall: 0.7,
          confidence: 0.6,
          modificationLikelihood: 'medium',
          reasoning: ['Large utility file'],
          categories: ['utils'],
          functions: [],
          classes: [],
          imports: [],
          exports: []
        },
        reasoning: 'Large utility file with helper functions',
        language: 'typescript',
        lastModified: new Date(),
        size: 50000
      };

      expect(() => processedFileSchema.parse(optimizedFile)).not.toThrow();
      expect(validateProcessedFile(optimizedFile)).toBe(true);
    });

    it('should reject files with empty paths', () => {
      const invalidFile = {
        path: '', // Invalid: empty path
        content: 'test',
        isOptimized: false,
        totalLines: 10,
        tokenEstimate: 50,
        contentSections: [],
        relevanceScore: {
          overall: 0.5,
          confidence: 0.5,
          modificationLikelihood: 'low',
          reasoning: ['test'],
          categories: ['test'],
          functions: [],
          classes: [],
          imports: [],
          exports: []
        },
        language: 'typescript',
        lastModified: new Date(),
        size: 100
      };

      expect(() => processedFileSchema.parse(invalidFile)).toThrow();
      expect(validateProcessedFile(invalidFile)).toBe(false);
    });
  });

  describe('FileReference Schema', () => {
    it('should validate valid file references', () => {
      const validReference: FileReference = {
        path: 'src/utils/helpers.ts',
        relevanceScore: 0.3,
        reasoning: 'Contains utility functions',
        tokenEstimate: 150,
        lastModified: new Date(),
        size: 800,
        language: 'typescript'
      };

      expect(() => fileReferenceSchema.parse(validReference)).not.toThrow();
      expect(validateFileReference(validReference)).toBe(true);
    });

    it('should reject invalid relevance scores', () => {
      const invalidReference = {
        path: 'test.ts',
        relevanceScore: -0.1, // Invalid: negative score
        reasoning: 'test',
        tokenEstimate: 100,
        lastModified: new Date(),
        size: 500,
        language: 'typescript'
      };

      expect(() => fileReferenceSchema.parse(invalidReference)).toThrow();
      expect(validateFileReference(invalidReference)).toBe(false);
    });
  });

  describe('ContextPackage Schema', () => {
    it('should validate complete context package', () => {
      const validPackage: ContextPackage = {
        metadata: {
          generationTimestamp: new Date(),
          targetDirectory: '/path/to/project',
          originalPrompt: 'Add authentication',
          refinedPrompt: 'Add JWT-based authentication system',
          totalTokenEstimate: 5000,
          processingTimeMs: 3000,
          taskType: 'feature_addition',
          version: '1.0.0',
          formatVersion: '1.0.0',
          toolVersion: '1.0.0',
          codemapCacheUsed: true,
          filesAnalyzed: 20,
          filesIncluded: 10
        },
        refinedPrompt: 'Add JWT-based authentication system with proper validation',
        codemapPath: '/path/to/codemap.json',
        highPriorityFiles: [
          {
            path: 'src/auth.ts',
            content: 'auth code',
            isOptimized: false,
            totalLines: 100,
            tokenEstimate: 400,
            contentSections: [],
            relevanceScore: {
              overall: 0.9,
              confidence: 0.8,
              modificationLikelihood: 'high',
              reasoning: ['Core auth'],
              categories: ['auth'],
              functions: [],
              classes: [],
              imports: [],
              exports: []
            },
            reasoning: 'Core authentication file',
            language: 'typescript',
            lastModified: new Date(),
            size: 2000
          }
        ],
        mediumPriorityFiles: [],
        lowPriorityFiles: [],
        metaPrompt: 'System prompt for AI agents...'
      };

      expect(() => contextPackageSchema.parse(validPackage)).not.toThrow();
      expect(validateContextPackage(validPackage)).toBe(true);
    });

    it('should reject packages with empty file arrays when no files are relevant', () => {
      const invalidPackage = {
        metadata: {
          generationTimestamp: new Date(),
          targetDirectory: '/path',
          originalPrompt: 'test',
          refinedPrompt: 'test refined',
          totalTokenEstimate: 1000,
          processingTimeMs: 1000,
          taskType: 'feature_addition',
          version: '1.0.0',
          formatVersion: '1.0.0',
          toolVersion: '1.0.0',
          codemapCacheUsed: true,
          filesAnalyzed: 10,
          filesIncluded: 0 // No files included but arrays are empty
        },
        refinedPrompt: 'test',
        codemapPath: '/path/to/codemap.json',
        highPriorityFiles: [], // All empty - should be valid if filesIncluded is 0
        mediumPriorityFiles: [],
        lowPriorityFiles: [],
        metaPrompt: 'test'
      };

      // This should actually be valid - empty arrays are allowed
      expect(() => contextPackageSchema.parse(invalidPackage)).not.toThrow();
      expect(validateContextPackage(invalidPackage)).toBe(true);
    });
  });

  describe('XMLSerializable Schema', () => {
    it('should validate XML serializable objects', () => {
      const validXMLObject: XMLSerializable = {
        toXML: () => '<test>content</test>',
        xmlVersion: '1.0',
        xmlEncoding: 'UTF-8'
      };

      expect(() => xmlSerializableSchema.parse(validXMLObject)).not.toThrow();
    });

    it('should reject objects without toXML method', () => {
      const invalidXMLObject = {
        xmlVersion: '1.0',
        xmlEncoding: 'UTF-8'
        // Missing toXML method
      };

      expect(() => xmlSerializableSchema.parse(invalidXMLObject)).toThrow();
    });
  });

  describe('Type Inference', () => {
    it('should correctly infer TypeScript types', () => {
      // This test ensures our type exports work correctly
      const metadata: PackageMetadata = {
        generationTimestamp: new Date(),
        targetDirectory: '/test',
        originalPrompt: 'test',
        refinedPrompt: 'test refined',
        totalTokenEstimate: 1000,
        processingTimeMs: 1000,
        taskType: 'feature_addition',
        version: '1.0.0',
        formatVersion: '1.0.0',
        toolVersion: '1.0.0',
        codemapCacheUsed: true,
        filesAnalyzed: 10,
        filesIncluded: 5
      };

      const fileRef: FileReference = {
        path: 'test.ts',
        relevanceScore: 0.5,
        reasoning: 'test file',
        tokenEstimate: 100,
        lastModified: new Date(),
        size: 500,
        language: 'typescript'
      };

      // These should compile without errors
      expect(metadata.taskType).toBe('feature_addition');
      expect(fileRef.relevanceScore).toBe(0.5);
    });
  });
});
