/**
 * Comprehensive Test Coverage Analyzer
 * Provides detailed analysis of test coverage metrics and gaps
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import logger from '../../../../logger.js';

/**
 * Coverage metrics for a file or directory
 */
export interface CoverageMetrics {
  lines: {
    total: number;
    covered: number;
    percentage: number;
  };
  functions: {
    total: number;
    covered: number;
    percentage: number;
  };
  branches: {
    total: number;
    covered: number;
    percentage: number;
  };
  statements: {
    total: number;
    covered: number;
    percentage: number;
  };
}

/**
 * Coverage analysis for a specific file
 */
export interface FileCoverageAnalysis {
  filePath: string;
  relativePath: string;
  metrics: CoverageMetrics;
  uncoveredLines: number[];
  uncoveredFunctions: string[];
  uncoveredBranches: Array<{
    line: number;
    branch: string;
    condition: string;
  }>;
  testFiles: string[];
  hasTests: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

/**
 * Overall coverage analysis report
 */
export interface CoverageAnalysisReport {
  summary: {
    totalFiles: number;
    testedFiles: number;
    untestedFiles: number;
    overallMetrics: CoverageMetrics;
    coverageTarget: number;
    meetsTarget: boolean;
  };
  fileAnalysis: FileCoverageAnalysis[];
  gapAnalysis: {
    criticalGaps: FileCoverageAnalysis[];
    highRiskFiles: FileCoverageAnalysis[];
    missingTestFiles: string[];
    lowCoverageFiles: FileCoverageAnalysis[];
  };
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    category: 'coverage' | 'testing' | 'quality';
    description: string;
    files: string[];
    estimatedEffort: 'low' | 'medium' | 'high';
  }[];
  trends: {
    coverageHistory: Array<{
      date: string;
      coverage: number;
    }>;
    improvementRate: number;
    projectedTarget: number;
  };
}

/**
 * Test coverage analyzer
 */
export class TestCoverageAnalyzer {
  private coverageTarget: number;
  private sourceDirectory: string;
  private testDirectory: string;
  private coverageDirectory: string;

  constructor(options: {
    coverageTarget?: number;
    sourceDirectory?: string;
    testDirectory?: string;
    coverageDirectory?: string;
  } = {}) {
    this.coverageTarget = options.coverageTarget || 90;
    this.sourceDirectory = options.sourceDirectory || 'src';
    this.testDirectory = options.testDirectory || '__tests__';
    this.coverageDirectory = options.coverageDirectory || 'coverage';
  }

  /**
   * Analyze test coverage comprehensively
   */
  async analyzeCoverage(): Promise<CoverageAnalysisReport> {
    logger.info('Starting comprehensive test coverage analysis');

    const sourceFiles = await this.getSourceFiles();
    const testFiles = await this.getTestFiles();
    const coverageData = await this.loadCoverageData();

    const fileAnalysis = await this.analyzeFiles(sourceFiles, testFiles, coverageData);
    const summary = this.calculateSummary(fileAnalysis);
    const gapAnalysis = this.performGapAnalysis(fileAnalysis);
    const recommendations = this.generateRecommendations(fileAnalysis, gapAnalysis);
    const trends = await this.analyzeTrends();

    const report: CoverageAnalysisReport = {
      summary,
      fileAnalysis,
      gapAnalysis,
      recommendations,
      trends
    };

    logger.info('Test coverage analysis completed', {
      totalFiles: summary.totalFiles,
      overallCoverage: summary.overallMetrics.lines.percentage,
      meetsTarget: summary.meetsTarget
    });

    return report;
  }

  /**
   * Get all source files
   */
  private async getSourceFiles(): Promise<string[]> {
    const patterns = [
      `${this.sourceDirectory}/**/*.ts`,
      `${this.sourceDirectory}/**/*.js`,
      `!${this.sourceDirectory}/**/*.d.ts`,
      `!${this.sourceDirectory}/**/${this.testDirectory}/**`,
      `!${this.sourceDirectory}/**/*.test.*`,
      `!${this.sourceDirectory}/**/*.spec.*`
    ];

    return await glob(patterns);
  }

  /**
   * Get all test files
   */
  private async getTestFiles(): Promise<string[]> {
    const patterns = [
      `${this.sourceDirectory}/**/${this.testDirectory}/**/*.test.ts`,
      `${this.sourceDirectory}/**/${this.testDirectory}/**/*.test.js`,
      `${this.sourceDirectory}/**/*.test.ts`,
      `${this.sourceDirectory}/**/*.test.js`,
      `${this.sourceDirectory}/**/*.spec.ts`,
      `${this.sourceDirectory}/**/*.spec.js`,
      'test/**/*.test.ts',
      'test/**/*.test.js',
      'e2e/**/*.test.ts',
      'e2e/**/*.test.js'
    ];

    return await glob(patterns);
  }

  /**
   * Load coverage data from coverage reports
   */
  private async loadCoverageData(): Promise<Record<string, unknown>> {
    try {
      const coverageJsonPath = path.join(this.coverageDirectory, 'coverage-final.json');
      if (await fs.pathExists(coverageJsonPath)) {
        return await fs.readJson(coverageJsonPath);
      }

      // Fallback to other coverage formats
      const coverageReportPath = path.join(this.coverageDirectory, 'lcov-report', 'index.html');
      if (await fs.pathExists(coverageReportPath)) {
        logger.warn('Using HTML coverage report, limited data available');
        return this.parseLcovReport();
      }

      logger.warn('No coverage data found, analysis will be limited');
      return {};
    } catch (error) {
      logger.error('Error loading coverage data', { error });
      return {};
    }
  }

  /**
   * Parse LCOV coverage report
   */
  private async parseLcovReport(): Promise<Record<string, unknown>> {
    try {
      const lcovPath = path.join(this.coverageDirectory, 'lcov.info');
      if (await fs.pathExists(lcovPath)) {
        const lcovContent = await fs.readFile(lcovPath, 'utf-8');
        return this.parseLcovContent(lcovContent);
      }
    } catch (error) {
      logger.error('Error parsing LCOV report', { error });
    }
    return {};
  }

  /**
   * Parse LCOV content into coverage data
   */
  private parseLcovContent(content: string): Record<string, unknown> {
    const files: Record<string, unknown> = {};
    const lines = content.split('\n');
    let currentFile = '';

    for (const line of lines) {
      if (line.startsWith('SF:')) {
        currentFile = line.substring(3);
        files[currentFile] = {
          lines: { total: 0, covered: 0 },
          functions: { total: 0, covered: 0 },
          branches: { total: 0, covered: 0 },
          statements: { total: 0, covered: 0 }
        };
      } else if (line.startsWith('LF:')) {
        files[currentFile].lines.total = parseInt(line.substring(3));
      } else if (line.startsWith('LH:')) {
        files[currentFile].lines.covered = parseInt(line.substring(3));
      } else if (line.startsWith('FNF:')) {
        files[currentFile].functions.total = parseInt(line.substring(4));
      } else if (line.startsWith('FNH:')) {
        files[currentFile].functions.covered = parseInt(line.substring(4));
      } else if (line.startsWith('BRF:')) {
        files[currentFile].branches.total = parseInt(line.substring(4));
      } else if (line.startsWith('BRH:')) {
        files[currentFile].branches.covered = parseInt(line.substring(4));
      }
    }

    return files;
  }

  /**
   * Analyze individual files
   */
  private async analyzeFiles(
    sourceFiles: string[],
    testFiles: string[],
    coverageData: Record<string, unknown>
  ): Promise<FileCoverageAnalysis[]> {
    const analysis: FileCoverageAnalysis[] = [];

    for (const filePath of sourceFiles) {
      const relativePath = path.relative(process.cwd(), filePath);
      const fileAnalysis = await this.analyzeFile(filePath, relativePath, testFiles, coverageData);
      analysis.push(fileAnalysis);
    }

    return analysis;
  }

  /**
   * Analyze a single file
   */
  private async analyzeFile(
    filePath: string,
    relativePath: string,
    testFiles: string[],
    coverageData: Record<string, unknown>
  ): Promise<FileCoverageAnalysis> {
    const fileCoverage = coverageData[filePath] || coverageData[relativePath];
    const metrics = this.extractMetrics(fileCoverage);
    const testFilesForFile = this.findTestFiles(filePath, testFiles);
    const hasTests = testFilesForFile.length > 0;
    const riskLevel = this.calculateRiskLevel(metrics, hasTests);
    const recommendations = this.generateFileRecommendations(metrics, hasTests, riskLevel);

    return {
      filePath,
      relativePath,
      metrics,
      uncoveredLines: fileCoverage?.uncoveredLines || [],
      uncoveredFunctions: fileCoverage?.uncoveredFunctions || [],
      uncoveredBranches: fileCoverage?.uncoveredBranches || [],
      testFiles: testFilesForFile,
      hasTests,
      riskLevel,
      recommendations
    };
  }

  /**
   * Extract metrics from coverage data
   */
  private extractMetrics(fileCoverage: Record<string, unknown>): CoverageMetrics {
    if (!fileCoverage) {
      return {
        lines: { total: 0, covered: 0, percentage: 0 },
        functions: { total: 0, covered: 0, percentage: 0 },
        branches: { total: 0, covered: 0, percentage: 0 },
        statements: { total: 0, covered: 0, percentage: 0 }
      };
    }

    const calculatePercentage = (covered: number, total: number) => 
      total > 0 ? Math.round((covered / total) * 100) : 0;

    return {
      lines: {
        total: fileCoverage.lines?.total || 0,
        covered: fileCoverage.lines?.covered || 0,
        percentage: calculatePercentage(fileCoverage.lines?.covered || 0, fileCoverage.lines?.total || 0)
      },
      functions: {
        total: fileCoverage.functions?.total || 0,
        covered: fileCoverage.functions?.covered || 0,
        percentage: calculatePercentage(fileCoverage.functions?.covered || 0, fileCoverage.functions?.total || 0)
      },
      branches: {
        total: fileCoverage.branches?.total || 0,
        covered: fileCoverage.branches?.covered || 0,
        percentage: calculatePercentage(fileCoverage.branches?.covered || 0, fileCoverage.branches?.total || 0)
      },
      statements: {
        total: fileCoverage.statements?.total || 0,
        covered: fileCoverage.statements?.covered || 0,
        percentage: calculatePercentage(fileCoverage.statements?.covered || 0, fileCoverage.statements?.total || 0)
      }
    };
  }

  /**
   * Find test files for a source file
   */
  private findTestFiles(sourceFile: string, testFiles: string[]): string[] {
    const baseName = path.basename(sourceFile, path.extname(sourceFile));
    const dirName = path.dirname(sourceFile);
    
    return testFiles.filter(testFile => {
      const testBaseName = path.basename(testFile, path.extname(testFile));
      const testDirName = path.dirname(testFile);
      
      // Check if test file name matches source file
      if (testBaseName.includes(baseName) || baseName.includes(testBaseName.replace('.test', '').replace('.spec', ''))) {
        return true;
      }
      
      // Check if test file is in same directory or test subdirectory
      if (testDirName.includes(dirName) || dirName.includes(testDirName)) {
        return true;
      }
      
      return false;
    });
  }

  /**
   * Calculate risk level for a file
   */
  private calculateRiskLevel(metrics: CoverageMetrics, hasTests: boolean): 'low' | 'medium' | 'high' | 'critical' {
    if (!hasTests) return 'critical';
    
    const avgCoverage = (metrics.lines.percentage + metrics.functions.percentage + metrics.branches.percentage) / 3;
    
    if (avgCoverage >= 90) return 'low';
    if (avgCoverage >= 70) return 'medium';
    if (avgCoverage >= 50) return 'high';
    return 'critical';
  }

  /**
   * Generate recommendations for a file
   */
  private generateFileRecommendations(
    metrics: CoverageMetrics,
    hasTests: boolean,
    riskLevel: string
  ): string[] {
    const recommendations: string[] = [];
    
    if (!hasTests) {
      recommendations.push('Create test file for this module');
    }
    
    if (metrics.lines.percentage < this.coverageTarget) {
      recommendations.push(`Increase line coverage from ${metrics.lines.percentage}% to ${this.coverageTarget}%`);
    }
    
    if (metrics.functions.percentage < 80) {
      recommendations.push('Add tests for uncovered functions');
    }
    
    if (metrics.branches.percentage < 70) {
      recommendations.push('Add tests for uncovered branches and edge cases');
    }
    
    if (riskLevel === 'critical') {
      recommendations.push('URGENT: This file needs immediate test coverage');
    }
    
    return recommendations;
  }

  /**
   * Calculate summary metrics
   */
  private calculateSummary(fileAnalysis: FileCoverageAnalysis[]): CoverageAnalysisReport['summary'] {
    const totalFiles = fileAnalysis.length;
    const testedFiles = fileAnalysis.filter(f => f.hasTests).length;
    const untestedFiles = totalFiles - testedFiles;
    
    const totalLines = fileAnalysis.reduce((sum, f) => sum + f.metrics.lines.total, 0);
    const coveredLines = fileAnalysis.reduce((sum, f) => sum + f.metrics.lines.covered, 0);
    const totalFunctions = fileAnalysis.reduce((sum, f) => sum + f.metrics.functions.total, 0);
    const coveredFunctions = fileAnalysis.reduce((sum, f) => sum + f.metrics.functions.covered, 0);
    const totalBranches = fileAnalysis.reduce((sum, f) => sum + f.metrics.branches.total, 0);
    const coveredBranches = fileAnalysis.reduce((sum, f) => sum + f.metrics.branches.covered, 0);
    const totalStatements = fileAnalysis.reduce((sum, f) => sum + f.metrics.statements.total, 0);
    const coveredStatements = fileAnalysis.reduce((sum, f) => sum + f.metrics.statements.covered, 0);
    
    const overallMetrics: CoverageMetrics = {
      lines: {
        total: totalLines,
        covered: coveredLines,
        percentage: totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0
      },
      functions: {
        total: totalFunctions,
        covered: coveredFunctions,
        percentage: totalFunctions > 0 ? Math.round((coveredFunctions / totalFunctions) * 100) : 0
      },
      branches: {
        total: totalBranches,
        covered: coveredBranches,
        percentage: totalBranches > 0 ? Math.round((coveredBranches / totalBranches) * 100) : 0
      },
      statements: {
        total: totalStatements,
        covered: coveredStatements,
        percentage: totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0
      }
    };
    
    return {
      totalFiles,
      testedFiles,
      untestedFiles,
      overallMetrics,
      coverageTarget: this.coverageTarget,
      meetsTarget: overallMetrics.lines.percentage >= this.coverageTarget
    };
  }

  /**
   * Perform gap analysis
   */
  private performGapAnalysis(fileAnalysis: FileCoverageAnalysis[]): CoverageAnalysisReport['gapAnalysis'] {
    return {
      criticalGaps: fileAnalysis.filter(f => f.riskLevel === 'critical'),
      highRiskFiles: fileAnalysis.filter(f => f.riskLevel === 'high'),
      missingTestFiles: fileAnalysis.filter(f => !f.hasTests).map(f => f.relativePath),
      lowCoverageFiles: fileAnalysis.filter(f => f.metrics.lines.percentage < this.coverageTarget)
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    fileAnalysis: FileCoverageAnalysis[],
    gapAnalysis: CoverageAnalysisReport['gapAnalysis']
  ): CoverageAnalysisReport['recommendations'] {
    const recommendations: CoverageAnalysisReport['recommendations'] = [];
    
    if (gapAnalysis.criticalGaps.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'testing',
        description: 'Create tests for files with no test coverage',
        files: gapAnalysis.criticalGaps.map(f => f.relativePath),
        estimatedEffort: 'high'
      });
    }
    
    if (gapAnalysis.lowCoverageFiles.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'coverage',
        description: 'Improve test coverage for files below target',
        files: gapAnalysis.lowCoverageFiles.map(f => f.relativePath),
        estimatedEffort: 'medium'
      });
    }
    
    return recommendations;
  }

  /**
   * Analyze coverage trends
   */
  private async analyzeTrends(): Promise<CoverageAnalysisReport['trends']> {
    // This would typically read historical coverage data
    // For now, return mock data
    return {
      coverageHistory: [
        { date: '2024-01-01', coverage: 85 },
        { date: '2024-02-01', coverage: 87 },
        { date: '2024-03-01', coverage: 89 }
      ],
      improvementRate: 2,
      projectedTarget: 92
    };
  }
}
