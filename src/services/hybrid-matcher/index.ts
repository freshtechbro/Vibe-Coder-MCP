import { z } from 'zod';

import logger from '../../logger.js';
import { processWithSequentialThinking } from '../../tools/sequential-thinking.js';
import { OpenRouterConfig } from '../../types/mcp.js';

export interface MatchResult {
  toolName: string;
  confidence: number;
  matchedPattern: string;
}

export async function findBestMatch(
  prompt: string,
  config: OpenRouterConfig & Record<string, string>
): Promise<string> {
  try {
    // Process with sequential thinking
    const thoughts = await processWithSequentialThinking(prompt, config);

    // Extract the most relevant tool from thoughts
    const lastThought = thoughts[thoughts.length - 1];
    if (!lastThought?.action) {
      return '';
    }

    // Return the tool name from the action
    return lastThought.action.split(' ')[0];
  } catch (error) {
    logger.error({ err: error }, 'Hybrid matching failed');
    return '';
  }
}
