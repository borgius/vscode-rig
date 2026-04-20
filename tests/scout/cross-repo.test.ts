import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureIndexed, ensureGraphBuilt } from '../../src/scout/cross-repo.js';
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
    graphifyAvailable: false,
    graphifyGraphPath: null,
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
    graphifyAvailable: false,
    graphifyGraphPath: null,
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
    graphifyAvailable: false,
    graphifyGraphPath: null,
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
    graphifyAvailable: false,
    graphifyGraphPath: null,
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
    graphifyAvailable: false,
    graphifyGraphPath: null,
      detectedAt: Date.now(),
    };

    // Directory is ~/tools/superpowers, which matches repo 'local/superpowers'
    const result = ensureIndexed('/home/user/tools/superpowers', env);
    expect(result.alreadyIndexed).toBe(true);
    expect(result.repo).toBe('local/superpowers');
  });
});

describe('ensureGraphBuilt', () => {
  const graphifyEnv: Environment = {
    rtkAvailable: false,
    rtkPath: null,
    jcodemunchAvailable: false,
    jcodemunchCwdIndexed: false,
    jcodemunchCwdRepo: null,
    jcodemunchKnownRepos: [],
    graphifyAvailable: true,
    graphifyGraphPath: 'graphify-out/graph.json',
    detectedAt: Date.now(),
  };

  const noGraphifyEnv: Environment = {
    rtkAvailable: false,
    rtkPath: null,
    jcodemunchAvailable: false,
    jcodemunchCwdIndexed: false,
    jcodemunchCwdRepo: null,
    jcodemunchKnownRepos: [],
    graphifyAvailable: false,
    graphifyGraphPath: null,
    detectedAt: Date.now(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns alreadyBuilt when graph.json exists at target', () => {
    const existsCheck = (p: string) => p.includes('graphify-out/graph.json');
    const result = ensureGraphBuilt('/home/user/my-project', graphifyEnv, execSync as any, existsCheck);
    expect(result).not.toBeNull();
    expect(result!.alreadyBuilt).toBe(true);
    expect(result!.graphPath).toBe('graphify-out/graph.json');
  });

  it('builds graph and returns result when graph.json does not exist', () => {
    let callCount = 0;
    const existsCheck = (p: string) => {
      // First check: graph doesn't exist yet
      // After build: graph exists
      callCount++;
      return callCount > 1;
    };
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('graphify update')) return '';
      return '';
    });

    const result = ensureGraphBuilt('/home/user/new-project', graphifyEnv, execSync as any, existsCheck);
    expect(result).not.toBeNull();
    expect(result!.alreadyBuilt).toBe(false);
    expect(result!.graphPath).toBe('graphify-out/graph.json');
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('graphify update'),
      expect.anything(),
    );
  });

  it('returns null when graphify not available', () => {
    const result = ensureGraphBuilt('/home/user/some-project', noGraphifyEnv, execSync as any, () => true);
    expect(result).toBeNull();
  });

  it('returns null when build fails', () => {
    const existsCheck = () => false;
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('graphify update')) throw new Error('build failed');
      return '';
    });

    const result = ensureGraphBuilt('/home/user/broken-project', graphifyEnv, execSync as any, existsCheck);
    expect(result).toBeNull();
  });

  it('returns null when build succeeds but graph.json still missing', () => {
    const existsCheck = () => false;
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('graphify update')) return '';
      return '';
    });

    const result = ensureGraphBuilt('/home/user/empty-project', graphifyEnv, execSync as any, existsCheck);
    expect(result).toBeNull();
  });
});
