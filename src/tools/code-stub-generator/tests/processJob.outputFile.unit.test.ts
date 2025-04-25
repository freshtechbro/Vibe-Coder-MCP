import path from 'path';
import { promises as fs } from 'fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createJob } from '../services/jobStore.js';
import { processJob } from '../index.js';
import { performDirectLlmCall } from '../../../utils/llmHelper.js';
import type { CodeStubInput } from '../schema.js';
import type { McpConfig } from '../../../types/config.js';

vi.mock('../../../utils/configLoader.js', () => ({
  loadLlmConfigMapping: vi.fn(() => ({})),
}));
vi.mock('../utils/contextHandler.js', () => ({
  readContextFile: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn(),
}));

const baseConfig: McpConfig = {
  env: { OPENROUTER_API_KEY: 'key', OPENROUTER_BASE_URL: 'url' },
  llm: { defaultModel: 'm', defaultTemperature: 0.1, maxTokens: 10 },
};

describe('processJob outputFilePath unit', () => {
  const input: CodeStubInput = {
    name: 'fn',
    description: 'desc',
    language: 'javascript',
    stubType: 'function',
    outputFilePath: 'out-unit.txt',
  };
  let jobId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;

  beforeEach(() => {
    jobId = createJob(input);
    writeSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    vi.mocked(performDirectLlmCall).mockResolvedValue('console.log("hi");');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fs.writeFile with the correct args', async () => {
    await processJob(jobId, input, baseConfig);
    const resolved = path.resolve(input.outputFilePath!);
    expect(writeSpy).toHaveBeenCalledWith(
      resolved,
      'console.log("hi");',
      'utf-8'
    );
  });
});
