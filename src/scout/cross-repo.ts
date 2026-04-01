import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import type { Environment } from '../types.js';

interface IndexResult {
  alreadyIndexed: boolean;
  repo: string;
}

/**
 * Ensure a directory is indexed by jcodemunch.
 * Returns the repo identifier if indexed, or null if indexing is not possible.
 */
export function ensureIndexed(directory: string, env: Environment): IndexResult | null {
  if (!env.jcodemunchAvailable) return null;

  // Check if already indexed by directory basename
  const dirName = basename(directory);
  const existing = env.jcodemunchKnownRepos.find(r => r.endsWith(dirName));
  if (existing) {
    return { alreadyIndexed: true, repo: existing };
  }

  // Index it
  try {
    const raw = execSync(
      `jcodemunch index_folder --path "${directory}"`,
      { encoding: 'utf-8', timeout: 120_000 },
    ).trim();
    const parsed = JSON.parse(raw);
    if (parsed.success) {
      return { alreadyIndexed: false, repo: parsed.repo };
    }
    return null;
  } catch {
    return null;
  }
}
