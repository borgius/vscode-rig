import { execSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import { SessionCache } from './cache.js';
import type { Environment, HarnessConfig } from '../types.js';
import { detectEnvironment, callJcodemunchMcpTool } from './environment.js';
import { checkWorktreeSuggestion } from './worktree.js';
import { captureMetricsBaseline } from './metrics.js';
import { loadConfig, DEFAULT_CONFIG } from '../config.js';

/**
 * SessionStart hook handler. Detects environment and auto-indexes CWD
 * with jcodemunch if available but not yet indexed.
 */
export async function handleSessionStart(cwd: string, cache: SessionCache): Promise<string> {
  const env = await detectAndIndex(cwd);
  cache.setEnvironment(env);

  const baseline = captureMetricsBaseline((cmd) => execSync(cmd, { encoding: 'utf-8' }));
  cache.setMetricsBaseline(baseline);

  // Capture changed files for failure classification
  try {
    const diff = execSync('git diff --name-only HEAD', { encoding: 'utf-8' }).trim();
    if (diff) {
      cache.setChangedFiles(diff.split('\n').filter(Boolean));
    }
  } catch {
    // Not a git repo or no commits — skip
  }

  const lines = [
    '[rig] Session initialized',
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

  // Emit active enforcement rules from config
  const configPath = join(resolve(cwd), '.harness.yaml');
  const config = await loadConfig(configPath);
  const activeRules = formatActiveRules(config);
  if (activeRules) {
    lines.push(activeRules);
  }

  const suggestion = checkWorktreeSuggestion(cwd, (cmd) => execSync(cmd, { encoding: 'utf-8' }));
  if (suggestion) {
    lines.push(suggestion);
  }

  // One-time warning for missing tools
  if (!cache.getToolsWarned()) {
    if (!env.rtkAvailable) {
      lines.push('[WARNING] rtk is not installed. Install for 60-90% token savings on dev operations: https://github.com/franklywatson/rtk');
    }
    if (!env.jcodemunchAvailable) {
      lines.push('[WARNING] jcodemunch is not installed. Install for indexed code search: https://github.com/franklywatson/jcodemunch');
    }
    cache.setToolsWarned(true);
  }

  return lines.join('\n');
}

function formatActiveRules(config: HarnessConfig): string | null {
  const active: string[] = [];

  const constitutional = config.rules.constitutional;
  if (constitutional) {
    for (const [rule, level] of Object.entries(constitutional)) {
      if (level && level !== 'silent') {
        active.push(`${rule} (${level})`);
      }
    }
  }

  if (active.length === 0) return null;
  return `  Active enforcement: ${active.join(', ')}`;
}

async function detectAndIndex(cwd: string): Promise<Environment> {
  const env = await detectEnvironment(cwd);

  // Auto-index if jcodemunch is available but CWD isn't indexed
  if (env.jcodemunchAvailable && !env.jcodemunchCwdIndexed) {
    // Try CLI auto-index first (only works when jcodemunch CLI binary is installed)
    try {
      execSync('which jcodemunch', { encoding: 'utf-8' });
      const indexResult = execSync(
        `jcodemunch index_folder --path "${cwd}"`,
        { encoding: 'utf-8', timeout: 60_000 },
      ).trim();
      const parsedResult = JSON.parse(indexResult);
      if (parsedResult.success) {
        env.jcodemunchCwdIndexed = true;
        env.jcodemunchCwdRepo = parsedResult.repo ?? env.jcodemunchCwdRepo;
        if (env.jcodemunchCwdRepo && !env.jcodemunchKnownRepos.includes(env.jcodemunchCwdRepo)) {
          env.jcodemunchKnownRepos.push(env.jcodemunchCwdRepo);
        }
      }
    } catch {
      // CLI not available — try MCP auto-index via JSON-RPC
      try {
        const mcpPath = execSync('which jcodemunch-mcp', { encoding: 'utf-8' }).trim();
        if (mcpPath) {
          const execFn = (cmd: string, opts?: { encoding?: string; timeout?: number }) =>
            execSync(cmd, { encoding: 'utf-8', ...opts } as Parameters<typeof execSync>[1]) as string;
          const text = callJcodemunchMcpTool(mcpPath, 'index_folder', { path: cwd }, execFn);
          if (text) {
            const parsedResult = JSON.parse(text);
            if (parsedResult.success) {
              env.jcodemunchCwdIndexed = true;
              env.jcodemunchCwdRepo = parsedResult.repo ?? env.jcodemunchCwdRepo;
              if (env.jcodemunchCwdRepo && !env.jcodemunchKnownRepos.includes(env.jcodemunchCwdRepo)) {
                env.jcodemunchKnownRepos.push(env.jcodemunchCwdRepo);
              }
            }
          }
        }
      } catch {
        // MCP auto-index failed — agent can index via MCP directly
      }
    }
  }

  return env;
}
