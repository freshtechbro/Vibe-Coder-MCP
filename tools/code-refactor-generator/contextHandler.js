const fs = require('fs');
const path = require('path');

const { readFileContent } = require('../../utils/fileReader.js'); // Adjust path if necessary

const { logger } = require('./configLoader.js'); // Use logger from configLoader

const MAX_CONTEXT_LENGTH = 60000; // Define maximum total context length (Consider making this configurable)
const ALLOWED_CONTEXT_DIR = path.resolve(__dirname, 'allowed_context'); // Define the sandbox directory

/**
 * Processes the context file path provided in the parameters.
 * Validates the path, checks sandboxing, reads the file content, and verifies size.
 *
 * @param {string|undefined} contextFilePath - The path to the context file (relative or absolute).
 * @returns {Promise<string>} A promise resolving to the file content string, or an empty string if no path is provided.
 * @throws {Error} If the path is outside the allowed directory, file not found, permission denied, or content exceeds max length.
 */
async function processContextFile(contextFilePath) {
  if (!contextFilePath) {
    logger.debug('No context file path provided.');
    return ''; // No context file specified, return empty string
  }

  logger.debug({ filePath: contextFilePath }, 'Processing context file path.');

  // Resolve the absolute path of the context file
  const absoluteFilePath = path.resolve(contextFilePath);

  // --- Sandboxing Check ---
  // Ensure the context file is within the allowed directory for security
  // We check if the resolved path *starts with* the allowed directory path + separator
  // This prevents path traversal attacks (e.g., ../../sensitive-file)
  if (!absoluteFilePath.startsWith(ALLOWED_CONTEXT_DIR + path.sep)) {
    const err = new Error(
      `Context file path is outside the allowed directory: ${ALLOWED_CONTEXT_DIR}`
    );
    logger.error(
      {
        filePath: contextFilePath,
        absoluteFilePath,
        allowedDir: ALLOWED_CONTEXT_DIR,
        error: err.message,
      },
      'Context file path outside allowed directory.'
    );
    throw err; // Security critical: Stop execution
  }
  logger.debug(
    { absoluteFilePath, allowedDir: ALLOWED_CONTEXT_DIR },
    'Context file path is within the allowed directory.'
  );

  // --- Existence Check ---
  // Check if the context file exists *before* attempting to read
  if (!fs.existsSync(absoluteFilePath)) {
    // Use absolute path for existence check
    const err = new Error(`Context file not found: ${contextFilePath}`);
    logger.error(
      { filePath: contextFilePath, absoluteFilePath, error: err.message },
      'Context file not found.'
    );
    throw err;
  }
  logger.debug({ absoluteFilePath }, 'Context file exists.');

  // --- Reading and Size Check ---
  let fileContext = '';
  try {
    // Read the content of the context file using the absolute path
    fileContext = await readFileContent(absoluteFilePath);
    logger.info(
      {
        filePath: contextFilePath,
        absoluteFilePath,
        contentLength: fileContext.length,
      },
      'Successfully read context file.'
    );

    // Check if the context length exceeds the maximum allowed length
    if (fileContext.length > MAX_CONTEXT_LENGTH) {
      const err = new Error(
        `Context file content (${fileContext.length} chars) exceeds maximum length of ${MAX_CONTEXT_LENGTH} characters.`
      );
      logger.error(
        {
          filePath: contextFilePath,
          absoluteFilePath,
          contentLength: fileContext.length,
          maxLength: MAX_CONTEXT_LENGTH,
          error: err.message,
        },
        'Context length exceeded.'
      );
      throw err;
    }
    logger.debug(
      { contentLength: fileContext.length, maxLength: MAX_CONTEXT_LENGTH },
      'Context file size check passed.'
    );

    return fileContext;
  } catch (readError) {
    // Handle specific file reading errors
    if (readError.code === 'EACCES') {
      logger.error(
        {
          filePath: contextFilePath,
          absoluteFilePath,
          error: readError.message,
        },
        `Permission denied when trying to read context file.`
      );
      // Throw a more user-friendly error, masking the absolute path
      throw new Error(
        `Permission denied when trying to read context file: ${contextFilePath}`
      );
    } else if (
      readError instanceof Error &&
      readError.message.startsWith('Context file content')
    ) {
      // Re-throw the size limit error directly
      throw readError;
    } else {
      // Handle other potential errors during file reading
      logger.error(
        {
          filePath: contextFilePath,
          absoluteFilePath,
          error: readError.message || readError,
        },
        `Failed to read context file.`
      );
      // Throw a generic error, masking potential sensitive details from lower-level errors
      throw new Error(
        `An error occurred while reading the context file: ${contextFilePath}`
      );
    }
  }
}

module.exports = {
  processContextFile,
  // Optionally export constants if they might be needed elsewhere, though likely not needed now
  // MAX_CONTEXT_LENGTH,
  // ALLOWED_CONTEXT_DIR
};
