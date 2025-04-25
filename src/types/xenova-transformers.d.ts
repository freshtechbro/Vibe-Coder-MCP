/**
 * Type declarations for @xenova/transformers
 * These are minimal types to support our usage of the library
 */

declare module '@xenova/transformers' {
  export type PipelineType =
    | 'feature-extraction'
    | 'text-classification'
    | 'token-classification'
    | 'question-answering';

  export interface FeatureExtractionPipeline {
    (
      text: string | string[],
      options?: Record<string, any>
    ): Promise<Float32Array | Float32Array[]>;
    model: any;
    tokenizer: any;
  }

  export type Pipeline = FeatureExtractionPipeline;

  export function pipeline(
    task: PipelineType,
    model?: string,
    options?: Record<string, any>
  ): Promise<Pipeline>;
}
