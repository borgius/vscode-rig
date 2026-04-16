import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import type { Environment } from '../types.js';

export interface ExecFn {
  (command: string, options?: { encoding?: string; timeout?: number }): string;
}

const defaultExec: ExecFn = (cmd, opts) =>
  execSync(cmd, { encoding: 'utf-8', ...opts } as Parameters<typeof execSync>[1]) as string;

export async function detectEnvironment(
  cwd: string,
  exec: ExecFn = defaultExec,
): Promise<Environment> {
  const rtkResult = detectRtk(exec);
  const jmResult = detectJcodemunch(cwd, exec);

  return {
    rtkAvailable: rtkResult.available,
    rtkPath: rtkResult.path,
    jcodemunchAvailable: jmResult.available,
    jcodemunchCwdIndexed: jmResult.cwdIndexed,
    jcodemunchCwdRepo: jmResult.cwdRepo,
    jcodemunchKnownRepos: jmResult.knownRepos,
    detectedAt: Date.now(),
  };
}

function detectRtk(exec: ExecFn): { available: boolean; path: string | null } {
  try {
    const path = exec('which rtk').trim();
    return { available: true, path };
  } catch {
    return { available: false, path: null };
  }
}

function detectJcodemunch(cwd: string, exec: ExecFn): {
  available: boolean;
  cwdIndexed: boolean;
  cwdRepo: string | null;
  knownRepos: string[];
} {
  // Try CLI binary first
  try {
    exec('which jcodemunch');
    return detectJcodemunchCli(cwd, exec);
  } catch {
    // CLI not found — try MCP server binary
  }

  try {
    const mcpPath = exec('which jcodemunch-mcp').trim();
    if (mcpPath) {
      return detectJcodemunchMcp(cwd, mcpPath, exec);
    }
  } catch {
    // MCP binary not found either
  }

  return { available: false, cwdIndexed: false, cwdRepo: null, knownRepos: [] };
}

function detectJcodemunchCli(cwd: string, exec: ExecFn): {
  available: boolean;
  cwdIndexed: boolean;
  cwdRepo: string | null;
  knownRepos: string[];
} {
  try {
    const raw = exec('jcodemunch list_repos').trim();
    const parsed = JSON.parse(raw);
    return resolveJcodemunchRepos(cwd, parsed.repos ?? []);
  } catch {
    return { available: true, cwdIndexed: false, cwdRepo: null, knownRepos: [] };
  }
}

function detectJcodemunchMcp(cwd: string, mcpPath: string, exec: ExecFn): {
  available: boolean;
  cwdIndexed: boolean;
  cwdRepo: string | null;
  knownRepos: string[];
} {
  try {
    const output = queryJcodemunchMcp(mcpPath, exec);
    if (!output) return { available: true, cwdIndexed: false, cwdRepo: null, knownRepos: [] };

    // Parse JSON-RPC responses — find the list_repos response (id:2)
    const lines = output.trim().split('\n');
    const reposLine = lines.find(l => l.includes('"id":2'));
    if (!reposLine) return { available: true, cwdIndexed: false, cwdRepo: null, knownRepos: [] };

    const rpcResponse = JSON.parse(reposLine);
    const textContent = rpcResponse?.result?.content?.[0]?.text;
    if (!textContent) return { available: true, cwdIndexed: false, cwdRepo: null, knownRepos: [] };

    const reposData = JSON.parse(textContent);
    // MCP returns repos as objects with a "repo" field; extract repo names
    const repoNames: string[] = (reposData.repos ?? []).map((r: { repo: string }) => r.repo);
    return resolveJcodemunchRepos(cwd, repoNames);
  } catch {
    return { available: true, cwdIndexed: false, cwdRepo: null, knownRepos: [] };
  }
}

function queryJcodemunchMcp(mcpPath: string, exec: ExecFn): string | null {
  const init = '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"rig","version":"1.0"}},"id":1}';
  const ready = '{"jsonrpc":"2.0","method":"notifications/initialized"}';
  const listRepos = '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_repos","arguments":{}},"id":2}';

  const cmd = `printf '%s\\n' '${init}' '${ready}' '${listRepos}' | '${mcpPath}' 2>/dev/null`;
  try {
    return exec(cmd, { timeout: 10000 });
  } catch {
    return null;
  }
}

/**
 * Call a jcodemunch MCP tool via JSON-RPC stdio protocol.
 * Returns the parsed text content of the result, or null on failure.
 */
export function callJcodemunchMcpTool(mcpPath: string, toolName: string, args: Record<string, string>, exec: ExecFn): string | null {
  const init = '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"rig","version":"1.0"}},"id":1}';
  const ready = '{"jsonrpc":"2.0","method":"notifications/initialized"}';
  const call = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: 2,
  });

  const cmd = `printf '%s\\n' '${init}' '${ready}' '${call}' | '${mcpPath}' 2>/dev/null`;
  try {
    const output = exec(cmd, { timeout: 60_000 });
    const lines = output.trim().split('\n');
    const responseLine = lines.find(l => l.includes('"id":2'));
    if (!responseLine) return null;
    const rpcResponse = JSON.parse(responseLine);
    return rpcResponse?.result?.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

function resolveJcodemunchRepos(cwd: string, repos: string[]): {
  available: boolean;
  cwdIndexed: boolean;
  cwdRepo: string | null;
  knownRepos: string[];
} {
  const folderName = basename(cwd);
  const cwdRepo = repos.find(r => r.endsWith(folderName)) ?? null;

  return {
    available: true,
    cwdIndexed: cwdRepo !== null,
    cwdRepo,
    knownRepos: repos,
  };
}
