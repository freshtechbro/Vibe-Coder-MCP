# Job Result Retriever Tool (`get-job-result`)

## Overview

This tool retrieves the final result of an asynchronous background job that was previously initiated by another tool (like `generate-task-list`, `run-workflow`, etc.).

## Inputs

| Parameter | Type     | Description                                      | Required |
| :-------- | :------- | :----------------------------------------------- | :------- |
| `jobId`   | `string` | The unique ID of the job whose result is needed. | Yes      |

## Outputs

- **Primary Output:** The `CallToolResult` object that was stored by the background job upon its completion or failure. This could contain the final generated content (e.g., task list, code snippet) or error details.
- **File Storage:** This tool does not save any files itself; it retrieves results potentially saved by other tools.

## Workflow

```mermaid
flowchart TD
    A[Start get-job-result] --> B{Validate Input Schema};
    B --> |Invalid| Z[Return Error: Invalid Job ID Format];
    B --> |Valid| C[Get JobManager Instance];
    C --> D[Call jobManager.getJob(jobId)];
    D --> E{Job Found?};
    E --> |No| F[Return Error: Job Not Found];
    E --> |Yes| G{Job Status?};
    G -- PENDING/RUNNING --> H[Return Info: Job Still Processing];
    G -- COMPLETED/FAILED --> I[Return Stored Job Result (Success or Error)];
    F --> X[End];
    H --> X;
    I --> X;
    Z --> X;
```

1.  **Validate Input:** The `jobId` parameter is validated.
2.  **Get Job Manager:** Retrieves the singleton instance of the `JobManager` service.
3.  **Retrieve Job:** Calls `jobManager.getJob(jobId)` to fetch the job's state.
4.  **Check Status:**
    - If the job is not found, returns an error.
    - If the job status is `PENDING` or `RUNNING`, returns an informational message indicating the job is still in progress.
    - If the job status is `COMPLETED` or `FAILED`, retrieves the stored `result` (which is a `CallToolResult` object) from the job record.
5.  **Return Result:** Returns the stored `CallToolResult` from the completed/failed job.

## Usage Example

```json
{
  "tool_name": "get-job-result",
  "arguments": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```

Invoked via AI Assistant (after getting a Job ID from another tool):
`"Get the result for job ID 123e4567-e89b-12d3-a456-426614174000"`

## Error Handling

- **Input Validation Errors:** Returns an error if `jobId` is missing or not a string.
- **Job Not Found:** Returns an error if no job exists with the provided `jobId`.
- **Job Still Processing:** Returns an informational message (not strictly an error) if the job is still `PENDING` or `RUNNING`.
