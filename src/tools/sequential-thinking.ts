import { z } from 'zod';

import logger from '../logger.js';
import { OpenRouterConfig } from '../types/workflow.js';
import { performDirectLlmCall } from '../utils/llmHelper.js';

export interface SequentialThought {
  step: number;
  thought: string;
  reasoning: string;
  action?: string;
  observation?: string;
}

export async function processWithSequentialThinking(
  input: string,
  config: OpenRouterConfig,
  maxSteps: number = 5
): Promise<SequentialThought[]> {
  const thoughts: SequentialThought[] = [];
  let currentStep = 1;

  while (currentStep <= maxSteps) {
    const prompt = `
    Previous thoughts: ${JSON.stringify(thoughts)}
    Current step: ${currentStep}
    Input: ${input}

    Think through this step-by-step:
    1. What is the current state?
    2. What should be considered next?
    3. What action, if any, should be taken?
    4. What might be observed from this action?

    Format response as JSON with:
    {
      "thought": "brief current thought",
      "reasoning": "detailed explanation",
      "action": "specific action to take (optional)",
      "observation": "expected observation (optional)"
    }
    `;

    const response = await performDirectLlmCall(
      prompt,
      'You are a careful step-by-step thinker.',
      config,
      'sequential_thinking',
      0.2
    );

    try {
      const thoughtResult = JSON.parse(response);
      thoughts.push({
        step: currentStep,
        ...thoughtResult,
      });

      // If no further action is needed, break
      if (!thoughtResult.action) {
        break;
      }

      currentStep++;
    } catch (error) {
      logger.error(
        { err: error },
        'Failed to parse sequential thinking response'
      );
      break;
    }
  }

  return thoughts;
}
