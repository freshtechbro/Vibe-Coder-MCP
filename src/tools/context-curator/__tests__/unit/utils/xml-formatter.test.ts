import { describe, it, expect } from 'vitest';
import { XMLFormatter, META_PROMPT_TEMPLATES } from '../../../utils/xml-formatter.js';
import { 
  ContextPackage, 
  ProcessedFile, 
  FileReference,
  createEmptyContextPackage 
} from '../../../types/output-package.js';

describe('XMLFormatter', () => {
  describe('escapeXML', () => {
    it('should escape basic XML characters', () => {
      const input = 'Hello & <world> "test" \'value\'';
      const expected = 'Hello &amp; &lt;world&gt; &quot;test&quot; &#39;value&#39;';
      expect(XMLFormatter.escapeXML(input)).toBe(expected);
    });

    it('should handle empty strings', () => {
      expect(XMLFormatter.escapeXML('')).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(XMLFormatter.escapeXML(123 as unknown as string)).toBe('123');
      expect(XMLFormatter.escapeXML(null as unknown as string)).toBe('null');
      expect(XMLFormatter.escapeXML(undefined as unknown as string)).toBe('undefined');
    });

    it('should remove control characters', () => {
      const input = 'Hello\x00\x01\x02World\x7F';
      const expected = 'HelloWorld';
      expect(XMLFormatter.escapeXML(input)).toBe(expected);
    });

    it('should preserve valid whitespace characters', () => {
      const input = 'Hello\n\t\r World';
      const expected = 'Hello\n\t\r World';
      expect(XMLFormatter.escapeXML(input)).toBe(expected);
    });
  });

  describe('formatContextPackage', () => {
    it('should format complete context package with all sections', () => {
      const contextPackage: ContextPackage = {
        metadata: {
          generationTimestamp: new Date('2024-01-20T10:00:00Z'),
          targetDirectory: '/test/project',
          originalPrompt: 'Test prompt',
          refinedPrompt: 'Refined test prompt',
          totalTokenEstimate: 1500,
          processingTimeMs: 2000,
          taskType: 'feature_addition',
          version: '1.0.0',
          formatVersion: '1.0.0',
          toolVersion: '1.0.0',
          codemapCacheUsed: false,
          filesAnalyzed: 5,
          filesIncluded: 3
        },
        refinedPrompt: 'Refined test prompt',
        codemapPath: '/test/codemap.md',
        highPriorityFiles: [{
          path: 'src/test.ts',
          content: 'console.log("test");',
          isOptimized: false,
          totalLines: 1,
          fullContentLines: 1,
          tokenEstimate: 10,
          contentSections: [{
            type: 'full',
            startLine: 1,
            endLine: 1,
            content: 'console.log("test");',
            tokenCount: 10,
            description: 'Complete file content'
          }]
        }],
        mediumPriorityFiles: [],
        lowPriorityFiles: [{
          path: 'src/utils.ts',
          relevanceScore: 0.3,
          reasoning: 'Utility functions',
          tokenEstimate: 50,
          size: 1024,
          lastModified: new Date('2024-01-19T10:00:00Z'),
          language: 'typescript'
        }],
        metaPrompt: 'Generated meta-prompt for AI agents'
      };

      const xml = XMLFormatter.formatContextPackage(contextPackage);

      // Verify XML structure
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<context_package version="1.0.0" format_version="1.0.0">');
      expect(xml).toContain('<generation_timestamp>2024-01-20T10:00:00.000Z</generation_timestamp>');
      expect(xml).toContain('<target_directory>/test/project</target_directory>');
      expect(xml).toContain('<task_type>feature_addition</task_type>');
      expect(xml).toContain('<high_priority_files>');
      expect(xml).toContain('<medium_priority_files></medium_priority_files>');
      expect(xml).toContain('<low_priority_files>');
      expect(xml).toContain('<meta_prompt task_type="feature_addition">');
      expect(xml).toContain('</context_package>');
    });

    it('should handle empty context package', () => {
      const contextPackage = createEmptyContextPackage('/test', 'Empty test', 'general');
      const xml = XMLFormatter.formatContextPackage(contextPackage);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<high_priority_files></high_priority_files>');
      expect(xml).toContain('<medium_priority_files></medium_priority_files>');
      expect(xml).toContain('<low_priority_files></low_priority_files>');
    });

    it('should escape special characters in content', () => {
      const contextPackage = createEmptyContextPackage('/test', 'Test with <special> & "chars"', 'general');
      const xml = XMLFormatter.formatContextPackage(contextPackage);

      expect(xml).toContain('&lt;special&gt; &amp; &quot;chars&quot;');
    });
  });

  describe('formatFiles', () => {
    it('should format processed files with content sections', () => {
      const files: ProcessedFile[] = [{
        path: 'src/example.ts',
        content: 'function test() { return true; }',
        isOptimized: true,
        totalLines: 10,
        fullContentLines: 5,
        optimizedLines: 5,
        tokenEstimate: 50,
        contentSections: [
          {
            type: 'full',
            startLine: 1,
            endLine: 5,
            content: 'function test() {',
            tokenCount: 20,
            description: 'Function declaration'
          },
          {
            type: 'optimized',
            startLine: 6,
            endLine: 10,
            content: '// ... implementation details',
            tokenCount: 30,
            description: 'Optimized content'
          }
        ]
      }];

      const xml = XMLFormatter.formatFiles(files, 'test_files');

      expect(xml).toContain('<test_files>');
      expect(xml).toContain('<file>');
      expect(xml).toContain('<path>src/example.ts</path>');
      expect(xml).toContain('<is_optimized>true</is_optimized>');
      expect(xml).toContain('<total_lines>10</total_lines>');
      expect(xml).toContain('<full_content_lines>5</full_content_lines>');
      expect(xml).toContain('<optimized_lines>5</optimized_lines>');
      expect(xml).toContain('<content_sections>');
      expect(xml).toContain('<content_section type="full"');
      expect(xml).toContain('<content_section type="optimized"');
      expect(xml).toContain('</test_files>');
    });

    it('should handle empty file arrays', () => {
      const xml = XMLFormatter.formatFiles([], 'empty_files');
      expect(xml).toBe('<empty_files></empty_files>');
    });
  });

  describe('formatLowPriorityFiles', () => {
    it('should format file references', () => {
      const files: FileReference[] = [{
        path: 'src/reference.ts',
        relevanceScore: 0.25,
        reasoning: 'Reference file summary',
        tokenEstimate: 100,
        size: 2048,
        lastModified: new Date('2024-01-18T15:30:00Z'),
        language: 'typescript'
      }];

      const xml = XMLFormatter.formatLowPriorityFiles(files);

      expect(xml).toContain('<low_priority_files>');
      expect(xml).toContain('<file_reference>');
      expect(xml).toContain('<path>src/reference.ts</path>');
      expect(xml).toContain('<relevance_score>0.25</relevance_score>');
      expect(xml).toContain('<reasoning>Reference file summary</reasoning>');
      expect(xml).toContain('<token_estimate>100</token_estimate>');
      expect(xml).toContain('<size_bytes>2048</size_bytes>');
      expect(xml).toContain('<last_modified>2024-01-18T15:30:00.000Z</last_modified>');
      expect(xml).toContain('<language>typescript</language>');
      expect(xml).toContain('</low_priority_files>');
    });

    it('should handle empty file reference arrays', () => {
      const xml = XMLFormatter.formatLowPriorityFiles([]);
      expect(xml).toBe('<low_priority_files></low_priority_files>');
    });
  });

  describe('formatMetaPrompt', () => {
    it('should format meta-prompt with task-specific guidelines for refactoring', () => {
      const metaPrompt = 'Refactor the authentication module';
      const xml = XMLFormatter.formatMetaPrompt(metaPrompt, 'refactoring');

      expect(xml).toContain('<meta_prompt task_type="refactoring">');
      expect(xml).toContain('refactoring specialist');
      expect(xml).toContain('REFACTORING PRINCIPLES');
      expect(xml).toContain('REFACTORING TASK DECOMPOSITION');
      expect(xml).toContain('CONTEXT-SPECIFIC INSTRUCTIONS');
      expect(xml).toContain('Refactor the authentication module');
      expect(xml).toContain('ATOMIC TASK VALIDATION EXAMPLES');
      expect(xml).toContain('<task_example type="atomic">');
      expect(xml).toContain('<task_example type="non_atomic">');
      expect(xml).toContain('</meta_prompt>');
    });

    it('should format meta-prompt for feature addition', () => {
      const metaPrompt = 'Add user profile management';
      const xml = XMLFormatter.formatMetaPrompt(metaPrompt, 'feature_addition');

      expect(xml).toContain('<meta_prompt task_type="feature_addition">');
      expect(xml).toContain('feature development specialist');
      expect(xml).toContain('FEATURE DEVELOPMENT PRINCIPLES');
      expect(xml).toContain('FEATURE ADDITION TASK DECOMPOSITION');
    });

    it('should format meta-prompt for bug fix', () => {
      const metaPrompt = 'Fix login validation issue';
      const xml = XMLFormatter.formatMetaPrompt(metaPrompt, 'bug_fix');

      expect(xml).toContain('<meta_prompt task_type="bug_fix">');
      expect(xml).toContain('debugging and bug resolution specialist');
      expect(xml).toContain('BUG FIX PRINCIPLES');
      expect(xml).toContain('BUG FIX TASK DECOMPOSITION');
    });

    it('should format meta-prompt for general tasks', () => {
      const metaPrompt = 'Implement data validation';
      const xml = XMLFormatter.formatMetaPrompt(metaPrompt, 'general');

      expect(xml).toContain('<meta_prompt task_type="general">');
      expect(xml).toContain('software development specialist');
      expect(xml).toContain('DEVELOPMENT PRINCIPLES');
      expect(xml).toContain('GENERAL TASK DECOMPOSITION');
    });

    it('should escape special characters in meta-prompt content', () => {
      const metaPrompt = 'Fix <component> & "validation" issues';
      const xml = XMLFormatter.formatMetaPrompt(metaPrompt, 'bug_fix');

      expect(xml).toContain('&lt;component&gt; &amp; &quot;validation&quot; issues');
    });
  });

  describe('validateXML', () => {
    it('should validate well-formed XML', () => {
      const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <child>content</child>
  <empty_element/>
</root>`;

      const result = XMLFormatter.validateXML(validXml);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing XML declaration', () => {
      const invalidXml = '<root><child>content</child></root>';
      const result = XMLFormatter.validateXML(invalidXml);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing XML declaration');
    });

    it('should detect unbalanced tags', () => {
      const invalidXml = `<?xml version="1.0"?>
<root>
  <child>content</child>
  <unclosed>
</root>`;

      const result = XMLFormatter.validateXML(invalidXml);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Unclosed tags'))).toBe(true);
    });

    it('should detect mismatched tags', () => {
      const invalidXml = `<?xml version="1.0"?>
<root>
  <child>content</wrong>
</root>`;

      const result = XMLFormatter.validateXML(invalidXml);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Mismatched tags'))).toBe(true);
    });

    it('should detect unexpected closing tags', () => {
      const invalidXml = `<?xml version="1.0"?>
<root>
  </unexpected>
</root>`;

      const result = XMLFormatter.validateXML(invalidXml);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Unexpected closing tag'))).toBe(true);
    });

    it('should handle self-closing tags correctly', () => {
      const validXml = `<?xml version="1.0"?>
<root>
  <self_closing/>
  <another attr="value"/>
</root>`;

      const result = XMLFormatter.validateXML(validXml);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getMetaPromptTemplate', () => {
    it('should return correct template for each task type', () => {
      const refactoringTemplate = XMLFormatter.getMetaPromptTemplate('refactoring');
      expect(refactoringTemplate.systemPrompt).toContain('refactoring specialist');
      expect(refactoringTemplate.taskDecompositionGuidelines).toContain('REFACTORING TASK DECOMPOSITION');

      const featureTemplate = XMLFormatter.getMetaPromptTemplate('feature_addition');
      expect(featureTemplate.systemPrompt).toContain('feature development specialist');
      expect(featureTemplate.taskDecompositionGuidelines).toContain('FEATURE ADDITION TASK DECOMPOSITION');

      const bugFixTemplate = XMLFormatter.getMetaPromptTemplate('bug_fix');
      expect(bugFixTemplate.systemPrompt).toContain('debugging and bug resolution specialist');
      expect(bugFixTemplate.taskDecompositionGuidelines).toContain('BUG FIX TASK DECOMPOSITION');

      const generalTemplate = XMLFormatter.getMetaPromptTemplate('general');
      expect(generalTemplate.systemPrompt).toContain('software development specialist');
      expect(generalTemplate.taskDecompositionGuidelines).toContain('GENERAL TASK DECOMPOSITION');
    });
  });

  describe('formatXMLForDisplay', () => {
    it('should format XML with proper indentation', () => {
      const unformattedXml = '<root><child><nested>content</nested></child></root>';
      const formatted = XMLFormatter.formatXMLForDisplay(unformattedXml);

      const lines = formatted.split('\n');
      expect(lines[0]).toBe('<root>');
      expect(lines[1]).toBe('  <child>');
      expect(lines[2]).toBe('    <nested>');
      expect(lines[3]).toBe('      content');
      expect(lines[4]).toBe('    </nested>');
      expect(lines[5]).toBe('  </child>');
      expect(lines[6]).toBe('</root>');
    });

    it('should handle self-closing tags', () => {
      const xml = '<root><self_closing/><another/></root>';
      const formatted = XMLFormatter.formatXMLForDisplay(xml);

      expect(formatted).toContain('<self_closing/>');
      expect(formatted).toContain('<another/>');
    });

    it('should preserve XML declarations', () => {
      const xml = '<?xml version="1.0"?><root><child/></root>';
      const formatted = XMLFormatter.formatXMLForDisplay(xml);

      expect(formatted).toContain('<?xml version="1.0"?>');
    });
  });

  describe('extractTextContent', () => {
    it('should extract text content from XML elements', () => {
      const xml = `<root>
        <title>First Title</title>
        <content>Some content here</content>
        <title>Second Title</title>
      </root>`;

      const titles = XMLFormatter.extractTextContent(xml, 'title');
      expect(titles).toEqual(['First Title', 'Second Title']);

      const content = XMLFormatter.extractTextContent(xml, 'content');
      expect(content).toEqual(['Some content here']);
    });

    it('should unescape XML entities', () => {
      const xml = '<test>&lt;escaped&gt; &amp; &quot;content&quot;</test>';
      const content = XMLFormatter.extractTextContent(xml, 'test');

      expect(content).toEqual(['<escaped> & "content"']);
    });

    it('should return empty array for non-existent elements', () => {
      const xml = '<root><child>content</child></root>';
      const result = XMLFormatter.extractTextContent(xml, 'nonexistent');

      expect(result).toEqual([]);
    });

    it('should handle elements with attributes', () => {
      const xml = '<root><item id="1">First</item><item id="2">Second</item></root>';
      const items = XMLFormatter.extractTextContent(xml, 'item');

      expect(items).toEqual(['First', 'Second']);
    });
  });

  describe('META_PROMPT_TEMPLATES', () => {
    it('should have templates for all task types', () => {
      expect(META_PROMPT_TEMPLATES.refactoring).toBeDefined();
      expect(META_PROMPT_TEMPLATES.feature_addition).toBeDefined();
      expect(META_PROMPT_TEMPLATES.bug_fix).toBeDefined();
      expect(META_PROMPT_TEMPLATES.general).toBeDefined();
    });

    it('should have required properties for each template', () => {
      Object.values(META_PROMPT_TEMPLATES).forEach(template => {
        expect(template.systemPrompt).toBeDefined();
        expect(typeof template.systemPrompt).toBe('string');
        expect(template.systemPrompt.length).toBeGreaterThan(0);

        expect(template.taskDecompositionGuidelines).toBeDefined();
        expect(typeof template.taskDecompositionGuidelines).toBe('string');
        expect(template.taskDecompositionGuidelines.length).toBeGreaterThan(0);
      });
    });

    it('should contain atomic task guidelines in each template', () => {
      Object.values(META_PROMPT_TEMPLATES).forEach(template => {
        expect(template.systemPrompt).toContain('ATOMIC TASK GUIDELINES');
        expect(template.systemPrompt).toContain('1-4 hours');
        expect(template.taskDecompositionGuidelines).toContain('Phase');
      });
    });
  });
});
