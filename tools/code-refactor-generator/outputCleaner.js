const { ParsingError } = require('../../utils/errors.js'); // For throwing specific errors

const { logger } = require('./configLoader.js'); // Optional: for logging cleaning steps if needed

/**
 * Cleans the raw output string from the LLM.
 * Attempts to extract code from markdown code fences (```).
 * Removes leading/trailing whitespace and unnecessary newlines.
 *
 * @param {string} rawOutput - The raw string output from the LLM.
 * @param {string} modelUsed - The model that generated the output (for error context).
 * @returns {string} The cleaned code string.
 * @throws {ParsingError} If the cleaned output is empty after processing.
 */
function cleanCodeOutput(rawOutput, modelUsed = 'unknown') {
  if (typeof rawOutput !== 'string') {
    logger.warn(
      { rawOutput, type: typeof rawOutput, modelUsed },
      'Received non-string output from LLM. Returning empty string.'
    );
    // Depending on requirements, might throw an error instead.
    // For now, return empty to avoid breaking flow, but log it.
    return '';
  }

  let cleaned = rawOutput.trim();
  logger.debug(
    { rawLength: rawOutput.length, trimmedLength: cleaned.length },
    'Cleaning raw LLM output.'
  );

  // Regex to find markdown code fences (```) potentially with language identifiers
  // It captures the content inside the fences.
  // Handles optional language identifiers (e.g., ```javascript) and varying whitespace.
  // Uses [\s\S]*? for non-greedy matching of any character including newlines.
  const fenceRegex = /^```(?:\w*\s*)?([\s\S]*?)\s*```$/;
  const match = cleaned.match(fenceRegex);

  if (match && match[1]) {
    // If a code fence is found, use the captured content inside the fence
    cleaned = match[1].trim();
    logger.debug('Extracted content from markdown code fence.');
  } else {
    logger.debug(
      'No markdown code fence found or content was empty, using raw trimmed output.'
    );
    // If no fence or empty fence, we proceed with the already trimmed rawOutput.
    // This handles cases where the LLM might just return the code directly.
  }

  // Final cleanup: Remove leading/trailing whitespace and blank lines that might remain
  // Note: This might be too aggressive if intentional blank lines within the code are desired.
  // Consider refining this if it causes issues with specific code formatting.
  // cleaned = cleaned.replace(/^\s*\n|\n\s*$/g, ''); // Removes leading/trailing newlines
  // A simpler trim might be sufficient after fence extraction:
  cleaned = cleaned.trim();

  if (!cleaned) {
    logger.error(
      { rawOutput, modelUsed },
      'LLM output resulted in an empty string after cleaning.'
    );
    // Throw a specific error if the result is empty, providing context.
    throw new ParsingError('LLM returned empty code content after cleanup.', {
      rawOutput,
      modelUsed,
    });
  }

  logger.debug(
    { finalLength: cleaned.length },
    'Finished cleaning LLM output.'
  );
  return cleaned;
}

module.exports = {
  cleanCodeOutput,
};
