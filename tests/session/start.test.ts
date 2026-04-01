import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSessionStart } from '../../src/session/start.js';
import { SessionCache } from '../../src/session/cache.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

describe('handleSessionStart', () => {
  let cache: SessionCache;

  beforeEach(() => {
    cache = new SessionCache();
    vi.resetAllMocks();
  });

  it('detects environment and caches it', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') return '/usr/bin/rtk';
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":["local/test-project"]}';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);

    const env = cache.getEnvironment();
    expect(env).toBeDefined();
    expect(env!.rtkAvailable).toBe(true);
    expect(env!.jcodemunchAvailable).toBe(true);
  });

  it('auto-indexes CWD with jcodemunch when available but not indexed', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":[]}';
      if (cmd.includes('index_folder')) return JSON.stringify({ success: true, repo: 'local/test-project' });
      return '';
    });

    await handleSessionStart('/home/user/test-project', cache);

    // Should have called index_folder for the CWD
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('index_folder'),
      expect.anything(),
    );
  });

  it('skips indexing when already indexed', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return JSON.stringify({ repos: ['local/test-project'] });
      return '';
    });

    await handleSessionStart('/home/user/test-project', cache);

    // Should NOT have called index_folder — already indexed
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    expect(calls.find(c => c.includes('index_folder'))).toBeUndefined();
  });

  it('skips indexing when jcodemunch not available', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') throw new Error('not found');
      return '';
    });

    await handleSessionStart('/home/user/test-project', cache);

    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    expect(calls.find(c => c.includes('index_folder'))).toBeUndefined();
  });

  it('returns diagnostic output for session start', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') return '/usr/bin/rtk';
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":["local/test-project"]}';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);
    expect(output).toContain('rtk');
    expect(output).toContain('jcodemunch');
    expect(output).toContain('indexed');
  });

  it('includes worktree suggestion when on master', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') throw new Error('not found');
      if (cmd === 'git branch --show-current') return 'master';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);
    expect(output).toContain('using-git-worktrees');
  });

  it('omits worktree suggestion when on feature branch', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') throw new Error('not found');
      if (cmd === 'git branch --show-current') return 'feat/something';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);
    expect(output).not.toContain('using-git-worktrees');
  });

  it('warns when rtk is not installed', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":["local/test-project"]}';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);
    expect(output).toContain('WARNING');
    expect(output).toContain('rtk');
    expect(output).toContain('install');
  });

  it('warns when jcodemunch is not installed', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') return '/usr/bin/rtk';
      if (cmd === 'which jcodemunch') throw new Error('not found');
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);
    expect(output).toContain('WARNING');
    expect(output).toContain('jcodemunch');
    expect(output).toContain('install');
  });

  it('warns when both tools are not installed', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') throw new Error('not found');
      if (cmd === 'git branch --show-current') return 'feat/something';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);
    expect(output).toContain('rtk');
    expect(output).toContain('jcodemunch');
    // Should contain two warnings
    const warningCount = (output.match(/WARNING/g) ?? []).length;
    expect(warningCount).toBeGreaterThanOrEqual(2);
  });

  it('does not warn when both tools are available', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') return '/usr/bin/rtk';
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":["local/test-project"]}';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);
    expect(output).not.toContain('WARNING');
  });

  it('suppresses warning on second call', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') throw new Error('not found');
      if (cmd === 'git branch --show-current') return 'feat/something';
      return '';
    });

    // First call — should warn
    const output1 = await handleSessionStart('/home/user/test-project', cache);
    expect(output1).toContain('WARNING');

    // Second call — warning suppressed
    const output2 = await handleSessionStart('/home/user/test-project', cache);
    expect(output2).not.toContain('WARNING');
  });
});
