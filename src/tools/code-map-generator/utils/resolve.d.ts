/**
 * Type declarations for the resolve module.
 */

declare module 'resolve' {
  /**
   * Options for the resolve.sync function.
   */
  export interface ResolveOptions {
    /**
     * Directory to begin resolving from.
     */
    basedir?: string;
    
    /**
     * Array of file extensions to search in order.
     */
    extensions?: string[];
    
    /**
     * Transform the resolved file path.
     */
    pathFilter?: (pkg: unknown, path: string, relativePath: string) => string;
    
    /**
     * Array of directories to recursively look for modules in.
     */
    paths?: string[];
    
    /**
     * Whether to preserve symbolic links.
     */
    preserveSymlinks?: boolean;
    
    /**
     * Package.json data to use instead of reading from disk.
     */
    packageFilter?: (pkg: unknown, pkgfile: string) => unknown;
    
    /**
     * Directory to start looking for modules in node_modules.
     */
    moduleDirectory?: string | string[];
    
    /**
     * Whether to read package.json files.
     */
    readPackageJson?: boolean;
    
    /**
     * Whether to read package.json files for modules.
     */
    readPackageJsonForModules?: boolean;
  }
  
  /**
   * Synchronously resolve the module path.
   * 
   * @param id The module path or name to resolve.
   * @param options Options for resolving the module.
   * @returns The resolved path.
   */
  export function sync(id: string, options?: ResolveOptions): string;
  
  /**
   * Asynchronously resolve the module path.
   * 
   * @param id The module path or name to resolve.
   * @param options Options for resolving the module.
   * @param callback Callback function with the resolved path.
   */
  export function resolve(
    id: string,
    options: ResolveOptions,
    callback: (err: Error | null, resolved?: string) => void
  ): void;
  
  /**
   * Asynchronously resolve the module path.
   * 
   * @param id The module path or name to resolve.
   * @param callback Callback function with the resolved path.
   */
  export function resolve(
    id: string,
    callback: (err: Error | null, resolved?: string) => void
  ): void;
  
  /**
   * Check if a module is core.
   * 
   * @param id The module name to check.
   * @returns Whether the module is a core module.
   */
  export function isCore(id: string): boolean;
}
