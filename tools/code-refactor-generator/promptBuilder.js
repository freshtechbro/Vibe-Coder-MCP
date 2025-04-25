// Define the system prompt (could be made configurable if needed)
const systemPrompt = `You are an expert AI assistant specializing in code refactoring.
Your goal is to improve code quality, maintainability, readability, and performance based on user instructions.
Analyze the provided code snippet and context, then apply the requested refactoring.
Output ONLY the refactored version of the original code snippet provided in the 'Code to Refactor' section.
Do NOT include explanations, apologies, or any text other than the refactored code itself.
Ensure the output is valid code in the specified language.
If the instructions are unclear or cannot be applied, output the original code snippet unchanged.`;

/**
 * Creates the user prompt string for the LLM based on the refactoring parameters and file context.
 *
 * @param {object} params - The parameters for the code refactoring task.
 * @param {string} params.language - The programming language of the code.
 * @param {string} params.codeContent - The code snippet to refactor.
 * @param {string} params.refactoringInstructions - The user's instructions for refactoring.
 * @param {string} [fileContext] - Optional surrounding code context (already read and validated).
 * @returns {string} The formatted user prompt string for the LLM.
 */
function createLLMPrompt(params, fileContext) {
  // Basic validation
  if (
    !params.language ||
    !params.codeContent ||
    !params.refactoringInstructions
  ) {
    throw new Error(
      'Missing required parameters for prompt creation: language, codeContent, or refactoringInstructions.'
    );
  }

  let prompt = `Refactor the following ${params.language} code snippet.\n\n`;
  prompt += `Language: ${params.language}\n\n`;
  prompt += `Code to Refactor:\n\`\`\`${params.language}\n${params.codeContent}\n\`\`\`\n\n`;
  prompt += `User Instructions:\n${params.refactoringInstructions}\n\n`;

  if (fileContext && fileContext.trim()) {
    prompt += `Consider the following surrounding code context for reference (do NOT include this context in the output):\n---\n${fileContext}\n---\n\n`;
  } else {
    prompt += `No surrounding code context was provided.\n\n`;
  }

  prompt += `Remember: Output ONLY the refactored version of the code snippet provided in the 'Code to Refactor' section above.`;

  return prompt;
}

module.exports = {
  createLLMPrompt,
  systemPrompt, // Export system prompt in case it's needed by the API client
};
