// src/tools/sequential-thinking.test.ts
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios'; // Import axios to mock it
// Import the REAL function we are testing
import { processWithSequentialThinking, getNextThought, SEQUENTIAL_THINKING_SYSTEM_PROMPT } from './sequential-thinking.js'; // Added getNextThought
import { OpenRouterConfig } from '../types/workflow.js';
import { ValidationError, ParsingError, FallbackError, ApiError } from '../utils/errors.js'; // Added FallbackError, ApiError
import logger from '../logger.js';
import { SequentialThought as ZodSequentialThought } from '../types/sequentialThought.js';

// Mock axios globally for this test suite
vi.mock('axios');
const mockedAxiosPost = vi.mocked(axios.post); // Helper for typed mocking

// Mock logger separately
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// Mock config with a valid URL structure
const mockConfig: OpenRouterConfig = {
    baseUrl: 'http://mock-api.test', apiKey: 'mock-key', defaultModel: 'mock-default', perplexityModel: 'mock-perplexity'
};
const baseUserPrompt = 'Solve this problem';
const baseSystemPrompt = 'System prompt';
const expectedApiUrl = `${mockConfig.baseUrl}/chat/completions`;

// Helper to create a mock API response
const createMockApiResponse = (content: ZodSequentialThought) => ({
  data: {
    choices: [{ message: { content: JSON.stringify(content) } }]
  }
});

// Helper to create a mock API error response
const createMockApiError = (status: number, message: string) => {
    const error = new Error(message) as any; // Cast to any to add properties
    error.isAxiosError = true;
    // Mimic the exact structure Axios uses for errors
    error.response = {
        status,
        data: null // Having null data instead of undefined to avoid TypeError
    };
    // This error will become the 'originalError' in ApiError
    return error;
};


describe('processWithSequentialThinking', () => {

  beforeEach(() => {
    // Reset mocks usage between tests
    vi.clearAllMocks();
    mockedAxiosPost.mockClear(); // Clear axios mock calls
    // Clear logger mocks
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.debug).mockClear();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();
  });

  afterEach(() => {
      vi.restoreAllMocks(); // Restore mocks if needed, though clearAllMocks might suffice
  });

  it('should complete successfully after multiple thoughts', async () => {
    // Mock sequence: Thought 1 -> Thought 2 -> Final Thought
    mockedAxiosPost
      .mockResolvedValueOnce(createMockApiResponse({ thought: 'Step 1 analysis', next_thought_needed: true, thought_number: 1, total_thoughts: 3 }))
      .mockResolvedValueOnce(createMockApiResponse({ thought: 'Step 2 refinement', next_thought_needed: true, thought_number: 2, total_thoughts: 3 }))
      .mockResolvedValueOnce(createMockApiResponse({ thought: 'Final Answer', next_thought_needed: false, thought_number: 3, total_thoughts: 3 }));

    const result = await processWithSequentialThinking(baseUserPrompt, mockConfig, baseSystemPrompt);

    expect(result).toBe('Final Answer');
    expect(mockedAxiosPost).toHaveBeenCalledTimes(3);
    // Check API calls with type assertions for payload
    expect(mockedAxiosPost.mock.calls[0][0]).toBe(expectedApiUrl);
    expect((mockedAxiosPost.mock.calls[0][1] as { messages: { role: string; content: string }[] }).messages[1].content).toContain('Provide your first thought:');
    expect(mockedAxiosPost.mock.calls[1][0]).toBe(expectedApiUrl);
    expect((mockedAxiosPost.mock.calls[1][1] as { messages: { role: string; content: string }[] }).messages[1].content).toContain('Previous thoughts:\n[Thought 1/3]: Step 1 analysis');
    expect(mockedAxiosPost.mock.calls[2][0]).toBe(expectedApiUrl);
    expect((mockedAxiosPost.mock.calls[2][1] as { messages: { role: string; content: string }[] }).messages[1].content).toContain('Previous thoughts:\n[Thought 1/3]: Step 1 analysis\n\n[Thought 2/3]: Step 2 refinement');
    // Check system prompt usage with type assertion
    const combinedSystemPrompt = `${SEQUENTIAL_THINKING_SYSTEM_PROMPT}\n\n${baseSystemPrompt}`;
    expect((mockedAxiosPost.mock.calls[0][1] as { messages: { role: string; content: string }[] }).messages[0].content).toBe(combinedSystemPrompt);
   });

  it('should retry on validation error (bad JSON) and succeed on retry', async () => {
     // Mock API returning bad JSON first, then good JSON
     mockedAxiosPost
       .mockResolvedValueOnce({ data: { choices: [{ message: { content: '{ bad json' } }] } }) // Invalid JSON
       .mockResolvedValueOnce(createMockApiResponse({ thought: 'Successful Retry Answer', next_thought_needed: false, thought_number: 1, total_thoughts: 1 })); // Valid on retry

     const result = await processWithSequentialThinking(baseUserPrompt, mockConfig);

     expect(result).toBe('Successful Retry Answer');
     expect(mockedAxiosPost).toHaveBeenCalledTimes(2);
     // Verify the second call's prompt contains the error message with type assertion
     expect((mockedAxiosPost.mock.calls[1][1] as { messages: { role: string; content: string }[] }).messages[1].content).toContain('Your previous attempt (attempt 1) failed with this error');
     expect((mockedAxiosPost.mock.calls[1][1] as { messages: { role: string; content: string }[] }).messages[1].content).toContain('LLM output was not valid JSON'); // Check for ParsingError message
     expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(ParsingError), attempt: 1 }), expect.stringContaining('Attempt 1 to get thought'));
     expect(vi.mocked(logger.info)).toHaveBeenCalledWith(expect.stringContaining('Retrying thought generation (attempt 2)...'));
   });

   it('should retry on validation error (schema mismatch) and succeed on retry', async () => {
    // Mock API returning JSON missing required fields first, then good JSON
    mockedAxiosPost
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: JSON.stringify({ thought: 'Incomplete' }) } }] } }) // Fails schema validation
      .mockResolvedValueOnce(createMockApiResponse({ thought: 'Successful Retry Answer', next_thought_needed: false, thought_number: 1, total_thoughts: 1 })); // Valid on retry

    const result = await processWithSequentialThinking(baseUserPrompt, mockConfig);

    expect(result).toBe('Successful Retry Answer');
    expect(mockedAxiosPost).toHaveBeenCalledTimes(2);
    // Verify the second call's prompt contains the error message with type assertion
    expect((mockedAxiosPost.mock.calls[1][1] as { messages: { role: string; content: string }[] }).messages[1].content).toContain('Your previous attempt (attempt 1) failed with this error');
    expect((mockedAxiosPost.mock.calls[1][1] as { messages: { role: string; content: string }[] }).messages[1].content).toContain('Sequential thought validation failed'); // Check for ValidationError message
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(ValidationError), attempt: 1 }), expect.stringContaining('Attempt 1 to get thought'));
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(expect.stringContaining('Retrying thought generation (attempt 2)...'));
  });


   it('should fail after exhausting retries on persistent validation errors', async () => {
       // Mock API always returning bad JSON
       mockedAxiosPost.mockResolvedValue({ data: { choices: [{ message: { content: '{ bad json' } }] } });

       // Assuming maxRetries = 3 internally
       // It should now throw FallbackError after getNextThought retries fail
       await expect(processWithSequentialThinking(baseUserPrompt, mockConfig))
         .rejects.toThrow(FallbackError);

       // processWithSequentialThinking retries 3 times
       // getNextThought retries 2 times internally for each outer attempt
       // First outer attempt: 2 inner calls -> FallbackError thrown by getNextThought
       // FallbackError caught by outer loop -> Thrown immediately
       expect(mockedAxiosPost).toHaveBeenCalledTimes(2); // Only the internal retries of getNextThought happen
       expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
         expect.objectContaining({ message: 'Persistent LLM formatting error after retries and cleaning. Throwing FallbackError.' }),
       );
       expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
         expect.objectContaining({ message: 'Sequential thinking aborted due to persistent LLM formatting error (FallbackError). Not retrying.' }),
       );
       expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(1); // Called for the first failed attempt in getNextThought
   });

   it('should fail immediately on API error without retrying', async () => {
       const apiError = createMockApiError(401, 'Auth failed');
       mockedAxiosPost.mockRejectedValueOnce(apiError); // Fail with API error

       // Expect the specific ApiError to be thrown up
       await expect(processWithSequentialThinking(baseUserPrompt, mockConfig))
         .rejects.toThrow(ApiError);

       // Verify it only tried once and didn't retry
       expect(mockedAxiosPost).toHaveBeenCalledTimes(1);

       // Verify it didn't attempt to retry (no info log)
       expect(vi.mocked(logger.info)).not.toHaveBeenCalledWith(
         expect.stringContaining('Retrying')
       );
       // Verify the specific API error log from processWithSequentialThinking
       expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
         expect.objectContaining({ err: expect.any(ApiError) }),
         "API error occurred - not retrying"
       );
   });

   // --- Test for Fence Stripping ---
   it('getNextThought should successfully parse JSON wrapped in Markdown fences', async () => {
     const validThought: ZodSequentialThought = { thought: 'Valid thought inside fences', next_thought_needed: false, thought_number: 1, total_thoughts: 1 };
     const fencedContent = `\`\`\`json\n${JSON.stringify(validThought, null, 2)}\n\`\`\``;
     mockedAxiosPost.mockResolvedValueOnce({ data: { choices: [{ message: { content: fencedContent } }] } });

     const result = await getNextThought(baseUserPrompt, baseSystemPrompt, mockConfig, 1);

     expect(result).toEqual(validThought);
     expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
     expect(vi.mocked(logger.debug)).toHaveBeenCalledWith(
       expect.objectContaining({ cleaned: JSON.stringify(validThought) }),
       "Stripped potential garbage/fences from LLM JSON response."
     );
   });

   // --- Tests for Explicit Fallback Error Propagation ---

   it('getNextThought should throw FallbackError on final ParsingError (bad JSON after cleaning)', async () => {
     // Mock API always returning bad JSON (even after potential cleaning)
     const badJsonContent = '{ bad json';
     // Simulate it being wrapped in fences initially
     const rawFencedContent = `\`\`\`json\n${badJsonContent}\n\`\`\``;
     mockedAxiosPost.mockResolvedValue({ data: { choices: [{ message: { content: rawFencedContent } }] } });
     const expectedThoughtNumber = 1;

     // Call getNextThought directly (assuming maxRetries=2 internally for getNextThought)
     await expect(getNextThought(baseUserPrompt, baseSystemPrompt, mockConfig, expectedThoughtNumber))
       .rejects.toThrow(FallbackError);

     expect(mockedAxiosPost).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
     // Check the specific error log for FallbackError being thrown
     expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
       expect.objectContaining({ message: 'Persistent LLM formatting error after retries and cleaning. Throwing FallbackError.' }),
     );
     // Verify the thrown error details
     try {
        await getNextThought(baseUserPrompt, baseSystemPrompt, mockConfig, expectedThoughtNumber);
     } catch (e) {
        expect(e).toBeInstanceOf(FallbackError);
        const fallbackError = e as FallbackError;
        expect(fallbackError.message).toContain('persistent LLM formatting error');
        expect(fallbackError.rawContent).toBe(rawFencedContent); // Should contain original raw content
        expect(fallbackError.originalError).toBeInstanceOf(ParsingError);
        // Check context includes cleaned content
        expect(fallbackError.context?.cleanedContent).toBe(badJsonContent);
     }
   });

   it('getNextThought should throw FallbackError on final ValidationError (schema mismatch after cleaning)', async () => {
     // Mock API always returning incomplete JSON (wrapped in fences)
     const incompleteJsonContent = JSON.stringify({ thought: 'Incomplete' });
     const rawFencedContent = `\`\`\`json\n${incompleteJsonContent}\n\`\`\``;
     mockedAxiosPost.mockResolvedValue({ data: { choices: [{ message: { content: rawFencedContent } }] } });
     const expectedThoughtNumber = 1;

     // Call getNextThought directly
      await expect(getNextThought(baseUserPrompt, baseSystemPrompt, mockConfig, expectedThoughtNumber))
       .rejects.toThrow(FallbackError);

     expect(mockedAxiosPost).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
     expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
       expect.objectContaining({ message: 'Persistent LLM formatting error after retries and cleaning. Throwing FallbackError.' }),
     );
      try {
        await getNextThought(baseUserPrompt, baseSystemPrompt, mockConfig, expectedThoughtNumber);
     } catch (e) {
        expect(e).toBeInstanceOf(FallbackError);
        const fallbackError = e as FallbackError;
        expect(fallbackError.message).toContain('persistent LLM formatting error');
        expect(fallbackError.rawContent).toBe(rawFencedContent);
        expect(fallbackError.originalError).toBeInstanceOf(ValidationError);
        expect(fallbackError.context?.cleanedContent).toBe(incompleteJsonContent);
     }
   });

    it('getNextThought should throw FallbackError when response is plain text (cleaning fails)', async () => {
     // Mock API returning plain text
     const plainTextResponse = "This is just plain text, not JSON.";
     mockedAxiosPost.mockResolvedValue({ data: { choices: [{ message: { content: plainTextResponse } }] } });
     const expectedThoughtNumber = 1;

     // Call getNextThought directly
     await expect(getNextThought(baseUserPrompt, baseSystemPrompt, mockConfig, expectedThoughtNumber))
       .rejects.toThrow(FallbackError);

     expect(mockedAxiosPost).toHaveBeenCalledTimes(2); // 1 initial + 1 retry attempt inside getNextThought
     expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
       expect.objectContaining({ message: 'Persistent LLM formatting error after retries and cleaning. Throwing FallbackError.' }),
     );
      try {
        await getNextThought(baseUserPrompt, baseSystemPrompt, mockConfig, expectedThoughtNumber);
     } catch (e) {
        expect(e).toBeInstanceOf(FallbackError);
        const fallbackError = e as FallbackError;
        expect(fallbackError.message).toContain('persistent LLM formatting error');
        expect(fallbackError.rawContent).toBe(plainTextResponse);
        expect(fallbackError.originalError).toBeInstanceOf(ParsingError); // Plain text causes ParsingError
        expect(fallbackError.context?.cleanedContent).toBeUndefined(); // Cleaning wouldn't have happened
     }
   });

   it('processWithSequentialThinking should abort and throw FallbackError when getNextThought throws FallbackError', async () => {
     // Mock sequence: Thought 1 (OK) -> Thought 2 (Bad JSON -> Throws FallbackError)
     const badJsonContent = '{ bad json for thought 2';
     mockedAxiosPost
       .mockResolvedValueOnce(createMockApiResponse({ thought: 'Step 1 analysis', next_thought_needed: true, thought_number: 1, total_thoughts: 2 }))
       // Mock Thought 2 failing twice (inside getNextThought's retry) leading to FallbackError
       .mockResolvedValueOnce({ data: { choices: [{ message: { content: badJsonContent } }] } }) // Attempt 1 fails parsing
       .mockResolvedValueOnce({ data: { choices: [{ message: { content: badJsonContent } }] } }); // Attempt 2 fails parsing -> FallbackError thrown

     // processWithSequentialThinking has its own retry loop (max 3 attempts)
     // getNextThought has its own retry loop (max 2 attempts) + throws FallbackError

     // Expect processWithSequentialThinking to reject with FallbackError
     await expect(processWithSequentialThinking(baseUserPrompt, mockConfig))
        .rejects.toThrow(FallbackError);

     // Verify calls:
     // 1 call for Thought 1 (OK)
     // 2 calls for Thought 2 (getNextThought internal retries -> throws FallbackError)
     // Total = 3 axios calls
     expect(mockedAxiosPost).toHaveBeenCalledTimes(3);

     // Check that the specific error log for throwing FallbackError was called by getNextThought
     expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Persistent LLM formatting error after retries and cleaning. Throwing FallbackError.' }),
     );
     // Check that the outer loop (processWithSequentialThinking) logged the abort and did NOT retry
     expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Sequential thinking aborted due to persistent LLM formatting error (FallbackError). Not retrying.' }),
     );
     expect(vi.mocked(logger.info)).not.toHaveBeenCalledWith(
        expect.stringContaining('Retrying thought generation') // Ensure outer loop didn't retry
     );
   });

   // --- Test for Max Thoughts Limit ---
   it('should terminate and log error when MAX_SEQUENTIAL_THOUGHTS is reached', async () => {
     const MAX_THOUGHTS = 10; // Match the updated constant in the source file
     // Mock the API to always return next_thought_needed: true
     mockedAxiosPost.mockImplementation(async () => {
       // Determine current thought number based on calls
       const callCount = mockedAxiosPost.mock.calls.length;
       return createMockApiResponse({
         thought: `Thought ${callCount}`,
         next_thought_needed: true, // Always true
         thought_number: callCount,
         total_thoughts: MAX_THOUGHTS + 5 // Estimate doesn't matter here
       });
     });

     // Call the function
     const result = await processWithSequentialThinking(baseUserPrompt, mockConfig);

     // Verify it made exactly MAX_THOUGHTS calls
     expect(mockedAxiosPost).toHaveBeenCalledTimes(MAX_THOUGHTS);

     // Verify the final result is the content of the last thought before termination
     expect(result).toBe(`Thought ${MAX_THOUGHTS}`);

     // Verify the error log message about reaching the limit
     expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
       expect.objectContaining({ maxThoughts: MAX_THOUGHTS }),
       expect.stringContaining(`terminated after reaching the maximum limit of ${MAX_THOUGHTS} thoughts`)
     );
   });

});
