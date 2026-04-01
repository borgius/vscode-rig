import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import { SessionCache } from './cache.js';
import type { Environment } from '../types.js';

/**
 * SessionStart hook handler. Detects environment and auto-indexes CWD
 * with jcodemunch if available but not yet indexed.
 */
export async function handleSessionStart(cwd: string, cache: SessionCache): Promise<string> {
  const env = await detectAndIndex(cwd);
  cache.setEnvironment(env);

  const lines = [
    '[claude-stack-utils] Session initialized',
    `  rtk: ${env.rtkAvailable ? `available (${env.rtkPath})` : 'not found'}`,
    `  jcodemunch: ${env.jcodemunchAvailable ? 'available' : 'not found'}`,
  ];

  if (env.jcodemunchAvailable) {
    if (env.jcodemunchCwdIndexed) {
      lines.push(`  CWD indexed: ${env.jcodemunchCwdRepo}`);
    } else {
      lines.push(`  CWD: not indexed (auto-indexing skipped)`);
    }
  }

  lines.push(`  Detected at: ${new Date(env.detectedAt).toISOString()}`);

  return lines.join('\n');
}

async function detectAndIndex(cwd: string): Promise<Environment> {
  // Detect rtk
  let rtkAvailable = false;
  let rtkPath: string | null = null;
  try {
    rtkPath = execSync('which rtk', { encoding: 'utf-8' }).trim();
    rtkAvailable = true;
  } catch {
    // rtk not found
  }

  // Detect jcodemunch
  let jcodemunchAvailable = false;
  let jcodemunchCwdIndexed = false;
  let jcodemunchCwdRepo: string | null = null;
  let jcodemunchKnownRepos: string[] = [];

  try {
    execSync('which jcodemunch', { encoding: 'utf-8' });
    jcodemunchAvailable = true;

    // Check existing indexes
    const raw = execSync('jcodemunch list_repos', { encoding: 'utf-8' }).trim();
    const parsed = JSON.parse(raw);
    jcodemunchKnownRepos = parsed.repos ?? [];

    const folderName = basename(cwd);
    const match = jcodemunchKnownRepos.find(r => r.endsWith(folderName)) ?? null;

    if (match) {
      jcodemunchCwdIndexed = true;
      jcodemunchCwdRepo = match;
    } else {
      // Auto-index CWD
      try {
        const indexResult = execSync(
          `jcodemunch index_folder --path "${cwd}"`,
          { encoding: 'utf-8', timeout: 60_000 },
        ).trim();
        const parsedResult = JSON.parse(indexResult);
        if (parsedResult.success) {
          jcodemunchCwdIndexed = true;
          jcodemunchCwdRepo = parsedResult.repo ?? null;
          if (jcodemunchCwdRepo && !jcodemunchKnownRepos.includes(jcodemunchCwdRepo)) {
            jcodemunchKnownRepos.push(jcodemunchCwdRepo);
          }
        }
      } catch {
        // Auto-index failed — continue without indexing
      }
    }
  } catch {
    // jcodemunch not found
  }

  return {
    rtkAvailable,
    rtkPath,
    jcodemunchAvailable,
    jcodemunchCwdIndexed,
    jcodemunchCwdRepo,
    jcodemunchKnownRepos,
    detectedAt: Date.now(),
  };
}
