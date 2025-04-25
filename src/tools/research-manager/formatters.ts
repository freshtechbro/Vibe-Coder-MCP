import type { ResearchResult } from './types.js';

export const formatters = {
  toMarkdown: (result: ResearchResult): string => {
    let output = '';

    // Add summary
    output += `# Research Results\n\n`;
    output += `## Summary\n${result.summary}\n\n`;

    // Add key findings
    output += `## Key Findings\n`;
    result.keyFindings.forEach((finding) => {
      output += `- ${finding}\n`;
    });
    output += '\n';

    // Add detailed analysis
    output += `## Detailed Analysis\n`;
    result.detailedAnalysis.sections.forEach((section) => {
      output += `### ${section.title}\n${section.content}\n\n`;
    });

    // Add practical applications
    output += `## Practical Applications\n`;
    result.practicalApplications.forEach((app) => {
      output += `- ${app}\n`;
    });
    output += '\n';

    // Add limitations
    output += `## Limitations\n`;
    result.limitations.forEach((limitation) => {
      output += `- ${limitation}\n`;
    });
    output += '\n';

    // Add recommendations
    output += `## Recommendations\n`;
    result.recommendations.forEach((rec) => {
      output += `- ${rec}\n`;
    });
    output += '\n';

    // Add metadata
    output += `---\n`;
    output += `Generated: ${result.metadata.timestamp}\n`;
    output += `Query: ${result.metadata.query}\n`;
    if (result.metadata.depth) {
      output += `Depth: ${result.metadata.depth}\n`;
    }
    if (result.metadata.categories?.length) {
      output += `Categories: ${result.metadata.categories.join(', ')}\n`;
    }

    return output;
  },
};
