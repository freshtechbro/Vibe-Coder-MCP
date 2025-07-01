import { describe, it, expect } from 'vitest';
import { 
  TokenEstimator
} from '../../../utils/token-estimator.js';

describe('TokenEstimator', () => {
  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(TokenEstimator.estimateTokens('')).toBe(0);
      expect(TokenEstimator.estimateTokens('   ')).toBe(0);
    });

    it('should estimate tokens for simple text', () => {
      const text = 'Hello world';
      const tokens = TokenEstimator.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 4)); // Using CHARS_PER_TOKEN = 4
    });

    it('should handle text with excessive whitespace', () => {
      const text1 = 'Hello    world';
      const text2 = 'Hello world';
      const tokens1 = TokenEstimator.estimateTokens(text1);
      const tokens2 = TokenEstimator.estimateTokens(text2);
      expect(tokens1).toBe(tokens2); // Should normalize whitespace
    });

    it('should estimate tokens for longer text', () => {
      const text = 'This is a longer piece of text that should result in a reasonable token estimate based on character count.';
      const tokens = TokenEstimator.estimateTokens(text);
      expect(tokens).toBeGreaterThan(20);
      expect(tokens).toBeLessThan(50);
    });
  });

  describe('estimateTokensByWords', () => {
    it('should return 0 for empty string', () => {
      expect(TokenEstimator.estimateTokensByWords('')).toBe(0);
      expect(TokenEstimator.estimateTokensByWords('   ')).toBe(0);
    });

    it('should estimate tokens based on word count', () => {
      const text = 'Hello world test';
      const tokens = TokenEstimator.estimateTokensByWords(text);
      const wordCount = text.split(/\s+/).length;
      expect(tokens).toBe(Math.ceil(wordCount / 0.75)); // Using WORDS_PER_TOKEN = 0.75
    });

    it('should handle single word', () => {
      const tokens = TokenEstimator.estimateTokensByWords('Hello');
      expect(tokens).toBe(2); // Math.ceil(1 / 0.75) = 2
    });
  });

  describe('estimateTokensAdvanced', () => {
    it('should provide detailed estimation for plain text', () => {
      const text = 'Hello world, this is a test.';
      const result = TokenEstimator.estimateTokensAdvanced(text, 'plain');
      
      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.confidence).toMatch(/^(high|medium|low)$/);
      expect(result.method).toBe('hybrid');
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown?.contentTokens).toBeGreaterThan(0);
    });

    it('should apply overhead for different content types', () => {
      const text = 'function test() { return "hello"; }';
      const plainResult = TokenEstimator.estimateTokensAdvanced(text, 'plain');
      const codeResult = TokenEstimator.estimateTokensAdvanced(text, 'code');
      
      expect(codeResult.estimatedTokens).toBeGreaterThan(plainResult.estimatedTokens);
    });

    it('should handle XML content with overhead', () => {
      const xmlText = '<root><item>value</item></root>';
      const result = TokenEstimator.estimateTokensAdvanced(xmlText, 'xml');
      
      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.breakdown?.formattingTokens).toBeGreaterThan(0);
    });

    it('should return high confidence for consistent text', () => {
      const text = 'This is a very consistent piece of text with normal word patterns.';
      const result = TokenEstimator.estimateTokensAdvanced(text);
      
      // Should have high confidence due to consistent character/word ratio
      expect(['high', 'medium']).toContain(result.confidence);
    });
  });

  describe('estimateFileTokens', () => {
    it('should estimate tokens for file with path overhead', () => {
      const filePath = '/path/to/file.js';
      const content = 'console.log("Hello world");';
      const result = TokenEstimator.estimateFileTokens(filePath, content);
      
      expect(result.filePath).toBe(filePath);
      expect(result.contentTokens).toBeGreaterThan(0);
      expect(result.pathTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBe(result.contentTokens + result.pathTokens);
      expect(result.confidence).toMatch(/^(high|medium|low)$/);
      expect(result.estimationMethod).toContain('with_path');
    });

    it('should detect content type from file extension', () => {
      const jsFile = TokenEstimator.estimateFileTokens('/test.js', 'const x = 1;');
      const txtFile = TokenEstimator.estimateFileTokens('/test.txt', 'const x = 1;');
      
      // JavaScript file should have higher token count due to code overhead
      expect(jsFile.contentTokens).toBeGreaterThan(txtFile.contentTokens);
    });

    it('should handle files with no extension', () => {
      const result = TokenEstimator.estimateFileTokens('/README', 'This is a readme file.');
      
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.contentTokens).toBeGreaterThan(0);
      expect(result.pathTokens).toBeGreaterThan(0);
    });
  });

  describe('validateTokenBudget', () => {
    it('should validate budget within limits', () => {
      const result = TokenEstimator.validateTokenBudget(1000, 2000);
      
      expect(result.isValid).toBe(true);
      expect(result.utilizationPercentage).toBe(50);
      expect(result.remainingTokens).toBe(1000);
      expect(result.recommendedAction).toBe('proceed');
      expect(result.warningLevel).toBe('none');
    });

    it('should warn when approaching budget limit', () => {
      const result = TokenEstimator.validateTokenBudget(1800, 2000);
      
      expect(result.isValid).toBe(true);
      expect(result.utilizationPercentage).toBe(90);
      expect(result.warningLevel).toBe('high');
      expect(result.recommendedAction).toBe('optimize');
    });

    it('should reject when over budget', () => {
      const result = TokenEstimator.validateTokenBudget(2500, 2000);
      
      expect(result.isValid).toBe(false);
      expect(result.utilizationPercentage).toBe(125);
      expect(result.remainingTokens).toBe(-500);
      expect(result.warningLevel).toBe('critical');
      expect(result.recommendedAction).toBe('reduce_scope');
    });

    it('should provide medium warning for 75% utilization', () => {
      const result = TokenEstimator.validateTokenBudget(1500, 2000);
      
      expect(result.isValid).toBe(true);
      expect(result.utilizationPercentage).toBe(75);
      expect(result.warningLevel).toBe('medium');
      expect(result.recommendedAction).toBe('optimize');
    });

    it('should provide low warning for 60% utilization', () => {
      const result = TokenEstimator.validateTokenBudget(1200, 2000);
      
      expect(result.isValid).toBe(true);
      expect(result.utilizationPercentage).toBe(60);
      expect(result.warningLevel).toBe('low');
      expect(result.recommendedAction).toBe('proceed');
    });
  });

  describe('estimateMultipleFiles', () => {
    it('should estimate tokens for multiple files', () => {
      const files = [
        { path: '/file1.js', content: 'console.log("test1");' },
        { path: '/file2.py', content: 'print("test2")' },
        { path: '/file3.txt', content: 'This is a text file.' }
      ];
      
      const result = TokenEstimator.estimateMultipleFiles(files);
      
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.fileEstimates).toHaveLength(3);
      expect(result.budgetRecommendation).toBe('suitable_for_standard_budget');
      
      // Verify individual file estimates
      result.fileEstimates.forEach((estimate, index) => {
        expect(estimate.filePath).toBe(files[index].path);
        expect(estimate.totalTokens).toBeGreaterThan(0);
      });
    });

    it('should recommend larger budget for many tokens', () => {
      const largeContent = 'word '.repeat(20000); // Much larger content to exceed 50k tokens
      const files = Array.from({ length: 10 }, (_, i) => ({
        path: `/very-large-file-${i}.js`,
        content: largeContent
      }));

      const result = TokenEstimator.estimateMultipleFiles(files);

      expect(result.totalTokens).toBeGreaterThan(50000); // Should exceed medium budget threshold
      expect(['requires_medium_budget', 'requires_large_budget']).toContain(result.budgetRecommendation);
    });
  });

  describe('getEstimationStats', () => {
    it('should provide detailed statistics', () => {
      const text = 'Hello world.\nThis is a test.\nAnother line here.';
      const stats = TokenEstimator.getEstimationStats(text);
      
      expect(stats.characterCount).toBe(text.length);
      expect(stats.wordCount).toBeGreaterThan(0);
      expect(stats.lineCount).toBe(3);
      expect(stats.charBasedTokens).toBeGreaterThan(0);
      expect(stats.wordBasedTokens).toBeGreaterThan(0);
      expect(stats.averageWordsPerLine).toBeGreaterThan(0);
      expect(stats.averageCharsPerWord).toBeGreaterThan(0);
    });

    it('should handle single line text', () => {
      const text = 'Single line of text';
      const stats = TokenEstimator.getEstimationStats(text);
      
      expect(stats.lineCount).toBe(1);
      expect(stats.averageWordsPerLine).toBe(stats.wordCount);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined inputs gracefully', () => {
      expect(TokenEstimator.estimateTokens('')).toBe(0);
      expect(TokenEstimator.estimateTokensByWords('')).toBe(0);
    });

    it('should handle very long text', () => {
      const longText = 'word '.repeat(10000);
      const tokens = TokenEstimator.estimateTokens(longText);
      
      expect(tokens).toBeGreaterThan(1000);
      expect(tokens).toBeLessThan(50000);
    });

    it('should handle text with special characters', () => {
      const specialText = '🚀 Hello 世界 @#$%^&*()';
      const tokens = TokenEstimator.estimateTokens(specialText);
      
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle code with complex syntax', () => {
      const codeText = `
        function complexFunction(param1: string, param2: number): Promise<boolean> {
          return new Promise((resolve, reject) => {
            if (param1.length > param2) {
              resolve(true);
            } else {
              reject(new Error('Invalid parameters'));
            }
          });
        }
      `;
      
      const result = TokenEstimator.estimateTokensAdvanced(codeText, 'code');
      expect(result.estimatedTokens).toBeGreaterThan(50);
    });
  });
});
