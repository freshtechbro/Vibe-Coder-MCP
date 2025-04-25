import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { createJob, getJobResult, JobStatus } from '../services/jobStore.js';
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

describe('processJob outputFilePath integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-stub-integ-'));
    vi.clearAllMocks();
    vi.mocked(performDirectLlmCall).mockResolvedValue('console.log("hi");');
  });

  it('writes stub to file when outputFilePath is set', async () => {
    const outputPath = path.join(tmpDir, 'stub.js');
    const input: CodeStubInput = {
      name: 'fn',
      description: 'desc',
      language: 'javascript',
      stubType: 'function',
      outputFilePath: outputPath,
    };
    const jobId = createJob(input);
    await processJob(jobId, input, baseConfig);

    // Verify job completed
    const job = getJobResult(jobId);
    expect(job?.status).toBe(JobStatus.COMPLETED);

    // Verify file contents
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toBe('console.log("hi");');
  });
});
