import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import logger from '../../logger.js';
import { ToolsConfig } from '../../types/tools.js'; // Removed ToolDefinition import
import { generateEmbedding } from '../../utils/embeddingHelper.js';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Export the interface so it can be imported elsewhere
export interface ToolEmbeddings {
  descriptionEmbedding: number[];
  useCaseEmbeddings: number[][]; // Array of embeddings for each use case
  description: string; // Store original text for potential debug/logging
  useCases: string[]; // Store original text
}

// Exported Map to store the embeddings
export const toolEmbeddingStore = new Map<string, ToolEmbeddings>();

/**
 * Initializes the tool embedding store by loading tool definitions from
 * mcp-config.json, generating embeddings for descriptions and use cases,
 * and storing them in memory.
 */
export async function initializeToolEmbeddings(): Promise<void> {
  logger.info('Initializing tool embeddings...');
  const configPath = path.resolve(__dirname, '../../../mcp-config.json'); // Path relative to this file

  let config: { tools: ToolsConfig };
  try {
    const configFile = readFileSync(configPath, 'utf-8');
    config = JSON.parse(configFile);
    if (!config || typeof config.tools !== 'object') {
      throw new Error(
        'Invalid mcp-config.json structure or missing tools object.'
      );
    }
    logger.debug(`Loaded mcp-config.json from: ${configPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: error, path: configPath },
      'Failed to load or parse mcp-config.json'
    );
    // Depending on requirements, you might re-throw or exit
    throw new Error(
      `Critical error: Could not load tool configuration from ${configPath}. ${errorMessage}`
    );
  }

  let processedCount = 0;
  const toolEntries = Object.entries(config.tools);

  for (const [toolName, toolData] of toolEntries) {
    logger.debug(`Processing embeddings for tool: ${toolName}`);
    try {
      // Ensure use_cases exists and is an array before mapping
      // Assuming toolData structure includes description: string, use_cases: string[]
      const description =
        typeof toolData.description === 'string' ? toolData.description : '';
      const useCases = Array.isArray(toolData.use_cases)
        ? toolData.use_cases
        : [];

      const descriptionEmbedding = await generateEmbedding(description);

      // Add explicit type 'string' for uc
      const useCaseEmbeddingsPromises = useCases.map((uc: string) =>
        generateEmbedding(uc)
      );
      const generatedUseCaseEmbeddings = await Promise.all(
        useCaseEmbeddingsPromises
      );

      // Filter out any failed embeddings (returned as empty arrays)
      const successfulUseCaseEmbeddings = generatedUseCaseEmbeddings.filter(
        (vec) => vec.length > 0
      );

      if (descriptionEmbedding.length > 0) {
        toolEmbeddingStore.set(toolName, {
          descriptionEmbedding,
          useCaseEmbeddings: successfulUseCaseEmbeddings,
          description: description, // Use the validated description
          useCases: useCases, // Store original use cases
        });
        logger.debug(
          `Stored embeddings for tool: ${toolName} (Use cases: ${successfulUseCaseEmbeddings.length}/${useCases.length})`
        );
        processedCount++;
      } else {
        logger.warn(
          `Skipping tool ${toolName} due to failed description embedding generation.`
        );
      }
    } catch (error) {
      logger.error(
        { err: error, tool: toolName },
        `Error processing embeddings for tool ${toolName}`
      );
      // Continue processing other tools
    }
  }

  logger.info(
    `Tool embedding initialization complete. Processed ${processedCount}/${toolEntries.length} tools.`
  );
}
