/**
 * Tests for Test Coverage Analyzer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestCoverageAnalyzer } from './test-coverage-analyzer.js';
import { setupUniversalTestMock, cleanupTestServices } from './service-test-helper.js';

// Mock fs-extra and glob
vi.mock('fs-extra', () => ({
  pathExists: vi.fn(),
  readJson: vi.fn(),
  readFile: vi.fn()
}));

vi.mock('glob', () => ({
  glob: vi.fn()
}));

describe('Test Coverage Analyzer', () => {
  let analyzer: TestCoverageAnalyzer;

  beforeEach(async () => {
    await setupUniversalTestMock('coverage-analyzer-test');
    analyzer = new TestCoverageAnalyzer({
      coverageTarget: 90,
      sourceDirectory: 'src',
      testDirectory: '__tests__',
      coverageDirectory: 'coverage'
    });
  });

  afterEach(async () => {
    await cleanupTestServices();
  });

  describe('TestCoverageAnalyzer', () => {
    it('should initialize with default options', () => {
      const defaultAnalyzer = new TestCoverageAnalyzer();
      expect(defaultAnalyzer).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const customAnalyzer = new TestCoverageAnalyzer({
        coverageTarget: 95,
        sourceDirectory: 'lib',
        testDirectory: 'tests',
        coverageDirectory: 'cov'
      });
      expect(customAnalyzer).toBeDefined();
    });

    it('should analyze coverage with mock data', async () => {
      // Mock glob to return source and test files
      const { glob } = await import('glob');
      vi.mocked(glob).mockImplementation(async (patterns: string | string[]) => {
        if (Array.isArray(patterns) && patterns.some(p => p.includes('test'))) {
          return ['src/__tests__/example.test.ts'];
        }
        return ['src/example.ts', 'src/utils/helper.ts'];
      });

      // Mock fs-extra
      const fs = await import('fs-extra');
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readJson).mockResolvedValue({
        'src/example.ts': {
          lines: { total: 100, covered: 85 },
          functions: { total: 10, covered: 8 },
          branches: { total: 20, covered: 15 },
          statements: { total: 95, covered: 80 }
        },
        'src/utils/helper.ts': {
          lines: { total: 50, covered: 45 },
          functions: { total: 5, covered: 5 },
          branches: { total: 10, covered: 9 },
          statements: { total: 48, covered: 43 }
        }
      });

      const report = await analyzer.analyzeCoverage();

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.fileAnalysis).toBeDefined();
      expect(report.gapAnalysis).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.trends).toBeDefined();

      // Check summary
      expect(report.summary.totalFiles).toBe(2);
      expect(report.summary.overallMetrics.lines.percentage).toBeGreaterThan(0);
      expect(typeof report.summary.meetsTarget).toBe('boolean');

      // Check file analysis
      expect(report.fileAnalysis).toHaveLength(2);
      expect(report.fileAnalysis[0].filePath).toBe('src/example.ts');
      expect(report.fileAnalysis[0].metrics.lines.percentage).toBe(85);
      expect(report.fileAnalysis[0].hasTests).toBe(true);

      // Check gap analysis
      expect(report.gapAnalysis.criticalGaps).toBeDefined();
      expect(report.gapAnalysis.highRiskFiles).toBeDefined();
      expect(report.gapAnalysis.missingTestFiles).toBeDefined();
      expect(report.gapAnalysis.lowCoverageFiles).toBeDefined();

      // Check recommendations
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should handle missing coverage data gracefully', async () => {
      // Mock glob to return files
      const { glob } = await import('glob');
      vi.mocked(glob).mockImplementation(async (patterns: string | string[]) => {
        if (Array.isArray(patterns) && patterns.some(p => p.includes('test'))) {
          return [];
        }
        return ['src/uncovered.ts'];
      });

      // Mock fs-extra to simulate missing coverage data
      const fs = await import('fs-extra');
      vi.mocked(fs.pathExists).mockResolvedValue(false);

      const report = await analyzer.analyzeCoverage();

      expect(report).toBeDefined();
      expect(report.summary.totalFiles).toBe(1);
      expect(report.fileAnalysis[0].hasTests).toBe(false);
      expect(report.fileAnalysis[0].riskLevel).toBe('critical');
      expect(report.gapAnalysis.criticalGaps).toHaveLength(1);
    });

    it('should calculate risk levels correctly', async () => {
      // Mock data for different risk levels
      const { glob } = await import('glob');
      vi.mocked(glob).mockImplementation(async (patterns: string | string[]) => {
        if (Array.isArray(patterns) && patterns.some(p => p.includes('test'))) {
          return [
            'src/__tests__/high-coverage.test.ts',
            'src/__tests__/medium-coverage.test.ts',
            'src/__tests__/low-coverage.test.ts'
          ];
        }
        return [
          'src/high-coverage.ts',
          'src/medium-coverage.ts', 
          'src/low-coverage.ts',
          'src/no-tests.ts'
        ];
      });

      const fs = await import('fs-extra');
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readJson).mockResolvedValue({
        'src/high-coverage.ts': {
          lines: { total: 100, covered: 95 },
          functions: { total: 10, covered: 10 },
          branches: { total: 20, covered: 18 }
        },
        'src/medium-coverage.ts': {
          lines: { total: 100, covered: 75 },
          functions: { total: 10, covered: 7 },
          branches: { total: 20, covered: 14 }
        },
        'src/low-coverage.ts': {
          lines: { total: 100, covered: 55 },
          functions: { total: 10, covered: 5 },
          branches: { total: 20, covered: 10 }
        },
        'src/no-tests.ts': {
          lines: { total: 100, covered: 0 },
          functions: { total: 10, covered: 0 },
          branches: { total: 20, covered: 0 }
        }
      });

      const report = await analyzer.analyzeCoverage();

      const highCoverageFile = report.fileAnalysis.find(f => f.filePath === 'src/high-coverage.ts');
      const mediumCoverageFile = report.fileAnalysis.find(f => f.filePath === 'src/medium-coverage.ts');
      const lowCoverageFile = report.fileAnalysis.find(f => f.filePath === 'src/low-coverage.ts');
      const noTestsFile = report.fileAnalysis.find(f => f.filePath === 'src/no-tests.ts');

      expect(highCoverageFile?.riskLevel).toBe('low');
      expect(mediumCoverageFile?.riskLevel).toBe('medium');
      expect(lowCoverageFile?.riskLevel).toBe('high');
      expect(noTestsFile?.riskLevel).toBe('critical');
    });

    it('should generate appropriate recommendations', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob).mockImplementation(async (patterns: string | string[]) => {
        if (Array.isArray(patterns) && patterns.some(p => p.includes('test'))) {
          return [];
        }
        return ['src/needs-tests.ts', 'src/low-coverage.ts'];
      });

      const fs = await import('fs-extra');
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readJson).mockResolvedValue({
        'src/needs-tests.ts': {
          lines: { total: 100, covered: 0 },
          functions: { total: 10, covered: 0 },
          branches: { total: 20, covered: 0 }
        },
        'src/low-coverage.ts': {
          lines: { total: 100, covered: 60 },
          functions: { total: 10, covered: 6 },
          branches: { total: 20, covered: 12 }
        }
      });

      const report = await analyzer.analyzeCoverage();

      expect(report.recommendations.length).toBeGreaterThan(0);
      
      const highPriorityRecs = report.recommendations.filter(r => r.priority === 'high');
      expect(highPriorityRecs.length).toBeGreaterThan(0);
      expect(highPriorityRecs[0].category).toBe('testing');
      expect(highPriorityRecs[0].description).toContain('no test coverage');

      const mediumPriorityRecs = report.recommendations.filter(r => r.priority === 'medium');
      expect(mediumPriorityRecs.length).toBeGreaterThan(0);
      expect(mediumPriorityRecs[0].category).toBe('coverage');
    });

    it('should parse LCOV content correctly', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob).mockImplementation(async () => ['src/example.ts']);

      const fs = await import('fs-extra');
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        if (path.includes('coverage-final.json')) return false;
        if (path.includes('lcov.info')) return true;
        return false;
      });

      const lcovContent = `SF:src/example.ts
LF:100
LH:85
FNF:10
FNH:8
BRF:20
BRH:15
end_of_record`;

      vi.mocked(fs.readFile).mockResolvedValue(lcovContent);

      const report = await analyzer.analyzeCoverage();

      expect(report.fileAnalysis[0].metrics.lines.total).toBe(100);
      expect(report.fileAnalysis[0].metrics.lines.covered).toBe(85);
      expect(report.fileAnalysis[0].metrics.functions.total).toBe(10);
      expect(report.fileAnalysis[0].metrics.functions.covered).toBe(8);
      expect(report.fileAnalysis[0].metrics.branches.total).toBe(20);
      expect(report.fileAnalysis[0].metrics.branches.covered).toBe(15);
    });

    it('should identify test files correctly', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob).mockImplementation(async (patterns: string | string[]) => {
        if (Array.isArray(patterns) && patterns.some(p => p.includes('test'))) {
          return [
            'src/utils/__tests__/helper.test.ts',
            'src/services/__tests__/api.test.ts',
            'test/integration/workflow.test.ts'
          ];
        }
        return [
          'src/utils/helper.ts',
          'src/services/api.ts',
          'src/components/button.ts'
        ];
      });

      const fs = await import('fs-extra');
      vi.mocked(fs.pathExists).mockResolvedValue(false);

      const report = await analyzer.analyzeCoverage();

      const helperFile = report.fileAnalysis.find(f => f.filePath === 'src/utils/helper.ts');
      const apiFile = report.fileAnalysis.find(f => f.filePath === 'src/services/api.ts');
      const buttonFile = report.fileAnalysis.find(f => f.filePath === 'src/components/button.ts');

      expect(helperFile?.hasTests).toBe(true);
      expect(helperFile?.testFiles).toContain('src/utils/__tests__/helper.test.ts');
      expect(apiFile?.hasTests).toBe(true);
      expect(apiFile?.testFiles).toContain('src/services/__tests__/api.test.ts');
      expect(buttonFile?.hasTests).toBe(false);
    });

    it('should calculate summary metrics correctly', async () => {
      const { glob } = await import('glob');
      vi.mocked(glob).mockImplementation(async (patterns: string | string[]) => {
        if (Array.isArray(patterns) && patterns.some(p => p.includes('test'))) {
          return ['src/__tests__/file1.test.ts'];
        }
        return ['src/file1.ts', 'src/file2.ts'];
      });

      const fs = await import('fs-extra');
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readJson).mockResolvedValue({
        'src/file1.ts': {
          lines: { total: 100, covered: 90 },
          functions: { total: 10, covered: 9 },
          branches: { total: 20, covered: 18 },
          statements: { total: 95, covered: 85 }
        },
        'src/file2.ts': {
          lines: { total: 50, covered: 40 },
          functions: { total: 5, covered: 4 },
          branches: { total: 10, covered: 8 },
          statements: { total: 48, covered: 38 }
        }
      });

      const report = await analyzer.analyzeCoverage();

      expect(report.summary.totalFiles).toBe(2);
      expect(report.summary.testedFiles).toBe(1);
      expect(report.summary.untestedFiles).toBe(1);
      expect(report.summary.overallMetrics.lines.total).toBe(150);
      expect(report.summary.overallMetrics.lines.covered).toBe(130);
      expect(report.summary.overallMetrics.lines.percentage).toBe(87);
      expect(report.summary.meetsTarget).toBe(false); // 87% < 90%
    });
  });
});
