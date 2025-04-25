import { Response } from 'express';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';

import { sseNotifier } from './index.js';

// Mock the logger
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Define interfaces for our mock objects
interface MockRequest {
  on: Mock;
  _closeListener: null | (() => void);
}

interface MockResponse extends Partial<Response> {
  writeHead: Mock;
  write: Mock;
  end: Mock;
  on: Mock;
  off: Mock;
  writableEnded: boolean;
  _closeListener?: () => void;
}

// Create a mock request with event handling
const createMockRequest = (): MockRequest => {
  const mock: MockRequest = {
    on: vi.fn().mockImplementation((event, listener) => {
      if (event === 'close') {
        // Store the listener for later use
        mock._closeListener = listener;
      }
      return mock;
    }),
    _closeListener: null,
  };
  return mock;
};

// Mock Express Response object
const createMockResponse = (): MockResponse => {
  const mock: MockResponse = {
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn().mockImplementation((event, listener) => {
      if (event === 'close') {
        // Store the listener to simulate the close event later
        mock._closeListener = listener;
      }
      return mock; // Return self for chaining
    }),
    off: vi.fn(),
    writableEnded: false,
  };
  return mock;
};

let mockResponse: MockResponse;
let mockRequest: MockRequest;

describe('SseNotifier Singleton', () => {
  beforeEach(() => {
    // Create fresh mocks for each test
    mockResponse = createMockResponse();
    mockRequest = createMockRequest();

    // Reset mocks
    vi.clearAllMocks();

    // Clear connections before each test
    // Cast to access private properties for testing purposes
    const notifier = sseNotifier as unknown as { connections: Set<Response> };
    notifier.connections.clear();
  });

  it('should notify all connected clients', () => {
    // Register a connection
    sseNotifier.handleConnection(
      mockRequest as any,
      mockResponse as unknown as Response
    );

    // Trigger a notification
    const testEvent = 'test_event';
    const testData = { foo: 'bar' };
    sseNotifier.notify(testEvent, testData);

    // Check that response.write was called correctly
    expect(mockResponse.write).toHaveBeenCalledWith(
      `event: ${testEvent}\ndata: ${JSON.stringify(testData)}\n\n`
    );
  });

  it('should remove connection when client disconnects', () => {
    // Register a connection
    sseNotifier.handleConnection(
      mockRequest as any,
      mockResponse as unknown as Response
    );

    // Simulate client disconnect by calling the stored close listener
    if (mockRequest._closeListener) {
      mockRequest._closeListener();
    }

    // Send a notification
    sseNotifier.notify('test', {});

    // Expect write not to be called (connection should be removed)
    expect(mockResponse.write).not.toHaveBeenCalled();
  });

  it('should handle multiple connections', () => {
    // Create multiple mock responses
    const mockResponse2 = createMockResponse();
    const mockRequest2 = createMockRequest();

    // Register connections
    sseNotifier.handleConnection(
      mockRequest as any,
      mockResponse as unknown as Response
    );
    sseNotifier.handleConnection(
      mockRequest2 as any,
      mockResponse2 as unknown as Response
    );

    // Send a notification
    sseNotifier.notify('test', {});

    // Both should receive the notification
    expect(mockResponse.write).toHaveBeenCalled();
    expect(mockResponse2.write).toHaveBeenCalled();
  });

  it('should close all connections', () => {
    // Register connections
    sseNotifier.handleConnection(
      mockRequest as any,
      mockResponse as unknown as Response
    );

    // Close all connections
    sseNotifier.closeAllConnections();

    // Response end should be called
    expect(mockResponse.end).toHaveBeenCalled();
  });
});
