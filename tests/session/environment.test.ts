import { describe, it, expect } from 'vitest';
import { detectEnvironment } from '../../src/session/environment.js';
import type { ExecFn } from '../../src/session/environment.js';

function makeExec(responses: Record<string, string | Error>): ExecFn {
  return (cmd: string) => {
    for (const [pattern, result] of Object.entries(responses)) {
      if (cmd.includes(pattern) || cmd === pattern) {
        if (result instanceof Error) throw result;
        return result;
      }
    }
    throw new Error(`unexpected command: ${cmd}`);
  };
}

describe('detectEnvironment', () => {
  it('detects rtk available when which succeeds', async () => {
    const exec = makeExec({
      'which rtk': '/usr/local/bin/rtk',
      'which jcodemunch': new Error('not found'),
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.rtkAvailable).toBe(true);
    expect(env.rtkPath).toBe('/usr/local/bin/rtk');
  });

  it('detects rtk unavailable when which fails', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': new Error('not found'),
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.rtkAvailable).toBe(false);
    expect(env.rtkPath).toBeNull();
  });

  it('detects jcodemunch available when which succeeds', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': '/usr/local/bin/jcodemunch',
      'list_repos': '{"repos":[]}',
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.jcodemunchAvailable).toBe(true);
  });

  it('detects jcodemunch unavailable when which fails', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': new Error('not found'),
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.jcodemunchAvailable).toBe(false);
    expect(env.jcodemunchCwdIndexed).toBe(false);
    expect(env.jcodemunchCwdRepo).toBeNull();
  });

  it('detects CWD as indexed when jcodemunch list_repos includes it', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': '/usr/local/bin/jcodemunch',
      'list_repos': JSON.stringify({ repos: ['local/claude-stack-utils'] }),
    });

    const env = await detectEnvironment('/home/jerome/projects/claude-stack-utils', exec);
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchKnownRepos).toContain('local/claude-stack-utils');
  });

  it('returns valid timestamp', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': new Error('not found'),
    });

    const before = Date.now();
    const env = await detectEnvironment('/fake/cwd', exec);
    const after = Date.now();
    expect(env.detectedAt).toBeGreaterThanOrEqual(before);
    expect(env.detectedAt).toBeLessThanOrEqual(after);
  });

  it('returns isEnvironment-compatible object', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': new Error('not found'),
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.rtkAvailable).toBe(false);
    expect(env.rtkPath).toBeNull();
    expect(env.jcodemunchAvailable).toBe(false);
    expect(env.jcodemunchCwdIndexed).toBe(false);
    expect(env.jcodemunchCwdRepo).toBeNull();
    expect(env.jcodemunchKnownRepos).toEqual([]);
    expect(typeof env.detectedAt).toBe('number');
  });
});
