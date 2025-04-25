# Code Refactor Generator Tool

## Purpose

This tool leverages a Large Language Model (LLM) to refactor provided code snippets based on user instructions. It can optionally use context from specified files to inform the refactoring process.

## Setup

1.  **Dependencies:** Ensure Node.js is installed. Install project dependencies from the root directory:

    ```bash
    npm install
    ```

    (This tool relies on shared dependencies and configuration from the root project.)

2.  **Configuration:**
    - Copy the root `.env.example` file to `.env`.
    - Fill in the required API key (e.g., `OPENROUTER_API_KEY`) in the `.env` file.
    - LLM provider, model, and other settings are configured in the root `llm_config.json` file.

## Configuration

This tool relies on the centralized project configuration:

- **API Key:** The required API key (e.g., `OPENROUTER_API_KEY`) must be set in the root `.env` file. Refer to the root `.env.example` for required keys based on the configured provider.
- **LLM Provider & Endpoint:** Defined in the root `llm_config.json` file (`api_config.provider` and `api_config.base_url`).
- **Model Name:** Uses the default model specified in the root `llm_config.json` (`model_params.defaultModel`). A specific model mapping for `code_refactoring` could be added to `llm_mapping` in `llm_config.json` if needed.
- **Request Timeout:** Configured in the root `llm_config.json` (`api_config.timeout`).
- **Log Level:** Controlled by the `LOG_LEVEL` environment variable (set in the root `.env` file, defaults to `info`). Supported levels: 'fatal', 'error', 'warn', 'info', 'debug', 'trace'.
- **Allowed Context Path:** Context files (`contextFilePath`) are restricted to the `tools/code-refactor-generator/allowed_context/` directory for security. This path is currently hardcoded in `index.js`.

## Basic Usage

The tool is typically invoked programmatically via its exported function.

**Example Function Call (Conceptual):**

```javascript
const { codeRefactorGenerator } = require('./index'); // Adjust path if needed

async function runRefactor() {
  try {
    const result = await codeRefactorGenerator({
      codeToRefactor: 'function oldCode() { console.log("Hello"); }',
      refactoringInstructions: 'Convert this to an arrow function.',
      // contextFilePath: ['tools/code-refactor-generator/allowed_context/example.js'] // Optional context
    });
    console.log('Refactored Code:\n', result);
  } catch (error) {
    console.error('Refactoring failed:', error.message);
  }
}

runRefactor();
```

**Input Parameters:**

- `codeToRefactor` (string, required): The code snippet to be refactored.
- `refactoringInstructions` (string, required): Instructions for the LLM on how to refactor the code.
- `contextFilePath` (string[], optional): An array of file paths (relative to the project root, and must be within `tools/code-refactor-generator/allowed_context/`) to provide additional context to the LLM.

## Limitations

- **LLM Dependency:** The quality and consistency of the refactoring depend heavily on the underlying Large Language Model configured in `llm_config.json`. Results may vary, and the LLM might occasionally produce incorrect or suboptimal code (hallucinations).
- **Cost:** Using this tool will incur costs based on the token usage of the configured LLM provider and model. Monitor usage via the provider's dashboard.
- **Security:**
  - While basic input demarcation is implemented, prompt injection is an ongoing area of research. Avoid passing untrusted or potentially malicious code or instructions to the tool.
  - Ensure the API key in the root `.env` file is kept secure and is not committed to version control.
- **Context Window:** Large code snippets or extensive context files might exceed the LLM's context window limit, potentially leading to errors or incomplete refactoring. Input size limits are in place but may need adjustment based on the specific model used.
- **Complex Refactorings:** Very complex or nuanced refactoring tasks might be beyond the capability of the current LLM or prompt structure.
