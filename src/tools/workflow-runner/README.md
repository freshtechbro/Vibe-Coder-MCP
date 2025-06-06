# Workflow Runner (`run-workflow`)

## Overview

The Workflow Runner orchestrates complex, multi-step development workflows by executing predefined sequences of tool calls. It enables automation of complete development processes, from project planning through implementation, by intelligently chaining together other Vibe Coder tools with dynamic parameter resolution and comprehensive error handling.

**Core Capabilities:**
- **Multi-Tool Orchestration**: Seamlessly chains multiple tools in predefined sequences
- **Dynamic Parameter Resolution**: Template-based parameter resolution using workflow inputs and step outputs
- **Asynchronous Processing**: Job-based execution with real-time status tracking and progress monitoring
- **Error Resilience**: Comprehensive error handling with step-level failure reporting and recovery
- **Configuration-Driven**: Flexible workflow definitions via JSON configuration files
- **Template System**: Powerful templating for parameter passing between workflow steps
- **Integration Ready**: Works with all Vibe Coder tools for complete automation

## Architecture

The Workflow Runner implements a sophisticated orchestration engine:

```mermaid
flowchart TD
    subgraph "Workflow Execution"
        A1[Load Workflow Definition] --> A2[Validate Inputs]
        A2 --> A3[Initialize Step Context]
        A3 --> A4[Execute Step Sequence]
        A4 --> A5[Process Final Output]
    end

    subgraph "Step Processing"
        B1[Resolve Parameters] --> B2[Execute Tool]
        B2 --> B3[Store Results]
        B3 --> B4[Check for Errors]
        B4 --> B5[Continue/Stop]
    end

    subgraph "Template Resolution"
        C1[Parse Templates] --> C2[Resolve Workflow Inputs]
        C2 --> C3[Resolve Step Outputs]
        C3 --> C4[Validate Resolution]
    end

    A4 --> B1
    B1 --> C1
    B5 --> A4
```

## Configuration

### Claude Desktop MCP Client Setup

Add this configuration to your `claude_desktop_config.json` file:

```json
"vibe-coder-mcp": {
  "command": "node",
  "args": ["--max-old-space-size=4096", "/path/to/your/Vibe-Coder-MCP/build/index.js"],
  "cwd": "/path/to/your/Vibe-Coder-MCP",
  "transport": "stdio",
  "env": {
    "LLM_CONFIG_PATH": "/path/to/your/Vibe-Coder-MCP/llm_config.json",
    "LOG_LEVEL": "debug",
    "NODE_ENV": "production",
    "VIBE_CODER_OUTPUT_DIR": "/path/to/your/Vibe-Coder-MCP/VibeCoderOutput"
  },
  "disabled": false,
  "autoApprove": [
    "run-workflow",
    "research",
    "generate-prd",
    "generate-user-stories",
    "generate-task-list",
    "generate-rules",
    "generate-fullstack-starter-kit",
    "get-job-result"
  ]
}
```

### Environment Variables

#### Core Configuration
- **`LLM_CONFIG_PATH`**: Path to LLM model configuration file
- **`VIBE_CODER_OUTPUT_DIR`**: Directory where workflow outputs are saved
- **`LOG_LEVEL`**: Logging verbosity for workflow execution
- **`NODE_ENV`**: Runtime environment

#### Workflow-Specific Settings
- **`WORKFLOW_CONFIG_PATH`**: Path to workflows.json file (default: ./workflows.json)
- **`WORKFLOW_EXECUTION_TIMEOUT_MS`**: Maximum workflow execution time (default: 300000)
- **`WORKFLOW_STEP_TIMEOUT_MS`**: Maximum step execution time (default: 60000)
- **`WORKFLOW_RETRY_ATTEMPTS`**: Number of retry attempts for failed steps (default: 1)

## Inputs

| Parameter       | Type                        | Description                                                                                                | Required |
| :-------------- | :-------------------------- | :--------------------------------------------------------------------------------------------------------- | :------- |
| `workflowName`  | `string`                    | The name of the workflow to execute, corresponding to a key in the `workflows.json` file's `workflows` object. | Yes      |
| `workflowInput` | `object` (Record<string, any>) | Optional. An object containing input data for the workflow. Keys and values depend on the specific workflow definition and how its steps reference `{workflow.input.key}` templates. | No       |

*Note: While `workflowInput` is optional in the schema, most workflows will require specific inputs defined within this object to function correctly.*

## Outputs

*   **Primary Output:** A summary message indicating the success or failure of the workflow execution. If the workflow definition includes an `output` template, the resolved output object might also be included or summarized in the message. This is returned within the `CallToolResult.content` array (type `text`).
*   **File Storage:** This tool itself does not save files. However, the individual tools *called within* the workflow might save files to their respective directories under `VibeCoderOutput/`.
*   **Error Details:** If the workflow fails, the `CallToolResult` will have `isError: true` and may include `errorDetails` specifying the step and reason for failure.

## Asynchronous Execution

This tool executes asynchronously because it orchestrates multiple steps, some of which may themselves be long-running asynchronous tools.
1.  When you call `run-workflow`, it will immediately return a **Job ID**.
2.  The entire workflow execution process runs in the background, managed by the `WorkflowExecutor` service.
3.  Use the `get-job-result` tool with the received Job ID to retrieve the final outcome (success message or error details) once the entire workflow job is complete.

## Workflow

```mermaid
flowchart TD
    A[Start run-workflow] --> B{Validate Input Schema (workflowName, workflowInput)};
    B --> |Invalid| Z[Return Error];
    B --> |Valid| C[Retrieve Workflow Definition from loadedWorkflows using workflowName];
    C --> |Not Found| Z[Return Error: Workflow Not Found];
    C --> |Found| D[Initialize Step Outputs Map];
    D --> E{Loop Through Workflow Steps};
    E --> |Next Step| F[Resolve Step Parameters using workflowInput & previous Step Outputs];
    F --> |Resolve Error| Z[Return Error: Parameter Resolution Failed];
    F --> |Resolved| G[Execute Tool for Step via ToolRegistry];
    G --> |Tool Error| H[Store Error Result in Step Outputs];
    H --> Z[Return Error: Step Failed];
    G --> |Tool Success| I[Store Success Result in Step Outputs];
    I --> E;
    E --> |Finished Steps| J{Process Final Output Template?};
    J --> |Yes| K[Resolve Output Template using Step Outputs];
    K --> |Resolve Error| L[Log Warning, Continue];
    K --> |Resolved| M[Prepare Final Success Message/Output];
    J --> |No| M;
    L --> M;
    M --> N[Return Success Result];
    N --> X[End];
    Z --> X;
```

1.  **Validate Input:** The `workflowName` and `workflowInput` parameters are validated.
2.  **Load Workflow Definition:** The tool retrieves the pre-loaded workflow definition matching `workflowName` from the `loadedWorkflows` map (populated by `loadWorkflowDefinitions` at server start). If not found, an error is returned.
3.  **Initialize State:** An empty map (`stepOutputs`) is created to store the results of each step.
4.  **Iterate Through Steps:** The tool loops through each `step` defined in the workflow's `steps` array.
5.  **Resolve Parameters:** For the current step, it iterates through the `params` defined in the workflow step. It uses the `resolveParamValue` function to replace template strings (like `{workflow.input.someKey}` or `{steps.previousStepId.output.content[0].text}`) with actual values from the initial `workflowInput` or the results stored in `stepOutputs` from previous steps. If a required parameter cannot be resolved, the workflow fails.
6.  **Execute Tool:** The `executeTool` function from the `ToolRegistry` is called with the resolved parameters for the current step's `toolName`.
7.  **Store Result:** The `CallToolResult` from the executed tool is stored in the `stepOutputs` map, keyed by the step's `id`.
8.  **Check for Step Error:** If the `stepResult.isError` is true, the workflow execution stops immediately, and an error result is returned, indicating which step failed.
9.  **Process Final Output (Optional):** After all steps complete successfully, if the workflow definition has an `output` template, the tool attempts to resolve its values using `resolveParamValue` against the `stepOutputs`.
10. **Return Result:** A successful `CallToolResult` is returned, containing a summary message and potentially the resolved final output data.

## Usage Example

```json
{
  "tool_name": "run-workflow",
  "arguments": {
    "workflowName": "newFeatureSetup",
    "workflowInput": {
      "featureName": "User Authentication",
      "featureType": "Core Security"
    }
  }
}
```

Invoked via AI Assistant:
`"Run the newFeatureSetup workflow for 'User Authentication'"` (Assuming the AI can map the request to the correct `workflowInput` structure).

## Error Handling

*   **Input Validation Errors:** Returns an error if `workflowName` is missing or `workflowInput` is not an object (if provided).
*   **Workflow Not Found:** Returns an error if the specified `workflowName` does not exist in the loaded `workflows.json`.
*   **Parameter Resolution Errors:** Returns an error if a template string in a step's `params` cannot be resolved (e.g., missing input key, invalid path, previous step failed or didn't produce expected output).
*   **Tool Execution Errors:** If any tool executed within a step fails, the workflow stops, and an error result is returned, indicating the failed step and tool, along with the error details from the failed tool.
*   **Configuration Errors:** Errors during the initial loading of `workflows.json` (logged at server start) will prevent any workflows from running.

## Configuration and Troubleshooting

### Workflow Definition Location

The `workflows.json` file must be located in the root directory of the project (same level as package.json). The server expects to find it at `process.cwd() + '/workflows.json'`.

### Common Issues

- **"Workflow Not Found" Error**: Verify that:
  - The `workflows.json` file exists in the root directory
  - The file has valid JSON syntax with proper commas between properties
  - The workflow name you're calling matches exactly (case-sensitive)

- **Parameter Resolution Errors**: Ensure template strings in workflow step parameters are correctly formatted:
  - For workflow inputs: `{workflow.input.paramName}`
  - For previous step outputs: `{steps.stepId.output.content[0].text}`
