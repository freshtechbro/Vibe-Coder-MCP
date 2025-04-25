import { z } from 'zod';

export interface GitHooksConfig {
  lintStaged: boolean;
  commitlint: boolean;
  prettier: boolean;
  husky: boolean;
}

const configSchema = z.object({
  lintStaged: z.boolean(),
  commitlint: z.boolean(),
  prettier: z.boolean(),
  husky: z.boolean(),
});

export function generateGitHooks(
  config: GitHooksConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: '.husky/pre-commit',
      content: `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

${validatedConfig.lintStaged ? 'pnpm lint-staged' : ''}
${validatedConfig.prettier ? 'pnpm prettier --write .' : ''}`,
    },
    {
      path: '.husky/commit-msg',
      content: `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

${validatedConfig.commitlint ? 'pnpm commitlint --edit $1' : ''}`,
    },
    {
      path: '.lintstagedrc.js',
      content: `
module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint --fix',
    ${validatedConfig.prettier ? "'prettier --write'," : ''}
    'vitest related --run'
  ],
  '*.{json,yml,yaml,md}': [
    ${validatedConfig.prettier ? "'prettier --write'" : ''}
  ]
}`,
    },
    {
      path: '.commitlintrc.js',
      content: `
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'perf',
      'test',
      'chore',
      'revert',
      'ci',
      'build'
    ]],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']]
  }
}`,
    },
  ];
}
