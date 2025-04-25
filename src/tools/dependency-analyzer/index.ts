import path from 'path';

import { z } from 'zod';

import logger from '@/logger.js';
import { AppError, ParsingError, ValidationError } from '@/utils/errors.js';
import { readFileContent } from '@/utils/fileReader.js';

import {
  ToolExecutionContext,
  toolRegistry,
} from '../../services/routing/toolRegistry.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';

// Define Zod schema for input parameters
const dependencyInputSchema = {
  projectPath: z.string(),
  filePath: z.string().optional().default('package.json'),
  includeDevDependencies: z.boolean().optional().default(true),
};

async function analyzeDependencies(
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  // Restore validation
  const validationResult = z.object(dependencyInputSchema).safeParse(params);
  if (!validationResult.success) {
    const errorMessage = `Invalid input parameters: ${validationResult.error.errors.map((e) => `${e.path.join('.')} - ${e.message}`).join(', ')}`;
    logger.error(
      { error: validationResult.error, sessionId: context.sessionId },
      errorMessage
    );
    return {
      isError: true,
      content: [{ type: 'text', text: errorMessage }],
      errorDetails: {
        type: 'ValidationError',
        errors: validationResult.error.errors,
      },
    };
  }

  const { projectPath, filePath, includeDevDependencies } =
    validationResult.data;
  const fullFilePath = path.resolve(projectPath, filePath);
  const logContext = {
    fullFilePath,
    includeDevDependencies,
    sessionId: context.sessionId,
  };

  logger.info(logContext, 'Analyzing dependencies');

  try {
    // Read the file content first
    const fileContent = await readFileContent(fullFilePath);

    // Now check for supported file type
    if (path.basename(filePath) !== 'package.json') {
      throw new AppError(
        `Unsupported file type '${filePath}'. Currently only 'package.json' is supported.`,
        { fileType: path.extname(filePath) }
      );
    }

    // Continue with parsing etc.
    let packageData;
    try {
      packageData = JSON.parse(fileContent);
    } catch (parseError) {
      throw new ParsingError(
        `Invalid JSON in file: ${filePath}`,
        {
          parsingError:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        },
        parseError instanceof Error ? parseError : undefined
      );
    }

    const dependencies = packageData.dependencies || {};
    const devDependencies = packageData.devDependencies || {};

    let resultText = `## Dependency Analysis for: ${filePath}\n\n`;

    const formatDeps = (deps: Record<string, string>, title: string) => {
      const keys = Object.keys(deps);
      resultText += `### ${title}${keys.length ? ` (${keys.length}):` : ':'}\n`;
      if (keys.length > 0) {
        keys.forEach((key) => {
          resultText += `- ${key}: ${deps[key]}\n`;
        });
      } else {
        resultText += ` - None found.\n`;
      }
    };

    formatDeps(dependencies, 'Dependencies');
    if (includeDevDependencies) {
      resultText += `\n`;
      formatDeps(devDependencies, 'Dev Dependencies');
    }

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: resultText,
        },
      ],
    };
  } catch (error) {
    let errorMessage = 'An unknown error occurred during dependency analysis.';
    let errorType = 'UnknownError';
    let errorDetails: Record<string, unknown> = { rawError: error };

    if (error instanceof AppError) {
      logger.error(
        { error: error, ...logContext },
        `${error.name} analyzing dependencies`
      );
      errorMessage = error.message;
      errorType = error.name;
      errorDetails = {
        type: errorType,
        message: errorMessage,
        ...(error.context || {}),
      };
    } else if (error instanceof Error) {
      logger.error(
        { error: error, ...logContext },
        'Error analyzing dependencies'
      );
      errorMessage = `Error analyzing dependencies: ${error.message}`;
      errorType = error.name || 'Error';
      errorDetails = {
        type: errorType,
        message: error.message,
        stack: error.stack,
      };
    } else {
      logger.error(
        { error, ...logContext },
        'Unknown error type analyzing dependencies'
      );
    }

    return {
      isError: true,
      content: [{ type: 'text', text: errorMessage }],
      errorDetails: errorDetails,
    };
  }
}

export const dependencyAnalyzerTool: ToolDefinition = {
  name: 'dependency-analyzer',
  description: 'Lists project dependencies from a package file.',
  inputSchema: dependencyInputSchema,
  execute: analyzeDependencies,
};

toolRegistry.registerTool(dependencyAnalyzerTool);
