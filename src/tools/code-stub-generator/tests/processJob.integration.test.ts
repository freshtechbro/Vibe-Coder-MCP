import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createJob, getJobResult, JobStatus } from '../services/jobStore.js';
import { processJob } from '../index.js';
import type { CodeStubInput } from '../schema.js';
import type { McpConfig } from '../../../types/config.js'; // eslint-disable-line import/extensions

import { loadLlmConfigMapping } from '../../../utils/configLoader.js';
import { performDirectLlmCall } from '../../../utils/llmHelper.js';
import { readContextFile } from '../utils/contextHandler.js';

// Mock external dependencies
vi.mock('../../../utils/configLoader.js', () => ({
  loadLlmConfigMapping: vi.fn(),
}));
vi.mock('../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn(),
}));
vi.mock('../utils/contextHandler.js', () => ({
  readContextFile: vi.fn(),
}));

describe('processJob integration', () => {
  const baseConfig: McpConfig = {
    env: { OPENROUTER_API_KEY: 'key', OPENROUTER_BASE_URL: 'url' },
    llm: { defaultModel: 'm', defaultTemperature: 0.1, maxTokens: 10 },
  };
  const input: CodeStubInput = {
    name: 'fn',
    description: 'desc',
    language: 'javascript',
    stubType: 'function',
  };

  beforeEach(() => {
    vi.mocked(loadLlmConfigMapping).mockReturnValue({});
    vi.mocked(performDirectLlmCall).mockReset();
    vi.mocked(readContextFile).mockReset();
  });

  it('completes job with fenced LLM output', async () => {
    const jobId = createJob(input);
    const fenced = "```js\nconsole.log('hi');\n```";
    vi.mocked(performDirectLlmCall).mockResolvedValue(fenced);

    await processJob(jobId, input, baseConfig);
    const job = getJobResult(jobId);
    expect(job).toBeDefined();
    expect(job?.status).toBe(JobStatus.COMPLETED);
    expect(job?.result).toBe("console.log('hi');");
  });

  it('completes job with raw LLM output when no fences', async () => {
    const jobId = createJob(input);
    vi.mocked(performDirectLlmCall).mockResolvedValue('raw code');

    await processJob(jobId, input, baseConfig);
    const job = getJobResult(jobId);
    expect(job?.status).toBe(JobStatus.COMPLETED);
    expect(job?.result).toBe('raw code');
  });

  it('fails job on LLM error', async () => {
    const jobId = createJob(input);
    vi.mocked(performDirectLlmCall).mockRejectedValue(new Error('fail'));

    await processJob(jobId, input, baseConfig);
    const job = getJobResult(jobId);
    expect(job?.status).toBe(JobStatus.FAILED);
    expect(job?.error).toBe('fail');
  });

  it('fails job when context read fails', async () => {
    const jobId = createJob({ ...input, contextFilePath: 'bad' });
    vi.mocked(readContextFile).mockResolvedValue(null);
    vi.mocked(performDirectLlmCall).mockResolvedValue('');

    await processJob(jobId, { ...input, contextFilePath: 'bad' }, baseConfig);
    const job = getJobResult(jobId);
    expect(job?.status).toBe(JobStatus.FAILED);
    expect(job?.error).toMatch(/Failed to read context file/);
  });
});
