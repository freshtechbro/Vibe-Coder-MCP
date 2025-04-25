import type { Rule } from '../types.js';

export interface RuleCategory {
  name: string;
  description: string;
  rules: Array<{
    name: string;
    description: string;
    metadata: {
      tags: string[];
      section?: string;
    };
  }>;
}

export interface RuleFormat {
  categories: RuleCategory[];
}

export function formatRuleToMarkdown(rule: Rule): string {
  let output = '';

  // Add rule header
  output += `### ${rule.name}\n\n`;

  // Add semantics section
  output += `#### Semantics\n\n`;
  output += `- **Intent:** ${rule.semantics.intent}\n`;
  output += `- **Context:** ${rule.semantics.context}\n`;
  output += `- **Impact:** ${rule.semantics.impact}\n\n`;

  // Add rationale if present
  if (rule.rationale) {
    output += `**Rationale:** ${rule.rationale}\n\n`;
  }

  // Add applicability if present
  if (rule.applicability) {
    output += `**Applicability:** ${rule.applicability}\n\n`;
  }

  // Add file patterns if present
  if (rule.filePatterns?.length) {
    output += '**File Patterns:**\n```\n';
    rule.filePatterns.forEach((pattern) => {
      output += `${pattern}\n`;
    });
    output += '```\n\n';
  }

  // Add examples if present
  if (rule.examples?.length) {
    output += '**Examples:**\n\n';
    rule.examples.forEach((example, index) => {
      output += `Example ${index + 1}:\n`;
      if (example.description) {
        output += `${example.description}\n\n`;
      }
      if (example.code) {
        output += '```\n';
        output += example.code;
        output += '\n```\n\n';
      }
    });
  }

  return output;
}

export function formatRulesToMarkdown(rules: Rule[]): string {
  let output = '';

  // Add header
  output += '# Development Rules\n\n';

  // Add each rule
  rules.forEach((rule) => {
    output += formatRuleToMarkdown(rule);
    output += '---\n\n';
  });

  return output;
}
