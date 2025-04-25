// src/utils/embeddingHelper.ts
// Commented out due to missing types
// import { pipeline, PipelineType, FeatureExtractionPipeline } from '@xenova/transformers';
import logger from '@/logger.js';

// To allow local models potentially in the future and manage cache
// env.allowLocalModels = false; // Adjust as needed
// env.useBrowserCache = false; // Typically false for server-side

// Define a type for the progress callback
type ProgressCallback = (progress: {
  status: string;
  progress?: number;
  message?: string;
}) => void;

export class EmbeddingPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  // Use any type for now since we don't have the proper types
  static instance: any | null = null;

  static async getInstance(
    progress_callback: ProgressCallback | null = null
  ): Promise<any> {
    if (this.instance === null) {
      logger.info(`Loading embedding model: ${this.model}`);
      try {
        // Pass options object conditionally or ensure progress_callback is handled correctly
        const options: { progress_callback?: ProgressCallback } = {};
        if (progress_callback) {
          options.progress_callback = progress_callback;
        }
        // Cast task to 'any' to bypass strict type check due to missing library types
        // Use type assertion for the instance assignment
        // Using dynamic import to avoid TypeScript errors
        const { pipeline } = await import('@xenova/transformers');
        this.instance = await pipeline(this.task as any, this.model, options);
        logger.info(`Embedding model ${this.model} loaded successfully.`);
      } catch (error) {
        logger.error(
          { err: error },
          `Failed to load embedding model ${this.model}`
        );
        throw error; // Re-throw after logging
      } // End try-catch
    } // End if (this.instance === null)

    // Ensure instance is not null before returning, although TS should catch this if it could be null
    if (!this.instance) {
      // This case should theoretically not happen if the pipeline call succeeds or throws
      logger.error(
        'Embedding pipeline instance is unexpectedly null after initialization attempt.'
      );
      throw new Error('Failed to initialize embedding pipeline instance.');
    }
    return this.instance;
  } // End static async getInstance
} // End class EmbeddingPipeline

/**
 * Generates an embedding vector for the given text using a pre-trained sentence transformer model.
 * Uses a singleton pattern to load the model only once.
 *
 * @param text The input string to embed.
 * @returns A Promise that resolves to an array of numbers representing the embedding vector.
 *          Returns an empty array if embedding generation fails.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // If the module is not available, return an empty array
  try {
    logger.debug(
      `Generating embedding for text: "${text.substring(0, 50)}..."`
    );

    try {
      const extractor = await EmbeddingPipeline.getInstance();
      // Generate embedding using the pipeline
      const output = await extractor(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Ensure output.data is treated as Float32Array for Array.from
      if (output && output.data) {
        // Convert to number[] explicitly
        const vector = Array.from(output.data).map(Number);
        logger.debug(
          `Successfully generated embedding vector of length ${vector.length}.`
        );
        return vector;
      } else {
        // Handle unexpected data type
        logger.error(
          { dataType: typeof output?.data },
          'Unexpected data type received from embedding pipeline'
        );
        return []; // Return empty array or throw error
      }
    } catch (error) {
      logger.error(
        { err: error, textSnippet: text.substring(0, 100) },
        'Failed to generate embedding'
      );
      return []; // Return empty array on failure to avoid breaking the flow
    }
  } catch (moduleError) {
    logger.error({ err: moduleError }, 'Failed to load embedding module');
    return [];
  }
}

/**
 * Calculates the cosine similarity between two vectors.
 * @param vecA The first vector (array of numbers).
 * @param vecB The second vector (array of numbers).
 * @returns The cosine similarity (a value between -1 and 1), or 0 if inputs are invalid.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  // Basic validation
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
    logger.warn(
      'Cosine similarity called with invalid vectors (empty or null).'
    );
    return 0;
  }
  if (vecA.length !== vecB.length) {
    logger.warn(
      `Cosine similarity called with vectors of different lengths (${vecA.length} vs ${vecB.length}).`
    );
    // Consider throwing an error, but returning 0 might be safer for some flows
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    // Handle zero vectors - similarity is undefined, return 0
    logger.debug('Cosine similarity involved a zero vector.');
    return 0;
  }

  const similarity = dotProduct / (magnitudeA * magnitudeB);

  // Clamp similarity to [-1, 1] due to potential floating point inaccuracies
  return Math.max(-1, Math.min(1, similarity));
}
