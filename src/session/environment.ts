import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import type { Environment } from '../types.js';

export async function detectEnvironment(cwd: string): Promise<Environment> {
  const rtkResult = detectRtk();
  const jmResult = detectJcodemunch(cwd);

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

function detectRtk(): { available: boolean; path: string | null } {
  try {
    const path = execSync('which rtk', { encoding: 'utf-8' }).trim();
    return { available: true, path };
  } catch {
    return { available: false, path: null };
  }
}

function detectJcodemunch(cwd: string): {
  available: boolean;
  cwdIndexed: boolean;
  cwdRepo: string | null;
  knownRepos: string[];
} {
  try {
    execSync('which jcodemunch', { encoding: 'utf-8' });
  } catch {
    return { available: false, cwdIndexed: false, cwdRepo: null, knownRepos: [] };
  }

  try {
    const raw = execSync('jcodemunch list_repos', { encoding: 'utf-8' }).trim();
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
