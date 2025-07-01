// Defines the in-memory representation for the code map.

export interface FunctionInfo {
  name: string;
  signature?: string; // e.g., "myFunction(param1: string, param2: number): boolean"
  comment?: string; // Heuristic or docstring
  startLine: number;
  endLine: number;
  isAsync?: boolean; // Optional metadata
  isExported?: boolean; // Optional metadata
  isMethod?: boolean;
  isConstructor?: boolean;
  isGetter?: boolean;
  isSetter?: boolean;
  isGenerator?: boolean;
  isHook?: boolean;
  isEventHandler?: boolean;
  framework?: string;
  class?: string;
  parameters?: string[];
  returnType?: string;
  accessModifier?: string; // public, private, protected
  isStatic?: boolean; // Whether the function is static
}

export interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: Array<ClassPropertyInfo>;
  parentClass?: string; // Name of parent class
  implementedInterfaces?: string[];
  comment?: string;
  startLine: number;
  endLine: number;
  isExported?: boolean; // Optional metadata
  isAbstract?: boolean; // Whether the class is abstract
  extends?: string; // Name of the parent class (alternative to parentClass)
  implements?: string[]; // Interfaces implemented by the class (alternative to implementedInterfaces)
  // Future: decorators, generics, etc.
}

export interface ClassPropertyInfo {
  name: string;
  type?: string;
  comment?: string;
  startLine: number;
  endLine: number;
  accessModifier?: string; // public, private, protected
  isStatic?: boolean; // Whether the property is static
}

export interface ImportedItem {
  name: string;
  alias?: string;
  isDefault: boolean;
  isNamespace?: boolean;
  path?: string;
  nodeText?: string;

  // Additional properties for language-specific metadata
  isStatic?: boolean;
  isGlobal?: boolean;
  isUsingNamespace?: boolean;
  isWildcardImport?: boolean;
  isSelectorImport?: boolean;
  isPackageDeclaration?: boolean;

  // Dart-specific properties
  isPackageImport?: boolean;
  isRelativeImport?: boolean;
  isDartImport?: boolean;
  isExport?: boolean;
  isPart?: boolean;
  isPartOf?: boolean;
  isLibraryName?: boolean;
  hideItems?: string[];
  showClause?: boolean;

  // C/C++-specific properties
  isSystemInclude?: boolean;
  isLocalInclude?: boolean;

  // Import type information
  importType?: string;
  importKind?: string;

  // Package information
  packageName?: string;
  moduleName?: string;

  // Static import information
  staticImport?: {
    className?: string;
    memberName?: string;
    [key: string]: unknown;
  };

  // Additional metadata
  exceptItems?: string[];
  options?: Record<string, unknown>;
  namespaceParts?: string[];
}

export interface ImportInfo {
  path: string; // The path string from the import statement
  importedItems?: ImportedItem[]; // Specific items imported, e.g., { parse } from 'url' -> [{name: 'parse', ...}]
  isDefault?: boolean; // If it's a default import
  alias?: string; // If the import is aliased
  comment?: string; // Optional comment for the import
  startLine?: number;
  endLine?: number;
  // Additional properties for enhanced import resolution
  type?: string; // Type of import (static, dynamic, commonjs, extracted)
  resolvedPath?: string; // Resolved path after import resolution
  absolutePath?: string; // Absolute file path
  isExternalPackage?: boolean; // Whether the import is from an external package
  // Additional properties used in outputFormatter.ts
  nodeText?: string; // The original node text for the import
  isProjectFile?: boolean; // Whether the import is from a project file
  originalPath?: string; // The original import path before resolution
  packageName?: string; // The package name for external packages
  // Properties added for Dependency-Cruiser integration
  isCore?: boolean; // Whether the import is a core module
  isDynamic?: boolean; // Whether the import is a dynamic import
  isRelative?: boolean; // Whether the import is a relative path
  moduleSystem?: string; // The module system used (CommonJS, ESM, etc.)
  metadata?: Record<string, unknown>; // Additional metadata from third-party resolvers
}

export interface FileInfo {
  filePath: string; // Relative to project root for display, absolute for processing
  relativePath: string; // Path relative to the scanned project's root
  classes: ClassInfo[];
  functions: FunctionInfo[]; // Top-level functions in the file
  imports: ImportInfo[];
  comment?: string; // File-level comment/docstring (e.g., from top of file)
  // exports?: string[]; // Optional: list of exported symbols (can be complex to determine accurately for all langs)
  // Future: globalVariables, enums, typeAliases, etc.
}

export interface CodeMap {
  projectPath: string; // Absolute path to the root of the scanned project
  files: FileInfo[];
  // Summary statistics can be added here later
  // totalFiles: number;
  // totalClasses: number;
  // totalFunctions: number;
  // generationDate: string;
}
