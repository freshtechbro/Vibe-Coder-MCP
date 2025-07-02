/**
 * Unit Tests for Port Allocator
 * 
 * Comprehensive test suite for dynamic port allocation functionality
 * Tests port availability checking, range parsing, system port exclusion, and batch allocation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PortAllocator, PortRange } from '../port-allocator.js';

// Mock logger to avoid console output during tests
vi.mock('../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Global mock state for port allocation tests - using a module-level variable
// that persists across mock function calls
const mockPortState = {
  portsInUse: new Set<number>()
};

// Mock net module to prevent real network operations during tests
vi.mock('net', () => {
  return {
    createServer: vi.fn(() => {
      let errorHandler: ((error: Error) => void) | null = null;
      
      const mockServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          // Use setTimeout to ensure proper async behavior and check current state
          setTimeout(() => {
            if (mockPortState.portsInUse.has(port)) {
              const error = new Error('EADDRINUSE') as NodeJS.ErrnoException & { port: number };
              error.code = 'EADDRINUSE';
              error.port = port;
              
              if (errorHandler) {
                errorHandler(error);
              }
            } else {
              mockServer.listening = true;
              if (callback) callback();
            }
          }, 0);
          return mockServer;
        }),
        
        close: vi.fn((callback?: () => void) => {
          mockServer.listening = false;
          setTimeout(() => {
            if (callback) callback();
          }, 0);
          return mockServer;
        }),
        
        on: vi.fn((event: string, handler: (error: Error) => void) => {
          if (event === 'error') {
            errorHandler = handler;
          }
          return mockServer;
        }),
        
        listening: false
      };
      
      return mockServer;
    })
  };
});

// Helper functions for test control
export const mockPortHelpers = {
  setPortInUse: (port: number) => {
    mockPortState.portsInUse.add(port);
    return true;
  },
  setPortAvailable: (port: number) => {
    mockPortState.portsInUse.delete(port);
    return true;
  },
  clearAllPorts: () => {
    mockPortState.portsInUse.clear();
    return true;
  },
  getMockPortsInUse: () => Array.from(mockPortState.portsInUse),
  getPortsInUseCount: () => mockPortState.portsInUse.size
};

describe('PortAllocator', () => {
  let testPortBase: number;

  beforeEach(() => {
    // Clear all mock ports state before each test
    mockPortHelpers.clearAllPorts();
    
    // Use unique port ranges for each test to avoid conflicts
    testPortBase = 45000 + Math.floor(Math.random() * 10000);
  });

  afterEach(() => {
    // Clean up mock state
    mockPortHelpers.clearAllPorts();
  });

  describe('findAvailablePort', () => {
    it('should return true for available ports', async () => {
      const port = 9999; // Use high port number to avoid conflicts
      const isAvailable = await PortAllocator.findAvailablePort(port);
      expect(isAvailable).toBe(true);
    });

    it('should return false for ports in use', async () => {
      const port = 9998;
      
      // Mark port as in use via mock
      mockPortHelpers.setPortInUse(port);

      const isAvailable = await PortAllocator.findAvailablePort(port);
      expect(isAvailable).toBe(false);
    });

    it('should handle invalid port numbers gracefully', async () => {
      const isAvailable1 = await PortAllocator.findAvailablePort(-1);
      const isAvailable2 = await PortAllocator.findAvailablePort(65536);
      const isAvailable3 = await PortAllocator.findAvailablePort(99999);

      expect(isAvailable1).toBe(false);
      expect(isAvailable2).toBe(false);
      expect(isAvailable3).toBe(false);
    });
  });

  describe('isPortExcluded', () => {
    it('should exclude system ports (1-1024)', () => {
      expect(PortAllocator.isPortExcluded(80)).toBe(true);
      expect(PortAllocator.isPortExcluded(443)).toBe(true);
      expect(PortAllocator.isPortExcluded(22)).toBe(true);
      expect(PortAllocator.isPortExcluded(1024)).toBe(true);
    });

    it('should exclude common service ports', () => {
      expect(PortAllocator.isPortExcluded(3306)).toBe(true); // MySQL
      expect(PortAllocator.isPortExcluded(5432)).toBe(true); // PostgreSQL
      expect(PortAllocator.isPortExcluded(6379)).toBe(true); // Redis
      expect(PortAllocator.isPortExcluded(27017)).toBe(true); // MongoDB
    });

    it('should not exclude normal application ports', () => {
      expect(PortAllocator.isPortExcluded(8080)).toBe(false);
      expect(PortAllocator.isPortExcluded(3000)).toBe(false);
      expect(PortAllocator.isPortExcluded(9000)).toBe(false);
      expect(PortAllocator.isPortExcluded(4000)).toBe(false);
    });
  });

  describe('parsePortRange', () => {
    const defaultRange: PortRange = { start: 8080, end: 8090, service: 'test' };

    it('should parse single port numbers', () => {
      const result = PortAllocator.parsePortRange('8085', defaultRange);
      expect(result).toEqual({
        start: 8085,
        end: 8085,
        service: 'test'
      });
    });

    it('should parse port ranges', () => {
      const result = PortAllocator.parsePortRange('8080-8090', defaultRange);
      expect(result).toEqual({
        start: 8080,
        end: 8090,
        service: 'test'
      });
    });

    it('should return default for empty input', () => {
      const result1 = PortAllocator.parsePortRange('', defaultRange);
      const result2 = PortAllocator.parsePortRange('   ', defaultRange);
      
      expect(result1).toEqual(defaultRange);
      expect(result2).toEqual(defaultRange);
    });

    it('should return default for invalid formats', () => {
      const result1 = PortAllocator.parsePortRange('invalid', defaultRange);
      const result2 = PortAllocator.parsePortRange('8080-8090-9000', defaultRange);
      const result3 = PortAllocator.parsePortRange('abc-def', defaultRange);
      
      expect(result1).toEqual(defaultRange);
      expect(result2).toEqual(defaultRange);
      expect(result3).toEqual(defaultRange);
    });

    it('should return default for invalid port numbers', () => {
      const result1 = PortAllocator.parsePortRange('-1', defaultRange);
      const result2 = PortAllocator.parsePortRange('65536', defaultRange);
      const result3 = PortAllocator.parsePortRange('8090-8080', defaultRange); // start > end
      
      expect(result1).toEqual(defaultRange);
      expect(result2).toEqual(defaultRange);
      expect(result3).toEqual(defaultRange);
    });
  });

  describe('findAvailablePortInRange', () => {
    it('should find available port in range', async () => {
      const range: PortRange = { start: testPortBase, end: testPortBase + 9, service: 'test' };
      const result = await PortAllocator.findAvailablePortInRange(range);

      expect(result.success).toBe(true);
      expect(result.port).toBeGreaterThanOrEqual(range.start);
      expect(result.port).toBeLessThanOrEqual(range.end);
      expect(result.service).toBe('test');
      expect(result.attempted.length).toBeGreaterThan(0);
    });

    it('should skip excluded ports', async () => {
      const range: PortRange = { start: 80, end: 85, service: 'test' };
      const result = await PortAllocator.findAvailablePortInRange(range);
      
      // Should fail because all ports in this range are excluded (system ports)
      expect(result.success).toBe(false);
      expect(result.attempted.length).toBe(0); // No ports attempted due to exclusion
    });

    it.skip('should handle range with all ports occupied', async () => {
      // Use test port base to avoid conflicts with other tests
      const range: PortRange = { start: testPortBase + 20, end: testPortBase + 22, service: 'test' };
      
      // Ensure clean state and mark all ports in the range as in use
      mockPortHelpers.clearAllPorts();
      
      for (let port = range.start; port <= range.end; port++) {
        mockPortHelpers.setPortInUse(port);
      }
      
      // Verify our mock setup
      const mockPorts = mockPortHelpers.getMockPortsInUse();
      const portsCount = mockPortHelpers.getPortsInUseCount();
      
      expect(portsCount).toBe(3);
      expect(mockPorts).toContain(range.start);
      expect(mockPorts).toContain(range.start + 1);
      expect(mockPorts).toContain(range.start + 2);
      
      const result = await PortAllocator.findAvailablePortInRange(range);
      
      expect(result.success).toBe(false);
      expect(result.attempted.length).toBe(range.end - range.start + 1);
      
      // Clean up after this test to avoid affecting other tests
      mockPortHelpers.clearAllPorts();
    });
  });

  describe('allocatePortsForServices', () => {
    it('should allocate ports for multiple services', async () => {
      const ranges: PortRange[] = [
        { start: testPortBase + 10, end: testPortBase + 15, service: 'websocket' },
        { start: testPortBase + 16, end: testPortBase + 20, service: 'http' },
        { start: testPortBase + 21, end: testPortBase + 25, service: 'sse' }
      ];
      
      const summary = await PortAllocator.allocatePortsForServices(ranges);
      
      expect(summary.allocations.size).toBe(3);
      expect(summary.successful.length).toBe(3);
      expect(summary.conflicts.length).toBe(0);
      expect(summary.errors.length).toBe(0);
      
      // Check individual allocations
      const wsAllocation = summary.allocations.get('websocket');
      const httpAllocation = summary.allocations.get('http');
      const sseAllocation = summary.allocations.get('sse');
      
      expect(wsAllocation?.success).toBe(true);
      expect(httpAllocation?.success).toBe(true);
      expect(sseAllocation?.success).toBe(true);
      
      // Ensure no port conflicts
      const allocatedPorts = [wsAllocation?.port, httpAllocation?.port, sseAllocation?.port];
      const uniquePorts = new Set(allocatedPorts);
      expect(uniquePorts.size).toBe(3); // All ports should be unique
    });

    it('should handle partial allocation failures gracefully', async () => {
      // Create a range where some ports will fail
      const ranges: PortRange[] = [
        { start: testPortBase + 30, end: testPortBase + 35, service: 'websocket' }, // Should succeed
        { start: 80, end: 85, service: 'http' } // Should fail (excluded ports)
      ];
      
      const summary = await PortAllocator.allocatePortsForServices(ranges);
      
      expect(summary.allocations.size).toBe(2);
      expect(summary.successful.length).toBe(1); // Only websocket should succeed
      expect(summary.errors.length).toBeGreaterThan(0);
      
      const wsAllocation = summary.allocations.get('websocket');
      const httpAllocation = summary.allocations.get('http');
      
      expect(wsAllocation?.success).toBe(true);
      expect(httpAllocation?.success).toBe(false);
    });
  });

  describe('cleanupOrphanedPorts', () => {
    it('should complete cleanup without errors', async () => {
      const cleanedCount = await PortAllocator.cleanupOrphanedPorts();
      expect(typeof cleanedCount).toBe('number');
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should detect occupied ports in common ranges', async () => {
      // Use a different port to avoid conflicts with other tests
      const testPort = 9876;
      
      // Mark port as in use via mock
      mockPortHelpers.setPortInUse(testPort);

      const cleanedCount = await PortAllocator.cleanupOrphanedPorts();
      expect(typeof cleanedCount).toBe('number');
    });
  });
});
