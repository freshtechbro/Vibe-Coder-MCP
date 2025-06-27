# Vibe Task Manager Test Suite

This directory contains the comprehensive test suite for the Vibe Task Manager with enhanced memory management, cleanup utilities, and performance optimizations.

## Test Structure

```
__tests__/
├── utils/                          # Test utilities and helpers
│   ├── test-cleanup.ts             # EventEmitter and resource cleanup
│   ├── test-helpers.ts             # Enhanced test helpers with memory optimization
│   ├── singleton-reset-manager.ts  # Singleton reset mechanisms
│   ├── memory-optimizer.ts         # Memory monitoring and optimization
│   ├── global-setup.ts             # Global test setup
│   └── *.test.ts                   # Utility tests
├── services/                       # Service layer tests
├── core/                          # Core functionality tests
├── integration/                   # Integration tests
└── setup.ts                      # Test environment setup
```

## Key Features

### 🧹 Automatic Cleanup
- **EventEmitter Cleanup**: Automatically removes all listeners and resets max listeners
- **Singleton Reset**: Resets singleton instances between tests for isolation
- **Resource Management**: Cleans up timers, file handles, and other resources
- **Memory Optimization**: Forces garbage collection and monitors memory usage

### 📊 Memory Management
- **Memory Monitoring**: Real-time memory usage tracking during tests
- **Leak Detection**: Identifies memory leaks and provides recommendations
- **Memory Optimization**: Automatic memory cleanup and garbage collection
- **Memory Limits**: Configurable memory limits with automatic enforcement

### ⚡ Performance Optimization
- **Sequential Execution**: Tests run sequentially to avoid memory conflicts
- **Reduced Concurrency**: Limited thread pool to conserve memory
- **Optimized Timeouts**: Reduced timeouts for faster test execution
- **Smart Cleanup**: Efficient cleanup strategies to minimize overhead

## Usage

### Basic Test Setup

```typescript
import { describe, it, expect } from 'vitest';
import { withTestCleanup } from './utils/test-helpers.js';

describe('My Test Suite', () => {
  // Apply automatic cleanup
  withTestCleanup('my-test-suite');

  it('should work correctly', () => {
    // Your test code here
    expect(true).toBe(true);
  });
});
```

### Memory-Optimized Tests

```typescript
import { withMemoryOptimization } from './utils/test-helpers.js';

describe('Memory-Intensive Tests', () => {
  // Apply memory optimization
  withMemoryOptimization({
    maxHeapMB: 200,
    enableMonitoring: true,
    forceCleanup: true
  });

  it('should handle large data sets', () => {
    const largeArray = new Array(10000).fill('data');
    // Test will automatically monitor and optimize memory
  });
});
```

### EventEmitter Tests

```typescript
import { createTestEventEmitter } from './utils/test-helpers.js';

describe('EventEmitter Tests', () => {
  withTestCleanup('event-emitter-tests');

  it('should handle events properly', () => {
    const emitter = createTestEventEmitter('test-emitter');
    
    let eventCount = 0;
    emitter.on('test', () => eventCount++);
    
    emitter.emit('test');
    expect(eventCount).toBe(1);
    
    // Cleanup happens automatically
  });
});
```

### Singleton Tests

```typescript
import { registerTestSingleton } from './utils/test-helpers.js';

describe('Singleton Tests', () => {
  withTestCleanup('singleton-tests');

  it('should reset singleton between tests', () => {
    const singleton = MySingleton.getInstance();
    registerTestSingleton('MySingleton', singleton, 'reset');
    
    singleton.setValue('test');
    expect(singleton.getValue()).toBe('test');
    
    // Singleton will be reset automatically
  });
});
```

## Test Scripts

### Standard Test Commands

```bash
# Run all tests with basic optimization
npm test

# Run tests with memory optimization
npm run test:memory

# Run tests with memory debugging
npm run test:memory:debug

# Run optimized tests (faster, less memory)
npm run test:optimized

# Run fast tests (minimal overhead)
npm run test:fast
```

### Specific Test Types

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# End-to-end tests
npm run test:e2e

# Coverage reports
npm run coverage
```

## Configuration

### Environment Variables

- `MEMORY_DEBUG=true` - Enable detailed memory logging
- `NODE_OPTIONS='--expose-gc'` - Enable garbage collection
- `NODE_OPTIONS='--max-old-space-size=2048'` - Set memory limit

### Vitest Configuration

The test suite uses optimized Vitest configuration:

- **Sequential execution** to avoid memory conflicts
- **Limited concurrency** (2 threads max)
- **Reduced timeouts** for faster execution
- **Memory monitoring** with heap usage logging
- **Test isolation** with proper cleanup

## Memory Management

### Memory Limits

- **Heap Limit**: 200MB for individual tests
- **RSS Limit**: 500MB for test processes
- **Warning Threshold**: 100MB heap usage
- **GC Threshold**: Automatic garbage collection at 70% usage

### Memory Monitoring

The test suite automatically monitors:

- Heap usage before and after each test
- Memory growth patterns
- Potential memory leaks
- Resource cleanup effectiveness

### Memory Optimization

Automatic optimizations include:

- Garbage collection before/after tests
- EventEmitter cleanup
- Singleton reset
- Timer and resource cleanup
- Memory usage assertions

## Troubleshooting

### Common Issues

1. **Memory Leaks**
   - Check EventEmitter listeners
   - Verify singleton cleanup
   - Review timer cleanup
   - Use memory debugging mode

2. **Test Timeouts**
   - Reduce test complexity
   - Use mocks for external services
   - Check for infinite loops
   - Verify cleanup completion

3. **Flaky Tests**
   - Ensure proper test isolation
   - Check for shared state
   - Verify async cleanup
   - Use deterministic test data

### Debug Commands

```bash
# Run with memory debugging
npm run test:memory:debug

# Run specific test with verbose output
npx vitest run path/to/test.ts --reporter=verbose

# Check memory usage
node --expose-gc --trace-gc your-test.js
```

## Best Practices

### Test Writing

1. **Use cleanup utilities** - Always apply `withTestCleanup()`
2. **Register resources** - Use `createTestEventEmitter()` for EventEmitters
3. **Reset singletons** - Use `registerTestSingleton()` for singleton classes
4. **Monitor memory** - Apply `withMemoryOptimization()` for memory-intensive tests
5. **Clean up manually** - Add custom cleanup in `afterEach()` when needed

### Performance

1. **Keep tests focused** - Test one thing at a time
2. **Use mocks** - Mock external dependencies
3. **Minimize data** - Use small test datasets
4. **Avoid global state** - Ensure test isolation
5. **Clean up resources** - Always clean up timers, files, connections

### Memory Management

1. **Monitor usage** - Check memory growth patterns
2. **Force cleanup** - Use garbage collection when needed
3. **Limit scope** - Keep object references minimal
4. **Use weak references** - When appropriate for caches
5. **Profile regularly** - Use memory profiling tools

## Contributing

When adding new tests:

1. Follow the established patterns
2. Use the provided utilities
3. Add proper cleanup
4. Monitor memory usage
5. Document complex test scenarios

For questions or issues, refer to the main project documentation or create an issue in the repository.
