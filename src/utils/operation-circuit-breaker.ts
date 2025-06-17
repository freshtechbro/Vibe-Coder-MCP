/**
 * Operation Circuit Breaker Utility
 * 
 * Implements circuit breaker pattern to prevent cascading failures
 * by monitoring operation failures and providing graceful fallbacks.
 * 
 * The circuit breaker has three states:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: Circuit is open, all requests fail fast with fallback
 * - HALF_OPEN: Testing if service has recovered, limited requests pass through
 */

import logger from '../logger.js';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;
  /** Success threshold to close circuit from half-open */
  successThreshold: number;
  /** Timeout before attempting to close circuit (ms) */
  timeout: number;
  /** Operation timeout (ms) */
  operationTimeout: number;
  /** Monitor window size for failure rate calculation */
  monitoringWindow: number;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
  failureRate: number;
}

/**
 * Operation result with circuit breaker metadata
 */
export interface OperationResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  usedFallback: boolean;
  circuitState: CircuitState;
  executionTime: number;
}

/**
 * Operation Circuit Breaker implementation
 */
export class OperationCircuitBreaker {
  private static circuits = new Map<string, OperationCircuitBreaker>();
  private static readonly DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000, // 1 minute
    operationTimeout: 30000, // 30 seconds
    monitoringWindow: 100 // Last 100 operations
  };

  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttemptTime?: number;
  private recentOperations: Array<{ success: boolean; timestamp: number }> = [];

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = OperationCircuitBreaker.DEFAULT_CONFIG
  ) {}

  /**
   * Get or create a circuit breaker for a named operation
   */
  static getCircuit(name: string, config?: Partial<CircuitBreakerConfig>): OperationCircuitBreaker {
    if (!this.circuits.has(name)) {
      const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
      this.circuits.set(name, new OperationCircuitBreaker(name, fullConfig));
    }
    return this.circuits.get(name)!;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  static async safeExecute<T>(
    operationName: string,
    operation: () => Promise<T>,
    fallback: T | (() => T | Promise<T>),
    config?: Partial<CircuitBreakerConfig>
  ): Promise<OperationResult<T>> {
    const circuit = this.getCircuit(operationName, config);
    return circuit.execute(operation, fallback);
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback: T | (() => T | Promise<T>)
  ): Promise<OperationResult<T>> {
    const startTime = Date.now();
    
    // Check if circuit should allow the operation
    if (!this.shouldAllowOperation()) {
      logger.debug({ 
        circuit: this.name, 
        state: this.state 
      }, 'Circuit breaker preventing operation, using fallback');
      
      const fallbackResult = await this.executeFallback(fallback);
      return {
        success: false,
        result: fallbackResult,
        usedFallback: true,
        circuitState: this.state,
        executionTime: Date.now() - startTime
      };
    }

    try {
      // Execute operation with timeout
      const result = await this.executeWithTimeout(operation);
      
      // Record success
      this.recordSuccess();
      
      logger.debug({ 
        circuit: this.name, 
        state: this.state,
        executionTime: Date.now() - startTime
      }, 'Circuit breaker operation succeeded');
      
      return {
        success: true,
        result,
        usedFallback: false,
        circuitState: this.state,
        executionTime: Date.now() - startTime
      };
      
    } catch (error) {
      // Record failure
      this.recordFailure();
      
      logger.warn({ 
        err: error,
        circuit: this.name, 
        state: this.state,
        executionTime: Date.now() - startTime
      }, 'Circuit breaker operation failed, using fallback');
      
      const fallbackResult = await this.executeFallback(fallback);
      return {
        success: false,
        result: fallbackResult,
        error: error as Error,
        usedFallback: true,
        circuitState: this.state,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check if operation should be allowed based on circuit state
   */
  private shouldAllowOperation(): boolean {
    const now = Date.now();
    
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
        
      case CircuitState.OPEN:
        if (this.nextAttemptTime && now >= this.nextAttemptTime) {
          this.state = CircuitState.HALF_OPEN;
          logger.info({ circuit: this.name }, 'Circuit breaker transitioning to HALF_OPEN');
          return true;
        }
        return false;
        
      case CircuitState.HALF_OPEN:
        return true;
        
      default:
        return false;
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.operationTimeout}ms`));
      }, this.config.operationTimeout);
      
      operation()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Execute fallback function or return fallback value
   */
  private async executeFallback<T>(fallback: T | (() => T | Promise<T>)): Promise<T> {
    if (typeof fallback === 'function') {
      try {
        const result = (fallback as () => T | Promise<T>)();
        return result instanceof Promise ? await result : result;
      } catch (error) {
        logger.error({ err: error, circuit: this.name }, 'Fallback execution failed');
        throw error;
      }
    }
    return fallback;
  }

  /**
   * Record successful operation
   */
  private recordSuccess(): void {
    const now = Date.now();
    this.successes++;
    this.lastSuccessTime = now;
    this.addToRecentOperations(true, now);
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        logger.info({ circuit: this.name }, 'Circuit breaker closed after successful recovery');
      }
    }
  }

  /**
   * Record failed operation
   */
  private recordFailure(): void {
    const now = Date.now();
    this.failures++;
    this.lastFailureTime = now;
    this.addToRecentOperations(false, now);
    
    if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
      const failureRate = this.calculateFailureRate();
      if (this.failures >= this.config.failureThreshold || failureRate > 0.5) {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = now + this.config.timeout;
        logger.warn({ 
          circuit: this.name, 
          failures: this.failures,
          failureRate,
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
        }, 'Circuit breaker opened due to failures');
      }
    }
  }

  /**
   * Add operation result to recent operations window
   */
  private addToRecentOperations(success: boolean, timestamp: number): void {
    this.recentOperations.push({ success, timestamp });
    
    // Keep only recent operations within monitoring window
    if (this.recentOperations.length > this.config.monitoringWindow) {
      this.recentOperations = this.recentOperations.slice(-this.config.monitoringWindow);
    }
  }

  /**
   * Calculate failure rate from recent operations
   */
  private calculateFailureRate(): number {
    if (this.recentOperations.length === 0) {
      return 0;
    }
    
    const failures = this.recentOperations.filter(op => !op.success).length;
    return failures / this.recentOperations.length;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.failures + this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
      failureRate: this.calculateFailureRate()
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttemptTime = undefined;
    this.recentOperations = [];
    
    logger.info({ circuit: this.name }, 'Circuit breaker reset');
  }

  /**
   * Force circuit to specific state (for testing/manual intervention)
   */
  forceState(state: CircuitState): void {
    this.state = state;
    if (state === CircuitState.OPEN) {
      this.nextAttemptTime = Date.now() + this.config.timeout;
    }
    
    logger.info({ circuit: this.name, state }, 'Circuit breaker state forced');
  }

  /**
   * Get all circuit breaker statistics
   */
  static getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, circuit] of this.circuits.entries()) {
      stats[name] = circuit.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
    logger.info('All circuit breakers reset');
  }

  /**
   * Remove circuit breaker
   */
  static removeCircuit(name: string): boolean {
    return this.circuits.delete(name);
  }
}
