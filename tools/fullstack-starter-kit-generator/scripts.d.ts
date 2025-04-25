import { StarterKitDefinition } from './schema.js';
/**
 * Output interface for generated scripts
 */
export interface ScriptOutput {
  sh: string;
  bat: string;
}
/**
 * Generates setup scripts (bash and batch) based on a validated starter kit definition
 * @param definition The validated starter kit definition
 * @returns Object containing the content of both sh and bat scripts
 */
export declare function generateSetupScripts(
  definition: StarterKitDefinition
): ScriptOutput;
