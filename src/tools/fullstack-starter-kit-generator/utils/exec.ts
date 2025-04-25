import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Execute a shell command and return the result
 * @param command The command to execute
 * @param cwd Optional working directory
 * @returns Promise resolving to stdout and stderr
 */
export async function executeCommand(
  command: string,
  cwd?: string
): Promise<ExecResult> {
  try {
    const options = cwd ? { cwd } : {};
    const { stdout, stderr } = await execPromise(command, options);
    return { stdout, stderr };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Command execution failed: ${error.message}`);
    }
    throw error;
  }
}
