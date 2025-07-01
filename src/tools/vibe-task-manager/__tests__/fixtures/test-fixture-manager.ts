/**
 * Test Fixture Manager
 * Coordinates standardized test fixtures and provides consistent setup/teardown
 */

import { vi } from 'vitest';
import {
  setupStandardizedFileSystemMocks,
  TEST_PATHS,
  TEST_DATES,
  TEST_CODE_MAP_CONTENT,
  createTestCodeMapInfo,
  createTestFileStats,
  cleanupStandardizedFixtures
} from './standardized-test-fixtures.js';

export interface TestFixtureOptions {
  enableFileSystemMocks?: boolean;
  enableLLMMocks?: boolean;
  enableTransportMocks?: boolean;
  testBehavior?: 'success' | 'failure' | 'mixed';
  customPaths?: Partial<typeof TEST_PATHS>;
  customDates?: Partial<typeof TEST_DATES>;
}

export class TestFixtureManager {
  private static instance: TestFixtureManager | null = null;
  private activeMocks = new Map<string, unknown>();
  private cleanupFunctions: Array<() => void> = [];

  static getInstance(): TestFixtureManager {
    if (!TestFixtureManager.instance) {
      TestFixtureManager.instance = new TestFixtureManager();
    }
    return TestFixtureManager.instance;
  }

  static reset(): void {
    if (TestFixtureManager.instance) {
      TestFixtureManager.instance.cleanup();
      TestFixtureManager.instance = null;
    }
  }

  /**
   * Setup comprehensive test fixtures for a test
   */
  setupTestFixtures(testName: string, options: TestFixtureOptions = {}): TestFixtureSetup {
    const {
      enableFileSystemMocks = true,
      enableLLMMocks = true,
      enableTransportMocks = false,
      testBehavior = 'success',
      customPaths = {},
      customDates = {}
    } = options;

    const testPaths = { ...TEST_PATHS, ...customPaths };
    const testDates = { ...TEST_DATES, ...customDates };

    const setup: TestFixtureSetup = {
      testName,
      paths: testPaths,
      dates: testDates,
      mocks: {},
      cleanup: () => this.cleanupTest(testName)
    };

    // Setup file system mocks
    if (enableFileSystemMocks) {
      setup.mocks.fs = this.setupFileSystemMocks(testBehavior, testPaths, testDates);
    }

    // Setup LLM mocks
    if (enableLLMMocks) {
      setup.mocks.llm = this.setupLLMMocks(testBehavior);
    }

    // Setup transport mocks
    if (enableTransportMocks) {
      setup.mocks.transport = this.setupTransportMocks(testBehavior);
    }

    // Register cleanup
    this.cleanupFunctions.push(() => this.cleanupTest(testName));

    return setup;
  }

  /**
   * Setup file system mocks with specific behavior
   */
  private setupFileSystemMocks(behavior: string, _paths: typeof TEST_PATHS, _dates: typeof TEST_DATES) {
    const mockFs = setupStandardizedFileSystemMocks();

    // Customize behavior based on test requirements
    if (behavior === 'failure') {
      mockFs.stat.mockRejectedValue(new Error('File not found'));
      mockFs.readFile.mockRejectedValue(new Error('Read failed'));
      mockFs.readdir.mockRejectedValue(new Error('Directory not found'));
    } else if (behavior === 'mixed') {
      // Some operations succeed, some fail
      mockFs.stat.mockImplementation((filePath: string) => {
        if (String(filePath).includes('fail')) {
          return Promise.reject(new Error('Stat failed'));
        }
        return Promise.resolve(createTestFileStats());
      });
    }

    this.activeMocks.set('fs', mockFs);
    return mockFs;
  }

  /**
   * Setup LLM mocks with specific behavior
   */
  private setupLLMMocks(behavior: string) {
    const mockLLM = {
      performFormatAwareLlmCall: vi.fn(),
      intelligentJsonParse: vi.fn()
    };

    if (behavior === 'success') {
      mockLLM.performFormatAwareLlmCall.mockResolvedValue({
        content: 'Mock LLM response',
        usage: { total_tokens: 100 }
      });
      mockLLM.intelligentJsonParse.mockReturnValue({ parsed: true });
    } else if (behavior === 'failure') {
      mockLLM.performFormatAwareLlmCall.mockRejectedValue(new Error('LLM call failed'));
      mockLLM.intelligentJsonParse.mockImplementation(() => {
        throw new Error('JSON parse failed');
      });
    }

    this.activeMocks.set('llm', mockLLM);
    return mockLLM;
  }

  /**
   * Setup transport mocks with specific behavior
   */
  private setupTransportMocks(behavior: string) {
    const mockTransport = {
      startAll: vi.fn(),
      stopAll: vi.fn(),
      getStatus: vi.fn(),
      getHealthStatus: vi.fn(),
      isTransportRunning: vi.fn()
    };

    if (behavior === 'success') {
      mockTransport.startAll.mockResolvedValue(undefined);
      mockTransport.stopAll.mockResolvedValue(undefined);
      mockTransport.getStatus.mockReturnValue({
        websocket: { running: true, port: 8081 },
        http: { running: true, port: 3012 }
      });
      mockTransport.getHealthStatus.mockResolvedValue({
        websocket: { status: 'healthy' },
        http: { status: 'healthy' }
      });
      mockTransport.isTransportRunning.mockReturnValue(true);
    } else if (behavior === 'failure') {
      mockTransport.startAll.mockRejectedValue(new Error('Transport start failed'));
      mockTransport.getStatus.mockReturnValue({
        websocket: { running: false },
        http: { running: false }
      });
      mockTransport.isTransportRunning.mockReturnValue(false);
    }

    this.activeMocks.set('transport', mockTransport);
    return mockTransport;
  }

  /**
   * Create standardized test data for specific scenarios
   */
  createTestScenario(scenario: 'fresh-codemap' | 'stale-codemap' | 'no-codemap' | 'invalid-data') {
    switch (scenario) {
      case 'fresh-codemap':
        return {
          codeMapInfo: createTestCodeMapInfo({
            generatedAt: TEST_DATES.fresh,
            isStale: false
          }),
          fileStats: createTestFileStats({
            mtime: TEST_DATES.fresh,
            isDirectory: false
          }),
          content: TEST_CODE_MAP_CONTENT
        };

      case 'stale-codemap':
        return {
          codeMapInfo: createTestCodeMapInfo({
            generatedAt: TEST_DATES.stale,
            isStale: true
          }),
          fileStats: createTestFileStats({
            mtime: TEST_DATES.stale,
            isDirectory: false
          }),
          content: TEST_CODE_MAP_CONTENT
        };

      case 'no-codemap':
        return {
          codeMapInfo: null,
          fileStats: null,
          content: null
        };

      case 'invalid-data':
        return {
          codeMapInfo: createTestCodeMapInfo(),
          fileStats: createTestFileStats(),
          content: 'Invalid content'
        };

      default:
        throw new Error(`Unknown test scenario: ${scenario}`);
    }
  }

  /**
   * Cleanup specific test
   */
  private cleanupTest(_testName: string): void {
    // Remove test-specific mocks
    for (const [, mock] of this.activeMocks) {
      if (mock && typeof mock.mockRestore === 'function') {
        mock.mockRestore();
      }
    }

    // Clear active mocks
    this.activeMocks.clear();

    // Run standardized cleanup
    cleanupStandardizedFixtures();
  }

  /**
   * Cleanup all tests
   */
  cleanup(): void {
    // Run all cleanup functions
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.warn('Cleanup function failed:', error);
      }
    });

    // Clear cleanup functions
    this.cleanupFunctions = [];

    // Clear all active mocks
    this.activeMocks.clear();

    // Run standardized cleanup
    cleanupStandardizedFixtures();
  }
}

export interface TestFixtureSetup {
  testName: string;
  paths: typeof TEST_PATHS;
  dates: typeof TEST_DATES;
  mocks: {
    fs?: unknown;
    llm?: unknown;
    transport?: unknown;
  };
  cleanup: () => void;
}

// Export singleton instance
export const testFixtureManager = TestFixtureManager.getInstance();

// Export convenience functions
export const setupTestFixtures = (testName: string, options?: TestFixtureOptions) => 
  testFixtureManager.setupTestFixtures(testName, options);

export const createTestScenario = (scenario: Parameters<TestFixtureManager['createTestScenario']>[0]) =>
  testFixtureManager.createTestScenario(scenario);

export const cleanupTestFixtures = () => testFixtureManager.cleanup();
