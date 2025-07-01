/**
 * Tests for the SemgrepRuleGenerator.
 */

import { describe, it, expect, vi } from 'vitest';
import { SemgrepRuleGenerator } from '../../importResolvers/semgrepRuleGenerator.js';
import * as fs from 'fs';

// Mock fs.promises.writeFile
vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('SemgrepRuleGenerator', () => {
  it('should generate rules for JavaScript/TypeScript', () => {
    const generator = new SemgrepRuleGenerator();
    const rules = generator.generateImportRules();

    // Check that JavaScript/TypeScript rules are included
    const jsRules = rules.filter(rule => rule.id.startsWith('js-'));
    expect(jsRules.length).toBeGreaterThan(0);

    // Check for default import rule
    const defaultImportRule = jsRules.find(rule => rule.id === 'js-import-default');
    expect(defaultImportRule).toBeDefined();
    expect(defaultImportRule?.pattern).toContain('import $NAME from');

    // Check for named import rule
    const namedImportRule = jsRules.find(rule => rule.id === 'js-import-named');
    expect(namedImportRule).toBeDefined();
    expect(namedImportRule?.pattern).toContain('import { $NAMES }');

    // Check for namespace import rule
    const namespaceImportRule = jsRules.find(rule => rule.id === 'js-import-namespace');
    expect(namespaceImportRule).toBeDefined();
    expect(namespaceImportRule?.pattern).toContain('import * as');
  });

  it('should generate rules for Python', () => {
    const generator = new SemgrepRuleGenerator();
    const rules = generator.generateImportRules();

    // Check that Python rules are included
    const pyRules = rules.filter(rule => rule.id.startsWith('python-'));
    expect(pyRules.length).toBeGreaterThan(0);

    // Check for import rule
    const importRule = pyRules.find(rule => rule.id === 'python-import');
    expect(importRule).toBeDefined();
    expect(importRule?.pattern).toContain('import $MODULE');

    // Check for from-import rule
    const fromImportRule = pyRules.find(rule => rule.id === 'python-from-import');
    expect(fromImportRule).toBeDefined();
    expect(fromImportRule?.pattern).toContain('from $MODULE import');
  });

  it('should generate rules for Ruby', () => {
    const generator = new SemgrepRuleGenerator();
    const rules = generator.generateImportRules();

    // Check that Ruby rules are included
    const rubyRules = rules.filter(rule => rule.id.startsWith('ruby-'));
    expect(rubyRules.length).toBeGreaterThan(0);

    // Check for require rule
    const requireRule = rubyRules.find(rule => rule.id === 'ruby-require');
    expect(requireRule).toBeDefined();
    expect(requireRule?.pattern).toContain('require');

    // Check for require_relative rule
    const requireRelativeRule = rubyRules.find(rule => rule.id === 'ruby-require-relative');
    expect(requireRelativeRule).toBeDefined();
    expect(requireRelativeRule?.pattern).toContain('require_relative');
  });

  it('should generate rules for Go', () => {
    const generator = new SemgrepRuleGenerator();
    const rules = generator.generateImportRules();

    // Check that Go rules are included
    const goRules = rules.filter(rule => rule.id.startsWith('go-'));
    expect(goRules.length).toBeGreaterThan(0);

    // Check for import rule
    const importRule = goRules.find(rule => rule.id === 'go-import-single');
    expect(importRule).toBeDefined();
    expect(importRule?.pattern).toContain('import');
  });

  it('should generate rules for PHP', () => {
    const generator = new SemgrepRuleGenerator();
    const rules = generator.generateImportRules();

    // Check that PHP rules are included
    const phpRules = rules.filter(rule => rule.id.startsWith('php-'));
    expect(phpRules.length).toBeGreaterThan(0);

    // Check for require rule
    const requireRule = phpRules.find(rule => rule.id === 'php-require');
    expect(requireRule).toBeDefined();
    expect(requireRule?.pattern).toContain('require');

    // Check for include rule
    const includeRule = phpRules.find(rule => rule.id === 'php-include');
    expect(includeRule).toBeDefined();
    expect(includeRule?.pattern).toContain('include');

    // Check for use rule
    const useRule = phpRules.find(rule => rule.id === 'php-use');
    expect(useRule).toBeDefined();
    expect(useRule?.pattern).toContain('use');
  });

  it('should generate rules for Java', () => {
    const generator = new SemgrepRuleGenerator();
    const rules = generator.generateImportRules();

    // Check that Java rules are included
    const javaRules = rules.filter(rule => rule.id.startsWith('java-'));
    expect(javaRules.length).toBeGreaterThan(0);

    // Check for import rule
    const importRule = javaRules.find(rule => rule.id === 'java-import');
    expect(importRule).toBeDefined();
    expect(importRule?.pattern).toContain('import');
  });

  it('should generate rules for C/C++', () => {
    const generator = new SemgrepRuleGenerator();
    const rules = generator.generateImportRules();

    // Check that C/C++ rules are included
    const cppRules = rules.filter(rule => rule.id.startsWith('cpp-'));
    expect(cppRules.length).toBeGreaterThan(0);

    // Check for system include rule
    const systemIncludeRule = cppRules.find(rule => rule.id === 'cpp-include-system');
    expect(systemIncludeRule).toBeDefined();
    expect(systemIncludeRule?.pattern).toContain('#include <');

    // Check for local include rule
    const localIncludeRule = cppRules.find(rule => rule.id === 'cpp-include-local');
    expect(localIncludeRule).toBeDefined();
    expect(localIncludeRule?.pattern).toContain('#include "');
  });

  it('should write rules to a file', async () => {
    const generator = new SemgrepRuleGenerator();
    const rules = generator.generateImportRules();
    const outputPath = '/tmp/semgrep-rules.yaml';

    await generator.writeRulesToFile(rules, outputPath);

    // Check that writeFile was called with the correct arguments
    expect(fs.promises.writeFile).toHaveBeenCalledWith(outputPath, expect.stringContaining('rules:'));
  });
});
