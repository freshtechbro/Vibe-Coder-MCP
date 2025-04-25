import { describe, it, expect } from 'vitest';
import { buildPrompts } from '../utils/promptBuilder.js';
import type { CodeStubInput } from '../schema.js';

describe('buildPrompts', () => {
  const baseInput: CodeStubInput = {
    language: 'typescript',
    stubType: 'function',
    name: 'myFunction',
    description: 'Does something',
  };

  it('generates prompts without parameters or context', () => {
    const { systemPrompt, userPrompt } = buildPrompts(baseInput);
    // System prompt should start with instruction
    expect(systemPrompt).toContain('You are an expert programmer');
    // User prompt should include language and function name
    expect(userPrompt).toContain('Generate a code stub in typescript');
    expect(userPrompt).toContain('Function Name: myFunction');
    // ParametersList should be 'None'
    expect(userPrompt).toContain('None');
    // No context section
    expect(userPrompt).not.toContain('**Context from File');
  });

  it('generates prompts with parameters and context', () => {
    const input: CodeStubInput = {
      ...baseInput,
      parameters: [
        { name: 'a', type: 'string', description: 'first param' },
        { name: 'b', type: 'number' },
      ],
      returnType: 'boolean',
    };
    const context = 'const x = 1;';
    const fileName = 'ctx.txt';
    const { systemPrompt, userPrompt } = buildPrompts(input, context, fileName);
    // System prompt unchanged
    expect(systemPrompt).toContain('You are an expert programmer');
    // Check userPrompt details
    expect(userPrompt).toContain('Parameters:');
    expect(userPrompt).toContain(
      '- name: a, type: string, description: first param'
    );
    expect(userPrompt).toContain('- name: b, type: number');
    expect(userPrompt).toContain('Return Type: boolean');
    // Context section present with correct file name and content
    expect(userPrompt).toContain(`**Context from File (${fileName})**`);
    expect(userPrompt).toContain(context);
  });
});
