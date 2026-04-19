import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { PythonEnv } from '../types.js';
import type { ExecFn } from './environment.js';

const defaultExec: ExecFn = (cmd, opts) =>
  execSync(cmd, { encoding: 'utf-8', ...opts } as Parameters<typeof execSync>[1]) as string;

export async function detectPythonEnv(
  cwd: string,
  exec: ExecFn = defaultExec,
  existsCheck: (path: string) => boolean = existsSync,
): Promise<PythonEnv> {
  const venvPath = join(cwd, '.venv');
  const venvBinPath = join(venvPath, 'bin');
  const hasVenv = existsCheck(venvBinPath) || existsCheck(venvPath);

  let uvAvailable = false;
  let uvPath: string | null = null;
  try {
    uvPath = exec('which uv').trim() || null;
    uvAvailable = uvPath !== null;
  } catch {
    // uv not installed
  }

  return {
    venvPath: hasVenv ? venvPath : null,
    uvAvailable,
    uvPath,
    detectedAt: Date.now(),
  };
}
