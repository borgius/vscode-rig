import { execSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Environment } from '../types.js';

interface IndexResult {
  alreadyIndexed: boolean;
  repo: string;
  fileCapHit?: { indexed: number; total: number };
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
      const result: IndexResult = { alreadyIndexed: false, repo: parsed.repo };
      const skipped = parsed.discovery_skip_counts?.file_limit ?? 0;
      if (skipped > 0 && parsed.file_count) {
        result.fileCapHit = { indexed: parsed.file_count, total: parsed.file_count + skipped };
      }
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

interface GraphBuildResult {
  status: 'ready' | 'build_failed';
  graphPath?: string;
}

/**
 * Ensure a directory has a graphify knowledge graph built.
 * Checks for existing graph.json; runs `graphify update` if missing.
 * Returns result with status, or null if graphify is not installed.
 */
export function ensureGraphBuilt(
  directory: string,
  env: Environment,
  exec: (cmd: string, opts?: { encoding?: string; timeout?: number }) => string,
  existsCheck: (path: string) => boolean = existsSync,
): GraphBuildResult | null {
  if (!env.graphifyAvailable) return null;

  const graphJsonPath = join(directory, 'graphify-out', 'graph.json');
  if (existsCheck(graphJsonPath)) {
    return { status: 'ready', graphPath: 'graphify-out/graph.json' };
  }

  try {
    exec(`graphify update "${directory}"`, { encoding: 'utf-8', timeout: 120_000 });
  } catch {
    return { status: 'build_failed' };
  }

  if (existsCheck(graphJsonPath)) {
    return { status: 'ready', graphPath: 'graphify-out/graph.json' };
  }

  return { status: 'build_failed' };
}
