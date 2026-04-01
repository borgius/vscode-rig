import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectEnvironment } from '../../src/session/environment.js';
import type { Environment } from '../../src/types.js';

// Mock child_process.execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

describe('detectEnvironment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects rtk available when which succeeds', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') return '/usr/local/bin/rtk';
      if (cmd.includes('index_folder')) return '';
      if (cmd.includes('list_repos')) return '{"repos":[]}';
      return '';
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.rtkAvailable).toBe(true);
    expect(env.rtkPath).toBe('/usr/local/bin/rtk');
  });

  it('detects rtk unavailable when which fails', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd.includes('index_folder')) return '';
      if (cmd.includes('list_repos')) return '{"repos":[]}';
      return '';
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.rtkAvailable).toBe(false);
    expect(env.rtkPath).toBeNull();
  });

  it('detects jcodemunch available when which succeeds', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which jcodemunch') return '/usr/local/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":[]}';
      return '';
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.jcodemunchAvailable).toBe(true);
  });

  it('detects jcodemunch unavailable when which fails', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which jcodemunch') throw new Error('not found');
      return '';
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.jcodemunchAvailable).toBe(false);
    expect(env.jcodemunchCwdIndexed).toBe(false);
    expect(env.jcodemunchCwdRepo).toBeNull();
  });

  it('detects CWD as indexed when jcodemunch list_repos includes it', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which jcodemunch') return '/usr/local/bin/jcodemunch';
      if (cmd.includes('list_repos')) return JSON.stringify({ repos: ['local/claude-stack-utils'] });
      return '';
    });

    const env = await detectEnvironment('/home/jerome/projects/claude-stack-utils');
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchKnownRepos).toContain('local/claude-stack-utils');
  });

  it('returns valid timestamp', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const before = Date.now();
    const env = await detectEnvironment('/fake/cwd');
    const after = Date.now();
    expect(env.detectedAt).toBeGreaterThanOrEqual(before);
    expect(env.detectedAt).toBeLessThanOrEqual(after);
  });

  it('returns isEnvironment-compatible object', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.rtkAvailable).toBe(false);
    expect(env.rtkPath).toBeNull();
    expect(env.jcodemunchAvailable).toBe(false);
    expect(env.jcodemunchCwdIndexed).toBe(false);
    expect(env.jcodemunchCwdRepo).toBeNull();
    expect(env.jcodemunchKnownRepos).toEqual([]);
    expect(typeof env.detectedAt).toBe('number');
  });
});
