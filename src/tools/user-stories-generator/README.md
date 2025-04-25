# User Stories Generator (`generate-user-stories`)

## Overview

Creates detailed user stories with acceptance criteria. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter            | Type     | Description                                           | Required |
| -------------------- | -------- | ----------------------------------------------------- | -------- |
| `productDescription` | `string` | Description of the product to create user stories for | Yes      |

_(Based on the Zod schema defined in `src/server.ts`)_

## Outputs

- **Primary Output:** A comprehensive set of user stories in Markdown format, hierarchically organized with acceptance criteria.
- **File Storage:** The generated artifact is saved for historical purposes to the configured output directory (default: `workflow-agent-files/`, override with `VIBE_CODER_OUTPUT_DIR` env var):
  `[output_dir]/user-stories-generator/[timestamp]-[sanitized-name]-user-stories.md`
- **MCP Response:** The generated content is returned as text content within the MCP `CallToolResult`.

## Asynchronous Execution

This tool executes asynchronously due to the time required for research and LLM generation.

1.  When you call this tool, it will immediately return a **Job ID**.
2.  The user stories generation process runs in the background.
3.  Use the `get-job-result` tool with the received Job ID to retrieve the final user stories document once the job is complete.

## Async Job Submission

When you submit a user stories generation job with `async: true`, you will receive a response like this:

```
Your request has been received and is being processed as an async job.

Job ID: 123e4567-e89b-12d3-a456-426614174000

Please wait a moment for the task to complete before attempting to retrieve the job result.

To check the status or result of this job, send the following prompt:
```json
{
  "tool_name": "user-stories-job-result",
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
     - User personas and stakeholders
     - Common user workflows and use cases
     - User experience expectations and pain points
   - Executes these queries in parallel using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
   - Aggregates the research results into a structured context block.
3. **Prompt Assembly:** Combines the original product description and the gathered research context into a comprehensive prompt for the main generation model.
4. **Generation Phase:**
   - Calls the `performDirectLlmCall` utility (`src/utils/llmHelper.ts`) with the assembled prompt and the user stories-specific system prompt (`USER_STORIES_SYSTEM_PROMPT`).
   - This directly uses the configured LLM (e.g., Gemini) to generate the user stories content as Markdown.
5. **Output Processing & Saving:**
   - Formats the generated Markdown user stories with a title header and timestamp.
   - Saves the user stories document to the `workflow-agent-files/user-stories-generator/` directory.
6. **Response:** Returns the formatted user stories content via the MCP protocol.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: generate-user-stories] --> B{Input Params Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> C[1. Formulate Research Queries];
    C --> D[2. Call performResearchQuery (Perplexity)];
    D --> E[3. Assemble Main Prompt (Inputs + Research Context)];
    E --> F[4. Call performDirectLlmCall (e.g., Gemini + System Prompt)];
    F --> G[5. Format User Stories Document];
    G --> H[6. Save User Stories to Output Directory];
    H --> I[7. Return Success Response via MCP];

    D -- Error --> DE[Log Research Error, Continue w/o Context];
    DE --> E;
    F -- Error --> FE[Log Generation Error, Return Error Response];
    H -- Error --> HE[Log Save Error, Continue to Response];
```

## Usage Example

From an MCP client (like Claude Desktop):

```
Generate user stories for a mobile app that helps users track their daily water intake, remind them to drink water, and visualize their hydration progress over time.
```

## System Prompt

The core generation logic uses `performDirectLlmCall` guided by the following system prompt (defined in `index.ts`):

```markdown
# User Stories Generator System Prompt Snippet

You are an AI assistant expert at generating comprehensive and well-structured user stories for software development projects.
Based on the provided product description and research context, generate detailed user stories.

## Using Research Context

- Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
- This research contains valuable insights on user personas, workflows, and expectations.
- Use these insights to inform your user stories while keeping the focus on the primary product requirements.
- Pay special attention to the "User Personas & Stakeholders" and "User Workflows & Use Cases" sections in the research.
  ...

## User Story Template

| Field         | Description                                         |
| ------------- | --------------------------------------------------- |
| User Story ID | A unique identifier (e.g., US-100, US-100.1)        |
| Title         | A concise summary of the user story                 |
| As a          | The user role benefiting from this functionality... |

...
```

## Error Handling

- Handles invalid input parameters.
- Attempts to gracefully handle failures during the research phase (logs errors, proceeds without research context).
- Reports errors during the main generation phase.
- Handles potential errors during file saving (typically logs warning and proceeds).
- Returns specific error messages via MCP response when failures occur.
