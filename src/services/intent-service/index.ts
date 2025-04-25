import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { MatchResult, ToolsConfig } from '../../types/tools.js';

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load tool configurations
const toolConfig = JSON.parse(
  readFileSync(
    path.join(__dirname, '..', '..', '..', 'mcp-config.json'),
    'utf-8'
  )
) as ToolsConfig;

/**
 * Simple keyword-based intent detection
 * Counts the number of matching keywords to determine the most likely intent
 *
 * @param request The user's request text
 * @returns A match result with tool name and confidence, or null if confidence is too low
 */
export function detectIntent(request: string): MatchResult | null {
  const words = request.toLowerCase().split(/\s+/);
  const scores: Record<string, number> = {};

  // Calculate scores for each tool based on keyword matches
  for (const [toolName, toolData] of Object.entries(toolConfig.tools)) {
    let score = 0;

    // Count matches in description
    const descWords = toolData.description.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && descWords.includes(word)) {
        score += 1;
      }
    }

    // Count matches in use cases (weighted higher)
    for (const useCase of toolData.use_cases) {
      const useCaseWords = useCase.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3 && useCaseWords.includes(word)) {
          score += 2;
        }
      }
    }

    // Normalize score based on request length (to avoid bias toward longer descriptions)
    const normalizedScore = score / words.length;
    scores[toolName] = normalizedScore;
  }

  // Find the tool with highest score
  let bestTool = '';
  let highestScore = 0;

  for (const [toolName, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      bestTool = toolName;
    }
  }

  // Convert score to confidence (0.0-1.0)
  // A perfect match would have a score of at least 1.0 (each word matches)
  const confidence = Math.min(highestScore, 0.85); // Cap at 0.85 to prioritize rule-based matches

  // Only return matches with confidence above threshold
  if (confidence > 0.3 && bestTool) {
    return {
      toolName: bestTool,
      confidence,
      matchedPattern: 'intent_matching',
    };
  }

  return null;
}

/**
 * Intent-based context extraction
 * Attempts to extract potential parameters from the request
 * based on context and common patterns
 *
 * @param request The user's request
 * @returns Object with potential extracted parameters
 */
export function extractContextParameters(
  request: string
): Record<string, string> {
  const params: Record<string, string> = {};
  const words = request.split(/\s+/);

  // Check for common parameter patterns

  // Look for "for X" pattern (common for specifying a target)
  const forMatch = request.match(/\bfor\s+([^.,;]+)/i);
  if (forMatch) {
    params['target'] = forMatch[1].trim();
  }

  // Look for "about X" pattern
  const aboutMatch = request.match(/\babout\s+([^.,;]+)/i);
  if (aboutMatch) {
    params['topic'] = aboutMatch[1].trim();
  }

  // Look for proper nouns (potential entities)
  // This is a very simple heuristic, would be better with NER
  for (let i = 0; i < words.length; i++) {
    if (
      words[i].length > 1 &&
      words[i][0] === words[i][0].toUpperCase() &&
      words[i][0] !== 'I' &&
      !/^(The|A|An|In|On|At|By|For|With|To)$/i.test(words[i])
    ) {
      // Check if this is part of a multi-word entity
      let entity = words[i];
      let j = i + 1;
      while (
        j < words.length &&
        words[j][0] === words[j][0].toUpperCase() &&
        !/^(The|A|An|In|On|At|By|For|With|To)$/i.test(words[j])
      ) {
        entity += ' ' + words[j];
        j++;
      }

      if (!params['entity']) {
        params['entity'] = entity;
      }

      i = j - 1; // Skip ahead
    }
  }

  return params;
}
