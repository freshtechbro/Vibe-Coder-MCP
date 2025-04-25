// src/tools/code-stub-generator/index.ts
import axios from 'axios';

import logger from '../../logger.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
import { selectModelForTask } from '../../utils/configLoader.js'; // Import the new utility
import {
  ApiError,
  ParsingError,
  ToolExecutionError,
  AppError,
  ConfigurationError,
} from '../../utils/errors.js'; // Import custom errors, Added ConfigurationError
import { readFileContent } from '../../utils/fileReader.js'; // Import file reader utility

import { codeStubInputSchema } from './schema.js'; // Import schema/type
const CODE_STUB_SYSTEM_PROMPT = `You are an expert code generation assistant. Your task is to generate a clean, syntactically correct code stub based ONLY on the user's specifications.

**IMPORTANT RULES:**
1.  ONLY output the raw code for the requested stub.
2.  Do NOT include any explanations, apologies, comments about the code, markdown formatting (like \`\`\`language ... \`\`\`), or any text other than the code itself.
3.  Generate idiomatic code for the specified language.
4.  Include basic docstrings/comments within the code stub explaining parameters and purpose, based on the provided description.
5.  If generating a function or method body, include a placeholder comment like '// TODO: Implement logic' or 'pass' (for Python).
6.  If essential information is missing, make reasonable assumptions but keep the stub minimal.
`;
// Function to generate the user prompt for the LLM
function createLLMPrompt(params, fileContext, previousContextText) {
  let prompt = `Generate a code stub with the following specifications:\n`;
  prompt += `- Language: ${params.language}\n`;
  prompt += `- Type: ${params.stubType}\n`;
  prompt += `- Name: ${params.name}\n`;
  prompt += `- Description: ${params.description}\n`;
  if (params.parameters && params.parameters.length > 0) {
    prompt += `- Parameters:\n`;
    params.parameters.forEach((p) => {
      prompt += `  - Name: ${p.name}${p.type ? `, Type: ${p.type}` : ''}${p.description ? `, Desc: ${p.description}` : ''}\n`;
    });
  }
  if (params.returnType) {
    prompt += `- Return Type: ${params.returnType}\n`;
  }
  if (params.classProperties && params.classProperties.length > 0) {
    prompt += `- Properties (for class):\n`;
    params.classProperties.forEach((p) => {
      prompt += `  - Name: ${p.name}${p.type ? `, Type: ${p.type}` : ''}${p.description ? `, Desc: ${p.description}` : ''}\n`;
    });
  }
  if (params.methods && params.methods.length > 0) {
    prompt += `- Methods (for class/interface):\n`;
    params.methods.forEach((m) => {
      prompt += `  - Name: ${m.name}${m.description ? `, Desc: ${m.description}` : ''}\n`;
    });
  }
  if (fileContext) {
    prompt += `\nConsider the following file content as additional context:\n---\n${fileContext}\n---\n`;
  }
  // Add previous context if available
  if (previousContextText) {
    prompt += `\nConsider the result of the previous operation:\n---\n${previousContextText}\n---\n`;
  }
  prompt += `\nOutput ONLY the raw code stub.`;
  return prompt;
}
// Function to clean up potential markdown fences
function cleanCodeOutput(rawOutput) {
  let cleaned = rawOutput.trim();
  // Remove ```language / ``` fences
  const fenceRegex = /^```(?:\w+)?\s*([\s\S]*?)\s*```$/;
  const match = cleaned.match(fenceRegex);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }
  // Remove leading/trailing empty lines potentially left after fence removal
  cleaned = cleaned.replace(/^\s*\n|\n\s*$/g, '');
  return cleaned;
}
// Main executor function
export const generateCodeStub = async (
  params,
  config,
  context // Add context parameter
) => {
  // Log the config received by the executor
  logger.debug(
    {
      configReceived: true,
      hasLlmMapping: Boolean(config.llm_mapping),
      mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : [],
    },
    'generateCodeStub executor received config'
  );
  // Validation happens in executeTool, but we cast here for type safety
  const validatedParams = params;
  logger.info(
    `Generating ${validatedParams.language} ${validatedParams.stubType} stub: ${validatedParams.name}`
  );
  let fileContext = '';
  if (validatedParams.contextFilePath) {
    logger.debug(`Reading context file: ${validatedParams.contextFilePath}`);
    try {
      fileContext = await readFileContent(validatedParams.contextFilePath);
      logger.info(
        `Successfully added context from file: ${validatedParams.contextFilePath}`
      );
    } catch (readError) {
      logger.warn(
        { err: readError },
        `Could not read context file '${validatedParams.contextFilePath}'. Proceeding without file context.`
      );
      // Optionally include the error message in the context string
      fileContext = `\n\n[Warning: Failed to read context file '${validatedParams.contextFilePath}'. Error: ${readError instanceof Error ? readError.message : String(readError)}]`;
      // Or, decide if this should be a hard error:
      // throw new ToolExecutionError(`Failed to read context file: ${readError.message}`, { path: validatedParams.contextFilePath }, readError);
    }
  }
  // Safely access previous response text from context and ensure it's a string
  let previousText = undefined;
  const potentialText = context?.previousResponse?.content?.[0]?.text;
  if (typeof potentialText === 'string' && potentialText.trim()) {
    previousText = potentialText;
    logger.debug('Using context from previous tool response.');
  }
  const userPrompt = createLLMPrompt(
    validatedParams,
    fileContext,
    previousText
  ); // Pass fileContext and validated previousText
  // Select the model
  const logicalTaskName = 'code_stub_generation';
  const defaultModel = config.geminiModel || 'google/gemini-2.0-flash-001'; // Or a better default code model
  const modelToUse = selectModelForTask(config, logicalTaskName, defaultModel);
  // Check for API key
  if (!config.apiKey) {
    throw new ConfigurationError(
      'OpenRouter API key (OPENROUTER_API_KEY) is not configured.'
    );
  }
  try {
    // Add Code Stub Generator header
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: modelToUse, // Use selected model
        messages: [
          { role: 'system', content: CODE_STUB_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000, // Adjust as needed
        temperature: 0.2, // Lower temperature for more predictable code
        // No stream needed for simple stub
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://vibe-coder-mcp.local', // Optional
        },
      }
    );
    if (response.data?.choices?.[0]?.message?.content) {
      const rawCode = response.data.choices[0].message.content;
      const cleanCode = cleanCodeOutput(rawCode);
      if (!cleanCode) {
        throw new ParsingError(
          'LLM returned empty code content after cleanup.',
          { rawCode, modelUsed: modelToUse }
        );
      }
      logger.debug(
        { modelUsed: modelToUse },
        `Successfully generated code stub for ${validatedParams.name}`
      );
      return {
        content: [{ type: 'text', text: cleanCode }], // Return the cleaned code
        isError: false,
      };
    } else {
      logger.warn(
        { responseData: response.data, modelUsed: modelToUse },
        'Received empty or unexpected response from LLM for code stub generation'
      );
      throw new ParsingError(
        'No valid content received from LLM for code stub generation',
        { responseData: response.data, modelUsed: modelToUse }
      );
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        tool: 'generate-code-stub',
        params: validatedParams,
        modelUsed: modelToUse,
      },
      `Error generating code stub for ${validatedParams.name}`
    );
    let specificError;
    // Wrap errors in custom types
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      specificError = new ApiError(
        `Code stub generation API Error: Status ${status || 'N/A'}. ${error.message}`,
        status,
        { params: validatedParams, modelUsed: modelToUse },
        error
      );
    } else if (error instanceof AppError) {
      // Create a new context object including the model info
      const newContext = { ...(error.context || {}), modelUsed: modelToUse };
      // Re-create the error with the new context
      specificError = new ToolExecutionError(
        error.message,
        newContext,
        error.originalError
      );
    } else if (error instanceof Error) {
      specificError = new ToolExecutionError(
        `Failed to generate code stub: ${error.message}`,
        { params: validatedParams, modelUsed: modelToUse },
        error
      );
    } else {
      specificError = new ToolExecutionError(
        `Unknown error during code stub generation.`,
        { params: validatedParams, modelUsed: modelToUse }
      );
    }
    // Return CallToolResult with error
    return {
      content: [{ type: 'text', text: specificError.message }],
      isError: true,
      errorDetails: {
        type: specificError.name,
        message: specificError.message,
      },
    };
  }
};
// Define and Register Tool
const codeStubToolDefinition = {
  name: 'generate-code-stub',
  description:
    'Generates a code stub (function, class, etc.) in a specified language based on a description. Can optionally use content from a file (relative path) as context.', // Updated description
  inputSchema: codeStubInputSchema.shape, // Pass the raw shape to the registry
  executor: generateCodeStub,
};
registerTool(codeStubToolDefinition);
