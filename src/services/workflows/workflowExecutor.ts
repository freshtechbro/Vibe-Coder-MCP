import fs from 'fs-extra';

import logger from '../../logger.js';
import { ToolResult } from '../../types/tools.js';
import {
  ConfigurationError,
  AppError,
  ToolExecutionError,
  ValidationError,
} from '../../utils/errors.js';
import { toolRegistry, ToolExecutionContext } from '../routing/toolRegistry.js';

export interface WorkflowDefinition {
  description: string;
  inputSchema?: Record<string, string>;
  steps: WorkflowStep[];
  output?: Record<string, string>;
}

export interface WorkflowStep {
  id: string;
  toolName: string;
  params: Record<string, string>;
}

export interface WorkflowResult {
  success: boolean;
  message: string;
  outputs?: Record<string, unknown>;
  error?: {
    stepId?: string;
    toolName?: string;
    message: string;
    details?: unknown;
    type?: string;
  };
  stepResults?: Map<string, ToolResult>;
}

let workflows = new Map<string, WorkflowDefinition>();

export function loadWorkflowDefinitions(path: string): void {
  try {
    if (!fs.existsSync(path)) {
      logger.warn(`Workflow definition file not found at: ${path}`);
      return;
    }

    const content = fs.readFileSync(path, 'utf-8');
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      logger.error({ err }, 'Failed to parse workflow definitions file');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !('workflows' in parsed)) {
      logger.error(
        {
          err: new ConfigurationError(
            '"workflows" object missing from definitions file'
          ),
        },
        'Invalid workflow definitions file structure'
      );
      return;
    }

    const newWorkflows = new Map<string, WorkflowDefinition>();
    for (const [name, def] of Object.entries(parsed.workflows)) {
      newWorkflows.set(name, def as WorkflowDefinition);
    }
    workflows = newWorkflows;

    logger.info(`Successfully loaded ${workflows.size} workflow definitions.`);
  } catch (error) {
    logger.error({ err: error }, 'Failed to load workflow definitions');
  }
}

function resolveParamValue(
  param: string,
  context: Record<string, unknown>
): unknown {
  const resolvePath = (
    path: string,
    currentContext: Record<string, unknown>
  ): unknown => {
    const parts = path.split('.');
    let value: unknown = currentContext;
    const arrayIndexRegex = /(.+)\[(\d+)\]$/; // Regex to match key[index]

    for (const part of parts) {
      if (value === null || value === undefined) {
        throw new Error(
          `Path "${path}" resolution failed: encountered null or undefined at segment processing "${part}".`
        );
      }

      const indexMatch = part.match(arrayIndexRegex);

      if (indexMatch) {
        const key = indexMatch[1];
        const index = parseInt(indexMatch[2], 10);

        // Access the object property first
        if (typeof value === 'object' && key in value) {
          value = (value as Record<string, unknown>)[key];
        } else {
          throw new Error(
            `Path "${path}" resolution failed: Key "${key}" not found.`
          );
        }

        // Now access the array element
        if (Array.isArray(value)) {
          if (index >= 0 && index < value.length) {
            value = value[index];
          } else {
            throw new Error(
              `Path "${path}" resolution failed: Index ${index} out of bounds for array "${key}".`
            );
          }
        } else {
          throw new Error(
            `Path "${path}" resolution failed: Expected an array for key "${key}" but got ${typeof value}.`
          );
        }
      } else {
        // Handle regular property access
        if (typeof value === 'object' && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          throw new Error(
            `Path "${path}" resolution failed: Part "${part}" not found.`
          );
        }
      }
    }
    return value;
  };

  const singleVarMatch = param.match(/^\{([^}]+)\}$/);
  if (singleVarMatch) {
    const path = singleVarMatch[1];
    try {
      return resolvePath(path, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to resolve parameter: ${message}`);
    }
  } else {
    // Handle embedded variables in a string
    return param.replace(/\{([^}]+)\}/g, (_, path) => {
      try {
        const resolvedValue = resolvePath(path, context);
        if (typeof resolvedValue === 'string') {
          return resolvedValue;
        } else if (
          typeof resolvedValue === 'number' ||
          typeof resolvedValue === 'boolean'
        ) {
          return String(resolvedValue);
        } else {
          logger.warn(
            { path, value: resolvedValue },
            'Attempted to embed non-primitive value in string template, using placeholder.'
          );
          return `[Object]`; // Or JSON.stringify(resolvedValue) if appropriate
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          { path, error },
          `Could not resolve embedded path "${path}": ${message}`
        );
        // Decide how to handle unresolved embedded paths: throw, return placeholder, etc.
        // Throwing aligns with the single variable case behavior.
        throw new Error(`Failed to resolve embedded parameter: ${message}`);
        // Or return a placeholder like `[Unresolved: ${path}]`;
      }
    });
  }
}

export async function executeWorkflow(
  workflowName: string,
  workflowInput: Record<string, unknown>,
  config: Record<string, unknown>,
  sessionId: string
): Promise<WorkflowResult> {
  const workflow = workflows.get(workflowName);
  if (!workflow) {
    return {
      success: false,
      message: `Workflow "${workflowName}" not found.`,
      error: {
        message: `Workflow "${workflowName}" not found.`,
        type: 'WorkflowNotFound',
      },
    };
  }

  const stepResults = new Map<string, ToolResult>();
  const context = {
    workflow: { input: workflowInput },
    steps: {} as Record<string, { output: ToolResult }>,
  };

  let currentStep: WorkflowStep | null = null;

  try {
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      currentStep = step;
      const stepNumber = i + 1;
      logger.info(
        {
          workflowName,
          stepId: step.id,
          stepNumber,
          toolName: step.toolName,
          sessionId,
        },
        `Executing workflow step ${stepNumber}`
      );

      const resolvedParams: Record<string, unknown> = {};
      try {
        for (const [key, valueTemplate] of Object.entries(step.params)) {
          resolvedParams[key] = resolveParamValue(valueTemplate, context);
        }
        logger.debug(
          { workflowName, stepId: step.id, resolvedParams },
          'Resolved step parameters'
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warn(
          { workflowName, stepId: step.id, error },
          `Parameter resolution failed for step ${step.id}`
        );
        return {
          success: false,
          message: `Workflow "${workflowName}" failed at step ${stepNumber} (${step.toolName}): Failed to resolve parameter: ${errorMessage}`,
          error: {
            stepId: step.id,
            toolName: step.toolName,
            message: `Failed to resolve parameter: ${errorMessage}`,
            type: 'ParameterResolutionError',
          },
          stepResults,
        };
      }

      const executionContext: ToolExecutionContext = {
        sessionId,
        workflowId: workflowName,
        stepId: step.id,
      };

      const result = await toolRegistry.executeTool(
        step.toolName,
        resolvedParams,
        config,
        executionContext
      );

      stepResults.set(step.id, result);
      context.steps[step.id] = { output: result };
      logger.debug(
        { workflowName, stepId: step.id, toolResult: result },
        `Step ${step.id} completed`
      );
    }

    const outputs: Record<string, unknown> = {};
    if (workflow.output) {
      logger.debug(
        { workflowName, outputTemplates: workflow.output },
        'Resolving workflow outputs'
      );
      for (const [key, template] of Object.entries(workflow.output)) {
        try {
          outputs[key] = resolveParamValue(template, context);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.warn(
            { workflowName, outputKey: key, error },
            `Could not resolve output template key '${key}': ${errorMessage}`
          );
          outputs[key] =
            `Error: Failed to resolve output template: ${errorMessage}`;
        }
      }
      logger.info(
        { workflowName, finalOutputs: outputs },
        'Workflow outputs resolved'
      );
    }

    logger.info(
      { workflowName, sessionId },
      `Workflow "${workflowName}" completed successfully.`
    );
    return {
      success: true,
      message: `Workflow "${workflowName}" completed successfully.`,
      outputs,
      stepResults,
    };
  } catch (error) {
    const stepId = currentStep?.id;
    const toolName = currentStep?.toolName;
    const stepNumber = currentStep
      ? workflow.steps.findIndex((s) => s.id === stepId) + 1
      : undefined;

    logger.error(
      { err: error, workflowName, stepId, toolName, stepNumber, sessionId },
      `Workflow "${workflowName}" failed${stepId ? ` at step ${stepNumber} (${toolName})` : ''}`
    );

    let errorMessage =
      'An unexpected error occurred during workflow execution.';
    let errorType = 'WorkflowExecutionError';
    let errorDetails: unknown = error;

    if (error instanceof AppError) {
      errorMessage = error.message;
      errorType = error.name;
      errorDetails = error.context;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      message: `Workflow "${workflowName}" failed${stepId ? ` at step ${stepNumber} (${toolName})` : ''}: ${errorMessage}`,
      error: {
        stepId,
        toolName,
        message: errorMessage,
        type: errorType,
        details: errorDetails,
      },
      stepResults,
    };
  }
}
