import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initCommand } from '../../src/cli/init.js';
import { runHook } from '../helpers/hook-runner.js';

describe('PreToolUse hook E2E', () => {
  let tempDir: string;
  let hookPath: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'rig-e2e-pre-'));
    // Initialize rig project to generate hook scripts
    await initCommand(tempDir, { force: false });
    hookPath = join(tempDir, '.claude', 'hooks', 'scripts', 'pre-tool-use.ts');
    expect(existsSync(hookPath)).toBe(true);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('allows Read tool', async () => {
    const result = await runHook(hookPath, {
      tool_name: 'Read',
      tool_input: { file_path: '/some/file.ts' },
    }, tempDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('allows Write tool', async () => {
    const result = await runHook(hookPath, {
      tool_name: 'Write',
      tool_input: { file_path: '/some/file.ts', content: 'hello' },
    }, tempDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('allows unknown tools', async () => {
    const result = await runHook(hookPath, {
      tool_name: 'SomeCustomTool',
      tool_input: {},
    }, tempDir);

    expect(result.exitCode).toBe(0);
  });

  it('handles malformed stdin gracefully', async () => {
    const { spawn } = await import('node:child_process');
    const result = await new Promise<{ exitCode: number }>((resolve) => {
      const child = spawn('npx', ['tsx', hookPath], {
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdin?.write('not json{{{');
      child.stdin?.end();
      child.on('close', (code) => resolve({ exitCode: code ?? 1 }));
    });

    expect(result.exitCode).toBe(0);
  });
});
