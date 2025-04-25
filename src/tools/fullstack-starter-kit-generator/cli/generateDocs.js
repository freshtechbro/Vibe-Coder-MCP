// generateDocs.js
// Minimal, atomic doc generation and safe write integration for Fullstack Starter Kit Generator.

import { z } from 'zod';
/**
 * import { writeGeneratedFile } from './utils/writeGeneratedFile.js';
 */

const docsSchema = z.object({
  name: z.string(),
  description: z.string(),
  features: z.array(z.string()),
  dependencies: z.array(z.string()),
  devDependencies: z.array(z.string()),
  scripts: z.record(z.string()),
});

/**
 * Generate documentation for the project
 * @param {object} config - Project configuration
 * @returns {Promise<void>}
 */
export async function generateDocs(config) {
  /*
  const validatedConfig = docsSchema.parse(config);

  const readmeContent = `# ${validatedConfig.name}

${validatedConfig.description}

## Features

${validatedConfig.features.map(feature => `- ${feature}`).join('\n')}

## Dependencies

${validatedConfig.dependencies.map(dep => `- ${dep}`).join('\n')}

## Dev Dependencies

${validatedConfig.devDependencies.map(dep => `- ${dep}`).join('\n')}

## Scripts

${Object.entries(validatedConfig.scripts)
  .map(([name, script]) => `- \`${name}\`: ${script}`)
  .join('\n')}

## Getting Started

1. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

2. Start development server:
   \`\`\`bash
   pnpm dev
   \`\`\`

## Build

To build the project:

\`\`\`bash
pnpm build
\`\`\`

## Test

To run tests:

\`\`\`bash
pnpm test
\`\`\`
`;

  await writeGeneratedFile('README.md', readmeContent);
  */
  console.warn('Documentation generation logic removed from CLI.');
}
