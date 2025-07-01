// src/services/sse-notifier/sse-notifier.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sseNotifier } from './index.js'; // Import the singleton instance
import { JobStatus } from '../job-manager/index.js'; // Import JobStatus enum
import { Response } from 'express'; // Import Response type for mocking

// Define type for mock response with close listener
type MockResponseWithCloseListener = Partial<Response> & { _closeListener?: () => void };

// Mock the logger
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

// Mock Express Response object
const createMockResponse = (): Partial<Response> => ({
  write: vi.fn(),
  flushHeaders: vi.fn(), // Often used with SSE
  // Mock 'close' event handling if needed
  on: vi.fn((event, listener) => {
    if (event === 'close') {
      // Store the listener to simulate the close event later
      (mockResponse as MockResponseWithCloseListener)._closeListener = listener;
    }
    return mockResponse as Response; // Return self for chaining
  }),
  off: vi.fn(), // Mock off if used
  writableEnded: false, // Initial state
  // Add other methods/properties if SseNotifier uses them
});

let mockResponse: MockResponseWithCloseListener;

describe('SseNotifier Singleton', () => {
  // We are testing the singleton instance directly
  // let sseNotifier: SseNotifier; // No need to declare or instantiate

  beforeEach(() => {
    // Create a fresh mock response for each test
    mockResponse = createMockResponse();
    // Reset mocks
    vi.clearAllMocks();
    // TODO: Consider adding a reset method to SseNotifier for testing if needed
    // e.g., sseNotifier.resetForTesting(); or manually clear internal clients map
    (sseNotifier as unknown as { connections: Map<string, Response> }).connections.clear(); // Clear connections before each test
  });

  it('should register a new connection', () => {
    const sessionId = 'session-1';
    sseNotifier.registerConnection(sessionId, mockResponse as Response);
    // Check internal state if possible/necessary, or test via sendProgress
    expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.has(sessionId)).toBe(true);
    expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.get(sessionId)).toBe(mockResponse);
    // Check if initial headers/keep-alive message was sent
    expect(mockResponse.write).toHaveBeenCalledWith('event: connection\ndata: established\n\n');
  });

  it('should unregister a connection', () => {
    const sessionId = 'session-1';
    sseNotifier.registerConnection(sessionId, mockResponse as Response);
    sseNotifier.unregisterConnection(sessionId);
    expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.has(sessionId)).toBe(false);
  });

  it('should automatically unregister when the connection closes', () => {
    const sessionId = 'session-1';
    sseNotifier.registerConnection(sessionId, mockResponse as Response);
    expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.has(sessionId)).toBe(true);

    // Simulate the 'close' event
    if (mockResponse._closeListener) {
      mockResponse._closeListener();
    } else {
      throw new Error("Close listener was not registered by mock");
    }

    expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.has(sessionId)).toBe(false);
  });

  it('should send progress updates to a registered connection', () => {
    const sessionId = 'session-1';
    const jobId = 'job-123';
    const status = JobStatus.RUNNING;
    const message = 'Processing step 1...';

    sseNotifier.registerConnection(sessionId, mockResponse as Response);
    sseNotifier.sendProgress(sessionId, jobId, status, message);

    const expectedData = JSON.stringify({ jobId, status, message });
    const expectedSseMessage = `event: progress\ndata: ${expectedData}\n\n`;

    // Check if write was called with the correct SSE formatted message
    expect(mockResponse.write).toHaveBeenCalledWith(expectedSseMessage);
  });

  it('should not send progress if session ID is not registered', () => {
    sseNotifier.sendProgress('non-existent-session', 'job-1', JobStatus.RUNNING, 'message');
    expect(mockResponse.write).not.toHaveBeenCalledWith(expect.stringContaining('event: progress'));
  });

  it('should handle JSON stringify errors gracefully when sending progress', () => {
    const sessionId = 'session-1';
    sseNotifier.registerConnection(sessionId, mockResponse as Response);

    // Create an object that cannot be stringified (circular reference)
    const circularData: { jobId: string; self?: unknown } = { jobId: 'job-circ' };
    circularData.self = circularData;

    // Expect sendProgress not to throw, but log an error (mock logger check)
    expect(() => sseNotifier.sendProgress(sessionId, 'job-circ', JobStatus.FAILED, 'Test circular data handling')).not.toThrow();

    // Check that write was NOT called with the bad data, but the initial connection message might still be there
    expect(mockResponse.write).toHaveBeenCalledTimes(1); // Only the initial connection message
    expect(mockResponse.write).not.toHaveBeenCalledWith(expect.stringContaining('job-circ'));
    // Check logger mock: expect(logger.error).toHaveBeenCalled();
  });

  it('should not send progress if the connection is already closed (writableEnded)', () => {
    const sessionId = 'session-1';
    sseNotifier.registerConnection(sessionId, mockResponse as Response);
    // Simulate closed connection - Cast to mock type to set property
    (mockResponse as MockResponseWithCloseListener & { writableEnded: boolean }).writableEnded = true;

    sseNotifier.sendProgress(sessionId, 'job-1', JobStatus.COMPLETED, 'Done');

    // write should only have been called for the initial connection message
    expect(mockResponse.write).toHaveBeenCalledTimes(1);
    expect(mockResponse.write).not.toHaveBeenCalledWith(expect.stringContaining('event: progress'));
  });

  // TODO: Add tests for sendWorkflowStepStart, sendWorkflowStepUpdate, sendWorkflowStepEnd if those methods are kept/implemented
});
