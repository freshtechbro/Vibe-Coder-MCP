# Task List Generator (`generate-task-list`)

## Overview

Creates structured development task lists with dependencies. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter            | Type     | Description                                  | Required |
| -------------------- | -------- | -------------------------------------------- | -------- |
| `productDescription` | `string` | Description of the product                   | Yes      |
| `userStories`        | `string` | User stories to use for task list generation | Yes      |

_(Based on the Zod schema defined in `src/server.ts`)_

## Outputs

- **Primary Output:** A comprehensive development task list in Markdown format, hierarchically organized with dependencies, priorities, and estimations.
- **File Storage:** The generated artifact is saved for historical purposes to the configured output directory (default: `workflow-agent-files/`, override with `VIBE_CODER_OUTPUT_DIR` env var):
  `[output_dir]/task-list-generator/[timestamp]-[sanitized-name]-task-list.md`
- **MCP Response:** The generated content is returned as text content within the MCP `CallToolResult`.

## Asynchronous Execution

This tool executes asynchronously due to the time required for research, initial task generation, and sub-task decomposition via multiple LLM calls.

1.  When you call this tool, it will immediately return a **Job ID**.
2.  The task list generation process runs in the background.
3.  Use the `get-job-result` tool with the received Job ID to retrieve the final task list once the job is complete.

## Async Job Submission

When you submit a task list generation job with `async: true`, you will receive a response like this:

```
Your request has been received and is being processed as an async job.

Job ID: 123e4567-e89b-12d3-a456-426614174000

Please wait a moment for the task to complete before attempting to retrieve the job result.

To check the status or result of this job, send the following prompt:
```json
{
  "tool_name": "task-list-job-result",
  "arguments": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```
You can use this prompt in the assistant, API, or Studio to retrieve your job's status or result.

- **Note:** Always wait a moment before polling for the result to ensure the job has time to complete.

## Workflow

When invoked, this tool performs the following steps:

1. **Input Validation:** The incoming parameters (product description and user stories) are validated.
2. **Research Phase (Pre-Generation):**
   - Formulates three specific queries based on the inputs:
     - Software development lifecycle tasks and milestones for the specific product
     - Task estimation and dependency management best practices
     - Development team structures and work breakdown for similar projects
   - Executes these queries in parallel using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
   - Aggregates the research results into a structured context block.
3. **Prompt Assembly:** Combines the original inputs (product description and user stories) and the gathered research context into a comprehensive prompt for the main generation model.
4. **Generation Phase (High-Level Tasks):**
   - Calls the `performDirectLlmCall` utility (`src/utils/llmHelper.ts`) with the assembled prompt and the task list-specific system prompt (`TASK_LIST_SYSTEM_PROMPT`).
   - This directly uses the configured LLM (e.g., Gemini) to generate the initial high-level task list as Markdown.
   - Includes robust parsing logic (`parseHighLevelTasks` and `extractFallbackTasks`) to handle potential formatting variations in the LLM output.
5. **Decomposition Phase (Sub-Tasks):**
   - For each successfully parsed high-level task, calls `performDirectLlmCall` again with a specific prompt to decompose it into detailed sub-tasks, including estimations and dependencies.
6. **Output Processing & Saving:**
   - Combines the high-level tasks and their decomposed sub-tasks into a final, formatted Markdown document with a title header and timestamp.
   - Saves the task list document to the `workflow-agent-files/task-list-generator/` directory.
7. **Response:** Returns the formatted task list content via the MCP protocol.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: generate-task-list] --> B{Input Params Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> C[1. Formulate Research Queries];
    C --> D[2. Call performResearchQuery (Perplexity)];
    D --> E[3. Assemble Main Prompt (Inputs + Research Context)];
    E --> F[4. Call performDirectLlmCall (High-Level Tasks)];
    F --> Parse{5. Parse High-Level Tasks};
    Parse -->|Error| Fallback[5b. Use Fallback Parser];
    Parse -->|Success| Decomp[6. Loop: Decompose Each Task];
    Fallback --> Decomp;
    Decomp -- For Each Task --> SubTask[6a. Call performDirectLlmCall (Sub-Tasks)];
    SubTask --> Decomp;
    Decomp -- All Done --> Combine[7. Combine & Format Document];
    Combine --> H[8. Save Task List to Output Directory];
    H --> I[7. Return Success Response via MCP];

    D -- Error --> DE[Log Research Error, Continue w/o Context];
    DE --> E;
    F -- Error --> FE[Log Generation Error, Return Error Response];
    H -- Error --> HE[Log Save Error, Continue to Response];
```

## Usage Example

From an MCP client (like Claude Desktop):

```
Generate a task list for developing a mobile app that helps users track their daily water intake. User stories have already been created and include features for tracking intake, setting reminders, and viewing hydration statistics.
```

## System Prompt

The core generation logic uses `performDirectLlmCall` guided by the following system prompt (defined in `index.ts`) for the initial high-level task generation:

```markdown
# Task List Generator System Prompt Snippet

You are an AI assistant expert at generating development task lists for software projects.
Based on the provided product description, user stories, and research context, generate a detailed task list.

## Using Research Context

- Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
- This research contains valuable insights on development lifecycle, task estimation, and team structure.
- Use these insights to inform your task list while keeping the focus on the primary product requirements.
- Pay special attention to the "Development Lifecycle & Milestones" and "Task Estimation & Dependencies" sections...

## Task Template

Each task should include:

- **Task ID**: A unique identifier (T-001, T-002, etc.)
- **Task Title**: Clear, action-oriented title starting with a verb
- **Description**: Explanation of what needs to be done
  ...
```

## Error Handling

- Handles invalid input parameters.
- Attempts to gracefully handle failures during the research phase (logs errors, proceeds without research context).
- Reports errors during the main generation phase.
- Handles potential errors during file saving (typically logs warning and proceeds).
- Returns specific error messages via MCP response when failures occur.
