/**
 * Multi-Format Output Formatter Service for Context Curator
 * 
 * Provides comprehensive output formatting capabilities supporting XML, JSON, and YAML formats
 * with task-type specific templates, validation, and schema compliance.
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import logger from '../../../logger.js';
import { XMLFormatter } from '../utils/xml-formatter.js';
import {
  OutputFormat,
  TaskType,
  XmlOutputValidation,
  JsonOutputValidation,
  YamlOutputValidation,
  ContextCuratorConfig
} from '../types/context-curator.js';
import { ContextPackage } from '../types/output-package.js';

/**
 * Template variable substitution interface
 */
export interface TemplateVariables {
  projectName?: string;
  taskType: TaskType;
  userPrompt: string;
  refinedPrompt?: string; // Made optional since it's already in metadata
  totalFiles: number;
  totalTokens: number;
  generationTimestamp: string;
  [key: string]: string | number | undefined;
}

/**
 * Format-specific output result
 */
export interface FormattedOutput {
  content: string;
  format: OutputFormat;
  size: number;
  validation: XmlOutputValidation | JsonOutputValidation | YamlOutputValidation;
  processingTimeMs: number;
}

/**
 * Multi-Format Output Formatter Service
 */
export class OutputFormatterService {
  private static instance: OutputFormatterService;
  private templateCache: Map<string, string> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): OutputFormatterService {
    if (!OutputFormatterService.instance) {
      OutputFormatterService.instance = new OutputFormatterService();
    }
    return OutputFormatterService.instance;
  }

  /**
   * Format context package in specified format
   */
  async formatOutput(
    contextPackage: ContextPackage,
    format: OutputFormat,
    config: ContextCuratorConfig,
    templateVariables?: Partial<TemplateVariables>
  ): Promise<FormattedOutput> {
    const startTime = Date.now();

    try {
      logger.debug({ format, packageId: contextPackage.metadata }, 'Formatting output');

      // Prepare template variables
      const variables: TemplateVariables = {
        projectName: contextPackage.metadata.targetDirectory ? path.basename(contextPackage.metadata.targetDirectory) : 'unknown',
        taskType: contextPackage.metadata.taskType,
        userPrompt: contextPackage.metadata.originalPrompt,
        // NOTE: refinedPrompt is already in metadata, no need to duplicate it in templateVariables
        // refinedPrompt: contextPackage.refinedPrompt,
        totalFiles: contextPackage.metadata.filesIncluded,
        totalTokens: contextPackage.metadata.totalTokenEstimate,
        generationTimestamp: (contextPackage.metadata.generationTimestamp || new Date()).toISOString(),
        ...templateVariables,
        ...(config.outputFormat?.templateOptions?.customVariables || {})
      };

      let content: string;
      let validation: XmlOutputValidation | JsonOutputValidation | YamlOutputValidation;

      switch (format) {
        case 'xml':
          content = await this.formatAsXML(contextPackage, variables, config);
          validation = this.validateXMLOutput(content);
          break;
        case 'json':
          content = await this.formatAsJSON(contextPackage, variables, config);
          validation = this.validateJSONOutput(content);
          break;
        case 'yaml':
          content = await this.formatAsYAML(contextPackage, variables, config);
          validation = this.validateYAMLOutput(content);
          break;
        default:
          throw new Error(`Unsupported output format: ${format}`);
      }

      const processingTimeMs = Date.now() - startTime;

      logger.info({
        format,
        size: content.length,
        processingTimeMs,
        isValid: this.isValidationPassed(validation)
      }, 'Output formatting completed');

      return {
        content,
        format,
        size: content.length,
        validation,
        processingTimeMs
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        format,
        processingTimeMs
      }, 'Output formatting failed');
      throw new Error(`Output formatting failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format as XML using enhanced templates
   */
  private async formatAsXML(
    contextPackage: ContextPackage,
    variables: TemplateVariables,
    _config: ContextCuratorConfig
  ): Promise<string> {
    // Load task-specific template
    const template = await this.loadTemplate(variables.taskType, 'xml');

    if (template.trim()) {
      // Use template-based formatting - generate only inner content for templates
      const innerXml = this.generateInnerXMLContent(contextPackage);
      const enhancedXml = this.applyTemplateVariables(innerXml, variables, template);
      return enhancedXml;
    } else {
      // Fallback to base XML formatter with variable substitution
      const baseXml = XMLFormatter.formatContextPackage(contextPackage);
      return this.applyTemplateVariables(baseXml, variables, '');
    }
  }

  /**
   * Generate inner XML content without XML declaration and root element
   */
  private generateInnerXMLContent(contextPackage: ContextPackage): string {
    // Generate the full XML first
    const fullXml = XMLFormatter.formatContextPackage(contextPackage);

    // Extract only the inner content (everything between the root tags)
    let innerContent = fullXml;

    // Remove XML declaration
    innerContent = innerContent.replace(/^\s*<\?xml[^>]*\?>\s*\n?/, '');

    // Remove the opening context_package tag and its attributes
    innerContent = innerContent.replace(/^\s*<context_package[^>]*>\s*\n?/, '');

    // Remove the closing context_package tag
    innerContent = innerContent.replace(/\s*<\/context_package>\s*$/, '');

    return innerContent.trim();
  }

  /**
   * Format as JSON
   */
  private async formatAsJSON(
    contextPackage: ContextPackage,
    variables: TemplateVariables,
    _config: ContextCuratorConfig
  ): Promise<string> {
    // Convert context package to JSON-friendly structure
    const jsonData = {
      metadata: {
        ...contextPackage.metadata,
        generationTimestamp: (contextPackage.metadata.generationTimestamp || new Date()).toISOString(),
        taskType: variables.taskType,
        format: 'json' as const
      },
      // NOTE: refinedPrompt is already included in metadata, no need to duplicate it here
      codemapPath: contextPackage.codemapPath,
      files: {
        highPriority: contextPackage.highPriorityFiles || [],
        mediumPriority: contextPackage.mediumPriorityFiles || [],
        lowPriority: contextPackage.lowPriorityFiles || []
      },
      metaPrompt: contextPackage.metaPrompt || (contextPackage as Record<string, unknown>).fullMetaPrompt,
      templateVariables: {
        ...variables,
        // Include AI agent response format from the original context package
        aiAgentResponseFormat: this.extractAiAgentResponseFormat(contextPackage)
      }
    };

    return JSON.stringify(jsonData, null, 2);
  }

  /**
   * Format as YAML
   */
  private async formatAsYAML(
    contextPackage: ContextPackage,
    variables: TemplateVariables,
    _config: ContextCuratorConfig
  ): Promise<string> {
    // Convert context package to YAML-friendly structure
    const yamlData = {
      metadata: {
        ...contextPackage.metadata,
        generationTimestamp: (contextPackage.metadata.generationTimestamp || new Date()).toISOString(),
        taskType: variables.taskType,
        format: 'yaml' as const
      },
      // NOTE: refinedPrompt is already included in metadata, no need to duplicate it here
      codemapPath: contextPackage.codemapPath,
      files: {
        highPriority: contextPackage.highPriorityFiles || [],
        mediumPriority: contextPackage.mediumPriorityFiles || [],
        lowPriority: contextPackage.lowPriorityFiles || []
      },
      metaPrompt: contextPackage.metaPrompt || (contextPackage as Record<string, unknown>).fullMetaPrompt,
      templateVariables: {
        ...variables,
        // Include AI agent response format from the original context package
        aiAgentResponseFormat: this.extractAiAgentResponseFormat(contextPackage)
      }
    };

    return yaml.dump(yamlData, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    });
  }

  /**
   * Load task-type specific template
   */
  private async loadTemplate(taskType: TaskType, format: OutputFormat): Promise<string> {
    const cacheKey = `${taskType}-${format}`;
    
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    try {
      // Use proper path resolution for templates relative to the project root
      const projectRoot = process.cwd();
      const templatePath = path.join(
        projectRoot,
        'src/tools/context-curator/templates',
        `${taskType}-template.${format}`
      );
      
      const template = await fs.readFile(templatePath, 'utf-8');
      this.templateCache.set(cacheKey, template);
      
      logger.debug({ taskType, format, templatePath }, 'Template loaded and cached');
      return template;
      
    } catch (error) {
      logger.warn({ 
        taskType, 
        format, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to load template, using default');
      
      // Return empty template as fallback
      return '';
    }
  }

  /**
   * Apply template variables to content
   */
  private applyTemplateVariables(
    content: string,
    variables: TemplateVariables,
    template: string
  ): string {
    // If template exists, use template-based approach
    if (template.trim()) {
      // First, apply variable substitution to the template
      let result = template;
      Object.entries(variables).forEach(([key, value]) => {
        if (value !== undefined) {
          const placeholder = `{{${key}}}`;
          result = result.replace(new RegExp(placeholder, 'g'), String(value));
        }
      });

      // Then replace {{CONTENT}} with the actual content
      // Remove XML declaration from content if template already has one
      let cleanContent = content;
      if (template.includes('<?xml') && content.includes('<?xml')) {
        // Remove ALL XML declarations from content, not just the first one
        // This handles cases where content might have multiple XML declarations
        cleanContent = content.replace(/<\?xml[^>]*\?>\s*\n?/g, '');
      }

      result = result.replace('{{CONTENT}}', cleanContent);
      return result;
    } else {
      // Fallback: apply variable substitution directly to content
      let result = content;
      Object.entries(variables).forEach(([key, value]) => {
        if (value !== undefined) {
          const placeholder = `{{${key}}}`;
          result = result.replace(new RegExp(placeholder, 'g'), String(value));
        }
      });
      return result;
    }
  }

  /**
   * Validate XML output
   */
  private validateXMLOutput(content: string): XmlOutputValidation {
    return {
      hasXmlDeclaration: content.startsWith('<?xml'),
      isWellFormed: this.isWellFormedXML(content),
      schemaCompliant: this.isXMLSchemaCompliant(content),
      validEncoding: this.hasValidXMLEncoding(content)
    };
  }

  /**
   * Validate JSON output
   */
  private validateJSONOutput(content: string): JsonOutputValidation {
    try {
      const parsed = JSON.parse(content);
      return {
        isValidJson: true,
        schemaCompliant: this.isJSONSchemaCompliant(parsed),
        hasRequiredFields: this.hasRequiredJSONFields(parsed)
      };
    } catch {
      return {
        isValidJson: false,
        schemaCompliant: false,
        hasRequiredFields: false
      };
    }
  }

  /**
   * Validate YAML output
   */
  private validateYAMLOutput(content: string): YamlOutputValidation {
    try {
      const parsed = yaml.load(content) as Record<string, unknown>;
      return {
        isValidYaml: true,
        schemaCompliant: this.isYAMLSchemaCompliant(parsed),
        hasRequiredFields: this.hasRequiredYAMLFields(parsed)
      };
    } catch {
      return {
        isValidYaml: false,
        schemaCompliant: false,
        hasRequiredFields: false
      };
    }
  }

  /**
   * Check if validation passed
   */
  private isValidationPassed(validation: XmlOutputValidation | JsonOutputValidation | YamlOutputValidation): boolean {
    if ('isWellFormed' in validation) {
      return validation.hasXmlDeclaration && validation.isWellFormed && validation.schemaCompliant;
    } else if ('isValidJson' in validation) {
      return validation.isValidJson && validation.schemaCompliant && validation.hasRequiredFields;
    } else {
      return validation.isValidYaml && validation.schemaCompliant && validation.hasRequiredFields;
    }
  }

  // Validation helper methods
  private isWellFormedXML(content: string): boolean {
    // Basic XML well-formedness check
    const openTags = content.match(/<[^/][^>]*>/g) || [];
    const closeTags = content.match(/<\/[^>]*>/g) || [];
    return openTags.length >= closeTags.length;
  }

  private isXMLSchemaCompliant(content: string): boolean {
    // Check for required XML elements - be more flexible with element names
    return content.includes('<context_package') ||
           content.includes('<feature_addition_context_package') ||
           content.includes('<bug_fix_context_package') ||
           content.includes('<refactoring_context_package') ||
           content.includes('<general_context_package') ||
           (content.includes('<package_metadata>') &&
            (content.includes('</context_package>') ||
             content.includes('</feature_addition_context_package>') ||
             content.includes('</bug_fix_context_package>') ||
             content.includes('</refactoring_context_package>') ||
             content.includes('</general_context_package>')));
  }

  /**
   * Extract AI agent response format from context package
   */
  private extractAiAgentResponseFormat(contextPackage: Record<string, unknown>): Record<string, unknown> | undefined {
    // Try to get from the original context package structure
    if (contextPackage && typeof contextPackage === 'object') {
      // Check if it's in the fullMetaPrompt object (preserved from conversion)
      if (contextPackage.fullMetaPrompt && typeof contextPackage.fullMetaPrompt === 'object') {
        const fullMeta = contextPackage.fullMetaPrompt as Record<string, unknown>;
        if (fullMeta.aiAgentResponseFormat) {
          return fullMeta.aiAgentResponseFormat as Record<string, unknown>;
        }
      }

      // Check if it's in the metaPrompt object (legacy structure)
      if (contextPackage.metaPrompt && typeof contextPackage.metaPrompt === 'object') {
        const meta = contextPackage.metaPrompt as Record<string, unknown>;
        if (meta.aiAgentResponseFormat) {
          return meta.aiAgentResponseFormat as Record<string, unknown>;
        }
      }

      // Check if it's directly on the context package (fallback)
      if (contextPackage.aiAgentResponseFormat) {
        return contextPackage.aiAgentResponseFormat as Record<string, unknown>;
      }
    }

    // Return undefined if not found
    return undefined;
  }

  private hasValidXMLEncoding(content: string): boolean {
    return content.includes('encoding="UTF-8"') || !content.includes('encoding=');
  }

  private isJSONSchemaCompliant(data: Record<string, unknown>): boolean {
    return !!(data &&
           typeof data === 'object' &&
           data.metadata &&
           data.files);
  }

  private hasRequiredJSONFields(data: Record<string, unknown>): boolean {
    const metadata = data.metadata as Record<string, unknown> | undefined;
    return !!(metadata?.taskType &&
           metadata?.generationTimestamp &&
           metadata?.refinedPrompt &&
           data.files);
  }

  private isYAMLSchemaCompliant(data: Record<string, unknown>): boolean {
    return !!(data &&
           typeof data === 'object' &&
           data.metadata &&
           data.files);
  }

  private hasRequiredYAMLFields(data: Record<string, unknown>): boolean {
    const metadata = data.metadata as Record<string, unknown> | undefined;
    return !!(metadata?.taskType &&
           metadata?.generationTimestamp &&
           metadata?.refinedPrompt &&
           data.files);
  }
}
