import fs from 'fs/promises';
import path from 'path';

import Handlebars from 'handlebars';

import { ValidationError, AppError } from '../../../utils/errors.js';

/**
 * Custom error for template-specific issues
 */
export class TemplateError extends AppError {
  constructor(message, context) {
    super(message, context);
    this.name = 'TemplateError';
  }
}

/**
 * Register Handlebars helpers for common template operations
 */
function registerHelpers() {
  // JSON stringification with optional indentation
  Handlebars.registerHelper('json', function (context, options) {
    const indent = options.hash.indent || 2;
    return JSON.stringify(context, null, indent);
  });

  // Conditional helper
  Handlebars.registerHelper('ifEquals', function (arg1, arg2, options) {
    return arg1 === arg2 ? options.fn(this) : options.inverse(this);
  });

  // String manipulation helpers
  Handlebars.registerHelper('lowercase', function (str) {
    return str.toLowerCase();
  });

  Handlebars.registerHelper('kebabCase', function (str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/\s+/g, '-')
      .toLowerCase();
  });

  // Array helpers
  Handlebars.registerHelper('join', function (arr, separator) {
    return Array.isArray(arr) ? arr.join(separator || ',') : '';
  });

  // Conditional dependency inclusion
  Handlebars.registerHelper(
    'ifDep',
    function (packageName, dependencies, options) {
      return dependencies && dependencies[packageName]
        ? options.fn(this)
        : options.inverse(this);
    }
  );
}

// Register helpers on module load
registerHelpers();

/**
 * The functions validateTemplateData and loadTemplate have been removed.
 */

/**
 * Fill a Handlebars template file with provided data.
 * @param {string} templatePath - Path to the .hbs template file
 * @param {object} data - Data context for template
 * @param {object} [options] - Additional options
 * @param {boolean} [options.strict=true] - Whether to enforce strict validation
 * @returns {Promise<string>} - Filled template content
 * @throws {TemplateError|ValidationError} If template processing fails
 */
export async function fillTemplate(
  templatePath,
  data,
  options = { strict: true }
) {
  /*
  if (typeof templatePath !== 'string') {
    throw new ValidationError('templatePath must be a string', {
      received: typeof templatePath
    });
  }

  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('data must be a non-null object', {
      received: data === null ? 'null' : typeof data
    });
  }

  try {
    // Load and validate template
    const templateContent = await loadTemplate(templatePath);

    // Validate data if strict mode is enabled (default)
    if (options.strict !== false) {
      validateTemplateData(templatePath, data);
    }

    // Compile template
    const compiled = Handlebars.compile(templateContent, {
      strict: true,
      noEscape: true,
      preventIndent: true,
      knownHelpersOnly: false
    });

    // Fill template
    const filled = compiled(data);

    // Basic output validation
    if (!filled || !filled.trim()) {
      throw new TemplateError('Template generated empty output', {
        templatePath,
        inputData: data
      });
    }

    return filled;
  } catch (error) {
    if (error instanceof AppError) throw error;
    
    throw new TemplateError(`Template processing failed: ${error.message}`, {
      templatePath,
      error: error.message
    });
  }
  */
  console.warn(
    `Template filling logic removed from CLI. Called for template: ${templatePath}`
  );
  return `Template filling logic removed. Template: ${templatePath}`;
}

/**
 * Register a partial template for reuse
 * @param {string} name - Name of the partial
 * @param {string} templatePath - Path to the partial template file
 */
export async function registerPartial(name, templatePath) {
  /*
  try {
    const content = await fs.readFile(templatePath, 'utf-8');
    Handlebars.registerPartial(name, content);
  } catch (error) {
    throw new TemplateError(`Failed to register partial ${name}`, {
      templatePath,
      error: error.message
    });
  }
  */
  console.warn(
    `Partial registration logic removed from CLI. Called for partial: ${name} at ${templatePath}`
  );
}
