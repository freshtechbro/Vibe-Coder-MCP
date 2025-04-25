import axios, { AxiosError } from 'axios';

import logger from '@/logger.js';
import { OpenRouterConfig } from '@/types/workflow.js';
import { selectModelForTask } from '@/utils/configLoader.js';
import {
  ApiError,
  ParsingError,
  AppError,
  ConfigurationError,
} from '@/utils/errors.js';

/**
 * Performs a single research query using the configured research model with web search capability.
 * @param query The research query string.
 * @param config OpenRouter configuration containing the llm_mapping.
 * @returns The research result content as a string.
 * @throws Error if the API call fails or returns no content.
 */
export async function performResearchQuery(
  query: string,
  config: OpenRouterConfig
): Promise<string> {
  const logicalTaskName = 'research_execution';

  // Check for API key first
  if (!config.apiKey) {
    throw new ConfigurationError(
      'OpenRouter API key (OPENROUTER_API_KEY) is not configured.'
    );
  }

  // Select the model using the utility function
  const modelToUse = selectModelForTask(
    config,
    logicalTaskName,
    config.defaultModel
  );
  logger.debug(
    { query, modelToUse },
    'Performing research query with web search capabilities'
  );

  try {
    // Build the request payload with web search plugin if configuration exists
    const requestPayload: any = {
      model: modelToUse, // This should already include the :online suffix from llm_config.json
      messages: [
        {
          role: 'system',
          content:
            "You are a sophisticated AI research assistant with web search capabilities. Provide comprehensive, accurate, and up-to-date information. Research the user's query thoroughly and cite your sources.",
        },
        { role: 'user', content: query },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    };

    // Add web search plugin configuration if available in config
    if (config.api_config?.web_search?.enabled) {
      requestPayload.plugins = [
        {
          id: 'web',
          max_results: config.api_config.web_search.max_results || 5,
          search_prompt: config.api_config.web_search.search_prompt,
        },
      ];
    }

    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      requestPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://vibe-coder-mcp.local',
        },
        timeout: 90000,
      }
    );

    if (response.data?.choices?.[0]?.message?.content) {
      logger.debug(
        { query, modelUsed: modelToUse },
        'Research query successful'
      );

      // Extract any citation annotations if present
      const annotations =
        response.data?.choices?.[0]?.message?.annotations || [];
      if (annotations.length > 0) {
        logger.debug(
          { citationCount: annotations.length },
          'Research includes citations from web search'
        );
      }

      return response.data.choices[0].message.content.trim();
    } else {
      logger.warn(
        { query, responseData: response.data, modelUsed: modelToUse },
        'Received empty or unexpected response structure from research call'
      );
      // Throw specific ParsingError
      throw new ParsingError(
        'Invalid API response structure received from research call',
        { query, responseData: response.data, modelUsed: modelToUse }
      );
    }
  } catch (error) {
    logger.error(
      { err: error, query, modelUsed: modelToUse },
      'Research API call failed'
    );

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data;
      const apiMessage = `Research API Error: Status ${status || 'N/A'}. ${axiosError.message}`;
      // Throw specific ApiError
      throw new ApiError(
        apiMessage,
        status,
        { query, modelUsed: modelToUse, responseData },
        axiosError
      );
    } else if (error instanceof AppError) {
      // Re-throw known AppErrors (like ParsingError from above)
      throw error;
    } else if (error instanceof Error) {
      // Wrap other standard errors
      throw new AppError(
        `Research failed: ${error.message}`,
        { query, modelUsed: modelToUse },
        error
      );
    } else {
      // Handle cases where a non-Error was thrown
      throw new AppError(`Unknown error during research.`, {
        query,
        modelUsed: modelToUse,
        thrownValue: String(error),
      });
    }
  }
}
