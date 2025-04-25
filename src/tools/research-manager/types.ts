import { z } from 'zod';

/**
 * Schema for research input validation
 */
export const researchInputSchema = z.object({
  query: z.string().min(5),
  depth: z.enum(['basic', 'detailed', 'comprehensive']).optional(),
  categories: z.array(z.string()).optional(),
});

/**
 * Type for validated research input
 */
export type ResearchInput = z.infer<typeof researchInputSchema>;

/**
 * Research result format
 */
export interface ResearchResult {
  summary: string;
  keyFindings: string[];
  detailedAnalysis: {
    sections: Array<{
      title: string;
      content: string;
    }>;
  };
  practicalApplications: string[];
  limitations: string[];
  recommendations: string[];
  metadata: {
    timestamp: string;
    query: string;
    depth?: string;
    categories?: string[];
  };
}

/**
 * Research analysis configuration
 */
export interface AnalysisConfig {
  depth: 'basic' | 'detailed' | 'comprehensive';
  format: 'markdown' | 'json' | 'yaml';
  maxTokens: number;
  temperature: number;
  categories?: string[];
}
