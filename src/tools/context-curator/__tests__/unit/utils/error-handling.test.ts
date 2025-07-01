import { describe, it, expect } from 'vitest';
import { ZodIssue } from 'zod';
import {
  ContextCuratorError,
  ContextCuratorLLMError,
  ContextCuratorConfigError,
  ContextCuratorFileError,
  ContextCuratorValidationError,
  ContextCuratorTokenBudgetError,
  ContextCuratorTimeoutError,
  ErrorHandler
} from '../../../utils/error-handling.js';

describe('ContextCuratorError', () => {
  it('should create base error with default values', () => {
    const error = new ContextCuratorError('Test error');
    
    expect(error.name).toBe('ContextCuratorError');
    expect(error.message).toBe('Test error');
    expect(error.recoverable).toBe(false);
    expect(error.severity).toBe('medium');
    expect(error.operation).toBeUndefined();
    expect(error.context).toBeUndefined();
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.cause).toBeUndefined();
  });

  it('should create error with custom options', () => {
    const context = { filePath: '/test/file.ts', lineNumber: 42 };
    const cause = new Error('Original error');
    
    const error = new ContextCuratorError('Test error', {
      context,
      recoverable: true,
      severity: 'high',
      operation: 'test_operation',
      cause
    });
    
    expect(error.context).toEqual(context);
    expect(error.recoverable).toBe(true);
    expect(error.severity).toBe('high');
    expect(error.operation).toBe('test_operation');
    expect(error.cause).toBe(cause);
  });

  it('should provide recovery hints', () => {
    const error = new ContextCuratorError('Test error', {
      recoverable: true,
      operation: 'file_processing',
      context: { filePath: '/test/file.ts', tokenBudget: 1000 }
    });
    
    const hints = error.getRecoveryHints();
    
    expect(hints).toContain('This error may be recoverable - consider retrying the operation');
    expect(hints).toContain('Check the file_processing operation parameters and configuration');
    expect(hints).toContain('Verify file accessibility: /test/file.ts');
    expect(hints).toContain('Consider adjusting token budget or file selection criteria');
  });

  it('should provide non-recoverable hints', () => {
    const error = new ContextCuratorError('Test error', { recoverable: false });
    const hints = error.getRecoveryHints();
    
    expect(hints).toContain('This error requires manual intervention to resolve');
  });

  it('should convert to structured object', () => {
    const context = { test: 'value' };
    const cause = new Error('Original error');
    const error = new ContextCuratorError('Test error', {
      context,
      recoverable: true,
      severity: 'high',
      operation: 'test_op',
      cause
    });
    
    const structured = error.toStructured();
    
    expect(structured.name).toBe('ContextCuratorError');
    expect(structured.message).toBe('Test error');
    expect(structured.severity).toBe('high');
    expect(structured.recoverable).toBe(true);
    expect(structured.operation).toBe('test_op');
    expect(structured.context).toEqual(context);
    expect(structured.timestamp).toBeDefined();
    expect(structured.stack).toBeDefined();
    expect(structured.cause).toEqual({
      name: 'Error',
      message: 'Original error',
      stack: cause.stack
    });
  });
});

describe('ContextCuratorLLMError', () => {
  it('should create LLM error with task context', () => {
    const error = new ContextCuratorLLMError('LLM failed', {
      task: 'intent_analysis',
      model: 'gpt-4',
      tokenCount: 5000
    });
    
    expect(error.name).toBe('ContextCuratorLLMError');
    expect(error.task).toBe('intent_analysis');
    expect(error.model).toBe('gpt-4');
    expect(error.tokenCount).toBe(5000);
    expect(error.recoverable).toBe(true);
    expect(error.severity).toBe('medium');
    expect(error.operation).toBe('llm_processing');
  });

  it('should provide LLM-specific recovery hints', () => {
    const error = new ContextCuratorLLMError('Token limit exceeded', {
      task: 'prompt_refinement',
      model: 'gpt-3.5-turbo',
      tokenCount: 150000
    });
    
    const hints = error.getRecoveryHints();
    
    expect(hints).toContain('Retry the prompt_refinement operation with adjusted parameters');
    expect(hints).toContain('Consider reducing token count by optimizing file content or selection');
    expect(hints).toContain('Consider using a different model than gpt-3.5-turbo');
    expect(hints).toContain('Check LLM service availability and rate limits');
  });
});

describe('ContextCuratorConfigError', () => {
  it('should create config error', () => {
    const error = new ContextCuratorConfigError('Invalid config', {
      configKey: 'maxTokens',
      expectedType: 'number',
      actualValue: 'invalid'
    });
    
    expect(error.name).toBe('ContextCuratorConfigError');
    expect(error.configKey).toBe('maxTokens');
    expect(error.expectedType).toBe('number');
    expect(error.recoverable).toBe(false);
    expect(error.severity).toBe('high');
    expect(error.operation).toBe('configuration_loading');
  });

  it('should provide config-specific recovery hints', () => {
    const error = new ContextCuratorConfigError('Invalid config', {
      configKey: 'tokenBudget',
      expectedType: 'number'
    });
    
    const hints = error.getRecoveryHints();
    
    expect(hints).toContain('Check configuration for key: tokenBudget');
    expect(hints).toContain('Ensure tokenBudget is of type: number');
    expect(hints).toContain('Verify environment variables and configuration files');
    expect(hints).toContain('Check Context Curator configuration documentation');
  });
});

describe('ContextCuratorFileError', () => {
  it('should create file error', () => {
    const cause = new Error('ENOENT: file not found');
    const error = new ContextCuratorFileError('File not found', {
      filePath: '/test/missing.ts',
      fileOperation: 'read',
      cause
    });
    
    expect(error.name).toBe('ContextCuratorFileError');
    expect(error.filePath).toBe('/test/missing.ts');
    expect(error.fileOperation).toBe('read');
    expect(error.recoverable).toBe(true);
    expect(error.severity).toBe('medium');
    expect(error.operation).toBe('file_processing');
    expect(error.cause).toBe(cause);
  });

  it('should provide file-specific recovery hints', () => {
    const error = new ContextCuratorFileError('Permission denied', {
      filePath: '/restricted/file.ts',
      fileOperation: 'read'
    });
    
    const hints = error.getRecoveryHints();
    
    expect(hints).toContain('Verify file exists and is accessible: /restricted/file.ts');
    expect(hints).toContain('Check permissions for read operation');
    expect(hints).toContain('Ensure file is not locked by another process');
    expect(hints).toContain('Check file encoding and format');
  });

  it('should provide glob-specific hints', () => {
    const error = new ContextCuratorFileError('Invalid glob pattern', {
      filePath: '/test/**/*.{ts,js',
      fileOperation: 'glob'
    });
    
    const hints = error.getRecoveryHints();
    
    expect(hints).toContain('Verify glob pattern syntax and directory structure');
  });
});

describe('ContextCuratorValidationError', () => {
  it('should create validation error with Zod issues', () => {
    const validationIssues: ZodIssue[] = [
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['userPrompt'],
        message: 'Expected string, received number'
      }
    ];
    
    const error = new ContextCuratorValidationError('Validation failed', {
      validationIssues,
      schemaName: 'ContextCuratorInput',
      invalidData: { userPrompt: 123 }
    });
    
    expect(error.name).toBe('ContextCuratorValidationError');
    expect(error.validationIssues).toEqual(validationIssues);
    expect(error.schemaName).toBe('ContextCuratorInput');
    expect(error.recoverable).toBe(true);
    expect(error.severity).toBe('medium');
    expect(error.operation).toBe('data_validation');
  });

  it('should provide validation-specific recovery hints', () => {
    const validationIssues: ZodIssue[] = [
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['userPrompt'],
        message: 'Expected string, received number'
      },
      {
        code: 'too_small',
        minimum: 1,
        type: 'string',
        inclusive: true,
        exact: false,
        path: ['taskType'],
        message: 'String must contain at least 1 character(s)'
      }
    ];
    
    const error = new ContextCuratorValidationError('Validation failed', {
      validationIssues,
      schemaName: 'InputSchema'
    });
    
    const hints = error.getRecoveryHints();
    
    expect(hints).toContain('Check data format for schema: InputSchema');
    expect(hints).toContain('Validation issues found:');
    expect(hints).toContain('  - userPrompt: Expected string, received number');
    expect(hints).toContain('  - taskType: String must contain at least 1 character(s)');
    expect(hints).toContain('Verify input data matches expected schema format');
  });
});

describe('ContextCuratorTokenBudgetError', () => {
  it('should create token budget error', () => {
    const error = new ContextCuratorTokenBudgetError('Token budget exceeded', {
      currentTokens: 15000,
      maxTokens: 10000,
      operation: 'file_processing'
    });
    
    expect(error.name).toBe('ContextCuratorTokenBudgetError');
    expect(error.currentTokens).toBe(15000);
    expect(error.maxTokens).toBe(10000);
    expect(error.overagePercentage).toBe(50);
    expect(error.recoverable).toBe(true);
    expect(error.severity).toBe('medium');
    expect(error.operation).toBe('file_processing');
  });

  it('should set high severity for large overages', () => {
    const error = new ContextCuratorTokenBudgetError('Massive overage', {
      currentTokens: 20000,
      maxTokens: 10000
    });
    
    expect(error.severity).toBe('high');
    expect(error.overagePercentage).toBe(100);
  });

  it('should provide token budget recovery hints', () => {
    const error = new ContextCuratorTokenBudgetError('Budget exceeded', {
      currentTokens: 25000,
      maxTokens: 10000
    });
    
    const hints = error.getRecoveryHints();
    
    expect(hints).toContain('Current tokens (25000) exceed budget (10000) by 150.0%');
    expect(hints).toContain('Consider reducing file selection or optimizing content');
    expect(hints).toContain('Increase token budget if more content is essential');
    expect(hints).toContain('Use more aggressive content optimization settings');
    expect(hints).toContain('Consider splitting the task into smaller chunks');
  });
});

describe('ContextCuratorTimeoutError', () => {
  it('should create timeout error', () => {
    const error = new ContextCuratorTimeoutError('Operation timed out', {
      timeoutMs: 30000,
      actualDurationMs: 35000,
      operation: 'llm_processing'
    });

    expect(error.name).toBe('ContextCuratorTimeoutError');
    expect(error.timeoutMs).toBe(30000);
    expect(error.actualDurationMs).toBe(35000);
    expect(error.recoverable).toBe(true);
    expect(error.severity).toBe('medium');
    expect(error.operation).toBe('llm_processing');
  });

  it('should provide timeout recovery hints', () => {
    const error = new ContextCuratorTimeoutError('Timeout occurred', {
      timeoutMs: 60000,
      actualDurationMs: 65000
    });

    const hints = error.getRecoveryHints();

    expect(hints).toContain('Operation timed out after 60000ms');
    expect(hints).toContain('Consider increasing timeout duration');
    expect(hints).toContain('Check network connectivity and service availability');
    expect(hints).toContain('Retry the operation with exponential backoff');
    expect(hints).toContain('Operation ran for 65000ms before timeout');
  });

  it('should handle timeout without actual duration', () => {
    const error = new ContextCuratorTimeoutError('Timeout', {
      timeoutMs: 30000
    });

    const hints = error.getRecoveryHints();

    expect(hints).toContain('Operation timed out after 30000ms');
    expect(hints).not.toContain('Operation ran for');
  });
});

describe('ErrorHandler', () => {
  describe('withErrorContext', () => {
    it('should execute function successfully', async () => {
      const result = await ErrorHandler.withErrorContext(
        'test_operation',
        async () => 'success'
      );

      expect(result).toBe('success');
    });

    it('should wrap unknown errors', async () => {
      const originalError = new Error('Original error');

      await expect(
        ErrorHandler.withErrorContext(
          'test_operation',
          async () => { throw originalError; },
          { testContext: 'value' }
        )
      ).rejects.toThrow(ContextCuratorError);

      try {
        await ErrorHandler.withErrorContext(
          'test_operation',
          async () => { throw originalError; },
          { testContext: 'value' }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ContextCuratorError);
        const ccError = error as ContextCuratorError;
        expect(ccError.operation).toBe('test_operation');
        expect(ccError.context).toEqual({ testContext: 'value' });
        expect(ccError.cause).toBe(originalError);
      }
    });

    it('should re-throw ContextCuratorError with additional context', async () => {
      const originalError = new ContextCuratorLLMError('LLM failed', {
        task: 'test_task'
      });

      try {
        await ErrorHandler.withErrorContext(
          'wrapper_operation',
          async () => { throw originalError; },
          { additionalContext: 'value' }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ContextCuratorError);
        const ccError = error as ContextCuratorError;
        expect(ccError.operation).toBe('llm_processing'); // Original operation preserved
        expect(ccError.context).toEqual({
          task: 'test_task',
          additionalContext: 'value'
        });
      }
    });
  });

  describe('isRecoverable', () => {
    it('should return true for recoverable ContextCuratorError', () => {
      const error = new ContextCuratorError('Test', { recoverable: true });
      expect(ErrorHandler.isRecoverable(error)).toBe(true);
    });

    it('should return false for non-recoverable ContextCuratorError', () => {
      const error = new ContextCuratorError('Test', { recoverable: false });
      expect(ErrorHandler.isRecoverable(error)).toBe(false);
    });

    it('should return false for unknown errors', () => {
      const error = new Error('Unknown error');
      expect(ErrorHandler.isRecoverable(error)).toBe(false);
    });
  });

  describe('getSeverity', () => {
    it('should return severity from ContextCuratorError', () => {
      const error = new ContextCuratorError('Test', { severity: 'high' });
      expect(ErrorHandler.getSeverity(error)).toBe('high');
    });

    it('should return medium for unknown errors', () => {
      const error = new Error('Unknown error');
      expect(ErrorHandler.getSeverity(error)).toBe('medium');
    });
  });

  describe('formatForLogging', () => {
    it('should format ContextCuratorError', () => {
      const error = new ContextCuratorError('Test error', {
        severity: 'high',
        recoverable: true,
        operation: 'test_op',
        context: { test: 'value' }
      });

      const formatted = ErrorHandler.formatForLogging(error);

      expect(formatted.name).toBe('ContextCuratorError');
      expect(formatted.message).toBe('Test error');
      expect(formatted.severity).toBe('high');
      expect(formatted.recoverable).toBe(true);
      expect(formatted.operation).toBe('test_op');
      expect(formatted.context).toEqual({ test: 'value' });
      expect(formatted.timestamp).toBeDefined();
      expect(formatted.stack).toBeDefined();
    });

    it('should format regular Error', () => {
      const error = new Error('Regular error');
      const formatted = ErrorHandler.formatForLogging(error);

      expect(formatted.name).toBe('Error');
      expect(formatted.message).toBe('Regular error');
      expect(formatted.severity).toBe('medium');
      expect(formatted.recoverable).toBe(false);
      expect(formatted.stack).toBeDefined();
    });

    it('should format unknown error', () => {
      const error = 'String error';
      const formatted = ErrorHandler.formatForLogging(error);

      expect(formatted.name).toBe('UnknownError');
      expect(formatted.message).toBe('String error');
      expect(formatted.severity).toBe('medium');
      expect(formatted.recoverable).toBe(false);
    });
  });

  describe('createError', () => {
    it('should create LLM error for LLM operations', () => {
      const error = ErrorHandler.createError(
        'LLM failed',
        'llm_processing',
        undefined,
        { model: 'gpt-4' }
      );

      expect(error).toBeInstanceOf(ContextCuratorLLMError);
      expect((error as ContextCuratorLLMError).task).toBe('llm_processing');
    });

    it('should create config error for config operations', () => {
      const error = ErrorHandler.createError(
        'Config invalid',
        'configuration_loading',
        undefined,
        { configKey: 'test' }
      );

      expect(error).toBeInstanceOf(ContextCuratorConfigError);
    });

    it('should create file error for file operations', () => {
      const error = ErrorHandler.createError(
        'File not found',
        'file_processing',
        undefined,
        { filePath: '/test/file.ts', fileOperation: 'read' }
      );

      expect(error).toBeInstanceOf(ContextCuratorFileError);
      expect((error as ContextCuratorFileError).filePath).toBe('/test/file.ts');
    });

    it('should create validation error for validation operations', () => {
      const error = ErrorHandler.createError(
        'Validation failed',
        'data_validation'
      );

      expect(error).toBeInstanceOf(ContextCuratorValidationError);
    });

    it('should create token budget error when token context provided', () => {
      const error = ErrorHandler.createError(
        'Budget exceeded',
        'token_estimation',
        undefined,
        { currentTokens: 15000, maxTokens: 10000 }
      );

      expect(error).toBeInstanceOf(ContextCuratorTokenBudgetError);
    });

    it('should create timeout error when timeout context provided', () => {
      const error = ErrorHandler.createError(
        'Timeout occurred',
        'timeout',
        undefined,
        { timeoutMs: 30000 }
      );

      expect(error).toBeInstanceOf(ContextCuratorTimeoutError);
    });

    it('should create base error for unknown operations', () => {
      const error = ErrorHandler.createError(
        'Unknown error',
        'unknown_operation'
      );

      expect(error).toBeInstanceOf(ContextCuratorError);
      expect(error.constructor).toBe(ContextCuratorError);
    });
  });
});
