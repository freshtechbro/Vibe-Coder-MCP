/**
 * Recursion Guard Utility
 * 
 * Provides method-level recursion detection and prevention to avoid infinite loops
 * and stack overflow errors. Tracks method call stacks and provides safe execution
 * with configurable recursion limits and fallback mechanisms.
 */

import logger from '../logger.js';

/**
 * Recursion guard configuration
 */
export interface RecursionGuardConfig {
  /** Maximum recursion depth allowed */
  maxDepth: number;
  /** Whether to log recursion warnings */
  enableLogging: boolean;
  /** Timeout for method execution (ms) */
  executionTimeout: number;
  /** Whether to track call history */
  trackHistory: boolean;
}

/**
 * Method call information
 */
export interface MethodCall {
  methodName: string;
  timestamp: number;
  depth: number;
  instanceId?: string;
}

/**
 * Recursion detection result
 */
export interface RecursionResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  recursionDetected: boolean;
  callDepth: number;
  executionTime: number;
}

/**
 * Recursion Guard implementation
 */
export class RecursionGuard {
  private static callStacks = new Map<string, MethodCall[]>();
  private static callHistory = new Map<string, MethodCall[]>();
  private static instanceCounters = new Map<string, number>();
  
  private static readonly DEFAULT_CONFIG: RecursionGuardConfig = {
    maxDepth: 10,
    enableLogging: true,
    executionTimeout: 30000, // 30 seconds
    trackHistory: true
  };

  /**
   * Execute method with recursion protection
   */
  static executeWithRecursionGuard<T>(
    methodName: string,
    operation: () => T | Promise<T>,
    config: Partial<RecursionGuardConfig> = {},
    instanceId?: string
  ): Promise<RecursionResult<T>> {
    const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
    const callKey = instanceId ? `${methodName}:${instanceId}` : methodName;
    const startTime = Date.now();

    return new Promise<RecursionResult<T>>((resolve) => {
      // Check current recursion depth
      const currentStack = this.callStacks.get(callKey) || [];
      const currentDepth = currentStack.length;

      // Check for recursion
      if (currentDepth >= fullConfig.maxDepth) {
        if (fullConfig.enableLogging) {
          logger.warn({
            methodName,
            instanceId,
            currentDepth,
            maxDepth: fullConfig.maxDepth,
            callStack: currentStack.map(call => ({
              method: call.methodName,
              depth: call.depth,
              timestamp: call.timestamp
            }))
          }, 'Recursion limit exceeded, preventing infinite recursion');
        }

        resolve({
          success: false,
          recursionDetected: true,
          callDepth: currentDepth,
          executionTime: Date.now() - startTime,
          error: new Error(`Recursion limit exceeded for method: ${methodName} (depth: ${currentDepth})`)
        });
        return;
      }

      // Add current call to stack
      const currentCall: MethodCall = {
        methodName,
        timestamp: startTime,
        depth: currentDepth,
        instanceId
      };

      currentStack.push(currentCall);
      this.callStacks.set(callKey, currentStack);

      // Add to history if tracking enabled
      if (fullConfig.trackHistory) {
        const history = this.callHistory.get(callKey) || [];
        history.push({ ...currentCall });
        
        // Keep only recent history (last 100 calls)
        if (history.length > 100) {
          history.splice(0, history.length - 100);
        }
        
        this.callHistory.set(callKey, history);
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.removeFromStack(callKey, currentCall);
        
        if (fullConfig.enableLogging) {
          logger.warn({
            methodName,
            instanceId,
            executionTime: Date.now() - startTime,
            timeout: fullConfig.executionTimeout
          }, 'Method execution timeout, possible infinite loop');
        }

        resolve({
          success: false,
          recursionDetected: false,
          callDepth: currentDepth,
          executionTime: Date.now() - startTime,
          error: new Error(`Method execution timeout: ${methodName} (${fullConfig.executionTimeout}ms)`)
        });
      }, fullConfig.executionTimeout);

      // Execute the operation
      try {
        const operationResult = operation();
        
        if (operationResult instanceof Promise) {
          // Handle async operation
          operationResult
            .then(result => {
              clearTimeout(timeoutId);
              this.removeFromStack(callKey, currentCall);
              
              if (fullConfig.enableLogging && currentDepth > 0) {
                logger.debug({
                  methodName,
                  instanceId,
                  depth: currentDepth,
                  executionTime: Date.now() - startTime
                }, 'Async method execution completed successfully');
              }

              resolve({
                success: true,
                result,
                recursionDetected: false,
                callDepth: currentDepth,
                executionTime: Date.now() - startTime
              });
            })
            .catch(error => {
              clearTimeout(timeoutId);
              this.removeFromStack(callKey, currentCall);
              
              if (fullConfig.enableLogging) {
                logger.warn({
                  err: error,
                  methodName,
                  instanceId,
                  depth: currentDepth,
                  executionTime: Date.now() - startTime
                }, 'Async method execution failed');
              }

              resolve({
                success: false,
                recursionDetected: false,
                callDepth: currentDepth,
                executionTime: Date.now() - startTime,
                error: error instanceof Error ? error : new Error(String(error))
              });
            });
        } else {
          // Handle sync operation
          clearTimeout(timeoutId);
          this.removeFromStack(callKey, currentCall);
          
          if (fullConfig.enableLogging && currentDepth > 0) {
            logger.debug({
              methodName,
              instanceId,
              depth: currentDepth,
              executionTime: Date.now() - startTime
            }, 'Sync method execution completed successfully');
          }

          resolve({
            success: true,
            result: operationResult,
            recursionDetected: false,
            callDepth: currentDepth,
            executionTime: Date.now() - startTime
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        this.removeFromStack(callKey, currentCall);
        
        if (fullConfig.enableLogging) {
          logger.warn({
            err: error,
            methodName,
            instanceId,
            depth: currentDepth,
            executionTime: Date.now() - startTime
          }, 'Sync method execution failed');
        }

        resolve({
          success: false,
          recursionDetected: false,
          callDepth: currentDepth,
          executionTime: Date.now() - startTime,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    });
  }

  /**
   * Remove call from stack
   */
  private static removeFromStack(callKey: string, callToRemove: MethodCall): void {
    const stack = this.callStacks.get(callKey);
    if (stack) {
      const index = stack.findIndex(call => 
        call.timestamp === callToRemove.timestamp && 
        call.depth === callToRemove.depth
      );
      
      if (index !== -1) {
        stack.splice(index, 1);
        
        if (stack.length === 0) {
          this.callStacks.delete(callKey);
        } else {
          this.callStacks.set(callKey, stack);
        }
      }
    }
  }

  /**
   * Check if method is currently executing (recursion check)
   */
  static isMethodExecuting(methodName: string, instanceId?: string): boolean {
    const callKey = instanceId ? `${methodName}:${instanceId}` : methodName;
    const stack = this.callStacks.get(callKey);
    return stack ? stack.length > 0 : false;
  }

  /**
   * Get current call depth for method
   */
  static getCurrentDepth(methodName: string, instanceId?: string): number {
    const callKey = instanceId ? `${methodName}:${instanceId}` : methodName;
    const stack = this.callStacks.get(callKey);
    return stack ? stack.length : 0;
  }

  /**
   * Get call stack for method
   */
  static getCallStack(methodName: string, instanceId?: string): MethodCall[] {
    const callKey = instanceId ? `${methodName}:${instanceId}` : methodName;
    return this.callStacks.get(callKey) || [];
  }

  /**
   * Get call history for method
   */
  static getCallHistory(methodName: string, instanceId?: string): MethodCall[] {
    const callKey = instanceId ? `${methodName}:${instanceId}` : methodName;
    return this.callHistory.get(callKey) || [];
  }

  /**
   * Clear all call stacks and history
   */
  static clearAll(): void {
    this.callStacks.clear();
    this.callHistory.clear();
    this.instanceCounters.clear();
  }

  /**
   * Clear call stack for specific method
   */
  static clearMethod(methodName: string, instanceId?: string): void {
    const callKey = instanceId ? `${methodName}:${instanceId}` : methodName;
    this.callStacks.delete(callKey);
    this.callHistory.delete(callKey);
  }

  /**
   * Generate unique instance ID for method tracking
   */
  static generateInstanceId(methodName: string): string {
    const counter = this.instanceCounters.get(methodName) || 0;
    const newCounter = counter + 1;
    this.instanceCounters.set(methodName, newCounter);
    return `${methodName}_${newCounter}_${Date.now()}`;
  }

  /**
   * Get statistics about all tracked methods
   */
  static getStatistics(): {
    activeStacks: number;
    totalMethods: number;
    deepestStack: number;
    methodStats: Record<string, {
      currentDepth: number;
      historyCount: number;
      lastCall?: number;
    }>;
  } {
    let deepestStack = 0;
    const methodStats: Record<string, {
      currentDepth: number;
      historyCount: number;
      lastCall?: number;
    }> = {};

    // Analyze call stacks
    for (const [callKey, stack] of this.callStacks.entries()) {
      if (stack.length > deepestStack) {
        deepestStack = stack.length;
      }

      const history = this.callHistory.get(callKey) || [];
      const lastCall = stack.length > 0 ? stack[stack.length - 1].timestamp : 
                      history.length > 0 ? history[history.length - 1].timestamp : undefined;

      methodStats[callKey] = {
        currentDepth: stack.length,
        historyCount: history.length,
        lastCall
      };
    }

    // Add methods that have history but no active stack
    for (const [callKey, history] of this.callHistory.entries()) {
      if (!methodStats[callKey]) {
        methodStats[callKey] = {
          currentDepth: 0,
          historyCount: history.length,
          lastCall: history.length > 0 ? history[history.length - 1].timestamp : undefined
        };
      }
    }

    return {
      activeStacks: this.callStacks.size,
      totalMethods: Object.keys(methodStats).length,
      deepestStack,
      methodStats
    };
  }

  /**
   * Create a method decorator for automatic recursion protection
   */
  static createMethodGuard<T extends (...args: any[]) => any>(
    methodName: string,
    config: Partial<RecursionGuardConfig> = {}
  ) {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;

      descriptor.value = async function(...args: any[]) {
        const instanceId = RecursionGuard.generateInstanceId(methodName);
        
        const result = await RecursionGuard.executeWithRecursionGuard(
          methodName,
          () => originalMethod.apply(this, args),
          config,
          instanceId
        );

        if (!result.success) {
          throw result.error || new Error(`Method execution failed: ${methodName}`);
        }

        return result.result;
      };

      return descriptor;
    };
  }
}
