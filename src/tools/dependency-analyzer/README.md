# Dependency Analyzer Tool (`analyze-dependencies`)

## Overview

This tool reads a specified dependency manifest file (like `package.json` or `requirements.txt`) and extracts a list of the project's dependencies (both main and development, where applicable).

## Inputs

| Parameter  | Type     | Description                                                                                                          | Required |
| :--------- | :------- | :------------------------------------------------------------------------------------------------------------------- | :------- |
| `filePath` | `string` | The relative path to the dependency manifest file (e.g., 'package.json', 'client/package.json', 'requirements.txt'). | Yes      |

## Outputs

- **Primary Output:** A formatted string listing the dependencies found in the file, typically separated into main and development dependencies if the format supports it (like `package.json`). This string is returned within the `CallToolResult.content` array (type `text`).
- **File Storage:** This tool does not save any files.

## Workflow

```mermaid
flowchart TD
    A[Start analyze-dependencies] --> B{Validate Input Schema};
    B --> |Invalid| Z[Return Error];
    B --> |Valid| C[Read Manifest File Content];
    C --> |Error Reading| Z;
    C --> |Success| D{Parse File Content};
    D --> |JSON Error (e.g., package.json)| Z;
    D --> |Success (JSON)| E[Extract 'dependencies' & 'devDependencies'];
    D --> |Success (Plain Text, e.g., requirements.txt)| F[Extract dependencies line-by-line];
    E --> G[Format Dependency List (Main & Dev)];
    F --> H[Format Dependency List (Simple)];
    G --> I[Return Success with Formatted List];
    H --> I;
    I --> X[End];
    Z --> X;
```

1.  **Validate Input:** The `filePath` parameter is validated.
2.  **Read File:** The tool attempts to read the content of the file specified by `filePath`. If the file cannot be read, an error is returned.
3.  **Parse Content:**
    - If the file is likely JSON (e.g., `package.json`), it's parsed as JSON. Dependencies are extracted from `dependencies` and `devDependencies` objects.
    - If the file is likely plain text (e.g., `requirements.txt`), it's processed line by line, potentially filtering out comments or blank lines.
    - If parsing fails (invalid JSON, unexpected format), an error is returned.
4.  **Format Output:** The extracted dependencies are formatted into a human-readable string, potentially categorizing them (e.g., "Dependencies:", "Dev Dependencies:").
5.  **Return Result:** A successful `CallToolResult` containing the formatted dependency list string is returned.

## Usage Example

```json
{
  "tool_name": "analyze-dependencies",
  "arguments": {
    "filePath": "package.json"
  }
}
```

Invoked via AI Assistant:
`"Analyze dependencies in package.json"` or `"List the packages in requirements.txt"`

## Error Handling

- **Input Validation Errors:** Returns an error if `filePath` is missing.
- **File Not Found/Read Errors:** Returns an error if the specified `filePath` does not exist or cannot be read.
- **Parsing Errors:** Returns an error if the file content is not valid for the expected format (e.g., invalid JSON for `package.json`).
- **Format Errors:** Returns an error if the manifest file format is recognized but dependencies cannot be extracted (e.g., missing `dependencies` key in `package.json`).
