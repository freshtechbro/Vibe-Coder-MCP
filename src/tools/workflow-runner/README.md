# Workflow Runner Tool (`run-workflow`)

## Overview

This tool executes a predefined sequence of tool calls, known as a workflow, based on definitions stored in the `workflows.json` file. It allows automating complex, multi-step tasks by orchestrating other tools within the Vibe Coder MCP server.

## Inputs

| Parameter       | Type                           | Description                                                                                                                                                                          | Required |
| :-------------- | :----------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------- |
| `workflowName`  | `string`                       | The name of the workflow to execute, corresponding to a key in the `workflows.json` file's `workflows` object.                                                                       | Yes      |
| `workflowInput` | `object` (Record<string, any>) | Optional. An object containing input data for the workflow. Keys and values depend on the specific workflow definition and how its steps reference `{workflow.input.key}` templates. | No       |

_Note: While `workflowInput` is optional in the schema, most workflows will require specific inputs defined within this object to function correctly._

## Outputs

- **Primary Output:** A summary message indicating the success or failure of the workflow execution. If the workflow definition includes an `output` template, the resolved output object might also be included or summarized in the message. This is returned within the `CallToolResult.content` array (type `text`).
- **File Storage:** This tool itself does not save files. However, the individual tools _called within_ the workflow might save files to their respective directories under `workflow-agent-files/`.
- **Error Details:** If the workflow fails, the `CallToolResult` will have `isError: true` and may include `errorDetails` specifying the step and reason for failure.

## Asynchronous Execution

This tool executes asynchronously because it orchestrates multiple steps, some of which may themselves be long-running asynchronous tools.

1.  When you call `run-workflow`, it will immediately return a **Job ID**.
2.  The entire workflow execution process runs in the background, managed by the `WorkflowExecutor` service.
3.  Use the `get-job-result` tool with the received Job ID to retrieve the final outcome (success message or error details) once the entire workflow job is complete.

## Async Job Submission

When you submit a workflow run with `async: true`, you will receive a response like this:

```
Your request has been received and is being processed as an async job.

Job ID: 123e4567-e89b-12d3-a456-426614174000

Please wait a moment for the task to complete before attempting to retrieve the job result.

To check the status or result of this job, send the following prompt:
```json
{
  "tool_name": "workflow-runner-job-result",
  "arguments": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```
You can use this prompt in the assistant, API, or Studio to retrieve your job's status or result.

- **Note:** Always wait a moment before polling for the result to ensure the job has time to complete.

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

- **Input Validation Errors:** Returns an error if `workflowName` is missing or `workflowInput` is not an object (if provided).
- **Workflow Not Found:** Returns an error if the specified `workflowName` does not exist in the loaded `workflows.json`.
- **Parameter Resolution Errors:** Returns an error if a template string in a step's `params` cannot be resolved (e.g., missing input key, invalid path, previous step failed or didn't produce expected output).
- **Tool Execution Errors:** If any tool executed within a step fails, the workflow stops, and an error result is returned, indicating the failed step and tool, along with the error details from the failed tool.
- **Configuration Errors:** Errors during the initial loading of `workflows.json` (logged at server start) will prevent any workflows from running.

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
