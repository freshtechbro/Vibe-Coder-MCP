import type { PathLike } from 'fs';

import { vi } from 'vitest';

type FileData = string | NodeJS.ArrayBufferView;
type FileOptions = { recursive?: boolean };

// Using underscore prefix to indicate intentionally unused parameters
export const readFileSync = vi.fn(
  (_path: PathLike, _encoding: string): string => ''
);
export const writeFileSync = vi.fn(
  (_path: PathLike, _data: FileData, _encoding: string): void => {}
);
export const existsSync = vi.fn((_path: PathLike): boolean => true);
export const mkdirSync = vi.fn(
  (_path: PathLike, _options: FileOptions): string => ''
);
export const copyFileSync = vi.fn(
  (_src: PathLike, _dest: PathLike): void => {}
);
export const unlinkSync = vi.fn((_path: PathLike): void => {});
