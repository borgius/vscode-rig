import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureIndexed } from '../../src/scout/cross-repo.js';
import type { Environment } from '../../src/types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

describe('ensureIndexed', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns existing repo when already indexed', () => {
    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: true,
      jcodemunchCwdRepo: 'local/my-project',
      jcodemunchKnownRepos: ['local/my-project', 'local/superpowers'],
      detectedAt: Date.now(),
    };

    const result = ensureIndexed('/home/user/my-project', env);
    expect(result.alreadyIndexed).toBe(true);
    expect(result.repo).toBe('local/my-project');
    expect(execSync).not.toHaveBeenCalledWith(expect.stringContaining('index_folder'), expect.anything());
  });

  it('indexes new directory when jcodemunch available but not indexed', () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('index_folder')) {
        return JSON.stringify({ success: true, repo: 'local/other-project' });
      }
      return '';
    });

    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    };

    const result = ensureIndexed('/home/user/other-project', env);
    expect(result.alreadyIndexed).toBe(false);
    expect(result.repo).toBe('local/other-project');
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('index_folder'),
      expect.anything(),
    );
  });

  it('returns null when jcodemunch not available', () => {
    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: false,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    };

    const result = ensureIndexed('/home/user/some-project', env);
    expect(result).toBeNull();
  });

  it('returns null when indexing fails', () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('index_folder')) {
        throw new Error('indexing failed');
      }
      return '';
    });

    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    };

    const result = ensureIndexed('/home/user/broken-project', env);
    expect(result).toBeNull();
  });

  it('detects already-indexed repo by directory basename', () => {
    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: ['local/superpowers', 'local/gstack'],
      detectedAt: Date.now(),
    };

    // Directory is ~/tools/superpowers, which matches repo 'local/superpowers'
    const result = ensureIndexed('/home/user/tools/superpowers', env);
    expect(result.alreadyIndexed).toBe(true);
    expect(result.repo).toBe('local/superpowers');
  });
});
