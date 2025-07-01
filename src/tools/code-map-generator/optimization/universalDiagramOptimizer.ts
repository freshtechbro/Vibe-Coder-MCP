/**
 * Universal Diagram Optimizer for Enhanced Code Map Generator
 *
 * Replaces verbose mermaid diagrams with concise text summaries that work across
 * all programming languages and tech stacks. Achieves maximum token reduction
 * while preserving essential architectural information.
 */

import { GraphNode, GraphEdge } from '../graphBuilder.js';
import { UniversalOptimizationConfig } from '../types.js';
import { FileInfo, ImportInfo } from '../codeMapModel.js';

/**
 * Represents dependency analysis results.
 */
export interface DependencyAnalysis {
  totalNodes: number;
  coreComponents: CoreComponent[];
  externalDependencies: string[];
  internalModules: string[];
  complexityScore: number;
  architecturalPattern: string;
}

/**
 * Represents a core component in the architecture.
 */
export interface CoreComponent {
  name: string;
  role: string;
  importance: number;
  connections: number;
}

/**
 * Universal diagram optimizer that works across all programming languages.
 */
export class UniversalDiagramOptimizer {

  /**
   * Optimizes import lists by cleaning up unresolved imports and reducing redundancy.
   * Enhanced with smart consolidation and pattern recognition.
   */
  optimizeImports(imports: ImportInfo[]): ImportInfo[] {
    if (!imports || imports.length === 0) {
      return imports;
    }

    const optimizedImports: ImportInfo[] = [];
    const resolved = imports.filter(imp => !this.isUnresolvedImport(imp));
    const unresolved = imports.filter(imp => this.isUnresolvedImport(imp));

    // Group and consolidate imports
    const consolidatedSummary = this.consolidateImports(resolved, unresolved);

    // Add consolidated summary as a single import entry
    if (consolidatedSummary) {
      optimizedImports.push({
        path: consolidatedSummary,
        type: 'summary',
        comment: 'Consolidated import summary',
        isExternalPackage: false
      });
    }

    // Only keep the most important resolved imports (top 3)
    const importantResolved = resolved
      .filter(imp => this.isImportantImport(imp))
      .slice(0, 3);

    optimizedImports.push(...importantResolved);

    return optimizedImports;
  }

  /**
   * Consolidates imports into a smart summary with pattern recognition.
   */
  private consolidateImports(resolved: ImportInfo[], unresolved: ImportInfo[]): string {
    const parts: string[] = [];

    // Count resolved imports
    if (resolved.length > 0) {
      parts.push(`${resolved.length} internal modules`);
    }

    // Analyze unresolved imports for patterns
    if (unresolved.length > 0) {
      const patterns = this.analyzeUnresolvedPatterns(unresolved);

      if (patterns.standardLibs > 0) {
        parts.push(`${patterns.standardLibs} standard libraries`);
      }

      if (patterns.frameworks > 0) {
        parts.push(`${patterns.frameworks} framework dependencies`);
      }

      if (patterns.utilities > 0) {
        parts.push(`${patterns.utilities} utility packages`);
      }

      const otherUnresolved = unresolved.length - patterns.standardLibs - patterns.frameworks - patterns.utilities;
      if (otherUnresolved > 0) {
        parts.push(`${otherUnresolved} external dependencies`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : '';
  }

  /**
   * Analyzes unresolved import patterns to categorize them.
   */
  private analyzeUnresolvedPatterns(unresolved: ImportInfo[]): {
    standardLibs: number;
    frameworks: number;
    utilities: number;
  } {
    const standardLibPatterns = ['fs', 'path', 'crypto', 'util', 'os', 'http', 'https', 'url', 'events', 'stream'];
    const frameworkPatterns = ['react', 'vue', 'angular', 'express', 'fastify', 'next', 'nuxt', 'django', 'flask', 'spring'];
    const utilityPatterns = ['lodash', 'moment', 'axios', 'fetch', 'uuid', 'chalk', 'debug', 'winston'];

    let standardLibs = 0;
    let frameworks = 0;
    let utilities = 0;

    unresolved.forEach(imp => {
      const path = imp.path.toLowerCase();

      if (standardLibPatterns.some(pattern => path.includes(pattern))) {
        standardLibs++;
      } else if (frameworkPatterns.some(pattern => path.includes(pattern))) {
        frameworks++;
      } else if (utilityPatterns.some(pattern => path.includes(pattern))) {
        utilities++;
      }
    });

    return { standardLibs, frameworks, utilities };
  }

  /**
   * Determines if an import is important enough to keep in detailed view.
   */
  private isImportantImport(imp: ImportInfo): boolean {
    const path = imp.path.toLowerCase();

    // Keep imports that are likely core to the application
    const importantPatterns = [
      'config', 'service', 'manager', 'controller', 'handler',
      'model', 'schema', 'types', 'interface', 'api'
    ];

    return importantPatterns.some(pattern => path.includes(pattern)) ||
           Boolean(imp.importedItems && imp.importedItems.length > 3); // Many imported items suggests importance
  }

  /**
   * Checks if an import is unresolved (generic "module import" placeholder).
   */
  private isUnresolvedImport(imp: ImportInfo): boolean {
    return imp.path === 'unknown' ||
           imp.path === 'module import' ||
           imp.path.startsWith('module import') ||
           (imp.path === 'unknown' && (!imp.importedItems || imp.importedItems.length === 0));
  }

  /**
   * Counts the number of unresolved imports.
   */
  private countUnresolvedImports(imports: ImportInfo[]): number {
    return imports.filter(imp => this.isUnresolvedImport(imp)).length;
  }

  /**
   * Creates a summary entry for unresolved imports.
   */
  private createUnresolvedImportSummary(count: number): ImportInfo {
    return {
      path: `${count} unresolved imports`,
      type: 'summary',
      comment: 'These imports could not be resolved to specific module names',
      isExternalPackage: false
    };
  }

  /**
   * Optimizes a FileInfo object by cleaning up its imports.
   */
  optimizeFileInfo(fileInfo: FileInfo): FileInfo {
    return {
      ...fileInfo,
      imports: this.optimizeImports(fileInfo.imports)
    };
  }

  /**
   * Optimizes an array of FileInfo objects by cleaning up their imports.
   */
  optimizeFileInfos(fileInfos: FileInfo[]): FileInfo[] {
    return fileInfos.map(fileInfo => this.optimizeFileInfo(fileInfo));
  }

  /**
   * Optimizes dependency diagrams based on complexity and configuration.
   */
  optimizeDependencyDiagram(
    nodes: GraphNode[],
    edges: GraphEdge[],
    config: UniversalOptimizationConfig
  ): string {
    // Analyze codebase to determine optimization strategy
    const analysis = this.analyzeDependencyComplexity(nodes, edges);

    // Maximum aggressive: Always use text summary for maximum token reduction
    if (config.eliminateVerboseDiagrams || analysis.totalNodes > 20) {
      return this.generateArchitectureSummary(analysis);
    } else if (analysis.totalNodes > 10) {
      return this.generateSimplifiedDiagram(nodes, edges);
    } else {
      return this.generateCompactDiagram(nodes, edges);
    }
  }

  /**
   * Analyzes dependency complexity for optimization decisions.
   */
  private analyzeDependencyComplexity(nodes: GraphNode[], edges: GraphEdge[]): DependencyAnalysis {
    const coreComponents = this.identifyCoreComponents(nodes, edges);
    const externalDeps = this.identifyExternalDependencies(nodes);
    const internalModules = this.identifyInternalModules(nodes);

    return {
      totalNodes: nodes.length,
      coreComponents,
      externalDependencies: externalDeps,
      internalModules,
      complexityScore: this.calculateComplexityScore(nodes, edges),
      architecturalPattern: this.detectArchitecturePattern(nodes, edges)
    };
  }

  /**
   * Generates concise architecture summary (maximum token reduction).
   */
  private generateArchitectureSummary(analysis: DependencyAnalysis): string {
    const coreComponents = analysis.coreComponents.slice(0, 6); // Top 6 components
    const externalDeps = analysis.externalDependencies.slice(0, 8); // Top 8 dependencies

    return `## Architecture Overview

**Core Components** (${coreComponents.length}/${analysis.coreComponents.length}):
${coreComponents.map(comp => `- **${comp.name}**: ${comp.role}`).join('\n')}

**External Dependencies** (${externalDeps.length}/${analysis.externalDependencies.length}):
${externalDeps.join(', ')}

**Architecture Pattern**: ${analysis.architecturalPattern}
**Module Organization**: ${analysis.internalModules.length} internal modules
`;
  }

  /**
   * Identifies core components based on importance and connections.
   */
  private identifyCoreComponents(nodes: GraphNode[], edges: GraphEdge[]): CoreComponent[] {
    return nodes
      .map(node => ({
        name: this.extractComponentName(node.id),
        importance: this.calculateComponentImportance(node, edges),
        role: this.inferComponentRole(node),
        connections: this.countConnections(node.id, edges)
      }))
      .filter(comp => comp.importance >= 6.0) // Higher threshold for maximum optimization
      .sort((a, b) => b.importance - a.importance);
  }

  /**
   * Extracts component name (universal across languages).
   */
  private extractComponentName(filePath: string): string {
    const segments = filePath.split('/').filter(Boolean);
    const fileName = segments[segments.length - 1];

    // Remove common file extensions universally
    return fileName.replace(/\.(ts|js|py|java|go|rs|php|rb|cpp|cs|kt|swift|dart|scala)$/, '');
  }

  /**
   * Infers component role based on universal patterns.
   */
  private inferComponentRole(node: GraphNode): string {
    const path = node.id.toLowerCase();

    // Universal role inference based on path patterns
    if (path.includes('service') || path.includes('api')) return 'Service';
    if (path.includes('model') || path.includes('entity')) return 'Data';
    if (path.includes('controller') || path.includes('handler')) return 'Handler';
    if (path.includes('util') || path.includes('helper')) return 'Utility';
    if (path.includes('config') || path.includes('setting')) return 'Config';
    if (path.includes('test') || path.includes('spec')) return 'Test';
    if (path.includes('component') || path.includes('widget')) return 'UI';
    if (path.includes('middleware') || path.includes('interceptor')) return 'Middleware';

    // Infer from file name patterns
    const fileName = this.extractComponentName(node.id).toLowerCase();
    if (fileName.includes('manager') || fileName.includes('coordinator')) return 'Manager';
    if (fileName.includes('factory') || fileName.includes('builder')) return 'Factory';
    if (fileName.includes('adapter') || fileName.includes('wrapper')) return 'Adapter';

    return 'Component';
  }

  /**
   * Calculates component importance score.
   */
  private calculateComponentImportance(node: GraphNode, edges: GraphEdge[]): number {
    let score = 5.0;

    // Count incoming and outgoing connections
    const incomingCount = edges.filter(e => e.to === node.id).length;
    const outgoingCount = edges.filter(e => e.from === node.id).length;

    // Boost for high connectivity (hub components)
    score += Math.min(incomingCount * 0.5, 3.0);
    score += Math.min(outgoingCount * 0.3, 2.0);

    // Boost for core architectural components
    const role = this.inferComponentRole(node);
    if (['Service', 'Manager', 'Handler'].includes(role)) score += 2.0;
    if (['Data', 'Config'].includes(role)) score += 1.0;

    // Boost for main/index files
    const fileName = this.extractComponentName(node.id).toLowerCase();
    if (['index', 'main', 'app', 'server'].includes(fileName)) score += 2.0;

    return Math.min(score, 10.0);
  }

  /**
   * Counts total connections for a node.
   */
  private countConnections(nodeId: string, edges: GraphEdge[]): number {
    return edges.filter(e => e.from === nodeId || e.to === nodeId).length;
  }

  /**
   * Identifies external dependencies (universal detection).
   */
  private identifyExternalDependencies(nodes: GraphNode[]): string[] {
    return nodes
      .filter(node => this.isExternalDependency(node.id))
      .map(node => this.extractDependencyName(node.id))
      .filter((dep, index, arr) => arr.indexOf(dep) === index) // Remove duplicates
      .sort();
  }

  /**
   * Checks if a node represents an external dependency.
   */
  private isExternalDependency(nodeId: string): boolean {
    // Universal patterns for external dependencies
    return nodeId.includes('node_modules') ||
           nodeId.includes('site-packages') ||
           nodeId.includes('vendor') ||
           nodeId.includes('lib') ||
           nodeId.startsWith('@') ||
           !nodeId.includes('/') && !nodeId.includes('\\'); // Simple module names
  }

  /**
   * Extracts dependency name from path.
   */
  private extractDependencyName(nodeId: string): string {
    if (nodeId.includes('node_modules')) {
      const parts = nodeId.split('node_modules/')[1]?.split('/');
      return parts?.[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts?.[0] || nodeId;
    }

    if (nodeId.includes('site-packages')) {
      const parts = nodeId.split('site-packages/')[1]?.split('/');
      return parts?.[0] || nodeId;
    }

    return nodeId;
  }

  /**
   * Identifies internal modules.
   */
  private identifyInternalModules(nodes: GraphNode[]): string[] {
    return nodes
      .filter(node => !this.isExternalDependency(node.id))
      .map(node => this.extractModulePath(node.id))
      .filter((module, index, arr) => arr.indexOf(module) === index)
      .sort();
  }

  /**
   * Extracts module path from file path.
   */
  private extractModulePath(filePath: string): string {
    const segments = filePath.split('/').filter(Boolean);
    return segments.length > 1 ? segments[0] : filePath;
  }

  /**
   * Calculates overall complexity score.
   */
  private calculateComplexityScore(nodes: GraphNode[], edges: GraphEdge[]): number {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    const density = nodeCount > 0 ? edgeCount / nodeCount : 0;

    return Math.min(nodeCount * 0.1 + density * 2, 10.0);
  }

  /**
   * Detects architectural pattern from dependency structure.
   */
  detectArchitecturePattern(nodes: GraphNode[], edges: GraphEdge[]): string {
    const analysis = this.analyzeArchitecturalPatterns(nodes, edges);

    if (analysis.hasLayeredStructure) return 'Layered Architecture';
    if (analysis.hasMicroservicePattern) return 'Microservices';
    if (analysis.hasMVCPattern) return 'MVC Pattern';
    if (analysis.hasModularStructure) return 'Modular Architecture';
    if (analysis.hasComponentStructure) return 'Component-Based';

    return 'Custom Architecture';
  }

  /**
   * Analyzes architectural patterns in the codebase.
   */
  private analyzeArchitecturalPatterns(nodes: GraphNode[], _edges: GraphEdge[]): { hasLayeredStructure: boolean; hasMicroservicePattern: boolean; hasMVCPattern: boolean; hasModularStructure: boolean; hasComponentStructure: boolean } {
    const paths = nodes.map(n => n.id.toLowerCase());

    return {
      hasLayeredStructure: this.detectLayeredStructure(paths),
      hasMicroservicePattern: this.detectMicroservicePattern(paths),
      hasMVCPattern: this.detectMVCPattern(paths),
      hasModularStructure: this.detectModularStructure(paths),
      hasComponentStructure: this.detectComponentStructure(paths)
    };
  }

  /**
   * Detects layered architecture pattern.
   */
  private detectLayeredStructure(paths: string[]): boolean {
    const layers = ['controller', 'service', 'repository', 'model', 'dao'];
    const foundLayers = layers.filter(layer =>
      paths.some(path => path.includes(layer))
    );
    return foundLayers.length >= 3;
  }

  /**
   * Detects microservice pattern.
   */
  private detectMicroservicePattern(paths: string[]): boolean {
    const serviceIndicators = ['service', 'api', 'gateway', 'proxy'];
    return serviceIndicators.filter(indicator =>
      paths.some(path => path.includes(indicator))
    ).length >= 2;
  }

  /**
   * Detects MVC pattern.
   */
  private detectMVCPattern(paths: string[]): boolean {
    const mvcComponents = ['controller', 'model', 'view'];
    return mvcComponents.every(component =>
      paths.some(path => path.includes(component))
    );
  }

  /**
   * Detects modular structure.
   */
  private detectModularStructure(paths: string[]): boolean {
    const modules = new Set(paths.map(path => path.split('/')[0]));
    return modules.size >= 3;
  }

  /**
   * Detects component-based structure.
   */
  private detectComponentStructure(paths: string[]): boolean {
    const componentIndicators = ['component', 'widget', 'element'];
    return componentIndicators.some(indicator =>
      paths.some(path => path.includes(indicator))
    );
  }

  /**
   * Generates simplified diagram for medium complexity.
   */
  private generateSimplifiedDiagram(nodes: GraphNode[], edges: GraphEdge[]): string {
    const coreNodes = nodes.slice(0, 15); // Limit to 15 nodes
    const coreEdges = edges.filter(e =>
      coreNodes.some(n => n.id === e.from) && coreNodes.some(n => n.id === e.to)
    );

    return `## Simplified Architecture

**Components**: ${coreNodes.map(n => this.extractComponentName(n.id)).join(', ')}
**Connections**: ${coreEdges.length} dependencies
`;
  }

  /**
   * Generates compact diagram for small complexity.
   */
  private generateCompactDiagram(nodes: GraphNode[], edges: GraphEdge[]): string {
    return `## Architecture Diagram

**Components** (${nodes.length}): ${nodes.map(n => this.extractComponentName(n.id)).join(', ')}
**Dependencies**: ${edges.length} connections
`;
  }
}
