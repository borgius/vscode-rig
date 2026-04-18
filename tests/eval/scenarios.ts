import type { Environment } from '../../src/types.js';

// ── Environment presets ──

export interface EnvPreset {
  name: string;
  env: Environment;
}

export const ENV_PRESETS: EnvPreset[] = [
  {
    name: 'full',
    env: {
      rtkAvailable: true,
      rtkPath: '/usr/bin/rtk',
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: true,
      jcodemunchCwdRepo: 'local/test',
      jcodemunchKnownRepos: ['local/test'],
      detectedAt: Date.now(),
    },
  },
  {
    name: 'rtk_only',
    env: {
      rtkAvailable: true,
      rtkPath: '/usr/bin/rtk',
      jcodemunchAvailable: false,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    },
  },
  {
    name: 'jm_only',
    env: {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: true,
      jcodemunchCwdRepo: 'local/test',
      jcodemunchKnownRepos: ['local/test'],
      detectedAt: Date.now(),
    },
  },
  // Most common production state: jcodemunch installed but CWD not indexed.
  // Debug log showed 15/16 sessions in this state (session-start auto-index
  // was skipped, or MCP server had disconnected and not yet reconnected).
  {
    name: 'jm_not_indexed',
    env: {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    },
  },
  {
    name: 'neither',
    env: {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: false,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    },
  },
];

// ── Scenario types ──

export interface ExpectedOutcome {
  action: 'advise' | 'block' | 'allow';
  tool?: string; // substring expected in the hook output
}

export interface EvalScenario {
  id: string;
  category: 'bash' | 'native' | 'agent' | 'pipe' | 'edge';
  description: string;
  toolCall: { tool: string; args: Record<string, unknown> };
  expected: Record<string, ExpectedOutcome>; // keyed by env preset name
  cwd?: string; // for cwd_path_expand scenarios
}

// ── Baseline scenarios ──
// Organized by category. Each scenario runs against all 5 environment presets.

export const ALL_SCENARIOS: EvalScenario[] = [
  // ── Bash commands (rtk territory) ──

  {
    id: 'bash_cat_code',
    category: 'bash',
    description: 'cat a code file via Bash',
    toolCall: { tool: 'Bash', args: { command: 'cat src/router/resolver.ts' } },
    expected: {
      full: { action: 'advise', tool: 'rtk cat' },
      rtk_only: { action: 'advise', tool: 'rtk cat' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'advise', tool: 'Read' },
      neither: { action: 'advise', tool: 'Read' },
    },
  },

  {
    id: 'bash_head_code',
    category: 'bash',
    description: 'head a code file via Bash',
    toolCall: { tool: 'Bash', args: { command: 'head -20 package.json' } },
    expected: {
      full: { action: 'advise', tool: 'rtk cat' },
      rtk_only: { action: 'advise', tool: 'rtk cat' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'advise', tool: 'Read' },
      neither: { action: 'advise', tool: 'Read' },
    },
  },

  {
    id: 'bash_grep',
    category: 'bash',
    description: 'grep via Bash',
    toolCall: { tool: 'Bash', args: { command: 'grep -r "TODO" src/' } },
    expected: {
      full: { action: 'block', tool: 'rtk grep' },
      rtk_only: { action: 'block', tool: 'rtk grep' },
      jm_only: { action: 'block', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'block', tool: 'Grep' },
      neither: { action: 'block', tool: 'Grep' },
    },
  },

  {
    id: 'bash_rg',
    category: 'bash',
    description: 'rg (ripgrep) via Bash',
    toolCall: { tool: 'Bash', args: { command: 'rg "export.*function" .' } },
    expected: {
      full: { action: 'block', tool: 'rtk grep' },
      rtk_only: { action: 'block', tool: 'rtk grep' },
      jm_only: { action: 'block', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'block', tool: 'Grep' },
      neither: { action: 'block', tool: 'Grep' },
    },
  },

  {
    id: 'bash_find',
    category: 'bash',
    description: 'find via Bash',
    toolCall: { tool: 'Bash', args: { command: 'find . -name "*.ts"' } },
    expected: {
      full: { action: 'advise', tool: 'rtk find' },
      rtk_only: { action: 'advise', tool: 'rtk find' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'advise', tool: 'Glob' },
      neither: { action: 'advise', tool: 'Glob' },
    },
  },

  {
    id: 'bash_sed_i',
    category: 'bash',
    description: 'sed -i via Bash (destructive)',
    toolCall: { tool: 'Bash', args: { command: "sed -i 's/foo/bar/' file.ts" } },
    expected: {
      full: { action: 'block' },
      rtk_only: { action: 'block' },
      jm_only: { action: 'block' },
      jm_not_indexed: { action: 'block' },
      neither: { action: 'block' },
    },
  },

  {
    id: 'bash_git_status',
    category: 'bash',
    description: 'git status (pass-through)',
    toolCall: { tool: 'Bash', args: { command: 'git status' } },
    expected: {
      full: { action: 'allow' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'allow' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  // ── Native tools (jcodemunch territory) ──

  {
    id: 'native_read_code',
    category: 'native',
    description: 'Read a code file without offset/limit',
    toolCall: { tool: 'Read', args: { file_path: '/project/src/router/resolver.ts' } },
    expected: {
      full: { action: 'advise', tool: 'jcodemunch' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  {
    id: 'native_read_noncode',
    category: 'native',
    description: 'Read a non-code file',
    toolCall: { tool: 'Read', args: { file_path: '/project/README.md' } },
    expected: {
      full: { action: 'allow' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'allow' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  {
    id: 'native_grep',
    category: 'native',
    description: 'Grep tool',
    toolCall: { tool: 'Grep', args: { pattern: 'function resolve' } },
    expected: {
      full: { action: 'advise', tool: 'jcodemunch' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  {
    id: 'native_glob_code',
    category: 'native',
    description: 'Glob with code file pattern',
    toolCall: { tool: 'Glob', args: { pattern: '**/*.ts' } },
    expected: {
      full: { action: 'advise', tool: 'jcodemunch' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  {
    id: 'native_glob_noncode',
    category: 'native',
    description: 'Glob with non-code pattern (matches file_discovery via TOOL_INTENT_MAP)',
    toolCall: { tool: 'Glob', args: { pattern: '*.md' } },
    expected: {
      full: { action: 'advise', tool: 'rtk find' },
      rtk_only: { action: 'advise', tool: 'rtk find' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'advise', tool: 'Glob' },
      neither: { action: 'advise', tool: 'Glob' },
    },
  },

  // ── Agent tool calls ──
  // Debug log showed 48 file_discovery advisories from Agent/Explore subagents.

  {
    id: 'agent_explore',
    category: 'agent',
    description: 'Agent with Explore subagent (file_discovery)',
    toolCall: { tool: 'Agent', args: { subagent_type: 'Explore', prompt: 'find auth files' } },
    expected: {
      full: { action: 'advise', tool: 'rtk find' },
      rtk_only: { action: 'advise', tool: 'rtk find' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'advise', tool: 'Glob' },
      neither: { action: 'advise', tool: 'Glob' },
    },
  },

  {
    id: 'agent_general',
    category: 'agent',
    description: 'Agent with general-purpose subagent (pass_through)',
    toolCall: { tool: 'Agent', args: { subagent_type: 'general-purpose', prompt: 'fix the bug' } },
    expected: {
      full: { action: 'allow' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'allow' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  // ── Pipe and compound commands ──
  // After the pipe fix, only the first segment before | is classified.
  // grep/find/cat after | is output filtering, not code search.

  {
    id: 'pipe_grep_output',
    category: 'pipe',
    description: 'piped grep as output filter (pass_through)',
    toolCall: { tool: 'Bash', args: { command: 'docker compose build 2>&1 | grep -E "error|Error"' } },
    expected: {
      full: { action: 'allow' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'allow' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  {
    id: 'pipe_cat_grep',
    category: 'pipe',
    description: 'piped cat | grep (first segment = file_read)',
    toolCall: { tool: 'Bash', args: { command: 'cat file | grep pattern' } },
    expected: {
      full: { action: 'advise', tool: 'rtk cat' },
      rtk_only: { action: 'advise', tool: 'rtk cat' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'advise', tool: 'Read' },
      neither: { action: 'advise', tool: 'Read' },
    },
  },

  {
    id: 'compound_grep_sed',
    category: 'pipe',
    description: 'compound grep ; sed -i (most restrictive = file_modify)',
    toolCall: { tool: 'Bash', args: { command: "rg pattern . ; sed -i 's/a/b/g' f" } },
    expected: {
      full: { action: 'block' },
      rtk_only: { action: 'block' },
      jm_only: { action: 'block' },
      jm_not_indexed: { action: 'block' },
      neither: { action: 'block' },
    },
  },

  // ── Edge cases ──

  {
    id: 'edge_read_offset',
    category: 'edge',
    description: 'Read code file with offset (targeted re-read)',
    toolCall: { tool: 'Read', args: { file_path: '/project/src/types.ts', offset: 10, limit: 20 } },
    expected: {
      full: { action: 'allow' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'allow' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  {
    id: 'edge_rtk_cat_code',
    category: 'edge',
    description: 'rtk cat on code file (close the bypass)',
    toolCall: { tool: 'Bash', args: { command: 'rtk cat src/types.ts' } },
    expected: {
      full: { action: 'block' },
      rtk_only: { action: 'block' },
      jm_only: { action: 'block' },
      jm_not_indexed: { action: 'block' },
      neither: { action: 'block' },
    },
  },

  {
    id: 'edge_passthrough',
    category: 'edge',
    description: 'npm test (pass-through)',
    toolCall: { tool: 'Bash', args: { command: 'npm test' } },
    expected: {
      full: { action: 'allow' },
      rtk_only: { action: 'allow' },
      jm_only: { action: 'allow' },
      jm_not_indexed: { action: 'allow' },
      neither: { action: 'allow' },
    },
  },

  {
    id: 'edge_cat_noncode',
    category: 'edge',
    description: 'cat a non-code file via Bash',
    toolCall: { tool: 'Bash', args: { command: 'cat /tmp/log.txt' } },
    expected: {
      full: { action: 'advise', tool: 'rtk cat' },
      rtk_only: { action: 'advise', tool: 'rtk cat' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      jm_not_indexed: { action: 'advise', tool: 'Read' },
      neither: { action: 'advise', tool: 'Read' },
    },
  },

  {
    id: 'edge_cwd_path',
    category: 'edge',
    description: 'Bash with fully-qualified CWD path',
    toolCall: { tool: 'Bash', args: { command: '/home/user/project/src/file.ts' } },
    cwd: '/home/user/project',
    expected: {
      full: { action: 'advise', tool: './' },
      rtk_only: { action: 'advise', tool: './' },
      jm_only: { action: 'advise', tool: './' },
      jm_not_indexed: { action: 'advise', tool: './' },
      neither: { action: 'advise', tool: './' },
    },
  },
];
