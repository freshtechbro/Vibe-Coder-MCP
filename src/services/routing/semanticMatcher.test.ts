// src/services/routing/semanticMatcher.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

import logger from '../../logger.js'; // To suppress/spy logs
import * as embeddingHelper from '../../utils/embeddingHelper.js'; // Import module to mock its exports

import * as embeddingStore from './embeddingStore.js'; // Import module to mock its store
import { findBestSemanticMatch } from './semanticMatcher.js'; // Function to test

// Mock dependencies
vi.mock('../../utils/embeddingHelper.js');
vi.mock('./embeddingStore.js');

// Mock logger
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'debug').mockImplementation(() => {});
vi.spyOn(logger, 'warn').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});

// Helper types for mocked functions
const mockedGenerateEmbedding = embeddingHelper.generateEmbedding as Mock;
const mockedCosineSimilarity = embeddingHelper.cosineSimilarity as Mock;

describe('findBestSemanticMatch', () => {
  // Define mock vectors used across tests
  const mockRequestEmbedding = [1, 0, 0, 0]; // Example request vector
  const mockTool1DescEmbedding = [0.9, 0.1, 0, 0]; // High similarity to request
  const mockTool1Uc1Embedding = [0.8, 0.2, 0, 0]; // Medium-high similarity
  const mockTool1Uc2Embedding = [0.7, 0.3, 0, 0]; // Medium similarity
  const mockTool2DescEmbedding = [0.1, 0.9, 0, 0]; // Low similarity (more orthogonal)
  const mockTool2Uc1Embedding = [0.2, 0.8, 0, 0]; // Low similarity
  const mockTool3DescEmbedding = [0.6, 0.4, 0, 0]; // Tool for testing below threshold

  // Mock store data setup
  const setupMockStore = (
    storeData: Map<string, embeddingStore.ToolEmbeddings>
  ) => {
    // Vitest doesn't directly mock exported Maps easily. We mock the `get` method of the Map.
    // A common pattern is to spy on the exported variable itself if it's mutable,
    // or mock the module that exports it. Since we mocked the module, we can mock the export.
    // However, iterating requires mocking `entries()`. Let's mock `getAllTools` instead if available,
    // or mock the Map's `entries` method directly on the instance used internally.
    // Simpler: Mock the Map's entries method used in the loop.
    vi.spyOn(embeddingStore.toolEmbeddingStore, 'entries').mockReturnValue(
      storeData.entries()
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // --- Mock generateEmbedding ---
    mockedGenerateEmbedding.mockImplementation(async (text: string) => {
      if (
        text === 'test request' ||
        text === 'low score request' ||
        text === 'no embedding request'
      ) {
        return mockRequestEmbedding;
      }
      if (text === 'fail embedding') {
        return []; // Simulate embedding failure
      }
      console.warn(
        `Unexpected generateEmbedding call in test with text: ${text}`
      );
      return []; // Default empty for unexpected calls
    });

    // --- Mock cosineSimilarity ---
    // Return predefined values based on input vectors (using simple equality check for mock vectors)
    mockedCosineSimilarity.mockImplementation(
      (vecA: number[], vecB: number[]) => {
        if (vecA === mockRequestEmbedding) {
          if (vecB === mockTool1DescEmbedding) return 0.9;
          if (vecB === mockTool1Uc1Embedding) return 0.8;
          if (vecB === mockTool1Uc2Embedding) return 0.7;
          if (vecB === mockTool2DescEmbedding) return 0.1;
          if (vecB === mockTool2Uc1Embedding) return 0.15;
          if (vecB === mockTool3DescEmbedding) return 0.6; // For below threshold test
        }
        // console.warn(`Unexpected cosineSimilarity call in test`);
        return 0; // Default similarity
      }
    );

    // --- Mock the embedding store data (Default Setup) ---
    const defaultStoreData = new Map<string, embeddingStore.ToolEmbeddings>();
    defaultStoreData.set('tool1', {
      descriptionEmbedding: mockTool1DescEmbedding,
      useCaseEmbeddings: [mockTool1Uc1Embedding, mockTool1Uc2Embedding],
      description: 'Tool 1 description',
      useCases: ['uc1', 'uc2'],
    });
    defaultStoreData.set('tool2', {
      descriptionEmbedding: mockTool2DescEmbedding,
      useCaseEmbeddings: [mockTool2Uc1Embedding],
      description: 'Tool 2 description',
      useCases: ['uc3'],
    });
    defaultStoreData.set('tool3_low_score', {
      descriptionEmbedding: mockTool3DescEmbedding, // Lower similarity score
      useCaseEmbeddings: [], // No use cases
      description: 'Tool 3 description',
      useCases: [],
    });
    setupMockStore(defaultStoreData);
  });

  afterEach(() => {
    // vi.restoreAllMocks(); // Restore original implementations if vi.spyOn was used without mockImplementation
  });

  it('should return the best matching tool above threshold', async () => {
    const result = await findBestSemanticMatch('test request');

    // Expected score tool1: (0.9 * 0.6) + (0.8 * 0.4) = 0.54 + 0.32 = 0.86
    // Expected score tool2: (0.1 * 0.6) + (0.15 * 0.4) = 0.06 + 0.06 = 0.12
    // Expected score tool3: (0.6 * 0.6) + (0 * 0.4) = 0.36
    // tool1 should win with score 0.86 (>= 0.70 threshold)

    expect(result).not.toBeNull();
    expect(result?.toolName).toBe('tool1');
    expect(result?.confidence).toBeCloseTo(0.86);
    expect(result?.matchedPattern).toBe('semantic_match');
    expect(embeddingHelper.generateEmbedding).toHaveBeenCalledWith(
      'test request'
    );
    // Check cosineSimilarity calls (example for tool1)
    expect(embeddingHelper.cosineSimilarity).toHaveBeenCalledWith(
      mockRequestEmbedding,
      mockTool1DescEmbedding
    );
    expect(embeddingHelper.cosineSimilarity).toHaveBeenCalledWith(
      mockRequestEmbedding,
      mockTool1Uc1Embedding
    );
    expect(embeddingHelper.cosineSimilarity).toHaveBeenCalledWith(
      mockRequestEmbedding,
      mockTool1Uc2Embedding
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Semantic match found: tool1')
    );
  });

  it('should return null if highest score is below threshold', async () => {
    // Use tool3 which has a max score of 0.36 based on mocks
    // Modify store to only contain tool3 or adjust similarities
    const lowScoreStoreData = new Map<string, embeddingStore.ToolEmbeddings>();
    lowScoreStoreData.set('tool3_low_score', {
      descriptionEmbedding: mockTool3DescEmbedding, // Similarity 0.6
      useCaseEmbeddings: [],
      description: 'Tool 3 description',
      useCases: [],
    });
    lowScoreStoreData.set('tool2', {
      // Add another low score tool
      descriptionEmbedding: mockTool2DescEmbedding, // Similarity 0.1
      useCaseEmbeddings: [mockTool2Uc1Embedding], // Similarity 0.15
      description: 'Tool 2 description',
      useCases: ['uc3'],
    });
    setupMockStore(lowScoreStoreData);
    // Expected score tool3: (0.6 * 0.6) + (0 * 0.4) = 0.36
    // Expected score tool2: (0.1 * 0.6) + (0.15 * 0.4) = 0.12
    // Highest is 0.36, which is below threshold 0.70

    const result = await findBestSemanticMatch('low score request');
    expect(result).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('No semantic match found above threshold')
    );
  });

  it('should return null if request embedding fails', async () => {
    // Mock generateEmbedding to return empty array for this request
    mockedGenerateEmbedding.mockImplementation(async (text: string) => {
      if (text === 'fail embedding') return [];
      return mockRequestEmbedding;
    });

    const result = await findBestSemanticMatch('fail embedding');
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Request embedding failed, cannot perform semantic match.'
    );
  });

  it('should handle tools with missing use case embeddings', async () => {
    // Store already contains tool3_low_score with no use case embeddings
    // We expect the score calculation to use 0 for maxUseCaseSimilarity

    const result = await findBestSemanticMatch('test request'); // Use request that matches tool1 best

    // Expected score tool1: 0.86
    // Expected score tool2: 0.12
    // Expected score tool3: (0.6 * 0.6) + (0 * 0.4) = 0.36
    // tool1 still wins

    expect(result).not.toBeNull();
    expect(result?.toolName).toBe('tool1');
    expect(result?.confidence).toBeCloseTo(0.86);

    // Check that cosineSimilarity was NOT called for tool3's use cases (because it's empty)
    // This is harder to check directly without more complex mocking, but the correct result implies correct handling.
  });

  it('should handle tools with missing description embeddings', async () => {
    const noDescStoreData = new Map<string, embeddingStore.ToolEmbeddings>();
    noDescStoreData.set('tool1_no_desc', {
      descriptionEmbedding: [], // Empty description embedding
      useCaseEmbeddings: [mockTool1Uc1Embedding, mockTool1Uc2Embedding], // Similarities 0.8, 0.7
      description: 'Tool 1 no desc',
      useCases: ['uc1', 'uc2'],
    });
    setupMockStore(noDescStoreData);

    // Expected score tool1_no_desc: (0 * 0.6) + (0.8 * 0.4) = 0.32 (below threshold)

    const result = await findBestSemanticMatch('test request');
    expect(result).toBeNull(); // Expect null as score is below threshold
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('No semantic match found above threshold')
    );
    // Verify cosineSimilarity was not called for the description embedding
    expect(embeddingHelper.cosineSimilarity).not.toHaveBeenCalledWith(
      mockRequestEmbedding,
      []
    );
  });
});
