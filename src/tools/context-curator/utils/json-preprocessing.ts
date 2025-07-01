import logger from '../../../logger.js';

/**
 * Context Curator-specific JSON preprocessing for relevance scoring responses
 * that get truncated by shared extraction logic when LLM returns large complete responses
 */
export function preprocessRelevanceScoringResponse(
  rawResponse: string, 
  jobId?: string
): string {
  // Only apply preprocessing for large responses that likely contain complete file arrays
  if (rawResponse.length < 10000) {
    logger.debug({ jobId, responseSize: rawResponse.length }, "Response too small for preprocessing, using normal processing");
    return rawResponse;
  }

  logger.debug({ jobId, originalSize: rawResponse.length }, "Applying Context Curator relevance scoring preprocessing");

  // Find all valid JSON objects in the response
  const jsonCandidates = findAllValidJsonObjects(rawResponse);
  
  if (jsonCandidates.length > 0) {
    // Prioritize objects that look like relevance scoring responses
    const relevanceScoringObjects = jsonCandidates.filter(candidate => {
      try {
        const parsed = JSON.parse(candidate);
        return isRelevanceScoringResponse(parsed);
      } catch {
        return false;
      }
    });
    
    if (relevanceScoringObjects.length > 0) {
      // Use the largest relevance scoring object
      relevanceScoringObjects.sort((a, b) => b.length - a.length);
      
      logger.info({
        jobId,
        originalSize: rawResponse.length,
        preprocessedSize: relevanceScoringObjects[0].length,
        candidatesFound: jsonCandidates.length,
        relevanceScoringCandidates: relevanceScoringObjects.length
      }, "Context Curator relevance scoring JSON preprocessing successful");
      
      return relevanceScoringObjects[0];
    }
  }

  logger.debug({ jobId, candidatesFound: jsonCandidates.length }, "No valid relevance scoring objects found, using original response");
  return rawResponse;
}

/**
 * Find all valid JSON objects in the content using balanced bracket matching
 */
function findAllValidJsonObjects(content: string): string[] {
  const jsonCandidates: string[] = [];
  
  // Find all opening braces
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      // Try to find the matching closing brace using balanced bracket matching
      let braceCount = 1;
      let inString = false;
      let escaped = false;
      
      for (let j = i + 1; j < content.length && braceCount > 0; j++) {
        const char = content[j];
        
        if (escaped) {
          escaped = false;
          continue;
        }
        
        if (char === '\\' && inString) {
          escaped = true;
          continue;
        }
        
        if (char === '"' && !escaped) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            
            if (braceCount === 0) {
              // Found complete JSON object
              const candidate = content.substring(i, j + 1);
              try {
                JSON.parse(candidate);
                jsonCandidates.push(candidate);
              } catch {
                // Not valid JSON, continue
              }
              break;
            }
          }
        }
      }
    }
  }
  
  // Sort by size (largest first)
  jsonCandidates.sort((a, b) => b.length - a.length);
  
  return jsonCandidates;
}

/**
 * Check if a parsed object looks like a relevance scoring response
 */
function isRelevanceScoringResponse(parsed: Record<string, unknown>): boolean {
  if (!parsed || typeof parsed !== 'object') {
    return false;
  }
  
  // Must have fileScores array (primary indicator)
  if (!Array.isArray(parsed.fileScores)) {
    return false;
  }
  
  // FileScores array should have substantial content
  if (parsed.fileScores.length === 0) {
    return false;
  }
  
  // Each file score should have expected structure
  const firstFile = parsed.fileScores[0];
  if (!firstFile || typeof firstFile !== 'object') {
    return false;
  }
  
  // Should have key relevance scoring fields
  const hasRequiredFields = 
    'filePath' in firstFile && 
    'relevanceScore' in firstFile;
    
  return hasRequiredFields;
}
