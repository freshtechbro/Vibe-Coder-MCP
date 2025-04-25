# Code Stub Generator Tool (`generate-code-stub`)

## Overview

This tool generates basic code structures (stubs or boilerplate) like functions, classes, interfaces, etc., in a specified programming language. It takes a description of the desired structure and uses an LLM to generate the code. It can optionally use the content of an existing file as additional context for the generation process.

## Inputs

| Parameter         | Type                                                         | Description                                                                                                    | Required |
| :---------------- | :----------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- | :------- |
| `language`        | `string`                                                     | The programming language for the stub (e.g., 'typescript', 'python', 'javascript').                            | Yes      |
| `stubType`        | `enum('function', 'class', 'interface', 'method', 'module')` | The type of code structure to generate.                                                                        | Yes      |
| `name`            | `string`                                                     | The name of the function, class, interface, etc.                                                               | Yes      |
| `description`     | `string`                                                     | Detailed description of what the stub should do, including its purpose, parameters, return values, etc.        | Yes      |
| `parameters`      | `array` (of `paramSchema`)                                   | Optional. For functions/methods: list of parameters (`{ name: string, type?: string, description?: string }`). | No       |
| `returnType`      | `string`                                                     | Optional. For functions/methods: the expected return type string.                                              | No       |
| `classProperties` | `array` (of `paramSchema`)                                   | Optional. For classes: list of properties (`{ name: string, type?: string, description?: string }`).           | No       |
| `methods`         | `array` (of `methodSchema`)                                  | Optional. For classes/interfaces: list of method signatures (`{ name: string, description?: string }`).        | No       |
| `contextFilePath` | `string`                                                     | Optional. Relative path to a file whose content should be used as additional context for generation.           | No       |
| `outputFilePath`  | `string`                                                     | Optional. Relative path to save the generated code stub to a file.                                             | No       |

## Outputs

- **Primary Output:** The generated Job ID for the stub generation request, returned in the initial response's `content` array (type `text`).
- **Retrieval:** Use the `get-job-result` tool with the received Job ID to retrieve the generated code stub. The stub is returned in the `content` array (type `text`) of the `get-job-result` response.
- **File Storage:** If `outputFilePath` is provided, the generated stub is also written to the specified file. Otherwise, no file is saved.

## Asynchronous Execution

This tool executes asynchronously due to the potential time required for LLM processing.

1. When you call this tool, it will immediately return a **Job ID**.
2. The code generation process runs in the background.
3. Use the `get-job-result` tool with the received Job ID to retrieve the final code stub once the job is complete.

## Async Job Submission

When you submit a code stub generation job with `async: true`, you will receive a response like this:

```
Your request has been received and is being processed as an async job.

Job ID: 123e4567-e89b-12d3-a456-426614174000

Please wait a moment for the task to complete before attempting to retrieve the job result.

To check the status or result of this job, send the following prompt:
```json
{
  "tool_name": "code-stub-job-result",
  "arguments": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```
You can use this prompt in the assistant, API, or Studio to retrieve your job's status or result.
```

- **Note:** Always wait a moment before polling for the result to ensure the job has time to complete.

## Workflow

```mermaid
flowchart TD
    Start[Receive Request] --> Validation{Validate Input Schema}

    Validation -->|Invalid| ErrorResponse[Return Validation Error]
    ErrorResponse --> End

    Validation -->|Valid| Context{Context File Path?}

    Context -->|Yes| ReadFile[Read Context File]
    ReadFile -->|Error| FileError[Log Error & Continue]
    ReadFile -->|Success| BuildPromptCtx[Build Prompt with Context]
    FileError --> BuildPromptNoCtx[Build Prompt without Context]
    Context -->|No| BuildPromptNoCtx

    BuildPromptCtx --> CallLLM[Call LLM (e.g., Gemini)]
    BuildPromptNoCtx --> CallLLM

    CallLLM -->|Error| LLMError[Return LLM Error]
    LLMError --> End

    CallLLM -->|Success| ExtractCode[Extract Code from Response]
    ExtractCode --> FormatCode[Format Code (Trim)]
    FormatCode --> SuccessResponse[Return Success Response]
    SuccessResponse --> End
```

1. **Validate Input:** The incoming parameters are validated against the `codeStubInputSchema`. If validation fails, an error is returned.
2. **Read Context (Optional):** If `contextFilePath` is provided, the tool attempts to read the content of the specified file using the `fileReader` utility. If the file cannot be read, the error is logged, and the process continues without context.
3. **Build Prompt:** A detailed prompt is constructed for the LLM, including:
    - The target `language`, `stubType`, `name`, and `description`.
    - Any provided `parameters`, `returnType`, `classProperties`, or `methods`.
    - The content read from `contextFilePath` (if provided and successful).
    - Instructions asking the LLM to generate only the code stub according to the specifications.
4. **Call LLM:** The constructed prompt is sent to the configured LLM (e.g., Gemini via OpenRouter).
5. **Process Response:** The code generated by the LLM is extracted from the response. Basic formatting (like trimming whitespace) is applied.
6. **Return Result:** A successful `CallToolResult` containing the generated code string is returned.

## Usage Examples

### Generate a TypeScript Function

```json
{
  "tool_name": "generate-code-stub",
  "arguments": {
    "language": "typescript",
    "stubType": "function",
    "name": "getUserProfile",
    "description": "Fetches a user profile from an API based on userId. Should handle potential errors.",
    "parameters": [{ "name": "userId", "type": "string" }],
    "returnType": "Promise<UserProfile | null>"
  }
}
```

Invoked via AI Assistant:
`"Generate a typescript function stub named getUserProfile that takes a userId string and returns a Promise<UserProfile | null>"`

### Generate a Python Class

```json
{
  "tool_name": "generate-code-stub",
  "arguments": {
    "language": "python",
    "stubType": "class",
    "name": "DataProcessor",
    "description": "A class to process data streams, including methods for loading and transforming data.",
    "classProperties": [
      {
        "name": "source",
        "type": "str",
        "description": "The source of the data stream"
      }
    ],
    "methods": [
      { "name": "load_data", "description": "Loads data from the source" },
      {
        "name": "transform_data",
        "description": "Applies transformations to the loaded data"
      }
    ]
  }
}
```

Invoked via AI Assistant:
`"Generate a python class stub named DataProcessor with a source property and methods load_data and transform_data"`

## System Prompt Excerpt

The LLM prompt is constructed dynamically based on the inputs, conceptually similar to:

```text
You are an expert code generator. Generate ONLY the code stub as requested below,
without any explanations, comments (unless requested in the description), or markdown formatting.

Language: {{language}}
Stub Type: {{stubType}}
Name: {{name}}
Description: {{description}}
{{#if parameters}}Parameters: {{parameters_formatted}}{{/if}}
{{#if returnType}}Return Type: {{returnType}}{{/if}}
{{#if classProperties}}Properties: {{properties_formatted}}{{/if}}
{{#if methods}}Methods: {{methods_formatted}}{{/if}}
{{#if contextFileContent}}
Additional Context from file {{contextFilePath}}:
---
{{contextFileContent}}
---
{{/if}}

Generate the code stub now:
```

## Error Handling

- **Input Validation Errors:** Returns a structured error if required inputs are missing or invalid according to the schema.
- **File Read Errors:** Logs an error if `contextFilePath` is provided but the file cannot be read, but continues generation without context.
- **LLM API Errors:** Returns a structured error if the call to the OpenRouter API fails (e.g., network issue, invalid API key).
- **LLM Response Parsing Errors:** Returns a structured error if the LLM response is malformed or the code cannot be extracted.
