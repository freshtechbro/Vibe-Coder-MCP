import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger to avoid actual logging
vi.mock('@/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock fs-extra for file operations
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
vi.mock('fs-extra', () => ({
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
}));

import { loadLlmConfigMapping, selectModelForTask } from './configLoader.js';
import type { OpenRouterConfig } from '../types/workflow.js';

describe('loadLlmConfigMapping', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    delete process.env.LLM_CONFIG_PATH;
  });

  it('returns mapping from env var path when exists', () => {
    process.env.LLM_CONFIG_PATH = '/tmp/config.json';
    mockExistsSync.mockImplementation((p) => p === '/tmp/config.json');
    mockReadFileSync.mockImplementation(() => JSON.stringify({ llm_mapping: { a: 'b' } }));

    const result = loadLlmConfigMapping('config.json');
    expect(mockExistsSync).toHaveBeenCalledWith('/tmp/config.json');
    expect(result).toEqual({ a: 'b' });
  });

  it('falls back to cwd path if env var missing', () => {
    const cwdPath = `${process.cwd()}/config.json`;
    mockExistsSync.mockImplementation((p) => p === cwdPath);
    mockReadFileSync.mockImplementation(() => JSON.stringify({ llm_mapping: { x: 'y' } }));

    const result = loadLlmConfigMapping('config.json');
    expect(mockExistsSync).toHaveBeenCalledWith(cwdPath);
    expect(result).toEqual({ x: 'y' });
  });

  it('returns empty mapping when file not found', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadLlmConfigMapping('config.json');
    expect(result).toEqual({});
  });

  it('returns empty mapping for invalid JSON', () => {
    const cwdPath = `${process.cwd()}/config.json`;
    mockExistsSync.mockImplementation((p) => p === cwdPath);
    mockReadFileSync.mockImplementation(() => 'not json');
    const result = loadLlmConfigMapping('config.json');
    expect(result).toEqual({});
  });

  it('filters out non-string values', () => {
    const cwdPath = `${process.cwd()}/config.json`;
    mockExistsSync.mockImplementation((p) => p === cwdPath);
    mockReadFileSync.mockImplementation(() => JSON.stringify({ llm_mapping: { good: 'v', bad: 123 } }));
    const result = loadLlmConfigMapping('config.json');
    expect(result).toEqual({ good: 'v' });
  });
});

describe('selectModelForTask', () => {
  const defaultModel = 'default';

  it('returns defaultModel when mapping missing', () => {
    const config = {} as OpenRouterConfig;
    expect(selectModelForTask(config, 'task', defaultModel)).toBe(defaultModel);
  });

  it('returns defaultModel when mapping empty', () => {
    const config = { llm_mapping: {} } as OpenRouterConfig;
    expect(selectModelForTask(config, 'task', defaultModel)).toBe(defaultModel);
  });

  it('returns specific mapping if present', () => {
    const config = { llm_mapping: { task: 'model1', default_generation: 'model2' } } as OpenRouterConfig;
    expect(selectModelForTask(config, 'task', defaultModel)).toBe('model1');
  });

  it('returns default_generation when specific missing', () => {
    const config = { llm_mapping: { default_generation: 'model2' } } as OpenRouterConfig;
    expect(selectModelForTask(config, 'other', defaultModel)).toBe('model2');
  });

  it('returns defaultModel when no mapping match', () => {
    const config = { llm_mapping: { another: 'model' } } as OpenRouterConfig;
    expect(selectModelForTask(config, 'task', defaultModel)).toBe(defaultModel);
  });
});
