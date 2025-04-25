import { z } from 'zod';

export interface WorkflowStep {
  name: string;
  tool: string;
  params: Record<string, unknown>;
  condition?: string;
  retries?: number;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStep[];
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
}

export interface WorkflowResult {
  stepResults: Array<{
    stepName: string;
    success: boolean;
    output: unknown;
    error?: string;
  }>;
  success: boolean;
  error?: string;
}

export interface WorkflowContext {
  workflowName: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  currentStep: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
