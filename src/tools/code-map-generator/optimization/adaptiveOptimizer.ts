/**
 * Adaptive Optimization Engine for Enhanced Code Map Generator
 *
 * Provides codebase-aware optimization that adapts based on project characteristics.
 * Automatically adjusts optimization strategies for maximum token reduction while
 * preserving essential architectural information.
 */

import { CodeMap } from '../codeMapModel.js';
import { UniversalOptimizationConfig } from '../types.js';
import { UniversalClassOptimizer } from './universalClassOptimizer.js';
import { UniversalDiagramOptimizer } from './universalDiagramOptimizer.js';

/**
 * Represents codebase analysis results.
 */
export interface CodebaseAnalysis {
  size: CodebaseSize;
  complexity: CodebaseComplexity;
  architecturalPattern: string;
  languageEcosystem: string[];
  repetitivePatterns: RepetitivePatterns;
  dependencyComplexity: DependencyComplexity;
}

/**
 * Represents codebase size metrics.
 */
export interface CodebaseSize {
  fileCount: number;
  classCount: number;
  functionCount: number;
  totalLines: number;
}

/**
 * Represents codebase complexity metrics.
 */
export interface CodebaseComplexity {
  averageClassComplexity: number;
  averageFunctionComplexity: number;
  inheritanceDepth: number;
  cyclomaticComplexity: number;
}

/**
 * Represents repetitive pattern analysis.
 */
export interface RepetitivePatterns {
  count: number;
  types: string[];
  consolidationOpportunities: number;
  architecturalPatterns: ArchitecturalPatternGroup[];
  functionPatterns: FunctionPatternGroup[];
}

/**
 * Represents architectural pattern grouping.
 */
export interface ArchitecturalPatternGroup {
  pattern: string;
  files: string[];
  count: number;
  consolidationPotential: number;
}

/**
 * Represents function pattern grouping.
 */
export interface FunctionPatternGroup {
  pattern: string;
  functions: string[];
  count: number;
  consolidationPotential: number;
}

/**
 * Represents dependency complexity analysis.
 */
export interface DependencyComplexity {
  totalDependencies: number;
  externalDependencies: number;
  circularDependencies: number;
  dependencyDepth: number;
}

/**
 * Represents optimization strategy.
 */
export interface OptimizationStrategy {
  diagramStrategy: 'text-summary' | 'simplified' | 'standard';
  classDetailLevel: 'minimal' | 'public-interface-only' | 'standard';
  contentDensityLevel: 'maximum' | 'aggressive' | 'moderate';
  patternConsolidation: boolean;
  adaptiveThresholds: AdaptiveThresholds;
}

/**
 * Represents adaptive optimization thresholds.
 */
export interface AdaptiveThresholds {
  importanceThreshold: number;
  maxContentLength: number;
  maxComponentsShown: number;
  maxDependenciesShown: number;
}

/**
 * Represents optimization results.
 */
export interface OptimizationResult {
  optimizedContent: string;
  reductionAchieved: number;
  strategy: OptimizationStrategy;
  qualityMetrics: QualityMetrics;
}

/**
 * Represents quality metrics.
 */
export interface QualityMetrics {
  semanticCompleteness: number;
  architecturalIntegrity: number;
  informationLoss: number;
  publicInterfacePreservation: number;
}

/**
 * Adaptive optimization engine that adjusts based on codebase characteristics.
 */
export class AdaptiveOptimizationEngine {
  private classOptimizer: UniversalClassOptimizer;
  private diagramOptimizer: UniversalDiagramOptimizer;

  constructor() {
    this.classOptimizer = new UniversalClassOptimizer();
    this.diagramOptimizer = new UniversalDiagramOptimizer();
  }

  /**
   * Optimizes content based on codebase characteristics.
   */
  optimizeBasedOnCodebase(
    codeMap: CodeMap,
    config: UniversalOptimizationConfig
  ): OptimizationResult {
    // Analyze codebase characteristics
    const analysis = this.analyzeCodebaseCharacteristics(codeMap);

    // Determine optimal optimization strategy (maximum aggressive by default)
    const strategy = this.determineOptimizationStrategy(analysis, config);

    // Apply optimizations adaptively
    return this.applyAdaptiveOptimizations(codeMap, strategy, config);
  }

  /**
   * Analyzes codebase characteristics for optimization decisions.
   */
  private analyzeCodebaseCharacteristics(codeMap: CodeMap): CodebaseAnalysis {
    const size = this.calculateCodebaseSize(codeMap);
    const complexity = this.calculateComplexity(codeMap);
    const languages = this.detectLanguageEcosystem(codeMap);
    const patterns = this.detectRepetitivePatterns(codeMap);

    return {
      size,
      complexity,
      architecturalPattern: this.detectArchitecturalPattern(codeMap),
      languageEcosystem: languages,
      repetitivePatterns: patterns,
      dependencyComplexity: this.analyzeDependencyComplexity(codeMap)
    };
  }

  /**
   * Calculates codebase size metrics.
   */
  private calculateCodebaseSize(codeMap: CodeMap): CodebaseSize {
    const fileCount = codeMap.files.length;
    const classCount = codeMap.files.reduce((sum, file) => sum + file.classes.length, 0);
    const functionCount = codeMap.files.reduce((sum, file) =>
      sum + file.functions.length + file.classes.reduce((classSum, cls) =>
        classSum + cls.methods.length, 0), 0);

    return {
      fileCount,
      classCount,
      functionCount,
      totalLines: fileCount * 50 // Estimate
    };
  }

  /**
   * Calculates complexity metrics.
   */
  private calculateComplexity(codeMap: CodeMap): CodebaseComplexity {
    const classes = codeMap.files.flatMap(f => f.classes);
    const functions = codeMap.files.flatMap(f => f.functions);

    const avgClassComplexity = classes.length > 0 ?
      classes.reduce((sum, cls) => sum + cls.methods.length, 0) / classes.length : 0;

    const avgFunctionComplexity = functions.length > 0 ?
      functions.reduce((sum, fn) => sum + (fn.parameters?.length || 0), 0) / functions.length : 0;

    return {
      averageClassComplexity: avgClassComplexity,
      averageFunctionComplexity: avgFunctionComplexity,
      inheritanceDepth: this.calculateInheritanceDepth(classes),
      cyclomaticComplexity: 5.0 // Estimate
    };
  }

  /**
   * Calculates maximum inheritance depth.
   */
  private calculateInheritanceDepth(classes: Array<{extends?: string; parentClass?: string}>): number {
    let maxDepth = 0;
    classes.forEach(cls => {
      if (cls.extends || cls.parentClass) maxDepth = Math.max(maxDepth, 1);
    });
    return maxDepth;
  }

  /**
   * Detects architectural pattern from codebase structure.
   */
  private detectArchitecturalPattern(codeMap: CodeMap): string {
    const paths = codeMap.files.map(f => f.relativePath.toLowerCase());

    if (this.hasPattern(paths, ['controller', 'service', 'model'])) return 'MVC';
    if (this.hasPattern(paths, ['component', 'service', 'module'])) return 'Component-Based';
    if (this.hasPattern(paths, ['api', 'service', 'gateway'])) return 'Microservices';
    if (this.hasPattern(paths, ['layer', 'tier', 'repository'])) return 'Layered';

    return 'Custom';
  }

  /**
   * Checks if paths contain specific patterns.
   */
  private hasPattern(paths: string[], patterns: string[]): boolean {
    return patterns.every(pattern =>
      paths.some(path => path.includes(pattern))
    );
  }

  /**
   * Detects language ecosystem.
   */
  private detectLanguageEcosystem(codeMap: CodeMap): string[] {
    const extensions = new Set<string>();
    codeMap.files.forEach(file => {
      const ext = file.relativePath.split('.').pop()?.toLowerCase();
      if (ext) extensions.add(ext);
    });

    return Array.from(extensions);
  }

  /**
   * Detects repetitive patterns in the codebase.
   */
  private detectRepetitivePatterns(codeMap: CodeMap): RepetitivePatterns {
    const patterns = new Map<string, number>();

    codeMap.files.forEach(file => {
      file.classes.forEach(cls => {
        const pattern = `class_${cls.methods.length}_methods`;
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      });
    });

    const repetitiveCount = Array.from(patterns.values()).filter(count => count > 3).length;

    // Detect architectural patterns for consolidation
    const architecturalPatterns = this.detectArchitecturalPatternGroups(codeMap);

    // Detect function patterns for consolidation
    const functionPatterns = this.detectFunctionPatternGroups(codeMap);

    return {
      count: repetitiveCount,
      types: Array.from(patterns.keys()).slice(0, 5),
      consolidationOpportunities: repetitiveCount + architecturalPatterns.length + functionPatterns.length,
      architecturalPatterns,
      functionPatterns
    };
  }

  /**
   * Detects architectural pattern groups for consolidation.
   */
  private detectArchitecturalPatternGroups(codeMap: CodeMap): ArchitecturalPatternGroup[] {
    const groups: ArchitecturalPatternGroup[] = [];

    // Group files by architectural patterns
    const serviceFiles = codeMap.files.filter(f =>
      f.relativePath.toLowerCase().includes('service') ||
      f.relativePath.toLowerCase().includes('services')
    );

    const handlerFiles = codeMap.files.filter(f =>
      f.relativePath.toLowerCase().includes('handler') ||
      f.relativePath.toLowerCase().includes('handlers')
    );

    const controllerFiles = codeMap.files.filter(f =>
      f.relativePath.toLowerCase().includes('controller') ||
      f.relativePath.toLowerCase().includes('controllers')
    );

    const utilFiles = codeMap.files.filter(f =>
      f.relativePath.toLowerCase().includes('util') ||
      f.relativePath.toLowerCase().includes('utils') ||
      f.relativePath.toLowerCase().includes('helper') ||
      f.relativePath.toLowerCase().includes('helpers')
    );

    const testFiles = codeMap.files.filter(f =>
      f.relativePath.toLowerCase().includes('test') ||
      f.relativePath.toLowerCase().includes('spec') ||
      f.relativePath.toLowerCase().includes('__tests__')
    );

    // Add groups with consolidation potential
    if (serviceFiles.length >= 3) {
      groups.push({
        pattern: 'Services',
        files: serviceFiles.map(f => f.relativePath),
        count: serviceFiles.length,
        consolidationPotential: Math.min(serviceFiles.length * 0.6, 10)
      });
    }

    if (handlerFiles.length >= 3) {
      groups.push({
        pattern: 'Handlers',
        files: handlerFiles.map(f => f.relativePath),
        count: handlerFiles.length,
        consolidationPotential: Math.min(handlerFiles.length * 0.6, 10)
      });
    }

    if (controllerFiles.length >= 3) {
      groups.push({
        pattern: 'Controllers',
        files: controllerFiles.map(f => f.relativePath),
        count: controllerFiles.length,
        consolidationPotential: Math.min(controllerFiles.length * 0.6, 10)
      });
    }

    if (utilFiles.length >= 3) {
      groups.push({
        pattern: 'Utilities',
        files: utilFiles.map(f => f.relativePath),
        count: utilFiles.length,
        consolidationPotential: Math.min(utilFiles.length * 0.7, 12)
      });
    }

    if (testFiles.length >= 5) {
      groups.push({
        pattern: 'Tests',
        files: testFiles.map(f => f.relativePath),
        count: testFiles.length,
        consolidationPotential: Math.min(testFiles.length * 0.8, 15)
      });
    }

    return groups;
  }

  /**
   * Detects function pattern groups for consolidation.
   */
  private detectFunctionPatternGroups(codeMap: CodeMap): FunctionPatternGroup[] {
    const groups: FunctionPatternGroup[] = [];

    // Collect all functions from all files
    const allFunctions: Array<{name: string, file: string}> = [];

    codeMap.files.forEach(file => {
      // Add standalone functions
      file.functions.forEach(fn => {
        allFunctions.push({name: fn.name, file: file.relativePath});
      });

      // Add class methods
      file.classes.forEach(cls => {
        cls.methods.forEach(method => {
          allFunctions.push({name: method.name, file: file.relativePath});
        });
      });
    });

    // Group by common patterns
    const constructors = allFunctions.filter(fn =>
      fn.name === 'constructor' || fn.name.toLowerCase().includes('constructor')
    );

    const getInstanceFunctions = allFunctions.filter(fn =>
      fn.name === 'getInstance' || fn.name.toLowerCase().includes('getinstance')
    );

    const initFunctions = allFunctions.filter(fn =>
      fn.name.toLowerCase().startsWith('init') ||
      fn.name.toLowerCase().includes('initialize')
    );

    const createFunctions = allFunctions.filter(fn =>
      fn.name.toLowerCase().startsWith('create') ||
      fn.name.toLowerCase().includes('create')
    );

    const getFunctions = allFunctions.filter(fn =>
      fn.name.toLowerCase().startsWith('get') &&
      !fn.name.toLowerCase().includes('getinstance')
    );

    const setFunctions = allFunctions.filter(fn =>
      fn.name.toLowerCase().startsWith('set')
    );

    // Add groups with consolidation potential
    if (constructors.length >= 5) {
      groups.push({
        pattern: 'Constructors',
        functions: constructors.map(fn => `${fn.name} (${fn.file})`),
        count: constructors.length,
        consolidationPotential: Math.min(constructors.length * 0.5, 8)
      });
    }

    if (getInstanceFunctions.length >= 3) {
      groups.push({
        pattern: 'getInstance Patterns',
        functions: getInstanceFunctions.map(fn => `${fn.name} (${fn.file})`),
        count: getInstanceFunctions.length,
        consolidationPotential: Math.min(getInstanceFunctions.length * 0.7, 10)
      });
    }

    if (initFunctions.length >= 4) {
      groups.push({
        pattern: 'Initialization Functions',
        functions: initFunctions.map(fn => `${fn.name} (${fn.file})`),
        count: initFunctions.length,
        consolidationPotential: Math.min(initFunctions.length * 0.6, 9)
      });
    }

    if (createFunctions.length >= 4) {
      groups.push({
        pattern: 'Creation Functions',
        functions: createFunctions.map(fn => `${fn.name} (${fn.file})`),
        count: createFunctions.length,
        consolidationPotential: Math.min(createFunctions.length * 0.6, 9)
      });
    }

    if (getFunctions.length >= 8) {
      groups.push({
        pattern: 'Getter Functions',
        functions: getFunctions.slice(0, 10).map(fn => `${fn.name} (${fn.file})`), // Limit to first 10
        count: getFunctions.length,
        consolidationPotential: Math.min(getFunctions.length * 0.4, 12)
      });
    }

    if (setFunctions.length >= 6) {
      groups.push({
        pattern: 'Setter Functions',
        functions: setFunctions.slice(0, 8).map(fn => `${fn.name} (${fn.file})`), // Limit to first 8
        count: setFunctions.length,
        consolidationPotential: Math.min(setFunctions.length * 0.4, 10)
      });
    }

    return groups;
  }

  /**
   * Analyzes dependency complexity.
   */
  private analyzeDependencyComplexity(codeMap: CodeMap): DependencyComplexity {
    const totalDeps = codeMap.files.reduce((sum, file) => sum + file.imports.length, 0);
    const externalDeps = codeMap.files.reduce((sum, file) =>
      sum + file.imports.filter(imp => this.isExternalImport(imp.path)).length, 0);

    return {
      totalDependencies: totalDeps,
      externalDependencies: externalDeps,
      circularDependencies: 0, // Would need graph analysis
      dependencyDepth: 3 // Estimate
    };
  }

  /**
   * Checks if an import is external.
   */
  private isExternalImport(importPath: string): boolean {
    return !importPath.startsWith('.') && !importPath.startsWith('/');
  }

  /**
   * Determines optimization strategy based on analysis (maximum aggressive by default).
   */
  private determineOptimizationStrategy(
    analysis: CodebaseAnalysis,
    _config: UniversalOptimizationConfig
  ): OptimizationStrategy {

    // Maximum aggressive strategy by default
    const strategy: OptimizationStrategy = {
      diagramStrategy: 'text-summary',
      classDetailLevel: 'public-interface-only',
      contentDensityLevel: 'maximum',
      patternConsolidation: true,
      adaptiveThresholds: {
        importanceThreshold: 3.0, // Very aggressive
        maxContentLength: 45, // Maximum compression
        maxComponentsShown: 3, // Changed from 6 to 3 for more aggressive consolidation
        maxDependenciesShown: 8
      }
    };

    // Adaptive adjustments based on codebase size
    if (analysis.size.fileCount > 200) {
      strategy.adaptiveThresholds.maxComponentsShown = 2; // Changed from 4 to 2 for more aggressive consolidation
      strategy.adaptiveThresholds.maxDependenciesShown = 4; // Changed from 6 to 4
      strategy.adaptiveThresholds.maxContentLength = 25; // Changed from 35 to 25 for even more aggressive compression
    } else if (analysis.size.fileCount > 100) {
      strategy.adaptiveThresholds.maxComponentsShown = 3; // Changed from 5 to 3
      strategy.adaptiveThresholds.maxDependenciesShown = 5; // Changed from 7 to 5
    }

    // Adjust based on complexity
    if (analysis.complexity.averageClassComplexity > 15) {
      strategy.classDetailLevel = 'minimal';
      strategy.adaptiveThresholds.importanceThreshold = 5.0;
    }

    // Adjust based on repetitive patterns
    if (analysis.repetitivePatterns.count > 30) {
      strategy.patternConsolidation = true;
      strategy.contentDensityLevel = 'maximum';
    }

    return strategy;
  }

  /**
   * Applies adaptive optimizations based on strategy.
   */
  private applyAdaptiveOptimizations(
    codeMap: CodeMap,
    strategy: OptimizationStrategy,
    config: UniversalOptimizationConfig
  ): OptimizationResult {
    let optimizedContent = '';
    let reductionAchieved = 0;

    // Apply diagram optimization (always text summary for maximum reduction)
    if (strategy.diagramStrategy === 'text-summary') {
      // This would be integrated with actual diagram generation
      optimizedContent += '## Architecture Overview\n\n';
      reductionAchieved += 25; // Estimated reduction from diagram optimization
    }

    // Apply class detail optimization
    if (strategy.classDetailLevel !== 'standard') {
      codeMap.files.forEach(file => {
        file.classes?.forEach(cls => {
          optimizedContent += this.classOptimizer.optimizeClassInfo(cls, config);
        });
      });
      reductionAchieved += 35; // Estimated reduction from class optimization
    }

    // Apply pattern consolidation
    if (strategy.patternConsolidation) {
      const consolidatedContent = this.applyPatternConsolidation(codeMap, strategy);
      optimizedContent += consolidatedContent;
      reductionAchieved += 20; // Increased from 15 to 20 for enhanced pattern consolidation
    }

    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(codeMap, optimizedContent, strategy);

    return {
      optimizedContent,
      reductionAchieved: Math.min(reductionAchieved, 97), // Cap at 97% reduction
      strategy,
      qualityMetrics
    };
  }

  /**
   * Applies pattern-based consolidation to reduce repetitive content.
   */
  private applyPatternConsolidation(codeMap: CodeMap, strategy: OptimizationStrategy): string {
    let consolidatedContent = '\n## Pattern-Based Consolidation\n\n';

    // Get the analysis for pattern detection
    const analysis = this.analyzeCodebaseCharacteristics(codeMap);
    const patterns = analysis.repetitivePatterns;

    // Consolidate architectural patterns
    if (patterns.architecturalPatterns.length > 0) {
      consolidatedContent += '### Architectural Patterns\n\n';

      patterns.architecturalPatterns.forEach(group => {
        const maxFilesToShow = Math.min(group.files.length, strategy.adaptiveThresholds.maxComponentsShown);
        const remainingCount = group.files.length - maxFilesToShow;

        consolidatedContent += `**${group.pattern}** (${group.count} files):\n`;

        // Show only the most important files based on maxComponentsShown
        group.files.slice(0, maxFilesToShow).forEach(file => {
          const fileName = file.split('/').pop() || file;
          consolidatedContent += `- ${fileName}\n`;
        });

        if (remainingCount > 0) {
          consolidatedContent += `- *...and ${remainingCount} more ${group.pattern.toLowerCase()} files*\n`;
        }

        consolidatedContent += `*Consolidation potential: ${group.consolidationPotential.toFixed(1)}% reduction*\n\n`;
      });
    }

    // Consolidate function patterns
    if (patterns.functionPatterns.length > 0) {
      consolidatedContent += '### Function Patterns\n\n';

      patterns.functionPatterns.forEach(group => {
        const maxFunctionsToShow = Math.min(group.functions.length, strategy.adaptiveThresholds.maxComponentsShown);
        const remainingCount = group.functions.length - maxFunctionsToShow;

        consolidatedContent += `**${group.pattern}** (${group.count} functions):\n`;

        // Show only the most important functions based on maxComponentsShown
        group.functions.slice(0, maxFunctionsToShow).forEach(func => {
          consolidatedContent += `- ${func}\n`;
        });

        if (remainingCount > 0) {
          consolidatedContent += `- *...and ${remainingCount} more ${group.pattern.toLowerCase()}*\n`;
        }

        consolidatedContent += `*Consolidation potential: ${group.consolidationPotential.toFixed(1)}% reduction*\n\n`;
      });
    }

    // Add summary if patterns were found
    if (patterns.architecturalPatterns.length > 0 || patterns.functionPatterns.length > 0) {
      const totalConsolidationPotential =
        patterns.architecturalPatterns.reduce((sum, p) => sum + p.consolidationPotential, 0) +
        patterns.functionPatterns.reduce((sum, p) => sum + p.consolidationPotential, 0);

      consolidatedContent += `### Consolidation Summary\n\n`;
      consolidatedContent += `- **Architectural patterns**: ${patterns.architecturalPatterns.length} groups\n`;
      consolidatedContent += `- **Function patterns**: ${patterns.functionPatterns.length} groups\n`;
      consolidatedContent += `- **Total consolidation potential**: ${totalConsolidationPotential.toFixed(1)}% reduction\n\n`;
    } else {
      consolidatedContent += '*No significant patterns detected for consolidation.*\n\n';
    }

    return consolidatedContent;
  }

  /**
   * Calculates quality metrics for the optimization.
   */
  private calculateQualityMetrics(
    codeMap: CodeMap,
    optimizedContent: string,
    strategy: OptimizationStrategy
  ): QualityMetrics {
    // Estimate quality metrics based on strategy aggressiveness
    const baseCompleteness = strategy.contentDensityLevel === 'maximum' ? 90 : 95;
    const baseIntegrity = 96;
    const baseLoss = strategy.contentDensityLevel === 'maximum' ? 12 : 8;

    return {
      semanticCompleteness: baseCompleteness,
      architecturalIntegrity: baseIntegrity,
      informationLoss: baseLoss,
      publicInterfacePreservation: 98
    };
  }
}
