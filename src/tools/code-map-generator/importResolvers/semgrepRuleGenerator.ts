/**
 * Generator for Semgrep rules to detect imports in various languages.
 */

import * as fs from 'fs';
import logger from '../../../logger.js';

/**
 * Interface for a Semgrep rule.
 */
export interface SemgrepRule {
  id: string;
  pattern: string;
  message: string;
  languages: string[];
  severity: string;
  metadata?: Record<string, unknown>;
}

/**
 * Class for generating Semgrep rules for import detection.
 */
export class SemgrepRuleGenerator {
  /**
   * Generates rules for detecting imports in various languages.
   * @returns Array of Semgrep rules
   */
  public generateImportRules(): SemgrepRule[] {
    const rules: SemgrepRule[] = [];

    // Add JavaScript/TypeScript rules
    rules.push(...this.generateJavaScriptRules());

    // Add Python rules
    rules.push(...this.generatePythonRules());

    // Add Java rules
    rules.push(...this.generateJavaRules());

    // Add C/C++ rules
    rules.push(...this.generateCppRules());

    // Add Ruby rules
    rules.push(...this.generateRubyRules());

    // Add Go rules
    rules.push(...this.generateGoRules());

    // Add PHP rules
    rules.push(...this.generatePhpRules());

    return rules;
  }

  /**
   * Generates rules for JavaScript/TypeScript imports.
   */
  private generateJavaScriptRules(): SemgrepRule[] {
    return [
      {
        id: 'js-import-default',
        pattern: 'import $NAME from "$PATH"',
        message: 'Found JavaScript/TypeScript default import',
        languages: ['js', 'ts', 'jsx', 'tsx'],
        severity: 'INFO',
        metadata: {
          importType: 'default',
          isDefault: true
        }
      },
      {
        id: 'js-import-named',
        pattern: 'import { $NAMES } from "$PATH"',
        message: 'Found JavaScript/TypeScript named import',
        languages: ['js', 'ts', 'jsx', 'tsx'],
        severity: 'INFO',
        metadata: {
          importType: 'named'
        }
      },
      {
        id: 'js-import-namespace',
        pattern: 'import * as $NAME from "$PATH"',
        message: 'Found JavaScript/TypeScript namespace import',
        languages: ['js', 'ts', 'jsx', 'tsx'],
        severity: 'INFO',
        metadata: {
          importType: 'namespace',
          isNamespace: true
        }
      },
      {
        id: 'js-require',
        pattern: 'require("$PATH")',
        message: 'Found CommonJS require',
        languages: ['js', 'ts', 'jsx', 'tsx'],
        severity: 'INFO',
        metadata: {
          importType: 'require',
          moduleSystem: 'commonjs'
        }
      },
      {
        id: 'js-dynamic-import',
        pattern: 'import($PATH)',
        message: 'Found JavaScript/TypeScript dynamic import',
        languages: ['js', 'ts', 'jsx', 'tsx'],
        severity: 'INFO',
        metadata: {
          importType: 'dynamic',
          isDynamic: true
        }
      }
    ];
  }

  /**
   * Generates rules for Python imports.
   */
  private generatePythonRules(): SemgrepRule[] {
    return [
      {
        id: 'python-import',
        pattern: 'import $MODULE',
        message: 'Found Python import',
        languages: ['python'],
        severity: 'INFO',
        metadata: {
          importType: 'module'
        }
      },
      {
        id: 'python-from-import',
        pattern: 'from $MODULE import $NAMES',
        message: 'Found Python from-import',
        languages: ['python'],
        severity: 'INFO',
        metadata: {
          importType: 'from'
        }
      },
      {
        id: 'python-import-as',
        pattern: 'import $MODULE as $ALIAS',
        message: 'Found Python import with alias',
        languages: ['python'],
        severity: 'INFO',
        metadata: {
          importType: 'alias'
        }
      },
      {
        id: 'python-from-import-as',
        pattern: 'from $MODULE import $NAME as $ALIAS',
        message: 'Found Python from-import with alias',
        languages: ['python'],
        severity: 'INFO',
        metadata: {
          importType: 'from-alias'
        }
      }
    ];
  }

  /**
   * Generates rules for Java imports.
   */
  private generateJavaRules(): SemgrepRule[] {
    return [
      {
        id: 'java-import',
        pattern: 'import $PACKAGE.$CLASS;',
        message: 'Found Java import',
        languages: ['java'],
        severity: 'INFO',
        metadata: {
          importType: 'class'
        }
      },
      {
        id: 'java-import-static',
        pattern: 'import static $PACKAGE.$CLASS.$MEMBER;',
        message: 'Found Java static import',
        languages: ['java'],
        severity: 'INFO',
        metadata: {
          importType: 'static'
        }
      },
      {
        id: 'java-import-wildcard',
        pattern: 'import $PACKAGE.*;',
        message: 'Found Java wildcard import',
        languages: ['java'],
        severity: 'INFO',
        metadata: {
          importType: 'wildcard'
        }
      }
    ];
  }

  /**
   * Generates rules for C/C++ includes.
   */
  private generateCppRules(): SemgrepRule[] {
    return [
      {
        id: 'cpp-include-system',
        pattern: '#include <$HEADER>',
        message: 'Found C/C++ system include',
        languages: ['c', 'cpp'],
        severity: 'INFO',
        metadata: {
          importType: 'system',
          isCore: true
        }
      },
      {
        id: 'cpp-include-local',
        pattern: '#include "$HEADER"',
        message: 'Found C/C++ local include',
        languages: ['c', 'cpp'],
        severity: 'INFO',
        metadata: {
          importType: 'local',
          isRelative: true
        }
      },
      {
        id: 'cpp-import',
        pattern: 'import $MODULE;',
        message: 'Found C++20 import',
        languages: ['cpp'],
        severity: 'INFO',
        metadata: {
          importType: 'module'
        }
      }
    ];
  }

  /**
   * Generates rules for Ruby imports.
   */
  private generateRubyRules(): SemgrepRule[] {
    return [
      {
        id: 'ruby-require',
        pattern: 'require "$GEM"',
        message: 'Found Ruby require',
        languages: ['ruby'],
        severity: 'INFO',
        metadata: {
          importType: 'gem'
        }
      },
      {
        id: 'ruby-require-relative',
        pattern: 'require_relative "$PATH"',
        message: 'Found Ruby relative require',
        languages: ['ruby'],
        severity: 'INFO',
        metadata: {
          importType: 'relative',
          isRelative: true
        }
      },
      {
        id: 'ruby-load',
        pattern: 'load "$PATH"',
        message: 'Found Ruby load',
        languages: ['ruby'],
        severity: 'INFO',
        metadata: {
          importType: 'load'
        }
      },
      {
        id: 'ruby-include',
        pattern: 'include $MODULE',
        message: 'Found Ruby include',
        languages: ['ruby'],
        severity: 'INFO',
        metadata: {
          importType: 'include'
        }
      }
    ];
  }

  /**
   * Generates rules for Go imports.
   */
  private generateGoRules(): SemgrepRule[] {
    return [
      {
        id: 'go-import-single',
        pattern: 'import "$PACKAGE"',
        message: 'Found Go import',
        languages: ['go'],
        severity: 'INFO',
        metadata: {
          importType: 'single'
        }
      },
      {
        id: 'go-import-alias',
        pattern: 'import $ALIAS "$PACKAGE"',
        message: 'Found Go import with alias',
        languages: ['go'],
        severity: 'INFO',
        metadata: {
          importType: 'alias'
        }
      },
      {
        id: 'go-import-dot',
        pattern: 'import . "$PACKAGE"',
        message: 'Found Go dot import',
        languages: ['go'],
        severity: 'INFO',
        metadata: {
          importType: 'dot'
        }
      },
      {
        id: 'go-import-blank',
        pattern: 'import _ "$PACKAGE"',
        message: 'Found Go blank import',
        languages: ['go'],
        severity: 'INFO',
        metadata: {
          importType: 'blank'
        }
      }
    ];
  }

  /**
   * Generates rules for PHP imports.
   */
  private generatePhpRules(): SemgrepRule[] {
    return [
      {
        id: 'php-require',
        pattern: 'require "$PATH"',
        message: 'Found PHP require',
        languages: ['php'],
        severity: 'INFO',
        metadata: {
          importType: 'require'
        }
      },
      {
        id: 'php-require-once',
        pattern: 'require_once "$PATH"',
        message: 'Found PHP require_once',
        languages: ['php'],
        severity: 'INFO',
        metadata: {
          importType: 'require_once'
        }
      },
      {
        id: 'php-include',
        pattern: 'include "$PATH"',
        message: 'Found PHP include',
        languages: ['php'],
        severity: 'INFO',
        metadata: {
          importType: 'include'
        }
      },
      {
        id: 'php-include-once',
        pattern: 'include_once "$PATH"',
        message: 'Found PHP include_once',
        languages: ['php'],
        severity: 'INFO',
        metadata: {
          importType: 'include_once'
        }
      },
      {
        id: 'php-use',
        pattern: 'use $NAMESPACE\\$CLASS;',
        message: 'Found PHP use',
        languages: ['php'],
        severity: 'INFO',
        metadata: {
          importType: 'use'
        }
      },
      {
        id: 'php-use-alias',
        pattern: 'use $NAMESPACE\\$CLASS as $ALIAS;',
        message: 'Found PHP use with alias',
        languages: ['php'],
        severity: 'INFO',
        metadata: {
          importType: 'use_alias'
        }
      }
    ];
  }
  /**
   * Writes rules to a YAML file.
   * @param rules Array of Semgrep rules
   * @param outputPath Path to write the rules file
   */
  public async writeRulesToFile(rules: SemgrepRule[], outputPath: string): Promise<void> {
    try {
      // Create YAML content
      let rulesContent = 'rules:\n';

      rules.forEach(rule => {
        rulesContent += `  - id: ${rule.id}\n`;
        rulesContent += `    pattern: ${rule.pattern}\n`;
        rulesContent += `    message: ${rule.message}\n`;
        rulesContent += `    languages: [${rule.languages.join(', ')}]\n`;
        rulesContent += `    severity: ${rule.severity}\n`;

        if (rule.metadata) {
          rulesContent += '    metadata:\n';
          Object.entries(rule.metadata).forEach(([key, value]) => {
            rulesContent += `      ${key}: ${JSON.stringify(value)}\n`;
          });
        }

        rulesContent += '\n';
      });

      // Write rules to file
      await fs.promises.writeFile(outputPath, rulesContent);
    } catch (error) {
      logger.error(
        { err: error, outputPath },
        'Error writing Semgrep rules to file'
      );
      throw error;
    }
  }
}