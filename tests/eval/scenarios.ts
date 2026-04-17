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
  category: 'bash' | 'native' | 'edge';
  description: string;
  toolCall: { tool: string; args: Record<string, unknown> };
  expected: Record<string, ExpectedOutcome>; // keyed by env preset name
  cwd?: string; // for cwd_path_expand scenarios
}

// ── 15 baseline scenarios ──

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
      neither: { action: 'block' },
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
      neither: { action: 'allow' },
    },
  },

  {
    id: 'native_glob_noncode',
    category: 'native',
    description: 'Glob with non-code pattern (still matches file_discovery)',
    toolCall: { tool: 'Glob', args: { pattern: '*.md' } },
    expected: {
      full: { action: 'advise', tool: 'rtk find' },
      rtk_only: { action: 'advise', tool: 'rtk find' },
      jm_only: { action: 'advise', tool: 'jcodemunch' },
      neither: { action: 'advise', tool: 'Glob' },
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
      neither: { action: 'advise', tool: './' },
    },
  },
];
