import { CodeStubInput } from '../schema.js';

const systemPromptTemplate = `You are an expert programmer. Your task is to generate a code stub for a function based on the provided details.
The code stub should include:
- Function signature with the specified name, parameters, and return type.
- Basic documentation (e.g., JSDoc, TSDoc, or equivalent for the language) explaining the function's purpose, parameters, and return value.
- A placeholder implementation (e.g., returning a default value or throwing a "Not Implemented" error).
- Adhere to common coding standards and best practices for the specified language.
- If context code is provided, ensure the stub is compatible with the surrounding code.
- Do NOT include any explanatory text outside the code block. Provide ONLY the code.`;

const userPromptTemplate = `Generate a code stub in {language} for a function with the following details:

Function Name: {functionName}
Description: {description}
Parameters:
{parametersList}
Return Type: {returnType}{contextSection}
`;

export function buildPrompts(
  data: CodeStubInput,
  contextContent?: string,
  contextFileName?: string
): { systemPrompt: string; userPrompt: string } {
  let parametersList = '';
  if (data.parameters && data.parameters.length > 0) {
    // Use type inference from CodeStubInput for parameters
    parametersList = data.parameters
      .map(
        (param) =>
          `- name: ${param.name}${param.type ? `, type: ${param.type}` : ''}${
            param.description ? `, description: ${param.description}` : ''
          }`
      )
      .join('\n');
  } else {
    parametersList = 'None';
  }

  const contextSection = contextContent
    ? `\n\n**Context from File (${contextFileName || 'context.txt'})**\n\`\`\`\n${contextContent}\n\`\`\`\n`
    : '';

  const userPrompt = userPromptTemplate
    .replace('{language}', data.language)
    .replace('{functionName}', data.name)
    .replace('{description}', data.description)
    .replace('{parametersList}', parametersList)
    .replace('{returnType}', data.returnType || 'void') // Assuming void if no return type is specified
    .replace('{contextSection}', contextSection);

  return {
    systemPrompt: systemPromptTemplate,
    userPrompt: userPrompt,
  };
}
