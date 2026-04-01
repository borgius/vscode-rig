import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import type { Environment } from '../types.js';

export interface ExecFn {
  (command: string, options?: { encoding?: string; timeout?: number }): string;
}

const defaultExec: ExecFn = (cmd, opts) =>
  execSync(cmd, { encoding: 'utf-8', ...opts } as Parameters<typeof execSync>[1]) as string;

export async function detectEnvironment(
  cwd: string,
  exec: ExecFn = defaultExec,
): Promise<Environment> {
  const rtkResult = detectRtk(exec);
  const jmResult = detectJcodemunch(cwd, exec);

  return {
    rtkAvailable: rtkResult.available,
    rtkPath: rtkResult.path,
    jcodemunchAvailable: jmResult.available,
    jcodemunchCwdIndexed: jmResult.cwdIndexed,
    jcodemunchCwdRepo: jmResult.cwdRepo,
    jcodemunchKnownRepos: jmResult.knownRepos,
    detectedAt: Date.now(),
  };
}

function detectRtk(exec: ExecFn): { available: boolean; path: string | null } {
  try {
    const path = exec('which rtk').trim();
    return { available: true, path };
  } catch {
    return { available: false, path: null };
  }
}

function detectJcodemunch(cwd: string, exec: ExecFn): {
  available: boolean;
  cwdIndexed: boolean;
  cwdRepo: string | null;
  knownRepos: string[];
} {
  try {
    exec('which jcodemunch');
  } catch {
    return { available: false, cwdIndexed: false, cwdRepo: null, knownRepos: [] };
  }

  try {
    const raw = exec('jcodemunch list_repos').trim();
    const parsed = JSON.parse(raw);
    const repos: string[] = parsed.repos ?? [];
    const folderName = basename(cwd);
    const cwdRepo = repos.find(r => r.endsWith(folderName)) ?? null;

    return {
      available: true,
      cwdIndexed: cwdRepo !== null,
      cwdRepo,
      knownRepos: repos,
    };
  } catch {
    return { available: true, cwdIndexed: false, cwdRepo: null, knownRepos: [] };
  }
}
