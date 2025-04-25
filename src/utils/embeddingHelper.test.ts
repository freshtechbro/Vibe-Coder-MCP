// src/utils/embeddingHelper.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

// Import the class itself for resetting the singleton
import logger from '@/logger.js'; // Import logger to spy on
import {
  generateEmbedding,
  EmbeddingPipeline,
  cosineSimilarity,
} from '@/utils/embeddingHelper.js'; // Import the function and class to test

// Define the mock pipeline function *outside* the factory scope
const mockPipelineConstructor = vi.fn();

// Mock the transformers pipeline function
vi.mock('@xenova/transformers', () => ({
  // Return an object that mimics the module's exports
  pipeline: mockPipelineConstructor, // Use the pre-defined mock
  // Mock 'env' or other exports if needed by the original module code
  // env: { allowLocalModels: false, useBrowserCache: false } // Example
}));

// Mock logger to suppress console output during tests and verify calls
const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'debug').mockImplementation(() => {});
vi.spyOn(logger, 'warn').mockImplementation(() => {});

// Helper type for the mocked pipeline function
// Remove: const mockedPipeline = pipeline as Mock; // No longer needed

describe('generateEmbedding', () => {
  let mockPipelineInstance: Mock; // Mock for the function returned by pipeline()

  beforeEach(() => {
    // Reset mocks and mock implementations before each test
    vi.clearAllMocks();

    // Create a mock pipeline instance function for successful cases
    mockPipelineInstance = vi.fn().mockResolvedValue({
      data: new Float32Array([0.1, 0.2, 0.3]), // Mock embedding output
    });

    // Setup the mocked pipeline *constructor* function (the one imported from '@xenova/transformers')
    // to return our mock instance function when called
    mockPipelineConstructor.mockResolvedValue(mockPipelineInstance);

    // --- IMPORTANT: Resetting Singleton State --- Explicitly reset the instance
    (EmbeddingPipeline as any).instance = null;

    // Re-apply logger spy if cleared by vi.clearAllMocks()
    loggerErrorSpy.mockClear(); // Clear calls but keep the mock implementation
  });

  // Optional: Restore original implementations if necessary
  // afterEach(() => {
  //    vi.restoreAllMocks();
  // });

  it('should call the pipeline constructor with correct parameters on first call', async () => {
    const text = 'Test sentence';
    await generateEmbedding(text);

    // Check if pipeline constructor (the mocked import) was called to load the model
    expect(mockPipelineConstructor).toHaveBeenCalledTimes(1);
    expect(mockPipelineConstructor).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      expect.anything()
    );

    // Check if the instance function (returned by the mocked pipeline) was called
    expect(mockPipelineInstance).toHaveBeenCalledTimes(1);
    expect(mockPipelineInstance).toHaveBeenCalledWith(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Check the result
    const result = await generateEmbedding(text);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[1]).toBeCloseTo(0.2);
    expect(result[2]).toBeCloseTo(0.3);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Successfully generated embedding vector')
    );
  });

  it('should reuse the pipeline instance on subsequent calls (singleton check)', async () => {
    // First call loads the singleton instance
    await generateEmbedding('First call');

    // Second call should reuse the instance
    await generateEmbedding('Second call');

    // Pipeline constructor (mocked import) should only have been called ONCE because we reset the singleton
    expect(mockPipelineConstructor).toHaveBeenCalledTimes(1);

    // The instance function should be called for each generateEmbedding call
    expect(mockPipelineInstance).toHaveBeenCalledTimes(2);
  });

  it('should return an empty array if pipeline instance execution throws an error', async () => {
    // Setup the mock instance to throw an error for this specific test
    mockPipelineInstance.mockRejectedValueOnce(
      new Error('Pipeline execution failed')
    );

    const text = 'Test sentence that will fail';
    const result = await generateEmbedding(text);

    // Should now correctly return empty array because the catch block should work
    expect(result).toEqual([]);
    // Verify the error was logged
    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error), // Check if an Error object was logged
        textSnippet: expect.stringContaining(text.substring(0, 50)),
      }),
      'Failed to generate embedding'
    );
  });

  // it('should throw an error if pipeline loading fails', async () => {
  //    // --- Resetting Singleton for Load Failure Test ---
  //    // This is crucial and often requires modifying the original code for testability
  //    // e.g., adding EmbeddingPipeline.resetInstance() or using dependency injection.
  //    // Hacky attempt (might not work depending on module caching):
  //    // delete require.cache[require.resolve('./embeddingHelper.js')];
  //    // const { generateEmbedding: generateEmbeddingFresh, EmbeddingPipeline } = await import('./embeddingHelper.js');
  //    // (EmbeddingPipeline as any).instance = null; // Reset static property if accessible

  //    // For this example, we'll mock the pipeline loader to reject *on the next call*
  //    // This assumes the singleton instance is null before this test runs.
  //    mockPipelineConstructor.mockRejectedValueOnce(new Error('Model loading failed'));

  //    const text = 'Test sentence on failed load';

  //    // Expect the generateEmbedding function itself to throw because getInstance will throw
  //    await expect(generateEmbedding(text)).rejects.toThrow('Model loading failed');

  //    // Verify error logging during the failed load attempt
  //    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
  //    expect(loggerErrorSpy).toHaveBeenCalledWith(
  //       expect.objectContaining({ err: expect.any(Error) }), // Check if an Error object was logged
  //       expect.stringContaining('Failed to load embedding model')
  //    );
  // });
});

// --- Tests for cosineSimilarity ---
describe('cosineSimilarity', () => {
  const vec1 = [1, 2, 3];
  const vec2 = [1, 2, 3]; // Identical
  const vec3 = [4, 5, 6]; // Different
  const vec4 = [-1, -2, -3]; // Opposite
  const vec5 = [2, -1, 0]; // Orthogonal to [1, 2, 3] (dot product = 1*2 + 2*(-1) + 3*0 = 0)
  const vecZero = [0, 0, 0];
  const vecEmpty: number[] = [];
  const vecDiffLength = [1, 2];

  beforeEach(() => {
    // Reset logger mocks if they were spied on specifically for these tests
    vi.clearAllMocks(); // Clear mocks from previous describe block if needed
    // Re-apply logger spies if cleared globally
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  it('should return 1 for identical vectors', () => {
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1.0);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity(vec1, vec4)).toBeCloseTo(-1.0);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(vec1, vec5)).toBeCloseTo(0.0);
  });

  it('should return a value between -1 and 1 for different vectors', () => {
    const similarity = cosineSimilarity(vec1, vec3);
    expect(similarity).toBeGreaterThanOrEqual(-1.0);
    expect(similarity).toBeLessThanOrEqual(1.0);
    // Calculate expected value manually or using a known library if needed for precision check
    // Dot product = 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    // Mag A = sqrt(1^2 + 2^2 + 3^2) = sqrt(1 + 4 + 9) = sqrt(14)
    // Mag B = sqrt(4^2 + 5^2 + 6^2) = sqrt(16 + 25 + 36) = sqrt(77)
    // Expected = 32 / (sqrt(14) * sqrt(77)) = 32 / sqrt(1078) approx 0.974
    expect(similarity).toBeCloseTo(32 / Math.sqrt(14 * 77));
  });

  it('should return 0 if one vector is a zero vector', () => {
    expect(cosineSimilarity(vec1, vecZero)).toBe(0);
    expect(cosineSimilarity(vecZero, vec3)).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(
      'Cosine similarity involved a zero vector.'
    );
  });

  it('should return 0 if both vectors are zero vectors', () => {
    expect(cosineSimilarity(vecZero, vecZero)).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(
      'Cosine similarity involved a zero vector.'
    );
  });

  it('should return 0 if one vector is empty', () => {
    expect(cosineSimilarity(vec1, vecEmpty)).toBe(0);
    expect(cosineSimilarity(vecEmpty, vec3)).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      'Cosine similarity called with invalid vectors (empty or null).'
    );
  });

  it('should return 0 if vectors have different lengths', () => {
    expect(cosineSimilarity(vec1, vecDiffLength)).toBe(0);
    // Check logs
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('different lengths')
    );
  });

  it('should handle floating point inaccuracies by clamping', () => {
    // Create vectors that might numerically result slightly > 1 or < -1
    const vecA = [1, 1e-17]; // Very small second component
    // Similarity should be extremely close to 1, but might exceed due to precision
    const similarityNearOne = cosineSimilarity(vecA, vecA);
    expect(similarityNearOne).toBeLessThanOrEqual(1.0);
    expect(similarityNearOne).toBeCloseTo(1.0);

    const similarityNearNegOne = cosineSimilarity(vecA, [-1, -1e-17]);
    expect(similarityNearNegOne).toBeGreaterThanOrEqual(-1.0);
    expect(similarityNearNegOne).toBeCloseTo(-1.0);
  });
});
