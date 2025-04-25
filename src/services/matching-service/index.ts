import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ToolsConfig, MatchResult } from '../../types/tools.js';

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
 * Rule-based matching for user requests
 * Matches a user's request text against patterns defined in mcp-config.json
 *
 * @param request The user's request text
 * @returns A match result with tool name and confidence, or null if no match
 */
export function matchRequest(request: string): MatchResult | null {
  const lowercaseRequest = request.toLowerCase();
  let bestMatch: MatchResult | null = null;

  // Simple pattern matching
  for (const [toolName, toolData] of Object.entries(toolConfig.tools)) {
    // First check exact patterns
    for (const pattern of toolData.input_patterns) {
      // Replace placeholders with regex capture groups
      const regexPattern = pattern
        .replace(/\{([^}]+)\}/g, '([\\w\\s-]+)') // Convert {name} to capture groups
        .toLowerCase();

      const regex = new RegExp(`^${regexPattern}$`, 'i');
      const match = lowercaseRequest.match(regex);

      if (match) {
        return {
          toolName,
          confidence: 0.9, // High confidence for exact pattern match
          matchedPattern: pattern,
        };
      }
    }

    // Then check for use case keywords
    for (const useCase of toolData.use_cases) {
      if (lowercaseRequest.includes(useCase.toLowerCase())) {
        const confidence = 0.7; // Medium confidence for use case match

        // Update best match if this is better
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            toolName,
            confidence,
            matchedPattern: useCase,
          };
        }
      }
    }

    // Description-based matching as fallback
    if (
      toolData.description &&
      lowercaseRequest
        .split(' ')
        .some(
          (word) =>
            toolData.description.toLowerCase().includes(word) && word.length > 3
        )
    ) {
      const confidence = 0.5; // Lower confidence for description match

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          toolName,
          confidence,
          matchedPattern: 'description_match',
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Get extracted parameters from a matched pattern
 *
 * @param request The original request text
 * @param matchedPattern The pattern that was matched
 * @returns Object with extracted parameters
 */
export function extractParameters(
  request: string,
  matchedPattern: string
): Record<string, string> {
  const params: Record<string, string> = {};

  // Find all parameter placeholders in the pattern
  const placeholders = matchedPattern.match(/\{([^}]+)\}/g);
  if (!placeholders) return params;

  // Create a regex pattern with capture groups for each parameter
  const regexStr = matchedPattern.replace(/\{([^}]+)\}/g, '([\\w\\s-]+)');
  const regex = new RegExp(regexStr, 'i');

  // Extract the captures
  const match = request.match(regex);
  if (!match) return params;

  // Assign captures to named parameters
  for (let i = 0; i < placeholders.length; i++) {
    const paramName = placeholders[i].slice(1, -1); // Remove { }
    params[paramName] = match[i + 1];
  }

  return params;
}
