# Rules Generator (`generate-rules`)

## Overview

Creates project-specific development rules based on product description. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter            | Type               | Description                                | Required |
| -------------------- | ------------------ | ------------------------------------------ | -------- |
| `productDescription` | `string`           | Description of the product being developed | Yes      |
| `userStories`        | `string`           | Optional user stories to inform the rules  | No       |
| `ruleCategories`     | `array of strings` | Optional categories of rules to generate   | No       |

_(Based on the Zod schema defined in `src/server.ts`)_

## Outputs

- **Primary Output:** A comprehensive set of development rules in Markdown format.
- **File Storage:** The generated artifact is saved for historical purposes to the configured output directory (default: `workflow-agent-files/`, override with `VIBE_CODER_OUTPUT_DIR` env var):
  `[output_dir]/rules-generator/[timestamp]-[sanitized-name]-rules.md`
- **MCP Response:** The generated content is returned as text content within the MCP `CallToolResult`.

## Asynchronous Execution

This tool executes asynchronously due to the time required for research and LLM generation.

1.  When you call this tool, it will immediately return a **Job ID**.
2.  The rules generation process runs in the background.
3.  Use the `get-job-result` tool with the received Job ID to retrieve the final rules document once the job is complete.

## Workflow

When invoked, this tool performs the following steps:

1. **Input Validation:** The incoming parameters are validated against requirements.
2. **Research Phase (Pre-Generation):**
   - Formulates three specific queries based on the inputs:
     - Best development practices and coding standards related to the product
     - Specific rules and guidelines for the requested categories (or common categories if none specified)
     - Modern architecture patterns and file organization for the detected product type
   - Executes these queries in parallel using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
   - Aggregates the research results into a structured context block.
3. **Prompt Assembly:** Combines the original inputs (product description, user stories, requested rule categories) and the gathered research context into a comprehensive prompt for the main generation model.
4. **Generation Phase:**
   - Calls the `performDirectLlmCall` utility (`src/utils/llmHelper.ts`) with the assembled prompt and the rules-specific system prompt (`RULES_SYSTEM_PROMPT`).
   - This directly uses the configured LLM (e.g., Gemini) to generate the rules content as Markdown.
5. **Output Processing & Saving:**
   - Formats the generated Markdown rules with a title header and timestamp.
   - Saves the rules document to the `workflow-agent-files/rules-generator/` directory.
6. **Response:** Returns the formatted rules content via the MCP protocol.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: generate-rules] --> B{Input Params Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> C[1. Formulate Research Queries];
    C --> D[2. Call performResearchQuery (Perplexity)];
    D --> E[3. Assemble Main Prompt (Inputs + Research Context)];
    E --> F[4. Call performDirectLlmCall (e.g., Gemini + System Prompt)];
    F --> G[5. Format Rules Document];
    G --> H[6. Save Rules to Output Directory];
    H --> I[7. Return Success Response via MCP];

    D -- Error --> DE[Log Research Error, Continue w/o Context];
    DE --> E;
    F -- Error --> FE[Log Generation Error, Return Error Response];
    H -- Error --> HE[Log Save Error, Continue to Response];
```

## Usage Example

From an MCP client (like Claude Desktop):

```
Generate development rules for a React Native mobile app that helps users track their fitness activities and nutrition. Focus on code style, architecture patterns, and performance considerations.
```

## System Prompt

The core generation logic uses `performDirectLlmCall` guided by the following system prompt (defined in `index.ts`):

````markdown
# Rules Generator System Prompt Snippet

You are an AI assistant expert at generating development rules for software projects.
Based on the provided product description, user stories (if any), and research context, generate a set of development rules.

## Using Research Context

- Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
- This research contains valuable insights on best practices, common rule categories, and architecture patterns.
- Use these insights to inform your rules while keeping the focus on the primary product requirements.
  ...

## Rule Format

```markdown
# Rule: [Rule Name]

## Description

[Clear description of the rule]
...
```
````

## Error Handling

- Handles invalid input parameters.
- Attempts to gracefully handle failures during the research phase (logs errors, proceeds without research context).
- Reports errors during the main generation phase.
- Handles potential errors during file saving (typically logs warning and proceeds).
- Returns specific error messages via MCP response when failures occur.
