import { z } from 'zod';

export interface VSCodeConfig {
  typescript: boolean;
  prettier: boolean;
  eslint: boolean;
  debug: boolean;
}

const configSchema = z.object({
  typescript: z.boolean(),
  prettier: z.boolean(),
  eslint: z.boolean(),
  debug: z.boolean(),
});

export function generateVSCodeConfig(
  config: VSCodeConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: '.vscode/settings.json',
      content: `{
  ${
    validatedConfig.typescript
      ? `
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,`
      : ''
  }
  ${
    validatedConfig.prettier
      ? `
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,`
      : ''
  }
  ${
    validatedConfig.eslint
      ? `
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],`
      : ''
  }
  "files.eol": "\\n",
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true
}`,
    },
    {
      path: '.vscode/extensions.json',
      content: `{
  "recommendations": [
    ${validatedConfig.typescript ? '"dbaeumer.vscode-eslint",' : ''}
    ${validatedConfig.prettier ? '"esbenp.prettier-vscode",' : ''}
    ${validatedConfig.eslint ? '"dbaeumer.vscode-eslint",' : ''}
    "editorconfig.editorconfig"
  ]
}`,
    },
    {
      path: '.vscode/launch.json',
      content: `{
  "version": "0.2.0",
  "configurations": [
    ${
      validatedConfig.debug
        ? `{
      "type": "node",
      "request": "launch",
      "name": "Debug API",
      "skipFiles": ["<node_internals>/**"],
      "program": "\${workspaceFolder}/apps/backend/src/index.ts",
      "outFiles": ["\${workspaceFolder}/apps/backend/dist/**/*.js"],
      "preLaunchTask": "build-api"
    },
    {
      "type": "chrome",
      "request": "launch",
      "name": "Debug Web",
      "url": "http://localhost:3000",
      "webRoot": "\${workspaceFolder}/apps/frontend",
      "sourceMapPathOverrides": {
        "webpack:///src/*": "\${webRoot}/src/*"
      }
    }`
        : ''
    }
  ]
}`,
    },
  ];
}
