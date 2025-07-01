/**
 * Universal Class Optimizer for Enhanced Code Map Generator
 *
 * Provides universal class optimization that works across all programming languages
 * and tech stacks. Focuses on public interfaces and eliminates private implementation
 * details to achieve maximum token reduction while preserving essential information.
 */

import { ClassInfo, FunctionInfo, ClassPropertyInfo, FileInfo } from '../codeMapModel.js';
import { UniversalOptimizationConfig } from '../types.js';
import { EnhancementConfig } from '../config/enhancementConfig.js';
import * as path from 'path';

/**
 * Represents a public interface extracted from a class.
 */
export interface PublicInterface {
  keyMethods: FunctionInfo[];
  keyProperties: ClassPropertyInfo[];
  getterSetterPairs: PropertyPair[];
  inheritance: string;
}

/**
 * Represents a property pair (getter/setter combination).
 */
export interface PropertyPair {
  name: string;
  hasGetter: boolean;
  hasSetter: boolean;
  type: string;
}

/**
 * Universal class optimizer that works across all programming languages.
 */
export class UniversalClassOptimizer {
  constructor(private config?: EnhancementConfig) {}

  /**
   * Optimizes class information based on importance and configuration.
   */
  optimizeClassInfo(cls: ClassInfo, _config: UniversalOptimizationConfig): string {
    const importance = this.calculateClassImportance(cls);
    const publicInterface = this.extractPublicInterface(cls);

    if (importance >= 8.0) {
      return this.formatCriticalClass(cls, publicInterface);
    } else if (importance >= 5.0) {
      return this.formatStandardClass(cls, publicInterface);
    } else {
      return this.formatMinimalClass(cls);
    }
  }

  /**
   * Extracts public interface from a class (universal across languages).
   */
  private extractPublicInterface(cls: ClassInfo): PublicInterface {
    // Universal public interface extraction (works for any language)
    const publicMethods = (cls.methods || [])
      .filter(method => this.isPublicMember(method))
      .filter(method => !this.isGetterSetter(method))
      .sort((a, b) => this.calculateMethodImportance(b) - this.calculateMethodImportance(a));

    const publicProperties = (cls.properties || [])
      .filter(prop => this.isPublicMember(prop))
      .filter(prop => !this.isGetterSetterProperty(prop, cls.methods || []))
      .sort((a, b) => this.calculatePropertyImportance(b) - this.calculatePropertyImportance(a));

    const getterSetterPairs = this.identifyGetterSetterPairs(cls.methods || []);

    return {
      keyMethods: publicMethods.slice(0, 5), // Top 5 most important methods
      keyProperties: publicProperties.slice(0, 5), // Top 5 most important properties
      getterSetterPairs: getterSetterPairs.slice(0, 3), // Top 3 property pairs
      inheritance: this.extractInheritanceInfo(cls)
    };
  }

  /**
   * Universal public member detection (works across all languages).
   */
  isPublicMember(member: {accessModifier?: string; access?: string; name: string}): boolean {
    // Check explicit access modifiers
    if (member.accessModifier) {
      return member.accessModifier === 'public' || member.accessModifier === 'export';
    }

    if (member.access) {
      return member.access === 'public' || member.access === 'export';
    }

    // Universal convention: underscore/hash prefix indicates private
    return !member.name.startsWith('_') && !member.name.startsWith('#');
  }

  /**
   * Universal getter/setter detection.
   */
  isGetterSetter(method: {name: string}): boolean {
    const name = method.name.toLowerCase();
    return name.startsWith('get') || name.startsWith('set') ||
           name.startsWith('is') || name.startsWith('has');
  }

  /**
   * Checks if a property has corresponding getter/setter methods.
   */
  private isGetterSetterProperty(property: {name: string}, methods: FunctionInfo[]): boolean {
    const propName = property.name;
    const hasGetter = methods.some(m =>
      m.name.toLowerCase() === `get${propName.toLowerCase()}` ||
      m.name.toLowerCase() === `is${propName.toLowerCase()}`
    );
    const hasSetter = methods.some(m =>
      m.name.toLowerCase() === `set${propName.toLowerCase()}`
    );

    return hasGetter || hasSetter;
  }

  /**
   * Identifies getter/setter pairs from methods.
   */
  identifyGetterSetterPairs(methods: FunctionInfo[]): PropertyPair[] {
    const pairs: PropertyPair[] = [];
    const getters = methods.filter(m =>
      m.name.startsWith('get') || m.name.startsWith('is') || m.name.startsWith('has')
    );

    getters.forEach(getter => {
      let propertyName = '';
      if (getter.name.startsWith('get')) {
        propertyName = getter.name.substring(3);
      } else if (getter.name.startsWith('is')) {
        propertyName = getter.name.substring(2);
      } else if (getter.name.startsWith('has')) {
        propertyName = getter.name.substring(3);
      }

      const setter = methods.find(m => m.name === `set${propertyName}`);

      pairs.push({
        name: propertyName,
        hasGetter: true,
        hasSetter: !!setter,
        type: getter.returnType || 'unknown'
      });
    });

    return pairs;
  }

  /**
   * Formats critical classes with detailed public interface.
   */
  private formatCriticalClass(cls: ClassInfo, publicInterface: PublicInterface): string {
    let result = `### ${cls.name}`;

    if (publicInterface.inheritance) {
      result += ` ${publicInterface.inheritance}`;
    }
    result += '\n';

    // Compressed description using configuration
    if (cls.comment) {
      const maxLength = this.config?.contentDensity?.maxContentLength ?? 25;
      const compressed = this.compressDescription(cls.comment, maxLength);
      if (compressed) {
        result += `- **Purpose**: ${compressed}\n`;
      }
    }

    // Key methods (public interface only)
    if (publicInterface.keyMethods.length > 0) {
      const methodNames = publicInterface.keyMethods.map(m => m.name);
      result += `- **Key Methods**: ${methodNames.join(', ')}\n`;
    }

    // Properties (grouped getter/setters)
    if (publicInterface.getterSetterPairs.length > 0) {
      const propNames = publicInterface.getterSetterPairs.map(p =>
        `${p.name}${p.hasSetter ? '' : ' (ro)'}`
      );
      result += `- **Properties**: ${propNames.join(', ')}\n`;
    }

    // Additional public properties
    if (publicInterface.keyProperties.length > 0) {
      const propNames = publicInterface.keyProperties.map(p => p.name);
      result += `- **Fields**: ${propNames.join(', ')}\n`;
    }

    return result + '\n';
  }

  /**
   * Formats standard classes with summary statistics.
   */
  private formatStandardClass(cls: ClassInfo, publicInterface: PublicInterface): string {
    let result = `### ${cls.name}`;

    if (publicInterface.inheritance) {
      result += ` ${publicInterface.inheritance}`;
    }
    result += '\n';

    // Summary statistics only
    const methodCount = publicInterface.keyMethods.length;
    const propertyCount = publicInterface.keyProperties.length + publicInterface.getterSetterPairs.length;

    if (methodCount > 0) {
      result += `- **Methods**: ${methodCount} public\n`;
    }

    if (propertyCount > 0) {
      result += `- **Properties**: ${propertyCount} public\n`;
    }

    return result + '\n';
  }

  /**
   * Formats minimal classes with just name and inheritance.
   */
  private formatMinimalClass(cls: ClassInfo): string {
    const inheritance = this.extractInheritanceInfo(cls);
    const suffix = inheritance ? ` ${inheritance}` : '';

    return `- **${cls.name}**${suffix}\n`;
  }

  /**
   * Extracts inheritance information in compressed format.
   */
  private extractInheritanceInfo(cls: ClassInfo): string {
    const parts: string[] = [];

    if (cls.extends || cls.parentClass) {
      const parent = cls.extends || cls.parentClass;
      parts.push(`ext:${parent}`);
    }

    if (cls.implements && cls.implements.length > 0) {
      const impls = cls.implements.slice(0, 2).join(',');
      const hasMore = cls.implements.length > 2;
      parts.push(`impl:${impls}${hasMore ? '...' : ''}`);
    } else if (cls.implementedInterfaces && cls.implementedInterfaces.length > 0) {
      const impls = cls.implementedInterfaces.slice(0, 2).join(',');
      const hasMore = cls.implementedInterfaces.length > 2;
      parts.push(`impl:${impls}${hasMore ? '...' : ''}`);
    }

    return parts.length > 0 ? `(${parts.join(' ')})` : '';
  }

  /**
   * Compresses description text while preserving key information.
   */
  private compressDescription(description: string, maxLength: number): string {
    if (description.length <= maxLength) return description;

    // Remove redundant phrases first for better compression
    const compressed = description
      .replace(/\bthis (function|method|class)\b/gi, '')
      .replace(/\bprovides? (a|an|the)?\b/gi, '')
      .replace(/\bis used (to|for)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If still too long, smart truncation at word boundaries
    if (compressed.length > maxLength) {
      const truncated = compressed.substring(0, maxLength);
      const lastSpace = truncated.lastIndexOf(' ');

      return lastSpace > maxLength * 0.8
        ? truncated.substring(0, lastSpace) + '...'
        : truncated + '...';
    }

    return compressed;
  }

  /**
   * Calculates file importance score (0-10).
   */
  calculateFileImportance(fileInfo: FileInfo): number {
    let score = 5.0;

    // Boost for exported classes/functions
    const exportCount = (fileInfo.classes?.filter(c => c.isExported).length || 0) +
                       (fileInfo.functions?.filter(f => f.isExported).length || 0);
    score += Math.min(exportCount * 0.5, 2.0);

    // Boost for files with many classes/functions
    const totalSymbols = (fileInfo.classes?.length || 0) + (fileInfo.functions?.length || 0);
    score += Math.min(totalSymbols * 0.1, 1.5);

    // Boost for core files (index, main, app, server)
    const fileName = path.basename(fileInfo.relativePath, path.extname(fileInfo.relativePath));
    if (['index', 'main', 'app', 'server', 'config'].includes(fileName.toLowerCase())) {
      score += 2.0;
    }

    // Penalty for test files
    if (fileInfo.relativePath.includes('test') || fileInfo.relativePath.includes('spec')) {
      score -= 3.0;
    }

    return Math.max(0, Math.min(score, 10.0));
  }

  /**
   * Calculates class importance score (0-10).
   */
  private calculateClassImportance(cls: ClassInfo): number {
    let score = 5.0;

    // Boost for exported classes
    if (cls.isExported) score += 2.0;

    // Boost for classes with many public methods
    const publicMethodCount = (cls.methods || []).filter(m => this.isPublicMember(m)).length;
    score += Math.min(publicMethodCount * 0.3, 2.0);

    // Boost for classes with inheritance
    if (cls.extends || cls.parentClass || (cls.implements && cls.implements.length > 0)) {
      score += 1.0;
    }

    // Boost for abstract classes
    if (cls.isAbstract) score += 1.5;

    return Math.min(score, 10.0);
  }

  /**
   * Calculates method importance score (0-10).
   */
  private calculateMethodImportance(method: FunctionInfo): number {
    let score = 5.0;

    // Boost for constructor
    if (method.name === 'constructor' || method.name === '__init__' || method.isConstructor) {
      score += 3.0;
    }

    // Boost for main/entry methods
    if (['main', 'run', 'execute', 'start', 'init'].includes(method.name.toLowerCase())) {
      score += 2.0;
    }

    // Boost for public methods
    if (this.isPublicMember(method)) score += 1.0;

    // Boost for exported methods
    if (method.isExported) score += 1.0;

    // Boost for methods with parameters (likely important business logic)
    if (method.parameters && method.parameters.length > 0) score += 0.5;

    return Math.min(score, 10.0);
  }

  /**
   * Calculates property importance score (0-10).
   */
  private calculatePropertyImportance(property: ClassPropertyInfo): number {
    let score = 5.0;

    // Boost for public properties
    if (this.isPublicMember(property)) score += 1.0;

    // Boost for static properties
    if (property.isStatic) score += 0.5;

    // Boost for properties with types
    if (property.type) score += 0.5;

    return Math.min(score, 10.0);
  }
}
