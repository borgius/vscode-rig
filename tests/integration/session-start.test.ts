import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initCommand } from '../../src/cli/init.js';
import { runHook, readSessionCache } from '../helpers/hook-runner.js';
import { sessionCachePath } from '../../src/session/cache.js';

describe('SessionStart hook E2E', () => {
  let tempDir: string;
  let hookPath: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'rig-e2e-session-'));
    await initCommand(tempDir, { force: false });
    hookPath = join(tempDir, '.claude', 'hooks', 'scripts', 'session-start.ts');
    expect(existsSync(hookPath)).toBe(true);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates session cache file in /tmp', async () => {
    const cachePath = sessionCachePath(tempDir);
    if (existsSync(cachePath)) { unlinkSync(cachePath); }

    const result = await runHook(hookPath, {}, tempDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Session initialized');

    const cache = readSessionCache(tempDir);
    expect(cache).not.toBeNull();
    expect(cache!.updatedAt).toBeGreaterThan(0);
  });

  it('detects environment in cache', async () => {
    const result = await runHook(hookPath, {}, tempDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('rtk:');

    const cache = readSessionCache(tempDir);
    expect(cache).not.toBeNull();
    expect(cache!.environment).not.toBeNull();
    expect(typeof cache!.environment!.rtkAvailable).toBe('boolean');
    expect(cache!.environment!.detectedAt).toBeGreaterThan(0);
  });

  it('captures metrics baseline', async () => {
    const result = await runHook(hookPath, {}, tempDir);

    expect(result.exitCode).toBe(0);

    const cache = readSessionCache(tempDir);
    expect(cache).not.toBeNull();
    expect(cache!.metricsBaseline).not.toBeNull();
    expect(typeof cache!.metricsBaseline!.totalSaved).toBe('number');
  });
});
