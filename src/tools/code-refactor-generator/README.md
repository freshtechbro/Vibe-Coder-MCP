# Code Refactor Generator Tool (`code-refactor-generator`)

## Overview

This tool suggests improvements for existing code by calling an LLM.
**Note:** This implementation calls an LLM to generate refactoring suggestions and returns a dynamic text message based on the LLM response.

## Inputs

| Parameter                | Type     | Description                                                              | Required |
| :----------------------- | :------- | :----------------------------------------------------------------------- | :------- |
| `language`               | `string` | The programming language of the code (e.g., 'typescript', 'python').     | Yes      |
| `codeContent`            | `string` | The actual code snippet to be refactored.                                 | Yes      |
| `refactoringInstructions`| `string` | Instructions on how to refactor the code snippet.                         | Yes      |
| `contextFilePath`        | `string` | (Optional) Path to a file for additional context.                         | No       |
| `outputFilePath`         | `string` | (Optional) Path to write the refactored code output.                      | No       |

## Outputs

**Fields:**
- `isError`: `boolean` indicating if an error occurred.
- `content`: `Array<{ type: 'text'; text: string }>` containing suggestions or error messages.
- `errorDetails`: Detailed error information (present when `isError` is `true`).
- If `outputFilePath` is provided and writing fails, `isError` will be `true` and `errorDetails` will describe the file error.

## Asynchronous Execution

This tool currently executes **synchronously** and returns the result directly.

## Async Job Submission

When you submit a code refactor job with `async: true`, you will receive a response like this:

```json
Your request has been received and is being processed as an async job.

Job ID: 123e4567-e89b-12d3-a456-426614174000

Please wait a moment for the task to complete before attempting to retrieve the job result.

To check the status or result of this job, send the following prompt:
```json
{
  "tool_name": "code-refactor-job-result",
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
    A[Start code-refactor-generator] --> B{Validate Input Schema (codeContent, refactoringInstructions, language)};
    B --> |Invalid| Z[Return Error];
    B --> |Valid| C[Log Input Parameters];
    C --> D[Call LLM for Refactoring Suggestions];
    D --> E{Write to outputFilePath?};
    E --> |Yes| F[Write output to file];
    E --> |No| G[Return Dynamic Text Message];
    F --> X[End];
    G --> X[End];
    Z --> X;
```

1. **Validate Input:** The incoming parameters (`codeContent`, `refactoringInstructions`, `language`) are validated.
2. **Log Input:** The validated parameters are logged.
3. **Call LLM:** The LLM is called with the validated parameters to generate refactoring suggestions.
4. **Write to File (Optional):** If `outputFilePath` is provided, the tool attempts to write the refactored code output to the specified file.
5. **Return Result:** A dynamic text message is returned based on the LLM response.

## Usage

To use the Code Refactor Generator, provide the following parameters:

 
- `language`: The programming language of the code snippet (e.g., 'typescript', 'python').
- `codeContent`: The code to be refactored.
- `refactoringInstructions`: Instructions for the refactor.
- `contextFilePath` (optional): Path to a file providing additional context.
- `outputFilePath` (optional): Path to write the refactored code.
- `async` (optional): Set to `true` to run the refactor as an async job.

 
### Example

```typescript
{
  "language": "typescript",
  "codeContent": "function foo() { return 1; }",
  "refactoringInstructions": "Convert to arrow function"
}
```


## Async Job Submission

You can submit a refactor job asynchronously by setting the `async` parameter to `true`.

When you submit an async job, you will receive a message like:


```text
Your request has been received and is being processed as an async job.
Please wait a moment for the task to complete before attempting to retrieve the job result.
To check the status or result of this job, send the following prompt:

code-refactor-job-result {"jobId": "<your-job-id>"}
```


## System Prompt

N/A - The current implementation does not provide a system prompt.

## Error Handling

- **Input Validation Errors:** Returns an error if required inputs (`codeContent`, `refactoringInstructions`, `language`) are missing or invalid according to the schema used in `index.ts`.
