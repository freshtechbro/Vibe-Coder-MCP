import { z } from 'zod';

import logger from '../../logger.js';
import {
  toolRegistry,
  ToolExecutionContext,
} from '../../services/routing/toolRegistry.js';
import { ToolDefinition, ToolResult } from '../../types/tools.js';
import { generateAsyncJobMessage } from '../../utils/jobMessages.js';
import { jobManager } from '../../services/job-manager/index.js';

const prdInputSchema = z.object({
  productDescription: z.string().min(10),
  research: z.string().optional(),
  async: z.boolean().optional(),
});

async function generatePRD(
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const input = prdInputSchema.parse(params);
    const prd = `# Product Requirements Document

## Overview
${input.productDescription}

${input.research ? `## Research\n${input.research}` : ''}

## Requirements
1. Feature A
2. Feature B
3. Feature C

## Timeline
- Phase 1: Planning
- Phase 2: Development
- Phase 3: Testing
- Phase 4: Launch
`;

    if (params.async === true) {
      const jobId = jobManager.createJob();
      // --- Use shared utility for async job message ---
      const message = generateAsyncJobMessage({
        jobId,
        toolName: 'prd-generator',
      });
      return {
        isError: false,
        content: [{ type: 'text', text: message }],
        metadata: { jobId },
      };
    }

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: prd,
        },
      ],
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Error generating PRD');
    return {
      isError: true,
      content: [{ type: 'text', text: `Error generating PRD: ${error instanceof Error ? error.message : String(error)}` }],
      errorDetails: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

// Export the function for testing
export { generatePRD };

export const PRD_SYSTEM_PROMPT = `You are an AI assistant expert at generating comprehensive Product Requirements Documents (PRDs).
Based on the provided product description and research context, generate a detailed PRD.

**Using Research Context:**
* Carefully consider the Pre-Generation Research Context included in the main task prompt.
* Use this research information to inform your output, ensuring it reflects current market trends, user expectations, and industry standards.
* Incorporate relevant insights from the research while keeping the focus on the primary product description.

**PRD Structure:** Include standard sections like:
1. Introduction/Overview
2. Target Audience
3. Requirements
4. Timeline
`;

export const prdGenerator: ToolDefinition = {
  name: 'prd-generator',
  description:
    'Drafts a Product Requirements Document (PRD) from a description.',
  inputSchema: prdInputSchema.shape,
  execute: generatePRD,
};
