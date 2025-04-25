// src/tools/dependency-analyzer/index.ts
import path from 'path'; // Import path

import logger from '../../logger.js'; // Adjust path if necessary
import { registerTool } from '../../services/routing/toolRegistry.js'; // Adjust path if necessary
import { AppError, ParsingError } from '../../utils/errors.js';
import { readFileContent } from '../../utils/fileReader.js'; // Adjust path if necessary

import { dependencyAnalysisInputSchema } from './schema.js';

/**
 * Parses package.json content to extract dependencies.
 * @param content The string content of package.json.
 * @param filePath The path to the file (for error context).
 * @returns An object containing dependencies and devDependencies.
 * @throws {ParsingError} If the JSON content is invalid.
 */
function parsePackageJson(content, filePath) {
  try {
    const packageJson = JSON.parse(content);
    // Ensure dependencies/devDependencies are objects, even if null/undefined in the file
    const dependencies =
      typeof packageJson.dependencies === 'object' &&
      packageJson.dependencies !== null
        ? packageJson.dependencies
        : {};
    const devDependencies =
      typeof packageJson.devDependencies === 'object' &&
      packageJson.devDependencies !== null
        ? packageJson.devDependencies
        : {};
    return { dependencies, devDependencies };
  } catch (error) {
    logger.error(
      { err: error, filePath },
      'Failed to parse package.json content'
    );
    throw new ParsingError(
      `Invalid JSON in file: ${filePath}`,
      { filePath },
      error instanceof Error ? error : undefined
    );
  }
}
/**
 * Formats the extracted dependencies into a readable Markdown string.
 * @param filePath The path to the analyzed file.
 * @param deps The regular dependencies.
 * @param devDeps The development dependencies.
 * @returns A formatted string summarizing the dependencies.
 */
function formatAnalysisResult(filePath, deps, devDeps) {
  let result = `## Dependency Analysis for: ${filePath}\n\n`;
  const depCount = Object.keys(deps).length;
  const devDepCount = Object.keys(devDeps).length;
  if (depCount > 0) {
    result += `### Dependencies (${depCount}):\n`;
    for (const [name, version] of Object.entries(deps)) {
      result += `- ${name}: ${version}\n`;
    }
  } else {
    result += `### Dependencies:\n - None found.\n`;
  }
  if (devDepCount > 0) {
    result += `\n### Dev Dependencies (${devDepCount}):\n`;
    for (const [name, version] of Object.entries(devDeps)) {
      result += `- ${name}: ${version}\n`;
    }
  } else {
    result += `\n### Dev Dependencies:\n - None found.\n`;
  }
  return result;
}
// Main executor function
export const analyzeDependencies = async (params) => {
  // Validation happens in executeTool, but we cast here for type safety
  const validatedParams = params;
  const filePath = validatedParams.filePath;
  logger.info(`Analyzing dependencies for file: ${filePath}`);
  try {
    // Read the file content using the utility
    const fileContent = await readFileContent(filePath);
    // Determine file type and parse
    let analysisResult;
    const fileName = path.basename(filePath).toLowerCase();
    if (fileName === 'package.json') {
      const { dependencies, devDependencies } = parsePackageJson(
        fileContent,
        filePath
      );
      analysisResult = formatAnalysisResult(
        filePath,
        dependencies,
        devDependencies
      );
    }
    // TODO: Add support for requirements.txt, pom.xml, etc.
    // else if (fileName === 'requirements.txt') { ... parse requirements.txt logic ... }
    else {
      logger.warn(
        `Unsupported dependency file type: ${fileName} at path ${filePath}`
      );
      // Return a specific error message for unsupported types
      return {
        content: [
          {
            type: 'text',
            text: `Error: Unsupported file type '${fileName}'. Currently only 'package.json' is supported.`,
          },
        ],
        isError: true,
        errorDetails: {
          type: 'UnsupportedFileTypeError',
          message: `Unsupported file type: ${fileName}`,
        },
      };
    }
    logger.info(`Successfully analyzed dependencies for ${filePath}`);
    return {
      content: [{ type: 'text', text: analysisResult }],
      isError: false,
    };
  } catch (error) {
    logger.error(
      { err: error, tool: 'analyze-dependencies', filePath },
      `Error analyzing dependencies for ${filePath}`
    );
    // Handle errors thrown by readFileContent or parsePackageJson
    const message =
      error instanceof Error
        ? error.message
        : `Unknown error analyzing dependencies for ${filePath}.`;
    // Use the specific error name if it's an AppError, otherwise use a generic name
    const errorType =
      error instanceof AppError ? error.name : 'DependencyAnalysisError';
    return {
      content: [
        { type: 'text', text: `Error analyzing dependencies: ${message}` },
      ],
      isError: true,
      errorDetails: { type: errorType, message: message },
    };
  }
};
// Define and Register Tool
const dependencyAnalyzerToolDefinition = {
  name: 'analyze-dependencies',
  description:
    'Analyzes dependency manifest files (currently supports package.json) to list project dependencies.',
  inputSchema: dependencyAnalysisInputSchema.shape, // Pass the raw shape
  executor: analyzeDependencies,
};
registerTool(dependencyAnalyzerToolDefinition);
