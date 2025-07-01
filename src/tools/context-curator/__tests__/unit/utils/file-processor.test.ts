import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies first
const mockReadFileSecure = vi.hoisted(() => vi.fn());

vi.mock('../../../../../code-map-generator/fsUtils.js', async () => {
  return {
    readFileSecure: mockReadFileSecure
  };
});

vi.mock('../../../../../code-map-generator/optimization/universalClassOptimizer.js', () => ({
  UniversalClassOptimizer: vi.fn()
}));

// Import after mocking
import {
  FileContentProcessor,
  FileProcessingOptions
} from '../../../utils/file-processor.js';

describe('FileContentProcessor', () => {
  const defaultOptions: FileProcessingOptions = {
    allowedDirectory: '/test/project',
    locThreshold: 1000,
    preserveComments: true,
    preserveTypes: true,
    maxContentLength: 25
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSecure.mockReset();
  });

  describe('processFileContent', () => {
    it('should return unoptimized content for files under LOC threshold', async () => {
      const filePath = '/test/project/small-file.js';
      const fileContent = 'const x = 1;\nconsole.log(x);';
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.isOptimized).toBe(false);
      expect(result.content).toBe(fileContent);
      expect(result.totalLines).toBe(2);
      expect(result.fullContentLines).toBe(2);
      expect(result.optimizedLines).toBeUndefined();
      expect(result.contentSections).toHaveLength(1);
      expect(result.contentSections[0].type).toBe('full');
      expect(result.processingMetadata.optimizationApplied).toBe(false);
    });

    it('should apply optimization for files over LOC threshold', async () => {
      const filePath = '/test/project/large-file.js';
      const lines = Array.from({ length: 1500 }, (_, i) => `// Line ${i + 1}\nconst var${i} = ${i};`);
      const fileContent = lines.join('\n');
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.isOptimized).toBe(true);
      expect(result.totalLines).toBe(3000); // 1500 * 2 lines each
      expect(result.fullContentLines).toBe(1000);
      expect(result.optimizedLines).toBe(2000);
      expect(result.contentSections).toHaveLength(2);
      expect(result.contentSections[0].type).toBe('full');
      expect(result.contentSections[1].type).toBe('optimized');
      expect(result.processingMetadata.optimizationApplied).toBe(true);
      expect(result.processingMetadata.optimizationRatio).toBeDefined();
    });

    it('should include optimization boundary markers in combined content', async () => {
      const filePath = '/test/project/large-file.js';
      const lines = Array.from({ length: 1200 }, (_, i) => `const var${i} = ${i};`);
      const fileContent = lines.join('\n');
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.content).toContain('OPTIMIZATION BOUNDARY');
      expect(result.content).toContain('Line 1000');
      expect(result.content).toContain('Content below this line has been optimized');
    });

    it('should handle different content types correctly', async () => {
      const testCases = [
        { path: '/test/project/file.js', expectedType: 'javascript' },
        { path: '/test/project/file.ts', expectedType: 'typescript' },
        { path: '/test/project/file.py', expectedType: 'python' },
        { path: '/test/project/file.java', expectedType: 'java' },
        { path: '/test/project/file.txt', expectedType: 'text' }
      ];

      for (const testCase of testCases) {
        const result = await FileContentProcessor.processFileContent(
          testCase.path,
          'test content',
          defaultOptions
        );

        expect(result.processingMetadata.contentType).toBe(testCase.expectedType);
      }
    });

    it('should respect custom LOC threshold', async () => {
      const filePath = '/test/project/medium-file.js';
      const lines = Array.from({ length: 800 }, (_, i) => `const var${i} = ${i};`);
      const fileContent = lines.join('\n');
      
      const customOptions = { ...defaultOptions, locThreshold: 500 };
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        customOptions
      );

      expect(result.isOptimized).toBe(true);
      expect(result.fullContentLines).toBe(500);
      expect(result.optimizedLines).toBe(300);
    });

    it('should calculate token estimates correctly', async () => {
      const filePath = '/test/project/test-file.js';
      const fileContent = 'const x = 1;\nconsole.log(x);';
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.tokenEstimate).toBeGreaterThan(0);
      expect(result.contentSections[0].tokenCount).toBeGreaterThan(0);
      expect(result.contentSections[0].tokenCount).toBe(result.tokenEstimate);
    });

    it('should handle optimization gracefully', async () => {
      const filePath = '/test/project/large-file.js';
      const lines = Array.from({ length: 1200 }, (_, i) => `// Comment ${i}\nconst var${i} = ${i};`);
      const fileContent = lines.join('\n');

      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.isOptimized).toBe(true);
      expect(result.contentSections[1].content.length).toBeLessThan(fileContent.length);
      // The optimized content should be shorter due to comment removal and whitespace optimization
    });

    it('should track processing metadata correctly', async () => {
      const filePath = '/test/project/test-file.js';
      const fileContent = 'const x = 1;';
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.processingMetadata.filePath).toBe(filePath);
      expect(result.processingMetadata.fileSize).toBe(fileContent.length);
      expect(result.processingMetadata.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.processingMetadata.contentType).toBe('javascript');
      expect(result.processingMetadata.encoding).toBe('utf-8');
    });
  });

  describe('readAndProcessFile', () => {
    it.skip('should read file and process content', async () => {
      const filePath = '/test/project/test-file.js';
      const fileContent = 'const x = 1;\nconsole.log(x);';

      // Setup mock
      vi.mocked(mockReadFileSecure).mockResolvedValue(fileContent);

      const result = await FileContentProcessor.readAndProcessFile(filePath, defaultOptions);

      expect(mockReadFileSecure).toHaveBeenCalledWith(filePath, defaultOptions.allowedDirectory);
      expect(result.content).toBe(fileContent);
      expect(result.isOptimized).toBe(false);
    });

    it('should handle file reading errors', async () => {
      const filePath = '/test/project/nonexistent.js';

      // Setup mock
      vi.mocked(mockReadFileSecure).mockRejectedValue(new Error('File not found'));

      await expect(
        FileContentProcessor.readAndProcessFile(filePath, defaultOptions)
      ).rejects.toThrow('Failed to read and process file');
    });
  });

  describe('getProcessingStats', () => {
    it('should return correct stats for unoptimized file', async () => {
      const filePath = '/test/project/small-file.js';
      const fileContent = 'const x = 1;\nconsole.log(x);';
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      const stats = FileContentProcessor.getProcessingStats(result);

      expect(stats.totalLines).toBe(2);
      expect(stats.optimizationApplied).toBe(false);
      expect(stats.tokenEfficiency).toBe(0);
      expect(stats.processingTime).toBeGreaterThanOrEqual(0);
      expect(stats.contentSectionCount).toBe(1);
    });

    it('should return correct stats for optimized file', async () => {
      const filePath = '/test/project/large-file.js';
      const lines = Array.from({ length: 1200 }, (_, i) => `// Comment ${i}\nconst var${i} = ${i};`);
      const fileContent = lines.join('\n');
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      const stats = FileContentProcessor.getProcessingStats(result);

      expect(stats.totalLines).toBe(2400);
      expect(stats.optimizationApplied).toBe(true);
      expect(stats.tokenEfficiency).toBeGreaterThan(0);
      expect(stats.processingTime).toBeGreaterThan(0);
      expect(stats.contentSectionCount).toBe(2);
    });
  });

  describe('Content Section Tracking', () => {
    it('should create proper content sections for large files', async () => {
      const filePath = '/test/project/large-file.js';
      const lines = Array.from({ length: 1500 }, (_, i) => `const var${i} = ${i};`);
      const fileContent = lines.join('\n');
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.contentSections).toHaveLength(2);
      
      const fullSection = result.contentSections[0];
      expect(fullSection.type).toBe('full');
      expect(fullSection.startLine).toBe(1);
      expect(fullSection.endLine).toBe(1000);
      expect(fullSection.description).toContain('Unoptimized content');
      
      const optimizedSection = result.contentSections[1];
      expect(optimizedSection.type).toBe('optimized');
      expect(optimizedSection.startLine).toBe(1001);
      expect(optimizedSection.endLine).toBe(1500);
      expect(optimizedSection.description).toContain('Optimized content');
    });

    it('should calculate token counts for each section', async () => {
      const filePath = '/test/project/large-file.js';
      const lines = Array.from({ length: 1200 }, (_, i) => `const var${i} = ${i};`);
      const fileContent = lines.join('\n');
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      const totalSectionTokens = result.contentSections.reduce(
        (sum, section) => sum + section.tokenCount,
        0
      );

      expect(totalSectionTokens).toBe(result.tokenEstimate);
      expect(result.contentSections[0].tokenCount).toBeGreaterThan(0);
      expect(result.contentSections[1].tokenCount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty files', async () => {
      const filePath = '/test/project/empty.js';
      const fileContent = '';

      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.isOptimized).toBe(false);
      expect(result.totalLines).toBe(1); // Empty string split gives one empty line
      expect(result.content).toBe('');
      expect(result.tokenEstimate).toBeGreaterThan(0); // Will include path tokens
    });

    it('should handle files with exactly LOC threshold lines', async () => {
      const filePath = '/test/project/exact-threshold.js';
      const lines = Array.from({ length: 1000 }, (_, i) => `const var${i} = ${i};`);
      const fileContent = lines.join('\n');
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.isOptimized).toBe(false);
      expect(result.totalLines).toBe(1000);
      expect(result.contentSections).toHaveLength(1);
    });

    it('should handle files with one line over threshold', async () => {
      const filePath = '/test/project/one-over-threshold.js';
      const lines = Array.from({ length: 1001 }, (_, i) => `const var${i} = ${i};`);
      const fileContent = lines.join('\n');
      
      const result = await FileContentProcessor.processFileContent(
        filePath,
        fileContent,
        defaultOptions
      );

      expect(result.isOptimized).toBe(true);
      expect(result.totalLines).toBe(1001);
      expect(result.fullContentLines).toBe(1000);
      expect(result.optimizedLines).toBe(1);
      expect(result.contentSections).toHaveLength(2);
    });
  });
});
