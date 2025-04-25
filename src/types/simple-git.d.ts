/**
 * Type declarations for simple-git
 * These are minimal types to support our usage of the library
 */

declare module 'simple-git' {
  export interface SimpleGit {
    checkIsRepo(): Promise<boolean>;
    log(options?: any): Promise<{ all: CommitInfo[] }>;
    diff(options?: string[]): Promise<string>;
    status(): Promise<StatusResult>;
  }

  export interface CommitInfo {
    hash: string;
    date: string;
    message: string;
    author_name: string;
    author_email: string;
  }

  export interface StatusResult {
    current: string;
    tracking: string;
    files: { path: string; index: string; working_dir: string }[];
    not_added: string[];
    created: string[];
    deleted: string[];
    modified: string[];
    renamed: string[];
  }

  export function simpleGit(
    baseDir?: string,
    options?: Record<string, any>
  ): SimpleGit;
}
