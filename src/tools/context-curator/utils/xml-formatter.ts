/**
 * XML Output Formatter for Context Curator
 * 
 * Provides comprehensive XML formatting capabilities for Context Curator output packages,
 * including proper escaping, structured formatting, and task-type specific meta-prompts.
 */

import { ContextPackage, ProcessedFile, FileReference } from '../types/output-package.js';

/**
 * Task-type specific meta-prompt templates with atomic task guidelines
 */
export const META_PROMPT_TEMPLATES = {
  refactoring: {
    systemPrompt: `You are an expert software refactoring specialist. Your task is to improve code quality, maintainability, and performance while preserving existing functionality.

REFACTORING PRINCIPLES:
- Preserve all existing functionality and behavior
- Improve code readability and maintainability
- Reduce technical debt and complexity
- Follow established patterns and conventions
- Ensure backward compatibility

ATOMIC TASK GUIDELINES:
- Each refactoring task should be completable in 1-4 hours
- Focus on single responsibility (one class, one method, one concern)
- Include comprehensive tests to verify behavior preservation
- Document all changes and rationale
- Consider performance implications`,

    taskDecompositionGuidelines: `
REFACTORING TASK DECOMPOSITION:
1. **Analysis Phase** (30-60 minutes)
   - Identify code smells and improvement opportunities
   - Analyze dependencies and impact scope
   - Plan refactoring strategy

2. **Implementation Phase** (2-3 hours)
   - Apply refactoring patterns systematically
   - Maintain test coverage throughout
   - Verify functionality preservation

3. **Validation Phase** (30-60 minutes)
   - Run comprehensive test suite
   - Perform code review
   - Document changes and improvements`
  },

  feature_addition: {
    systemPrompt: `You are an expert software feature development specialist. Your task is to implement new functionality that integrates seamlessly with existing codebase architecture.

FEATURE DEVELOPMENT PRINCIPLES:
- Follow existing architectural patterns
- Maintain code quality and consistency
- Implement comprehensive error handling
- Design for scalability and maintainability
- Include thorough testing and documentation

ATOMIC TASK GUIDELINES:
- Each feature task should be completable in 1-4 hours
- Focus on single feature component or capability
- Include unit, integration, and acceptance tests
- Follow established coding standards
- Consider security and performance implications`,

    taskDecompositionGuidelines: `
FEATURE ADDITION TASK DECOMPOSITION:
1. **Design Phase** (45-90 minutes)
   - Define feature requirements and acceptance criteria
   - Design API and integration points
   - Plan implementation approach

2. **Implementation Phase** (2-3 hours)
   - Implement core functionality
   - Add error handling and validation
   - Write comprehensive tests

3. **Integration Phase** (30-60 minutes)
   - Integrate with existing systems
   - Verify end-to-end functionality
   - Update documentation`
  },

  bug_fix: {
    systemPrompt: `You are an expert software debugging and bug resolution specialist. Your task is to identify, isolate, and fix software defects while preventing regression.

BUG FIX PRINCIPLES:
- Identify root cause, not just symptoms
- Implement minimal, targeted fixes
- Add tests to prevent regression
- Consider edge cases and error conditions
- Document fix rationale and approach

ATOMIC TASK GUIDELINES:
- Each bug fix should be completable in 1-4 hours
- Focus on single bug or related group of symptoms
- Include reproduction test case
- Verify fix doesn't introduce new issues
- Consider impact on dependent systems`,

    taskDecompositionGuidelines: `
BUG FIX TASK DECOMPOSITION:
1. **Investigation Phase** (60-90 minutes)
   - Reproduce the bug consistently
   - Identify root cause and contributing factors
   - Analyze impact and scope

2. **Resolution Phase** (1-2 hours)
   - Implement targeted fix
   - Add regression test
   - Verify fix resolves issue

3. **Verification Phase** (30-60 minutes)
   - Test edge cases and error conditions
   - Verify no new issues introduced
   - Update documentation if needed`
  },

  performance_optimization: {
    systemPrompt: `You are an expert software performance optimization specialist. Your task is to identify and resolve performance bottlenecks while maintaining code quality and functionality.

PERFORMANCE OPTIMIZATION PRINCIPLES:
- Profile before optimizing to identify actual bottlenecks
- Measure performance impact of changes
- Maintain code readability and maintainability
- Consider memory usage, CPU efficiency, and I/O optimization
- Preserve existing functionality and behavior

ATOMIC TASK GUIDELINES:
- Each optimization task should be completable in 1-4 hours
- Focus on single performance bottleneck or optimization area
- Include performance benchmarks and measurements
- Verify optimization effectiveness with metrics
- Consider scalability implications`,

    taskDecompositionGuidelines: `
PERFORMANCE OPTIMIZATION TASK DECOMPOSITION:
1. **Analysis Phase** (60-90 minutes)
   - Profile application to identify bottlenecks
   - Analyze performance metrics and patterns
   - Prioritize optimization opportunities

2. **Optimization Phase** (2-3 hours)
   - Implement targeted performance improvements
   - Optimize algorithms, data structures, or I/O operations
   - Verify functionality preservation

3. **Validation Phase** (30-60 minutes)
   - Measure performance improvements
   - Run comprehensive test suite
   - Document optimization results and rationale`
  },

  general: {
    systemPrompt: `You are an expert software development specialist. Your task is to implement high-quality software solutions following best practices and established patterns.

DEVELOPMENT PRINCIPLES:
- Write clean, maintainable, and well-documented code
- Follow established architectural patterns
- Implement comprehensive testing
- Consider security, performance, and scalability
- Maintain consistency with existing codebase

ATOMIC TASK GUIDELINES:
- Each task should be completable in 1-4 hours
- Focus on single responsibility or concern
- Include appropriate testing strategy
- Follow coding standards and conventions
- Document decisions and implementation approach`,

    taskDecompositionGuidelines: `
GENERAL TASK DECOMPOSITION:
1. **Planning Phase** (30-60 minutes)
   - Analyze requirements and constraints
   - Design implementation approach
   - Identify dependencies and risks

2. **Implementation Phase** (2-3 hours)
   - Implement solution following best practices
   - Write comprehensive tests
   - Handle edge cases and errors

3. **Review Phase** (30-60 minutes)
   - Verify requirements are met
   - Perform code review
   - Update documentation`
  }
} as const;

/**
 * XML Formatter Class
 * 
 * Provides comprehensive XML formatting capabilities for Context Curator output packages.
 */
export class XMLFormatter {
  /**
   * Escape special XML characters in text content
   */
  static escapeXML(text: string): string {
    if (typeof text !== 'string') {
      return String(text);
    }
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .split("").filter(char => char.charCodeAt(0) >= 32 || [9, 10, 13].includes(char.charCodeAt(0))).join(""); // Remove control characters
  }

  /**
   * Format a complete context package as XML
   */
  static formatContextPackage(contextPackage: ContextPackage): string {
    const timestamp = (contextPackage.metadata.generationTimestamp || new Date()).toISOString();

    // Ensure arrays are never undefined
    const highPriorityFiles = contextPackage.highPriorityFiles || [];
    const mediumPriorityFiles = contextPackage.mediumPriorityFiles || [];
    const lowPriorityFiles = contextPackage.lowPriorityFiles || [];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<context_package version="${this.escapeXML(contextPackage.metadata.version)}" format_version="${this.escapeXML(contextPackage.metadata.formatVersion)}">
  <package_metadata>
    <generation_timestamp>${timestamp}</generation_timestamp>
    <target_directory>${this.escapeXML(contextPackage.metadata.targetDirectory)}</target_directory>
    <original_prompt>${this.escapeXML(contextPackage.metadata.originalPrompt)}</original_prompt>
    <refined_prompt>${this.escapeXML(contextPackage.metadata.refinedPrompt)}</refined_prompt>
    <total_token_estimate>${contextPackage.metadata.totalTokenEstimate}</total_token_estimate>
    <processing_time_ms>${contextPackage.metadata.processingTimeMs}</processing_time_ms>
    <task_type>${this.escapeXML(contextPackage.metadata.taskType)}</task_type>
    <tool_version>${this.escapeXML(contextPackage.metadata.toolVersion)}</tool_version>
    <codemap_cache_used>${contextPackage.metadata.codemapCacheUsed}</codemap_cache_used>
    <files_analyzed>${contextPackage.metadata.filesAnalyzed}</files_analyzed>
    <files_included>${contextPackage.metadata.filesIncluded}</files_included>
  </package_metadata>

  <refined_prompt>${this.escapeXML(contextPackage.refinedPrompt)}</refined_prompt>

  <codemap_path>${this.escapeXML(contextPackage.codemapPath)}</codemap_path>

  ${this.formatFiles(highPriorityFiles, 'high_priority_files')}
  ${this.formatFiles(mediumPriorityFiles, 'medium_priority_files')}
  ${this.formatLowPriorityFiles(lowPriorityFiles)}

  ${this.formatEnhancedMetaPrompt(this.getMetaPrompt(contextPackage), contextPackage.metadata.taskType)}
</context_package>`;

    return xml;
  }

  /**
   * Format processed files with full content
   */
  static formatFiles(files: ProcessedFile[], sectionName: string): string {
    if (!files || !Array.isArray(files) || files.length === 0) {
      return `<${sectionName}></${sectionName}>`;
    }

    const filesXml = files.map(file => {
      const contentSectionsXml = (file.contentSections || []).map(section => {
        const safeSectionContent = section.content ? `<![CDATA[${section.content}]]>` : '';
        return `    <content_section type="${section.type}" start_line="${section.startLine}" end_line="${section.endLine}" token_count="${section.tokenCount}">
      <description>${this.escapeXML(section.description)}</description>
      <content>${safeSectionContent}</content>
    </content_section>`;
      }).join('\n');

      // Extract reasoning from relevanceScore if available
      let reasoning = '';
      if (file.relevanceScore?.reasoning) {
        reasoning = Array.isArray(file.relevanceScore.reasoning)
          ? file.relevanceScore.reasoning.join(', ')
          : String(file.relevanceScore.reasoning);
      } else if (file.reasoning) {
        reasoning = Array.isArray(file.reasoning)
          ? file.reasoning.join(', ')
          : String(file.reasoning);
      } else {
        reasoning = 'File selected for analysis based on relevance scoring';
      }

      // Use CDATA for file content to prevent XML parsing issues
      const safeContent = file.content ? `<![CDATA[${file.content}]]>` : '';

      return `  <file>
    <path>${this.escapeXML(file.path)}</path>
    <content>${safeContent}</content>
    <is_optimized>${file.isOptimized}</is_optimized>
    <total_lines>${file.totalLines}</total_lines>
    ${file.fullContentLines !== undefined ? `<full_content_lines>${file.fullContentLines}</full_content_lines>` : ''}
    ${file.optimizedLines !== undefined ? `<optimized_lines>${file.optimizedLines}</optimized_lines>` : ''}
    <token_estimate>${file.tokenEstimate}</token_estimate>
    <reasoning>${this.escapeXML(reasoning)}</reasoning>
    <content_sections>
${contentSectionsXml}
    </content_sections>
  </file>`;
    }).join('\n');

    return `<${sectionName}>
${filesXml}
</${sectionName}>`;
  }

  /**
   * Format low priority files (references only)
   */
  static formatLowPriorityFiles(files: FileReference[]): string {
    if (!files || !Array.isArray(files) || files.length === 0) {
      return '<low_priority_files></low_priority_files>';
    }

    const filesXml = files.map(file => {
      // Handle undefined or invalid reasoning
      let reasoning = '';
      if (file.reasoning && typeof file.reasoning === 'string') {
        reasoning = file.reasoning;
      } else if (file.reasoning && typeof file.reasoning === 'object') {
        // Handle case where reasoning might be an object
        reasoning = String(file.reasoning);
      } else {
        reasoning = 'Low priority file - included for reference';
      }

      // Handle relevance score that might be an object
      let relevanceScore = '';
      if (typeof file.relevanceScore === 'number') {
        relevanceScore = String(file.relevanceScore);
      } else if (typeof file.relevanceScore === 'object' && file.relevanceScore !== null) {
        // If it's an object, try to extract the score
        const scoreObj = file.relevanceScore as Record<string, unknown>;
        relevanceScore = String(scoreObj.overall || scoreObj.score || 0);
      } else {
        relevanceScore = '0';
      }

      return `  <file_reference>
    <path>${this.escapeXML(file.path)}</path>
    <relevance_score>${relevanceScore}</relevance_score>
    <reasoning>${this.escapeXML(reasoning)}</reasoning>
    <token_estimate>${file.tokenEstimate}</token_estimate>
    <size_bytes>${file.size}</size_bytes>
    <last_modified>${file.lastModified instanceof Date ? file.lastModified.toISOString() : new Date(file.lastModified || Date.now()).toISOString()}</last_modified>
    <language>${this.escapeXML(file.language)}</language>
  </file_reference>`;
    }).join('\n');

    return `<low_priority_files>
${filesXml}
</low_priority_files>`;
  }

  /**
   * Safely extract meta-prompt from context package
   */
  private static getMetaPrompt(contextPackage: ContextPackage): string | Record<string, unknown> {
    // ContextPackage might have metaPrompt property, check if it exists
    const pkg = contextPackage as ContextPackage & { 
      fullMetaPrompt?: string | Record<string, unknown>; 
      metaPrompt?: string | Record<string, unknown>; 
    };
    
    return pkg.fullMetaPrompt || pkg.metaPrompt || contextPackage.metaPrompt || '';
  }

  /**
   * Format enhanced meta-prompt (uses the actual enhanced meta prompt from context package)
   */
  static formatEnhancedMetaPrompt(metaPrompt: string | Record<string, unknown>, taskType: 'refactoring' | 'feature_addition' | 'bug_fix' | 'performance_optimization' | 'general'): string {
    // Handle undefined or null meta-prompt
    if (metaPrompt === undefined || metaPrompt === null) {
      return `<meta_prompt task_type="${this.escapeXML(taskType)}">
No meta-prompt available for this context package.
</meta_prompt>`;
    }

    // Check if metaPrompt is an object with enhanced structure
    if (typeof metaPrompt === 'object' && metaPrompt !== null) {
      // Extract components from the enhanced meta-prompt object
      const systemPrompt = metaPrompt.systemPrompt || metaPrompt.systemInstruction || '';
      const userPrompt = metaPrompt.userPrompt || metaPrompt.contextSpecificInstructions || '';
      const contextSummary = metaPrompt.contextSummary || '';
      const taskDecomposition = metaPrompt.taskDecomposition || metaPrompt.taskDecompositionRules || '';
      const guidelines = metaPrompt.guidelines || metaPrompt.atomicTaskGuidelines || '';
      const aiAgentResponseFormat = metaPrompt.aiAgentResponseFormat || '';

      // Handle task decomposition serialization
      let taskDecompositionStr = '';
      if (typeof taskDecomposition === 'string') {
        taskDecompositionStr = taskDecomposition;
      } else if (taskDecomposition && typeof taskDecomposition === 'object') {
        // If it's an object, serialize it properly
        try {
          taskDecompositionStr = JSON.stringify(taskDecomposition, null, 2);
        } catch {
          taskDecompositionStr = String(taskDecomposition);
        }
      } else {
        taskDecompositionStr = String(taskDecomposition || '');
      }

      // Handle guidelines serialization
      let guidelinesStr = '';
      if (typeof guidelines === 'string') {
        guidelinesStr = guidelines;
      } else if (Array.isArray(guidelines)) {
        guidelinesStr = guidelines.join('\n');
      } else if (guidelines && typeof guidelines === 'object') {
        try {
          guidelinesStr = JSON.stringify(guidelines, null, 2);
        } catch {
          guidelinesStr = String(guidelines);
        }
      } else {
        guidelinesStr = String(guidelines || '');
      }

      // Format as structured XML
      return `<meta_prompt task_type="${this.escapeXML(taskType)}">
  <system_prompt>${this.escapeXML(String(systemPrompt))}</system_prompt>
  <user_prompt>${this.escapeXML(String(userPrompt))}</user_prompt>
  <context_summary>${this.escapeXML(String(contextSummary))}</context_summary>
  <task_decomposition>${this.escapeXML(taskDecompositionStr)}</task_decomposition>
  <guidelines>${this.escapeXML(guidelinesStr)}</guidelines>
  <ai_agent_response_format>${this.escapeXML(typeof aiAgentResponseFormat === 'string' ? aiAgentResponseFormat : JSON.stringify(aiAgentResponseFormat))}</ai_agent_response_format>
</meta_prompt>`;
    } else {
      // Fallback to simple string format
      return `<meta_prompt task_type="${this.escapeXML(taskType)}">
${this.escapeXML(String(metaPrompt))}
</meta_prompt>`;
    }
  }

  /**
   * Format meta-prompt with task-type specific guidelines (legacy method)
   */
  static formatMetaPrompt(metaPrompt: string, taskType: 'refactoring' | 'feature_addition' | 'bug_fix' | 'performance_optimization' | 'general'): string {
    const template = META_PROMPT_TEMPLATES[taskType];

    const textContent = `${template.systemPrompt}

${template.taskDecompositionGuidelines}

CONTEXT-SPECIFIC INSTRUCTIONS:
${metaPrompt}

ATOMIC TASK VALIDATION EXAMPLES:`;

    const xmlExamples = `<task_example type="atomic">
  <title>Implement user authentication middleware</title>
  <description>Create Express.js middleware function to validate JWT tokens and attach user data to request object</description>
  <estimated_hours>3</estimated_hours>
  <acceptance_criteria>
    - Middleware validates JWT token from Authorization header
    - Invalid tokens return 401 status with error message
    - Valid tokens attach user data to req.user
    - Includes comprehensive unit tests with >95% coverage
  </acceptance_criteria>
</task_example>

<task_example type="non_atomic">
  <title>Build complete user management system</title>
  <description>Implement full user registration, authentication, and profile management</description>
  <why_not_atomic>Too broad - spans multiple components, would take 20+ hours, lacks specific acceptance criteria</why_not_atomic>
  <decomposition_needed>Break into: user registration endpoint, authentication middleware, profile CRUD operations, password reset flow</decomposition_needed>
</task_example>`;

    return `<meta_prompt task_type="${this.escapeXML(taskType)}">
${this.escapeXML(textContent)}
${xmlExamples}
</meta_prompt>`;
  }

  /**
   * Validate XML structure and well-formedness
   */
  static validateXML(xmlString: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic XML structure validation
    if (!xmlString.trim().startsWith('<?xml')) {
      errors.push('Missing XML declaration');
    }

    // Check for balanced tags
    const tagPattern = /<\/?([a-zA-Z_][a-zA-Z0-9_-]*)[^>]*>/g;
    const tagStack: string[] = [];
    let match;

    while ((match = tagPattern.exec(xmlString)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];

      if (fullTag.startsWith('</')) {
        // Closing tag
        if (tagStack.length === 0) {
          errors.push(`Unexpected closing tag: ${fullTag}`);
        } else {
          const lastTag = tagStack.pop();
          if (lastTag !== tagName) {
            errors.push(`Mismatched tags: expected </${lastTag}>, found </${tagName}>`);
          }
        }
      } else if (!fullTag.endsWith('/>') && !fullTag.startsWith('<?')) {
        // Opening tag (not self-closing and not XML declaration)
        tagStack.push(tagName);
      }
    }

    if (tagStack.length > 0) {
      errors.push(`Unclosed tags: ${tagStack.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get task-type specific meta-prompt template
   */
  static getMetaPromptTemplate(taskType: 'refactoring' | 'feature_addition' | 'bug_fix' | 'performance_optimization' | 'general') {
    return META_PROMPT_TEMPLATES[taskType];
  }

  /**
   * Format XML with proper indentation for readability
   */
  static formatXMLForDisplay(xmlString: string): string {
    let formatted = '';
    let indent = 0;
    const indentSize = 2;

    // Split by tags to handle inline content properly
    const parts = xmlString.split(/(<[^>]*>)/);

    for (const part of parts) {
      if (!part.trim()) continue;

      if (part.startsWith('<')) {
        // This is a tag
        if (part.startsWith('</')) {
          // Closing tag - decrease indent first
          indent = Math.max(0, indent - indentSize);
          formatted += ' '.repeat(indent) + part + '\n';
        } else if (part.endsWith('/>') || part.startsWith('<?')) {
          // Self-closing tag or XML declaration
          formatted += ' '.repeat(indent) + part + '\n';
        } else {
          // Opening tag
          formatted += ' '.repeat(indent) + part + '\n';
          indent += indentSize;
        }
      } else {
        // This is text content
        const trimmed = part.trim();
        if (trimmed) {
          formatted += ' '.repeat(indent) + trimmed + '\n';
        }
      }
    }

    return formatted.trim();
  }

  /**
   * Extract text content from XML elements (for testing/validation)
   */
  static extractTextContent(xmlString: string, elementName: string): string[] {
    const pattern = new RegExp(`<${elementName}[^>]*>(.*?)</${elementName}>`, 'gs');
    const matches: string[] = [];
    let match;

    while ((match = pattern.exec(xmlString)) !== null) {
      // Unescape XML entities
      const content = match[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&'); // This should be last

      matches.push(content.trim());
    }

    return matches;
  }
}
