import chalk from 'chalk';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { executeAndValidateCommand } from '../cli.js'; // Import the function to test
import { executeCommand } from '../utils/exec.js'; // Import the original to mock

// Mock the underlying executeCommand utility
vi.mock('../utils/exec.js', () => ({
  executeCommand: vi.fn(),
}));

// Mock process.exit to prevent tests from terminating and allow assertion
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  // Throw an error to be caught by the test assertion
  throw new Error(`process.exit called with code ${code}`);
});

// Spy on console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi
  .spyOn(console, 'error')
  .mockImplementation(() => {});

describe('executeAndValidateCommand', () => {
  const command = 'test-cmd';
  const args = ['arg1', 'arg2'];
  const options = { cwd: '/test', retries: 1 };
  const label = 'Test Command Execution';

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure spies/mocks are restored after each test if needed, though clearAllMocks usually handles it.
    // vi.restoreAllMocks(); // Use if clearAllMocks isn't sufficient
  });

  it('should log success and not exit when command status is 0', async () => {
    executeCommand.mockResolvedValue({
      status: 0,
      stdout: 'Success output',
      stderr: '',
    });

    await executeAndValidateCommand(command, args, options, label);

    expect(executeCommand).toHaveBeenCalledWith(command, args, options);
    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.blue.bold(`\n🚀 Starting: ${label}...`)
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.green(`✅ Completed: ${label} finished successfully.`)
    );
    expect(mockConsoleError).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should log failure, stderr, and exit with code 1 when command status is non-zero', async () => {
    const stderrOutput = 'Something went wrong';
    executeCommand.mockResolvedValue({
      status: 1,
      stdout: '',
      stderr: stderrOutput,
    });

    // Expect the function to throw because process.exit is mocked to throw
    await expect(
      executeAndValidateCommand(command, args, options, label)
    ).rejects.toThrow('process.exit called with code 1');

    expect(executeCommand).toHaveBeenCalledWith(command, args, options);
    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.blue.bold(`\n🚀 Starting: ${label}...`)
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      chalk.red.bold(`❌ Failed: ${label} exited with status 1.`)
    );
    expect(mockConsoleError).toHaveBeenCalledWith(chalk.red(stderrOutput));
    expect(mockConsoleError).toHaveBeenCalledWith(
      chalk.red.bold(`Halting execution due to error in '${label}'.`)
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should log failure, execution error, and exit with code 1 when command result has an error object', async () => {
    const executionError = new Error('Spawn failed');
    executeCommand.mockResolvedValue({
      status: null,
      stdout: '',
      stderr: '',
      error: executionError,
    }); // Simulate spawn error

    await expect(
      executeAndValidateCommand(command, args, options, label)
    ).rejects.toThrow('process.exit called with code 1');

    expect(executeCommand).toHaveBeenCalledWith(command, args, options);
    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.blue.bold(`\n🚀 Starting: ${label}...`)
    );
    // Status might be null or non-zero depending on how exec.js handles spawn errors, test assumes non-zero effective status for logging
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(`❌ Failed: ${label} exited with status`)
    ); // Check for failure log
    expect(mockConsoleError).toHaveBeenCalledWith(
      chalk.red.bold('Execution Error:'),
      executionError
    ); // Check for execution error log
    expect(mockConsoleError).toHaveBeenCalledWith(
      chalk.red.bold(`Halting execution due to error in '${label}'.`)
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // Optional: Test case where stderr is empty on failure
  it('should log failure and exit with code 1 when command status is non-zero and stderr is empty', async () => {
    executeCommand.mockResolvedValue({ status: 127, stdout: '', stderr: '' }); // Example non-zero status

    await expect(
      executeAndValidateCommand(command, args, options, label)
    ).rejects.toThrow('process.exit called with code 1');

    expect(executeCommand).toHaveBeenCalledWith(command, args, options);
    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.blue.bold(`\n🚀 Starting: ${label}...`)
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      chalk.red.bold(`❌ Failed: ${label} exited with status 127.`)
    );
    // Ensure stderr logging wasn't called with empty string (it might be called with other error messages though)
    expect(mockConsoleError).not.toHaveBeenCalledWith(chalk.red(''));
    expect(mockConsoleError).toHaveBeenCalledWith(
      chalk.red.bold(`Halting execution due to error in '${label}'.`)
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
import { run } from '../cli.js'; // Import the main CLI entry point

// Mock commander
vi.mock('commander', async (importOriginal) => {
  const original = await importOriginal();
  const programMock = {
    name: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    action: vi.fn().mockImplementation((fn) => {
      // Store the action function to call it later if needed
      programMock.runAction = fn;
      return programMock; // Return this for chaining
    }),
    parse: vi.fn().mockImplementation(() => {
      // Simulate parsing and setting options
      programMock.opts = () => ({
        name: 'test-project',
        stack: 'test-stack',
        outputDir: '.',
        // Add other default/mocked options as needed by the run function
      });
      // If an action was registered, call it with the mocked options
      if (programMock.runAction) {
        // programMock.runAction(programMock.opts()); // We might not call action directly if run() handles it
      }
      return programMock; // Return this for chaining
    }),
    opts: vi.fn().mockReturnValue({}), // Default empty options
    runAction: null, // To store the action function
  };
  return {
    ...original,
    program: programMock,
    Command: vi.fn(() => programMock), // Mock the constructor if used
  };
});

// --- Mocks for Pre-Checks ---
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
let nodeVersionMock;
let platformMock;

describe('CLI Pre-Checks', () => {
  const MIN_NODE_VERSION = 18; // Assuming v18 minimum

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Restore default mocks for process properties if they were changed
    nodeVersionMock?.mockRestore();
    platformMock?.mockRestore();
    // Default mocks for successful checks
    nodeVersionMock = vi
      .spyOn(process, 'version', 'get')
      .mockReturnValue('v18.0.0');
    platformMock = vi
      .spyOn(process, 'platform', 'get')
      .mockReturnValue('linux'); // Default to linux
    executeCommand.mockImplementation(async (command) => {
      if (command === 'pnpm') return { status: 0, stdout: '8.0.0', stderr: '' };
      if (command === 'git')
        return { status: 0, stdout: 'git version 2.30.0', stderr: '' };
      return { status: 0, stdout: '', stderr: '' }; // Default success for other commands
    });
    // Reset exit mock behavior
    mockExit.mockImplementation((code) => {
      throw new Error(`process.exit called with code ${code}`);
    });
  });

  afterEach(() => {
    // Restore mocks to ensure clean state
    nodeVersionMock?.mockRestore();
    platformMock?.mockRestore();
    vi.restoreAllMocks(); // Restore all mocks including console spies
  });

  it('should pass all pre-checks successfully', async () => {
    await run(); // Assuming run() contains the checks

    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.green('✅ Node.js version check passed (v18.0.0).')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✅ pnpm found.'));
    expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✅ Git found.'));
    expect(mockConsoleError).not.toHaveBeenCalled();
    expect(mockConsoleWarn).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should fail and exit if Node.js version is too low', async () => {
    nodeVersionMock.mockReturnValue('v16.5.0'); // Set insufficient version

    await expect(run()).rejects.toThrow('process.exit called with code 1');

    expect(mockConsoleError).toHaveBeenCalledWith(
      chalk.red.bold(
        `❌ Error: Required Node.js version is v${MIN_NODE_VERSION}.0.0 or higher. You are using v16.5.0.`
      )
    );
    expect(mockExit).toHaveBeenCalledWith(1);
    // Ensure other checks weren't performed
    expect(executeCommand).not.toHaveBeenCalledWith(
      'pnpm',
      expect.anything(),
      expect.anything()
    );
  });

  it('should fail and exit if pnpm is not found', async () => {
    executeCommand.mockImplementation(async (command) => {
      if (command === 'pnpm')
        return { status: 1, stdout: '', stderr: 'command not found' }; // Simulate pnpm not found
      if (command === 'git')
        return { status: 0, stdout: 'git version 2.30.0', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    });

    await expect(run()).rejects.toThrow('process.exit called with code 1');

    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.green('✅ Node.js version check passed (v18.0.0).')
    ); // Node check should pass
    expect(mockConsoleError).toHaveBeenCalledWith(
      chalk.red.bold(
        '❌ Error: pnpm is required but was not found. Please install pnpm (https://pnpm.io/installation).'
      )
    );
    expect(mockExit).toHaveBeenCalledWith(1);
    // Ensure git check wasn't performed
    expect(executeCommand).not.toHaveBeenCalledWith(
      'git',
      expect.anything(),
      expect.anything()
    );
  });

  it('should show warning but continue if Git is not found (non-Windows)', async () => {
    executeCommand.mockImplementation(async (command) => {
      if (command === 'pnpm') return { status: 0, stdout: '8.0.0', stderr: '' };
      if (command === 'git')
        return { status: 1, stdout: '', stderr: 'command not found' }; // Simulate git not found
      return { status: 0, stdout: '', stderr: '' };
    });

    await run(); // Should not exit

    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.green('✅ Node.js version check passed (v18.0.0).')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✅ pnpm found.'));
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      chalk.yellow.bold(
        '⚠️ Warning: Git command failed. Git might not be installed or accessible. Some operations might fail later.'
      )
    );
    expect(mockConsoleError).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should show warning but continue if Git is not found (Windows)', async () => {
    platformMock.mockReturnValue('win32'); // Set platform to Windows
    executeCommand.mockImplementation(async (command) => {
      if (command === 'pnpm') return { status: 0, stdout: '8.0.0', stderr: '' };
      if (command === 'git')
        return { status: 1, stdout: '', stderr: 'command not found' }; // Simulate git not found
      return { status: 0, stdout: '', stderr: '' };
    });

    await run(); // Should not exit

    expect(mockConsoleLog).toHaveBeenCalledWith(
      chalk.green('✅ Node.js version check passed (v18.0.0).')
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✅ pnpm found.'));
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      chalk.yellow.bold(
        '⚠️ Warning: Git command failed. Git might not be installed or accessible. Some operations might fail later.'
      )
    );
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      chalk.yellow(
        '   On Windows, ensure Git is installed and in your PATH. Git Bash is recommended for compatibility.'
      )
    ); // Windows specific hint
    expect(mockConsoleError).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });
});
