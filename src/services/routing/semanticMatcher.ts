import logger from '../../logger.js';
import { MatchResult } from '../../types/tools.js';
import {
  generateEmbedding,
  cosineSimilarity,
} from '../../utils/embeddingHelper.js';

import { toolEmbeddingStore } from './embeddingStore.js'; // Removed unused ToolEmbeddings import

const SEMANTIC_MATCH_THRESHOLD = 0.7; // Minimum similarity score to consider a match
const DESCRIPTION_WEIGHT = 0.6; // Weight for description similarity
const USE_CASE_WEIGHT = 0.4; // Weight for the best use case similarity

/**
 * Finds the best semantic tool match for a given user request using pre-computed embeddings.
 * Calculates cosine similarity between the request embedding and stored tool embeddings
 * (description and use cases) and returns the tool with the highest weighted score
 * above a defined threshold.
 *
 * @param request The user request string.
 * @returns A Promise resolving to a MatchResult object if a suitable match is found, otherwise null.
 */
export async function findBestSemanticMatch(
  request: string
): Promise<MatchResult | null> {
  logger.debug(
    `Starting semantic match for request: "${request.substring(0, 50)}..."`
  );
  try {
    const requestEmbedding = await generateEmbedding(request);

    if (requestEmbedding.length === 0) {
      logger.warn('Request embedding failed, cannot perform semantic match.');
      return null;
    }

    let bestMatch: MatchResult | null = null;
    let highestScore: number = -1; // Use -1 to allow scores below 0

    for (const [toolName, embeddings] of toolEmbeddingStore.entries()) {
      // Skip if tool has no embeddings at all
      if (
        embeddings.descriptionEmbedding.length === 0 &&
        embeddings.useCaseEmbeddings.length === 0
      ) {
        logger.debug(`Skipping tool ${toolName} as it has no embeddings.`);
        continue;
      }

      // Calculate description similarity (handle case where description embedding might have failed during init)
      const descSimilarity =
        embeddings.descriptionEmbedding.length > 0
          ? cosineSimilarity(requestEmbedding, embeddings.descriptionEmbedding)
          : 0; // Default to 0 if no description embedding

      // Calculate use case similarities and find the max
      const useCaseSimilarities = embeddings.useCaseEmbeddings.map((ucVec) =>
        cosineSimilarity(requestEmbedding, ucVec)
      );
      const maxUseCaseSimilarity =
        useCaseSimilarities.length > 0 ? Math.max(...useCaseSimilarities) : 0;

      // Calculate weighted score
      const score =
        descSimilarity * DESCRIPTION_WEIGHT +
        maxUseCaseSimilarity * USE_CASE_WEIGHT;

      logger.debug(
        `Tool: ${toolName}, Desc Sim: ${descSimilarity.toFixed(3)}, Max UC Sim: ${maxUseCaseSimilarity.toFixed(3)}, Weighted Score: ${score.toFixed(3)}`
      );

      // Update best match if current score is higher
      if (score > highestScore) {
        highestScore = score;
        // Create the match result - confidence is the raw score here
        bestMatch = {
          toolName,
          confidence: score,
          matchedPattern: 'semantic_match',
        };
      }
    }

    // Check if the best match meets the threshold
    if (bestMatch && highestScore >= SEMANTIC_MATCH_THRESHOLD) {
      logger.info(
        `Semantic match found: ${bestMatch.toolName} with score ${highestScore.toFixed(3)}`
      );
      // Assign the final confidence (using raw score for now)
      bestMatch.confidence = highestScore;
      return bestMatch;
    } else {
      logger.info(
        `No semantic match found above threshold ${SEMANTIC_MATCH_THRESHOLD}. Highest score: ${highestScore.toFixed(3)}`
      );
      return null;
    }
  } catch (error) {
    logger.error({ err: error }, 'Error during semantic matching');
    return null; // Return null on unexpected errors
  }
}
