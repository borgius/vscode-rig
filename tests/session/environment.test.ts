import { describe, it, expect } from 'vitest';
import { detectEnvironment, detectGraphify } from '../../src/session/environment.js';
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

// Helper to build MCP JSON-RPC response for list_repos
function mcpListReposResponse(repos: Array<{ repo: string }>): string {
  const reposJson = JSON.stringify({ repos });
  const rpcResponse = {
    jsonrpc: '2.0',
    id: 2,
    result: {
      content: [{ type: 'text', text: reposJson }],
      isError: false,
    },
  };
  const initResponse = { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26' } };
  return JSON.stringify(initResponse) + '\n' + JSON.stringify(rpcResponse);
}

describe('detectEnvironment', () => {
  it('detects rtk available when which succeeds', async () => {
    const exec = makeExec({
      'which rtk': '/usr/local/bin/rtk',
      'which jcodemunch': new Error('not found'),
      'which jcodemunch-mcp': new Error('not found'),
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.rtkAvailable).toBe(true);
    expect(env.rtkPath).toBe('/usr/local/bin/rtk');
  });

  it('detects rtk unavailable when which fails', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': new Error('not found'),
      'which jcodemunch-mcp': new Error('not found'),
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.rtkAvailable).toBe(false);
    expect(env.rtkPath).toBeNull();
  });

  it('detects jcodemunch available when CLI binary succeeds', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': '/usr/local/bin/jcodemunch',
      'list_repos': '{"repos":[]}',
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.jcodemunchAvailable).toBe(true);
  });

  it('detects jcodemunch unavailable when neither CLI nor MCP found', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': new Error('not found'),
      'which jcodemunch-mcp': new Error('not found'),
    });

    const env = await detectEnvironment('/fake/cwd', exec);
    expect(env.jcodemunchAvailable).toBe(false);
    expect(env.jcodemunchCwdIndexed).toBe(false);
    expect(env.jcodemunchCwdRepo).toBeNull();
  });

  it('detects CWD as indexed when jcodemunch CLI list_repos includes it', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': '/usr/local/bin/jcodemunch',
      'list_repos': JSON.stringify({ repos: ['local/rig'] }),
    });

    const env = await detectEnvironment('/home/jerome/projects/rig', exec);
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchKnownRepos).toContain('local/rig');
  });

  it('detects jcodemunch via MCP server binary when CLI not found', async () => {
    const mcpOutput = mcpListReposResponse([{ repo: 'local/ai-news' }]);
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch-mcp': '/home/user/.local/bin/jcodemunch-mcp\n',
      'which jcodemunch': new Error('not found'),
      'jcodemunch-mcp': mcpOutput,
    });

    const env = await detectEnvironment('/home/user/projects/ai-news', exec);
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchCwdIndexed).toBe(true);
    expect(env.jcodemunchCwdRepo).toBe('local/ai-news');
    expect(env.jcodemunchKnownRepos).toContain('local/ai-news');
  });

  it('detects jcodemunch MCP available but CWD not indexed', async () => {
    const mcpOutput = mcpListReposResponse([
      { repo: 'local/other-project' },
      { repo: 'local/third-project' },
    ]);
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch-mcp': '/home/user/.local/bin/jcodemunch-mcp\n',
      'which jcodemunch': new Error('not found'),
      'jcodemunch-mcp': mcpOutput,
    });

    const env = await detectEnvironment('/home/user/projects/ai-news', exec);
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchCwdIndexed).toBe(false);
    expect(env.jcodemunchKnownRepos).toHaveLength(2);
  });

  it('handles malformed MCP JSON-RPC response gracefully', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch-mcp': '/home/user/.local/bin/jcodemunch-mcp\n',
      'which jcodemunch': new Error('not found'),
      'jcodemunch-mcp': 'not valid json',
    });

    const env = await detectEnvironment('/home/user/projects/ai-news', exec);
    // Should still mark as available since the binary exists
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchCwdIndexed).toBe(false);
  });

  it('handles MCP query failure gracefully', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch-mcp': '/home/user/.local/bin/jcodemunch-mcp\n',
      'which jcodemunch': new Error('not found'),
      'jcodemunch-mcp': new Error('timeout'),
    });

    const env = await detectEnvironment('/home/user/projects/ai-news', exec);
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchCwdIndexed).toBe(false);
  });

  it('prefers CLI binary over MCP server when both available', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': '/usr/local/bin/jcodemunch',
      'list_repos': JSON.stringify({ repos: ['local/rig'] }),
    });

    const env = await detectEnvironment('/home/jerome/projects/rig', exec);
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchKnownRepos).toContain('local/rig');
  });

  it('returns valid timestamp', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': new Error('not found'),
      'which jcodemunch-mcp': new Error('not found'),
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
      'which jcodemunch-mcp': new Error('not found'),
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

describe('detectGraphify', () => {
  it('returns available true with graphPath when graphify CLI and graph.json exist', () => {
    const exec = makeExec({
      'which graphify': '/usr/local/bin/graphify',
    });
    const existsCheck = (path: string) =>
      path === '/fake/cwd/graphify-out/graph.json';

    const result = detectGraphify('/fake/cwd', exec, existsCheck);
    expect(result.available).toBe(true);
    expect(result.graphPath).toBe('graphify-out/graph.json');
  });

  it('returns available false when which graphify fails', () => {
    const exec = makeExec({
      'which graphify': new Error('not found'),
      'which graphifyy': new Error('not found'),
    });
    const existsCheck = (_path: string) => true;

    const result = detectGraphify('/fake/cwd', exec, existsCheck);
    expect(result.available).toBe(false);
    expect(result.graphPath).toBeNull();
  });

  it('returns available true when graphifyy (uvx) binary exists and graph.json exists', () => {
    const exec = (cmd: string) => {
      if (cmd === 'which graphify') throw new Error('not found');
      if (cmd === 'which graphifyy') return '/home/user/.local/bin/graphifyy';
      throw new Error(`unexpected: ${cmd}`);
    };
    const existsCheck = (path: string) =>
      path === '/fake/cwd/graphify-out/graph.json';

    const result = detectGraphify('/fake/cwd', exec, existsCheck);
    expect(result.available).toBe(true);
    expect(result.graphPath).toBe('graphify-out/graph.json');
  });

  it('returns available false when graphifyy exists but graph.json does not', () => {
    const exec = (cmd: string) => {
      if (cmd === 'which graphify') throw new Error('not found');
      if (cmd === 'which graphifyy') return '/home/user/.local/bin/graphifyy';
      throw new Error(`unexpected: ${cmd}`);
    };
    const existsCheck = (_path: string) => false;

    const result = detectGraphify('/fake/cwd', exec, existsCheck);
    expect(result.available).toBe(false);
    expect(result.graphPath).toBeNull();
  });

  it('returns available false when CLI exists but graph.json does not', () => {
    const exec = makeExec({
      'which graphify': '/usr/local/bin/graphify',
    });
    const existsCheck = (_path: string) => false;

    const result = detectGraphify('/fake/cwd', exec, existsCheck);
    expect(result.available).toBe(false);
    expect(result.graphPath).toBeNull();
  });

  it('is wired into detectEnvironment result', async () => {
    const exec = makeExec({
      'which rtk': new Error('not found'),
      'which jcodemunch': new Error('not found'),
      'which jcodemunch-mcp': new Error('not found'),
      'which graphify': '/usr/local/bin/graphify',
    });
    const existsCheck = (path: string) =>
      path === '/project/graphify-out/graph.json';

    const env = await detectEnvironment('/project', exec, existsCheck);
    expect(env.graphifyAvailable).toBe(true);
    expect(env.graphifyGraphPath).toBe('graphify-out/graph.json');
  });
});
