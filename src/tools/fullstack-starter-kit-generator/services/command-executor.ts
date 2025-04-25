import { exec, ExecOptions } from 'child_process';
import util from 'util';

import logger from '../../../logger.js';

const execPromise = util.promisify(exec);

export interface CommandExecutorOptions {
  /** The working directory for the command execution. */
  cwd: string;
  /** Optional environment variables for the command. */
  env?: NodeJS.ProcessEnv;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  /** Exit code of the command. 0 typically indicates success. */
  exitCode: number | null;
}

/**
 * Service for executing shell commands.
 */
export class CommandExecutor {
  private options: CommandExecutorOptions;

  constructor(options: CommandExecutorOptions) {
    if (!options.cwd) {
      throw new Error(
        'CommandExecutor requires a current working directory (cwd).'
      );
    }
    this.options = options;
    logger.debug(`CommandExecutor initialized with cwd: ${this.options.cwd}`);
  }

  /**
   * Executes a shell command.
   * @param command The command string to execute.
   * @returns A promise that resolves with the command result (stdout, stderr, exitCode).
   */
  async execute(command: string): Promise<CommandResult> {
    logger.info(`Executing command: "${command}" in ${this.options.cwd}`);
    const execOptions: ExecOptions = {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env }, // Merge environment variables
    };

    try {
      const { stdout, stderr } = await execPromise(command, execOptions);
      logger.debug(`Command "${command}" executed successfully.`);
      logger.trace(`stdout:\n${stdout}`);
      if (stderr) {
        logger.warn(`stderr:\n${stderr}`);
      }
      return { stdout, stderr, exitCode: 0 }; // execPromise throws on non-zero exit code
    } catch (error: any) {
      logger.error(`Command "${command}" failed with exit code ${error.code}.`);
      logger.error(`stderr:\n${error.stderr}`);
      if (error.stdout) {
        logger.error(`stdout:\n${error.stdout}`); // Log stdout even on error if available
      }
      // Ensure error properties exist before accessing
      const stdout = typeof error.stdout === 'string' ? error.stdout : '';
      const stderr = typeof error.stderr === 'string' ? error.stderr : '';
      const exitCode = typeof error.code === 'number' ? error.code : null;
      return { stdout, stderr, exitCode };
    }
  }
}
