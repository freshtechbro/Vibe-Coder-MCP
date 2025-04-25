import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import { ToolExecutionContext } from '../../../services/routing/toolRegistry.js';
import { ToolResult } from '../../../types/tools.js';
import { BaseHandler, HandlerConfig } from '../base-handler.js';

class TestHandler extends BaseHandler {
  constructor() {
    const config: HandlerConfig = {
      name: 'test-handler',
      description: 'A test handler',
      inputSchema: {
        testParam: z.string(),
      },
    };
    super(config);
  }

  protected async execute(
    params: Record<string, unknown>,
    _config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    return {
      content: [
        {
          type: 'text',
          text: `Executed with param: ${params.testParam}`,
        },
      ],
    };
  }
}

describe('BaseHandler', () => {
  it('should validate input parameters', async () => {
    const handler = new TestHandler();
    const result = await handler.handle(
      { testParam: 'test' },
      {},
      { sessionId: 'test-session' }
    );

    expect(result.content[0].text).toBe('Executed with param: test');
    expect(result.isError).toBeUndefined();
  });

  it('should handle invalid input parameters', async () => {
    const handler = new TestHandler();
    const result = await handler.handle(
      { testParam: 123 }, // Invalid type
      {},
      { sessionId: 'test-session' }
    );

    expect(result.isError).toBe(true);
    expect(result.errorDetails).toBeDefined();
    expect(result.errorDetails).toEqual(
      expect.objectContaining({
        code: 'HANDLER_ERROR',
      })
    );
  });

  it('should provide handler metadata', () => {
    const handler = new TestHandler();
    const metadata = handler.getMetadata();

    expect(metadata.name).toBe('test-handler');
    expect(metadata.description).toBe('A test handler');
    expect(metadata.inputSchema).toBeDefined();
  });
});
