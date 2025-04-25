# PRD Generator (`generate-prd`)

## Overview

Creates comprehensive product requirements documents. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter            | Type     | Description                                    | Required |
| -------------------- | -------- | ---------------------------------------------- | -------- |
| `productDescription` | `string` | Description of the product to create a PRD for | Yes      |

_(Based on the Zod schema defined in `src/server.ts`)_

## Outputs

- **Primary Output:** A comprehensive Product Requirements Document (PRD) in Markdown format.
- **File Storage:** The generated artifact is saved for historical purposes to the configured output directory (default: `workflow-agent-files/`, override with `VIBE_CODER_OUTPUT_DIR` env var):
  `[output_dir]/prd-generator/[timestamp]-[sanitized-name]-prd.md`
- **MCP Response:** The generated content is returned as text content within the MCP `CallToolResult`.

## Asynchronous Execution

This tool executes asynchronously due to the time required for research and LLM generation.

1.  When you call this tool, it will immediately return a **Job ID**.
2.  The PRD generation process runs in the background.
3.  Use the `get-job-result` tool with the received Job ID to retrieve the final PRD content once the job is complete.

## Async Job Submission

When you submit a PRD generation job with `async: true`, you will receive a response like this:

```
Your request has been received and is being processed as an async job.

Job ID: 123e4567-e89b-12d3-a456-426614174000

Please wait a moment for the task to complete before attempting to retrieve the job result.

To check the status or result of this job, send the following prompt:
```json
{
  "tool_name": "prd-generator-job-result",
  "arguments": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```
You can use this prompt in the assistant, API, or Studio to retrieve your job's status or result.

- **Note:** Always wait a moment before polling for the result to ensure the job has time to complete.

## Workflow

When invoked, this tool performs the following steps:

1. **Input Validation:** The incoming product description parameter is validated.
2. **Research Phase (Pre-Generation):**
   - Formulates three specific queries based on the product description:
     - Market analysis and competitive landscape
     - User needs, demographics, and expectations
     - Industry standards, best practices, and common feature sets
   - Executes these queries in parallel using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
   - Aggregates the research results into a structured context block.
3. **Prompt Assembly:** Combines the original product description and the gathered research context into a comprehensive prompt for the main generation model.
4. **Generation Phase:**
   - Calls the `performDirectLlmCall` utility (`src/utils/llmHelper.ts`) with the assembled prompt and the PRD-specific system prompt (`PRD_SYSTEM_PROMPT`).
   - This directly uses the configured LLM (e.g., Gemini) to generate the PRD content as Markdown.
5. **Output Processing & Saving:**
   - Formats the generated Markdown PRD with a title header and timestamp.
   - Saves the PRD document to the `workflow-agent-files/prd-generator/` directory.
6. **Response:** Returns the formatted PRD content via the MCP protocol.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: generate-prd] --> B{Input Params Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> C[1. Formulate Research Queries];
    C --> D[2. Call performResearchQuery (Perplexity)];
    D --> E[3. Assemble Main Prompt (Inputs + Research Context)];
    E --> F[4. Call performDirectLlmCall (e.g., Gemini + System Prompt)];
    F --> G[5. Format PRD Document];
    G --> H[6. Save PRD to Output Directory];
    H --> I[7. Return Success Response via MCP];

    D -- Error --> DE[Log Research Error, Continue w/o Context];
    DE --> E;
    F -- Error --> FE[Log Generation Error, Return Error Response];
    H -- Error --> HE[Log Save Error, Continue to Response];
```

## Usage Example

From an MCP client (like Claude Desktop):

```
Create a PRD for a mobile app that helps users track their daily water intake, send reminders, and visualize their hydration progress over time.
```

## System Prompt

The core generation logic uses `performDirectLlmCall` guided by the following system prompt (defined in `index.ts`):

```markdown
# PRD Generator System Prompt Snippet

You are an AI assistant expert at generating comprehensive Product Requirements Documents (PRDs).
Based on the provided product description and research context, generate a detailed PRD.

**Using Research Context:**

- Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
- Use this research information to inform your output, ensuring it reflects current market trends, user expectations, and industry standards.
- Incorporate relevant insights from the research while keeping the focus on the primary product description.

**PRD Structure:** Include standard sections like:

1.  **Introduction/Overview:** Purpose, Goals (if inferrable).
2.  **Target Audience:** Describe likely users, informed by the research on user demographics.
    ...
```

## Error Handling

- Handles invalid input parameters.
- Attempts to gracefully handle failures during the research phase (logs errors, proceeds without research context).
- Reports errors during the main generation phase.
- Handles potential errors during file saving (typically logs warning and proceeds).
- Returns specific error messages via MCP response when failures occur.
