import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { Environment, MetricsBaseline, SessionCacheFile } from '../../src/types.js';
import { sessionCachePath } from '../../src/session/cache.js';

export interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a hook script as a subprocess, piping JSON input via stdin.
 * Returns captured stdout, stderr, and exit code.
 */
export function runHook(
  hookScriptPath: string,
  input: Record<string, unknown>,
  cwd: string,
): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', hookScriptPath], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      reject(err);
    });

    // Send input and close stdin
    child.stdin?.write(JSON.stringify(input));
    child.stdin?.end();
  });
}

/**
 * Read the session cache file for a given cwd (for test assertions).
 */
export function readSessionCache(cwd: string): SessionCacheFile | null {
  try {
    const { readFileSync } = require('node:fs');
    const raw = readFileSync(sessionCachePath(cwd), 'utf-8');
    return JSON.parse(raw) as SessionCacheFile;
  } catch {
    return null;
  }
}
