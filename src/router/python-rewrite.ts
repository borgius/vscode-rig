import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { PythonEnv } from '../types.js';

/**
 * Check if a command references a .py file in its arguments.
 * This is the signal that we're in a Python context.
 */
export function hasPythonSignal(command: string): boolean {
  // Match .py as a file extension: preceded by a word char or / or . (path)
  // and NOT followed by a word char (rules out .pyc, .pyo, .pyx, etc.)
  return /\.py\b/.test(command);
}

/**
 * Try to rewrite a Bash command using Python environment detection.
 * Resolution chain:
 * 1. .venv/bin/<binary> exists → rewrite to absolute venv path
 * 2. uv available → rewrite to `uv run <command>`
 * 3. Neither → return null (pass through)
 *
 * Only triggers when the command has a .py file in its arguments.
 */
export function tryPythonRewrite(
  command: string,
  cwd: string,
  pythonEnv: PythonEnv,
  existsCheck: (path: string) => boolean = existsSync,
): string | null {
  if (!hasPythonSignal(command)) return null;

  const { venvPath, uvAvailable } = pythonEnv;

  // Extract binary name
  const binary = command.trimStart().split(/\s+/)[0] ?? '';

  // Try .venv/bin/<binary>
  if (venvPath) {
    const venvBinary = join(venvPath, 'bin', binary);
    if (existsCheck(venvBinary)) {
      return `${venvBinary} ${command.slice(command.indexOf(binary) + binary.length).trimStart()}`;
    }
  }

  // Try uv run
  if (uvAvailable) {
    return `uv run ${command}`;
  }

  return null;
}
