// src/services/workflows/workflowExecutor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Removed unused import afterEach
import fs from 'fs-extra';
import * as toolRegistry from '../routing/toolRegistry.js'; // To mock executeTool
import { loadWorkflowDefinitions, executeWorkflow } from './workflowExecutor.js'; // Removed unused import WorkflowResult
import { OpenRouterConfig } from '../../types/workflow.js'; // Adjust path if necessary
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Adjust path if necessary
import logger from '../../logger.js'; // Adjust path if necessary
import { ConfigurationError } from '../../utils/errors.js'; // Removed unused imports

// Mock dependencies
vi.mock('fs-extra');
vi.mock('../routing/toolRegistry.js');

// Mock logger
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'debug').mockImplementation(() => {});
vi.spyOn(logger, 'warn').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});

const mockConfig: OpenRouterConfig = { baseUrl: '', apiKey: '', defaultModel: '', perplexityModel: '' };

// Mock workflow definition content
const mockWorkflowFileContent = JSON.stringify({
    workflows: {
        testFlow: {
            description: "Test workflow",
            inputSchema: { inputParam: "string" },
            steps: [
                { id: "step1", toolName: "toolA", params: { p1: "{workflow.input.inputParam}" } },
                { id: "step2", toolName: "toolB", params: { p2: "{steps.step1.output.content[0].text}" } }
            ],
            output: { finalMessage: "Step 2 output was: {steps.step2.output.content[0].text}" }
        },
        failingFlow: {
            description: "Test workflow that fails",
            steps: [ { id: "failStep", toolName: "toolFail", params: {} } ]
        }
    }
});
const mockEmptyWorkflowFileContent = JSON.stringify({ workflows: {} });
const mockInvalidWorkflowFileContent = "{ invalid json";


describe('Workflow Executor', () => {
    const executeToolMock = vi.mocked(toolRegistry.executeTool);

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the loaded workflows state before each test by calling load with empty mock
        vi.mocked(fs.existsSync).mockReturnValue(true); // Assume file exists by default
         vi.mocked(fs.readFileSync).mockReturnValue(mockEmptyWorkflowFileContent);
         loadWorkflowDefinitions('dummyPath'); // Load empty to clear state
    });

     describe('loadWorkflowDefinitions', () => {
         it('should load workflows from a valid file', () => {
             vi.mocked(fs.readFileSync).mockReturnValue(mockWorkflowFileContent);
             loadWorkflowDefinitions('validPath');
             // Need a way to check internal state 'loadedWorkflows' or add a getter
             // Check the final success log message after loading the valid file
             expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully loaded 2 workflow definitions.'));
         });

         it('should handle missing workflow file', () => {
              vi.mocked(fs.existsSync).mockReturnValue(false);
              loadWorkflowDefinitions('missingPath');
              expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Workflow definition file not found'));
         });

         it('should handle invalid JSON', () => {
              vi.mocked(fs.readFileSync).mockReturnValue(mockInvalidWorkflowFileContent);
              loadWorkflowDefinitions('invalidJsonPath');
              expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(SyntaxError) }), expect.any(String));
         });

          it('should handle invalid structure (missing workflows key)', () => {
               vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ not_workflows: {} }));
               loadWorkflowDefinitions('invalidStructPath');
               expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(ConfigurationError) }), expect.any(String));
               expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.objectContaining({ message: expect.stringContaining('"workflows" object missing') }) }), expect.any(String));
          });
     });


    describe('executeWorkflow', () => {
         beforeEach(() => {
             // Load valid workflows for execution tests
             vi.mocked(fs.readFileSync).mockReturnValue(mockWorkflowFileContent);
             loadWorkflowDefinitions('validPath');
         });

        it('should execute a workflow successfully', async () => {
            // Mock tool results
            const step1Result: CallToolResult = { content: [{ type: 'text', text: 'Step 1 Output' }], isError: false };
            const step2Result: CallToolResult = { content: [{ type: 'text', text: 'Step 2 Output' }], isError: false };
            executeToolMock
                .mockResolvedValueOnce(step1Result) // toolA
                .mockResolvedValueOnce(step2Result); // toolB

            const workflowInput = { inputParam: 'Start Value' };
            const result = await executeWorkflow('testFlow', workflowInput, mockConfig);

            expect(result.success).toBe(true);
            // Assert the generic success message
            expect(result.message).toBe('Workflow "testFlow" completed successfully.');
            // Assert the specific resolved output value should match the raw output of the last step
            expect(result.outputs?.finalMessage).toBe("Step 2 Output");
            expect(executeToolMock).toHaveBeenCalledTimes(2);
            // Check toolA call - executeTool doesn't receive context in this call
            expect(executeToolMock).toHaveBeenNthCalledWith(1, 'toolA', { p1: 'Start Value' }, mockConfig);
            // Check toolB call
            expect(executeToolMock).toHaveBeenNthCalledWith(2, 'toolB', { p2: 'Step 1 Output' }, mockConfig);
            expect(result.stepResults?.get('step1')).toBe(step1Result);
            expect(result.stepResults?.get('step2')).toBe(step2Result);
        });

        it('should stop and return error if a step fails', async () => {
             const step1Result: CallToolResult = { content: [{ type: 'text', text: 'Step 1 Output' }], isError: false };
             // Mock toolB to return an error CallToolResult
             const stepFailResult: CallToolResult = { content: [{ type: 'text', text: 'Tool B Failed Msg' }], isError: true, errorDetails:{ message: 'Tool B Failed Detail'} };
             executeToolMock
                 .mockResolvedValueOnce(step1Result) // toolA succeeds
                 .mockResolvedValueOnce(stepFailResult); // toolB fails

             const workflowInput = { inputParam: 'Start Value' };
             const result = await executeWorkflow('testFlow', workflowInput, mockConfig);

             expect(result.success).toBe(false);
             // The error message in WorkflowResult comes from the ToolExecutionError thrown by executeWorkflow
             expect(result.message).toContain("failed at step 2 (toolB): Step 'step2' (Tool: toolB) failed: Tool B Failed Msg");
             expect(result.error?.stepId).toBe('step2');
             expect(result.error?.toolName).toBe('toolB');
             expect(result.error?.message).toContain("Step 'step2' (Tool: toolB) failed: Tool B Failed Msg");
             // Check the details contain the original tool error result
             expect((result.error?.details as Record<string, unknown>)?.toolResult).toEqual(stepFailResult);
             expect(executeToolMock).toHaveBeenCalledTimes(2); // Called toolA and toolB
             expect(result.stepResults?.size).toBe(2); // Includes results up to failure
             expect(result.stepResults?.get('step1')).toBe(step1Result);
             expect(result.stepResults?.get('step2')).toBe(stepFailResult);
         });

         it('should return error if parameter resolution fails', async () => {
              // step2 expects output from step1, but let's say step1 doesn't exist in this flow
              const brokenWorkflowContent = JSON.stringify({
                  workflows: { brokenFlow: { description: "Broken", steps: [ { id: "s2", toolName: "tB", params: { p: "{steps.s1.output.content[0].text}" } } ] } }
              });
              vi.mocked(fs.readFileSync).mockReturnValue(brokenWorkflowContent);
              loadWorkflowDefinitions('brokenPath');

              const result = await executeWorkflow('brokenFlow', {}, mockConfig);

              expect(result.success).toBe(false);
              expect(result.message).toContain("failed at step 1 (tB)");
              expect(result.message).toContain("Failed to resolve parameter 'p'");
              // Check the underlying error message from resolveParamValue
              expect(result.message).toContain("Output from step \"s1\" not found");
              expect(result.error?.stepId).toBe('s2');
              expect(result.error?.toolName).toBe('tB');
              expect(executeToolMock).not.toHaveBeenCalled(); // Failed before calling tool
         });

         it('should return error if workflow definition not found', async () => {
              const result = await executeWorkflow('nonExistentFlow', {}, mockConfig);
              expect(result.success).toBe(false);
              expect(result.message).toBe('Workflow "nonExistentFlow" not found.');
              expect(result.error?.message).toBe('Workflow "nonExistentFlow" not found.');
         });

         // Test resolveParamValue indirectly via executeWorkflow
         it('should handle resolving undefined paths gracefully in output', async () => {
             const workflowWithBadOutput = JSON.stringify({
                 workflows: { badOutputFlow: { description:"Test", steps: [{ id: "s1", toolName: "tA", params: {} }], output: { msg: "{steps.s1.output.nonexistent.path}" } } }
             });
             vi.mocked(fs.readFileSync).mockReturnValue(workflowWithBadOutput);
             loadWorkflowDefinitions('badOutputPath');
             executeToolMock.mockResolvedValue({ content: [{ type: 'text', text: 'Output' }], isError: false }); // Mock tool success

             const result = await executeWorkflow('badOutputFlow', {}, mockConfig);

             expect(result.success).toBe(true); // Workflow succeeds even if output resolution fails
             expect(result.outputs?.msg).toContain("Error: Failed to resolve output template"); // Error message included in output
             expect(logger.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("Could not resolve output template key 'msg'"));
         });
    });
});
