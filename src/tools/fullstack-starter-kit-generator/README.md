# Fullstack Starter Kit Generator (`generate-fullstack-starter-kit`)

## Overview

Generates full-stack project starter kits with custom tech stacks. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter                   | Type                     | Description                                       | Required |
| --------------------------- | ------------------------ | ------------------------------------------------- | -------- |
| `use_case`                  | `string`                 | The specific use case for the starter kit         | Yes      |
| `tech_stack_preferences`    | `Record<string, string>` | Optional tech stack preferences                   | No       |
| `request_recommendation`    | `boolean`                | Whether to request recommendations for tech stack | No       |
| `include_optional_features` | `string[]`               | Optional features to include in the starter kit   | No       |

_(Based on the Zod schema defined in `src/server.ts`)_

## Outputs

- **Primary Output:** A structured JSON definition specifying the starter kit's configuration.
- **File Storage:** Multiple artifacts are saved to the configured output directory (default: `workflow-agent-files/`, override with `VIBE_CODER_OUTPUT_DIR` env var):
  - JSON Definition: `[output_dir]/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-definition.json`
  - Shell Script: `[output_dir]/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-setup.sh`
  - Batch Script: `[output_dir]/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-setup.bat`
- **MCP Response:** A formatted report of the generated starter kit configuration.

## Asynchronous Execution

This tool executes asynchronously due to the significant time required for research (if requested) and LLM generation.

1.  When you call this tool, it will immediately return a **Job ID**.
2.  The starter kit generation process runs in the background.
3.  Use the `get-job-result` tool with the received Job ID to retrieve the final confirmation message and details once the job is complete.

## Async Job Submission

When you submit a starter kit generation job with `async: true`, you will receive a response like this:

```
Your request has been received and is being processed as an async job.

Job ID: 123e4567-e89b-12d3-a456-426614174000

Please wait a moment for the task to complete before attempting to retrieve the job result.

To check the status or result of this job, send the following prompt:
```json
{
  "tool_name": "fullstack-starter-kit-job-result",
  "arguments": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```
You can use this prompt in the assistant, API, or Studio to retrieve your job's status or result.

- **Note:** Always wait a moment before polling for the result to ensure the job has time to complete.

## Workflow

When invoked, this tool performs the following steps:

1. **Input Validation:** The incoming parameters are validated.
2. **Initial Analysis:** Performs an initial analysis of the use case and tech stack preferences.
3. **Research Phase (Pre-Generation):**
   - If `request_recommendation` is true:
     - Formulates three specific queries based on the use case:
       - Latest technology stack recommendations
       - Best practices and architectural patterns
       - Modern development tooling and libraries
     - Executes these queries in parallel using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
     - Aggregates the research results into a structured context block.
4. **JSON Generation Phase:**
   - Constructs a prompt including the research context (if available) asking for the starter kit definition in JSON format.
   - Calls the `performDirectLlmCall` utility (`src/utils/llmHelper.ts`) to get the JSON definition directly from the configured LLM (e.g., Gemini).
5. **JSON Validation:**
   - Attempts to parse the LLM response as JSON.
   - Validates it against the `starterKitDefinitionSchema` (Zod schema).
   - If validation fails, returns a detailed error response.
6. **Setup Script Generation:**
   - Generates shell and batch scripts based on the validated JSON definition.
   - These scripts create the project structure, files, and install dependencies.
7. **Output Saving:**
   - Saves the validated JSON definition and both scripts to the filesystem.
8. **Response:** Returns a formatted report of the generated starter kit.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: generate-fullstack-starter-kit] --> B{Input Params Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> C[1. Perform Initial Analysis];
    C --> D{Research Requested?};

    D -- Yes --> E[2a. Call performResearchQuery (Perplexity)];
    D -- No --> F[3. Assemble Main Prompt w/o Research];

    E --> F2[2b. Assemble Main Prompt w/ Research Context];
    F2 --> G2[4. Call performDirectLlmCall (e.g., Gemini)];
    F --> G[4. Call performDirectLlmCall (e.g., Gemini)];

    G2 --> H[5. Parse & Validate JSON Output];
    G --> H;

    H -- Valid --> I[6. Generate Setup Scripts (SH & BAT)];
    H -- Invalid --> HE[Return Validation Error];

    I --> J[7. Save Definition JSON & Scripts];
    J --> K[8. Return Formatted Response via MCP];

    E -- Error --> EE[Log Research Error, Continue w/o Context];
    EE --> F2;
```

## Usage Example

From an MCP client (like Claude Desktop):

```
Generate a fullstack starter kit for a real estate listing website with user authentication, property search, and favoriting features. I prefer React on the frontend and Node.js with Express on the backend, but would like recommendations for other components.
```

## JSON Schema & Scripts

The tool generates a structured definition conforming to a Zod schema (`schema.ts`), which is then used to generate setup scripts (`scripts.ts`). The schema includes:

- `projectName`: Project identifier
- `description`: Detailed project description
- `techStack`: Technology choices with rationale
- `directoryStructure`: Complete file/folder organization
- `dependencies`: Package dependencies by directory
- `setupCommands`: Commands to initialize the project
- `nextSteps`: Follow-up actions after setup

The generated setup scripts (shell and batch) create the defined directory structure, write all files with appropriate content, install dependencies, and run specified setup commands.

## Error Handling

- Handles invalid input parameters.
- Attempts to gracefully handle failures during the research phase.
- Provides detailed validation errors for invalid JSON output.
- Handles script generation failures.
- Handles file saving errors.
- Returns specific error messages via MCP response when failures occur.
