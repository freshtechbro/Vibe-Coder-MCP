// Reconnecting pattern matching for improved NLP accuracy
import { matchRequest, extractParameters } from "../matching-service/index.js";
import { MatchResult } from "../../types/tools.js";
import { processWithSequentialThinking } from "../../tools/sequential-thinking.js";
import { OpenRouterConfig } from "../../types/workflow.js";
import { findBestSemanticMatch } from "../routing/semanticMatcher.js";
import logger from "../../logger.js";

// Confidence thresholds
const HIGH_CONFIDENCE = 0.8;
// const MEDIUM_CONFIDENCE = 0.6; // Removed unused variable
// const LOW_CONFIDENCE = 0.4; // Removed unused variable

/**
 * Hybrid matching result with additional metadata
 */
export interface EnhancedMatchResult extends MatchResult {
  parameters: Record<string, string>;
  matchMethod: "rule" | "intent" | "semantic" | "sequential"; // Added "semantic"
  requiresConfirmation: boolean;
}

/**
 * Main hybrid matching function that implements the fallback flow
 * 1. Try Pattern Matching (fastest, most accurate for defined patterns)
 * 2. Try Semantic Matching (embeddings-based similarity)
 * 3. Fall back to Sequential Thinking (LLM-based)
 * 4. Default Fallback
 *
 * @param request The user request to match
 * @param config OpenRouter configuration for sequential thinking
 * @returns Enhanced match result with parameters and metadata
 */
export async function hybridMatch(
  request: string,
  config: OpenRouterConfig
): Promise<EnhancedMatchResult> {
  let matchResult: MatchResult | null = null;
  let parameters: Record<string, string> = {};
  // Default to sequential, will be overridden if pattern or semantic match succeeds
  let matchMethod: "rule" | "semantic" | "sequential" = "sequential";
  let requiresConfirmation = true; // Default to true, pattern/semantic match might override

  // Step 0: Try Keyword Prefiltering (ultra-fast path for obvious matches)
  const lowerRequest = request.toLowerCase();
  const toolKeywords: Record<string, string[]> = {
    'prd-generator': ['prd', 'product requirement'],
    'user-stories-generator': ['user stor', 'acceptance criteria'],
    'task-list-generator': ['task list', 'todo', 'tasks'],
    'vibe-task-manager': ['vibe', 'task manager', 'decompose', 'atomic'],
    'map-codebase': ['map', 'codebase', 'structure', 'architecture'],
    'research-manager': ['research', 'investigate', 'explore'],
    'curate-context': ['curate', 'context', 'meta-prompt'],
    'run-workflow': ['workflow', 'run workflow'],
    'rules-generator': ['rules', 'standards', 'guidelines', 'style guide'],
    'fullstack-starter-kit-generator': ['starter kit', 'scaffold', 'boilerplate'],
    'get-job-result': ['job result', 'job status', 'check job'],
    'register-agent': ['register agent', 'add agent'],
    'get-agent-tasks': ['agent tasks', 'poll tasks'],
    'submit-task-response': ['submit response', 'task completion'],
    'process-request': ['process request', 'route request']
  };

  for (const [tool, keywords] of Object.entries(toolKeywords)) {
    if (keywords.some(kw => lowerRequest.includes(kw))) {
      logger.info(`Keyword match for ${tool}`);
      
      // Try to extract parameters using existing pattern matching
      const patternMatch = matchRequest(request);
      let parameters: Record<string, string> = {};
      let confidence = 0.85; // Default keyword match confidence
      let matchedPattern: string = 'keyword_match';
      
      // If we found a pattern match for this tool, use its confidence and parameters
      if (patternMatch && patternMatch.toolName === tool && patternMatch.matchedPattern) {
        // Extract parameters from the matched pattern
        parameters = extractParameters(request, patternMatch.matchedPattern);
        // Use the pattern match confidence if it's higher
        confidence = Math.max(confidence, patternMatch.confidence);
        // Use the actual matched pattern for better tracking
        matchedPattern = patternMatch.matchedPattern;
        logger.debug(`Enhanced keyword match with pattern extraction for ${tool}: ${JSON.stringify(parameters)}`);
      }
      
      return {
        toolName: tool,
        confidence,
        matchedPattern,
        parameters,
        matchMethod: 'rule' as const,
        requiresConfirmation: confidence < 0.9 // High confidence (0.9) skips confirmation
      };
    }
  }

  // Step 1: Try Pattern Matching (fastest, most accurate for defined patterns)
  logger.debug('No keyword match found. Trying pattern matching...');
  const patternMatch = matchRequest(request);
  if (patternMatch && patternMatch.confidence >= 0.8) {
    logger.info(`Pattern match found: ${patternMatch.toolName} (${patternMatch.confidence})`);
    const extractedParams = patternMatch.matchedPattern 
      ? extractParameters(request, patternMatch.matchedPattern)
      : {};
    return {
      ...patternMatch,
      parameters: extractedParams,
      matchMethod: 'rule' as const,
      requiresConfirmation: patternMatch.confidence < 0.9
    };
  }

  // Step 2: Try Semantic Matching (if pattern matching didn't succeed)
  logger.debug('Pattern matching did not yield a confident result. Trying semantic matching...');
  const semanticMatchResult = await findBestSemanticMatch(request);

  if (semanticMatchResult) {
    // Successfully matched via semantic similarity
    matchMethod = "semantic";
    matchResult = semanticMatchResult; // Assign the successful match

    // Parameter extraction removed for now - can be added back later
    parameters = {}; // Default to empty parameters

    // Require confirmation for lower confidence semantic matches
    requiresConfirmation = semanticMatchResult.confidence < HIGH_CONFIDENCE;

    logger.info(`Match found via semantic search: ${matchResult.toolName} (Confidence: ${matchResult.confidence.toFixed(3)})`);
    return {
      ...matchResult, // No need for type assertion if matchResult is correctly typed now
      parameters,
      matchMethod,
      requiresConfirmation
    };
  } else {
     logger.debug('Semantic matching did not yield a confident result. Falling back to sequential thinking...');
  }

  // Step 3: Fall back to sequential thinking for ambiguous requests (Only if pattern and semantic match failed)
  // Note: matchMethod remains 'sequential' if both pattern and semantic match failed
  try {
    // Use sequential thinking to determine the most likely tool
    const sequentialResult = await performSequentialThinking(
      request,
      "What tool should I use for this request? Options are: research-manager, prd-generator, user-stories-generator, task-list-generator, rules-generator, run-workflow, get-job-result, map-codebase, vibe-task-manager, curate-context, fullstack-starter-kit-generator, register-agent, get-agent-tasks, submit-task-response, process-request.",
      config
    );

    // Extract the tool name from the response
    const toolName = sequentialResult.toLowerCase()
      .trim()
      .split("\n")[0]
      .replace(/^.*?: /, "");

    // Check if the tool name is valid (exists in our tool list)
    const validTools = [
      "research-manager", "prd-generator", "user-stories-generator", "task-list-generator", 
      "rules-generator", "run-workflow", "get-job-result", "map-codebase", 
      "vibe-task-manager", "curate-context", "fullstack-starter-kit-generator", 
      "register-agent", "get-agent-tasks", "submit-task-response", "process-request"
    ];
    
    if (toolName && validTools.includes(toolName)) {
      matchResult = {
        toolName: toolName,
        confidence: 0.5, // Medium confidence for sequential thinking
        matchedPattern: "sequential_thinking"
      };

      matchMethod = "sequential";

      // Always require confirmation for sequential matches
      requiresConfirmation = true;

      // Parameter extraction removed for now - can be added back later
      parameters = {}; // Default to empty parameters

      return {
        ...matchResult,
        parameters,
        matchMethod,
        requiresConfirmation
      };
    }
  } catch (error) {
    logger.error({ err: error }, "Sequential thinking failed");
  }

  // If all else fails, return a default match to the research manager
  // This ensures we always return something, but with low confidence
  return {
    toolName: "research-manager",
    confidence: 0.2,
    matchedPattern: "fallback",
    parameters: { query: request },
    matchMethod: "sequential",
    requiresConfirmation: true
  };
}

/**
 * Helper function to use sequential thinking for tool selection
 *
 * @param request The user's request
 * @param systemPrompt The prompt to guide sequential thinking
 * @param config OpenRouter configuration
 * @returns The result of sequential thinking
 */
async function performSequentialThinking(
  request: string,
  systemPrompt: string,
  config: OpenRouterConfig
): Promise<string> {
  const prompt = `Given this user request: "${request}"

${systemPrompt}

Analyze the request and determine which tool is most appropriate. Reply with just the name of the most appropriate tool.`;

  return await processWithSequentialThinking(prompt, config);
}

/**
 * Get a human-readable description of why a match was chosen
 *
 * @param match The enhanced match result
 * @returns A string explaining the match
 */
export function getMatchExplanation(match: EnhancedMatchResult): string {
  switch (match.matchMethod) {
    // Removed "rule" and "intent" cases
    case "semantic":
      return `I chose the ${match.toolName} because your request seems semantically similar to its purpose. I'm ${Math.round(match.confidence * 100)}% confident.`;

    case "sequential":
      if (match.matchedPattern === "fallback") {
        return `I wasn't sure which tool to use, so I'm defaulting to the ${match.toolName}. Please let me know if you'd prefer a different tool.`;
      } else {
        return `After analyzing your request, I believe the ${match.toolName} is the most appropriate tool to use.`;
      }

    default:
      return `I selected the ${match.toolName} based on your request.`;
  }
}
