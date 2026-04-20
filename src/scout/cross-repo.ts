import { execSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { existsSync } from 'node:fs';
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

interface GraphBuildResult {
  alreadyBuilt: boolean;
  graphPath: string;
}

/**
 * Ensure a directory has a graphify knowledge graph built.
 * Checks for existing graph.json; runs `graphify update` if missing.
 * Returns result if graph is available, or null if graphify is not installed or build fails.
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
    return { alreadyBuilt: true, graphPath: 'graphify-out/graph.json' };
  }

  try {
    exec(`graphify update "${directory}"`, { encoding: 'utf-8', timeout: 120_000 });
  } catch {
    return null;
  }

  if (existsCheck(graphJsonPath)) {
    return { alreadyBuilt: false, graphPath: 'graphify-out/graph.json' };
  }

  return null;
}
