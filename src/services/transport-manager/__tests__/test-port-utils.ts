/**
 * Test Port Allocation Utilities
 * 
 * Provides utilities for allocating unique port ranges for tests to prevent
 * EADDRINUSE conflicts when multiple test suites run concurrently.
 */

/**
 * Global port counter to ensure unique port ranges across all tests
 * Starting from 25000 to avoid conflicts with common services
 */
let globalPortCounter = 25000;

/**
 * Allocate a unique port range for a test
 * @param rangeSize - Number of ports to allocate (default: 20)
 * @returns Object with port range and environment variable setup function
 */
export function allocateTestPortRange(rangeSize: number = 20) {
  const startPort = globalPortCounter;
  const endPort = startPort + rangeSize - 1;
  
  // Increment global counter to ensure next allocation doesn't overlap
  globalPortCounter += rangeSize + 10; // Add buffer between ranges
  
  return {
    startPort,
    endPort,
    websocketPort: startPort,
    httpPort: startPort + 1,
    ssePort: startPort + 2,
    websocketRange: `${startPort + 3}-${startPort + 8}`,
    httpRange: `${startPort + 9}-${startPort + 14}`,
    sseRange: `${startPort + 15}-${startPort + 19}`,
    
    /**
     * Set environment variables for this port range
     */
    setEnvironmentVariables() {
      process.env.WEBSOCKET_PORT = this.websocketPort.toString();
      process.env.HTTP_AGENT_PORT = this.httpPort.toString();
      process.env.SSE_PORT = this.ssePort.toString();
      process.env.WEBSOCKET_PORT_RANGE = this.websocketRange;
      process.env.HTTP_AGENT_PORT_RANGE = this.httpRange;
      process.env.SSE_PORT_RANGE = this.sseRange;
    },
    
    /**
     * Clear environment variables
     */
    clearEnvironmentVariables() {
      delete process.env.WEBSOCKET_PORT;
      delete process.env.HTTP_AGENT_PORT;
      delete process.env.SSE_PORT;
      delete process.env.WEBSOCKET_PORT_RANGE;
      delete process.env.HTTP_AGENT_PORT_RANGE;
      delete process.env.SSE_PORT_RANGE;
    }
  };
}

/**
 * Setup unique ports for a test suite
 * Call this in beforeEach to ensure each test gets unique ports
 */
export function setupUniqueTestPorts() {
  const portRange = allocateTestPortRange();
  portRange.setEnvironmentVariables();
  return portRange;
}

/**
 * Cleanup test ports
 * Call this in afterEach to clean up environment variables
 */
export function cleanupTestPorts(portRange?: ReturnType<typeof allocateTestPortRange>) {
  if (portRange) {
    portRange.clearEnvironmentVariables();
  } else {
    // Clear all port-related environment variables
    delete process.env.WEBSOCKET_PORT;
    delete process.env.HTTP_AGENT_PORT;
    delete process.env.SSE_PORT;
    delete process.env.WEBSOCKET_PORT_RANGE;
    delete process.env.HTTP_AGENT_PORT_RANGE;
    delete process.env.SSE_PORT_RANGE;
  }
}
