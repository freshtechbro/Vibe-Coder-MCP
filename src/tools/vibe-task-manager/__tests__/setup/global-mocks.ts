/**
 * Global Mock Setup for Vibe Task Manager Tests
 * 
 * This file provides centralized mock configurations that can be imported
 * by any test file to ensure consistent mocking across the test suite.
 * 
 * Usage:
 * import { setupGlobalMocks, cleanupGlobalMocks } from '../setup/global-mocks.js';
 * 
 * beforeEach(async () => {
 *   await setupGlobalMocks();
 * });
 * 
 * afterEach(async () => {
 *   await cleanupGlobalMocks();
 * });
 */

import { vi } from 'vitest';

/**
 * Setup all global mocks for consistent test environment
 */
export async function setupGlobalMocks(): Promise<void> {
  // Setup fs-extra mock with comprehensive methods
  vi.mock('fs-extra', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
      ...actual,
      // Directory operations
      ensureDir: vi.fn().mockResolvedValue(undefined),
      ensureDirSync: vi.fn().mockReturnValue(undefined),
      emptyDir: vi.fn().mockResolvedValue(undefined),
      emptyDirSync: vi.fn().mockReturnValue(undefined),
      mkdirp: vi.fn().mockResolvedValue(undefined),
      mkdirpSync: vi.fn().mockReturnValue(undefined),

      // File operations
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFileSync: vi.fn().mockReturnValue('{}'),
      writeFileSync: vi.fn().mockReturnValue(undefined),
      readJson: vi.fn().mockResolvedValue({}),
      writeJson: vi.fn().mockResolvedValue(undefined),
      readJsonSync: vi.fn().mockReturnValue({}),
      writeJsonSync: vi.fn().mockReturnValue(undefined),

      // Path operations
      pathExists: vi.fn().mockResolvedValue(true),
      pathExistsSync: vi.fn().mockReturnValue(true),
      access: vi.fn().mockResolvedValue(undefined),

      // Copy/move operations
      copy: vi.fn().mockResolvedValue(undefined),
      copySync: vi.fn().mockReturnValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      moveSync: vi.fn().mockReturnValue(undefined),

      // Remove operations
      remove: vi.fn().mockResolvedValue(undefined),
      removeSync: vi.fn().mockReturnValue(undefined),

      // Other operations
      stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
      statSync: vi.fn().mockReturnValue({ isFile: () => true, isDirectory: () => false }),
      lstat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
      lstatSync: vi.fn().mockReturnValue({ isFile: () => true, isDirectory: () => false }),

      // Additional fs-extra specific methods
      outputFile: vi.fn().mockResolvedValue(undefined),
      outputFileSync: vi.fn().mockReturnValue(undefined),
      outputJson: vi.fn().mockResolvedValue(undefined),
      outputJsonSync: vi.fn().mockReturnValue(undefined),
      createFile: vi.fn().mockResolvedValue(undefined),
      createFileSync: vi.fn().mockReturnValue(undefined),
      createReadStream: vi.fn().mockReturnValue({
        on: vi.fn(),
        pipe: vi.fn(),
        close: vi.fn()
      }),
      createWriteStream: vi.fn().mockReturnValue({
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn()
      })
    };
  });

  // Setup axios mock for LLM API calls
  vi.mock('axios', () => ({
    default: {
      post: vi.fn().mockResolvedValue({
        data: {
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-model',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({ success: true, result: 'mock response' })
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 50,
            total_tokens: 100
          }
        }
      })
    },
    post: vi.fn().mockResolvedValue({
      data: {
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({ success: true, result: 'mock response' })
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 50,
          total_tokens: 100
        }
      }
    })
  }));

  // Setup standard fs mock
  vi.mock('fs', () => ({
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('{}'),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => false, isFile: () => true }),
      access: vi.fn().mockResolvedValue(undefined),
      appendFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([])
    },
    constants: {
      R_OK: 4,
      W_OK: 2,
      F_OK: 0
    },
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn().mockReturnValue(undefined),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => false, isFile: () => true }),
    unlinkSync: vi.fn().mockReturnValue(undefined)
  }));
}

/**
 * Cleanup all global mocks
 */
export async function cleanupGlobalMocks(): Promise<void> {
  vi.clearAllMocks();
  vi.resetAllMocks();
}

/**
 * Queue multiple mock responses for LLM calls
 */
export function queueMockResponses(responses: Array<{ success: boolean; data?: any; error?: string }>): void {
  const mockQueue = responses.slice(); // Create a copy
  let responseIndex = 0;

  const axiosPost = vi.fn().mockImplementation(async (url: string, data?: any) => {
    const response = mockQueue[responseIndex] || mockQueue[mockQueue.length - 1] || { success: true, data: {} };
    responseIndex = Math.min(responseIndex + 1, mockQueue.length - 1);

    if (response.success) {
      return {
        data: {
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-model',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {})
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 50,
            total_tokens: 100
          }
        }
      };
    } else {
      throw new Error(response.error || 'Mock LLM error');
    }
  });

  // Apply the mock
  vi.mock('axios', () => ({
    default: { post: axiosPost },
    post: axiosPost
  }));
}

/**
 * Mock single OpenRouter response
 */
export function mockOpenRouterResponse(response: { success: boolean; data?: any; error?: string }): void {
  const axiosPost = vi.fn().mockImplementation(async (url: string, data?: any) => {
    if (response.success) {
      return {
        data: {
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-model',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {})
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 50,
            total_tokens: 100
          }
        }
      };
    } else {
      throw new Error(response.error || 'Mock LLM error');
    }
  });

  // Apply the mock
  vi.mock('axios', () => ({
    default: { post: axiosPost },
    post: axiosPost
  }));
}
