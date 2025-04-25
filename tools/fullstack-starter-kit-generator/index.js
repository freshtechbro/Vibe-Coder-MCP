import { z } from 'zod';

import { initDirectories } from './initDirectories.js';
import { generateSetupScripts } from './scripts.js';

// Define Input Type based on Schema
const starterKitInputSchemaShape = {
  projectName: z
    .string()
    .min(1, { message: 'Project name cannot be empty.' })
    .describe('Name of the project'),
  description: z
    .string()
    .min(1, { message: 'Description cannot be empty.' })
    .describe('Description of the project'),
  features: z
    .array(z.string())
    .min(1, { message: 'At least one feature must be specified.' })
    .describe('List of features to include'),
};

/**
 * Generate a fullstack starter kit based on project requirements.
 * @param {object} params - The validated tool parameters.
 * @param {object} config - OpenRouter configuration.
 * @returns {Promise<object>} A Promise resolving to a CallToolResult object.
 */
export const generateStarterKit = async (params, config) => {
  const { projectName, description, features } = params;

  try {
    // Create base directory structure
    const structure = {
      [projectName]: {
        src: {},
        tests: {},
        docs: {},
        config: {},
      },
    };

    await initDirectories(projectName, structure);

    // Generate setup scripts
    await generateSetupScripts(
      {
        packageConfig: {
          name: projectName,
          description,
          dependencies: [],
          devDependencies: features,
          scripts: {
            start: 'node src/index.js',
            test: 'jest',
            build: 'tsc',
          },
        },
      },
      config
    );

    return {
      content: [{ type: 'text', text: 'Starter kit generated successfully' }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Starter kit generation failed: ${error.message}`,
        },
      ],
      isError: true,
      errorDetails: error,
    };
  }
};

// Export the tool definition
export const starterKitToolDefinition = {
  name: 'fullstack-starter-kit-generator',
  description:
    'Generates a fullstack starter kit based on project requirements.',
  inputSchema: starterKitInputSchemaShape,
  executor: generateStarterKit,
};
