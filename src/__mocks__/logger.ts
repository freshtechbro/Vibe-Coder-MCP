import type { Logger } from 'pino';
import { vi } from 'vitest';

interface LogObject {
  [key: string]: unknown;
}

const mockLogger = {
  info: vi.fn((_obj: LogObject | string, _msg?: string): void => {}),
  error: vi.fn((_obj: LogObject | string, _msg?: string): void => {}),
  warn: vi.fn((_obj: LogObject | string, _msg?: string): void => {}),
  debug: vi.fn((_obj: LogObject | string, _msg?: string): void => {}),
} as unknown as Logger;

export default mockLogger;
