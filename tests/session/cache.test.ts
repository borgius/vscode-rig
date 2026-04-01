import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionCache, sessionCachePath } from '../../src/session/cache.js';
import type { Environment, SessionCacheFile } from '../../src/types.js';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';

function makeEnv(overrides: Partial<Environment> = {}): Environment {
  return {
    rtkAvailable: false,
    rtkPath: null,
    jcodemunchAvailable: false,
    jcodemunchCwdIndexed: false,
    jcodemunchCwdRepo: null,
    jcodemunchKnownRepos: [],
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe('SessionCache', () => {
  let cache: SessionCache;

  beforeEach(() => {
    cache = new SessionCache();
  });

  it('returns undefined when environment not set', () => {
    expect(cache.getEnvironment()).toBeUndefined();
  });

  it('stores and retrieves environment', () => {
    const env = makeEnv({ rtkAvailable: true });
    cache.setEnvironment(env);
    expect(cache.getEnvironment()).toEqual(env);
  });

  it('reports environment as stale after TTL expires', () => {
    const env = makeEnv({ detectedAt: Date.now() - 31 * 60 * 1000 }); // 31 min ago
    cache.setEnvironment(env);
    expect(cache.isEnvironmentStale()).toBe(true);
  });

  it('reports environment as fresh within TTL', () => {
    const env = makeEnv({ detectedAt: Date.now() });
    cache.setEnvironment(env);
    expect(cache.isEnvironmentStale()).toBe(false);
  });

  it('tracks edited source files', () => {
    cache.addEditedFile('src/router/resolver.ts', 'source');
    cache.addEditedFile('src/enforcement/zero-defect.ts', 'source');
    expect(cache.getEditedFiles('source')).toEqual([
      'src/router/resolver.ts',
      'src/enforcement/zero-defect.ts',
    ]);
  });

  it('tracks edited test files separately', () => {
    cache.addEditedFile('tests/router/resolver.test.ts', 'test');
    cache.addEditedFile('src/router/resolver.ts', 'source');
    expect(cache.getEditedFiles('test')).toEqual(['tests/router/resolver.test.ts']);
    expect(cache.getEditedFiles('source')).toEqual(['src/router/resolver.ts']);
  });

  it('tracks current skill phase', () => {
    expect(cache.getCurrentPhase()).toBeNull();
    cache.setPhase('tdd+');
    expect(cache.getCurrentPhase()).toBe('tdd+');
  });

  it('clears all state on reset', () => {
    cache.setEnvironment(makeEnv());
    cache.addEditedFile('src/foo.ts', 'source');
    cache.setPhase('tdd+');
    cache.reset();
    expect(cache.getEnvironment()).toBeUndefined();
    expect(cache.getEditedFiles('source')).toEqual([]);
    expect(cache.getCurrentPhase()).toBeNull();
  });

  it('stores and retrieves metrics baseline', () => {
    const cache = new SessionCache();
    expect(cache.getMetricsBaseline()).toBeUndefined();
    cache.setMetricsBaseline({ totalSaved: 1000000, capturedAt: Date.now() });
    const baseline = cache.getMetricsBaseline();
    expect(baseline).toBeDefined();
    expect(baseline!.totalSaved).toBe(1000000);
  });

  it('stores and increments metric counters', () => {
    const cache = new SessionCache();
    expect(cache.getMetricCounters()).toEqual({ rtkCalls: 0, jmCalls: 0, efficientCalls: 0 });
    cache.incrementMetricCounter('rtkCalls');
    cache.incrementMetricCounter('rtkCalls');
    cache.incrementMetricCounter('jmCalls');
    expect(cache.getMetricCounters()).toEqual({ rtkCalls: 2, jmCalls: 1, efficientCalls: 0 });
  });
});

describe('SessionCache (file-backed)', () => {
  const testCwd = '/tmp/rig-test-cache-' + process.pid;
  let cleanupPaths: string[] = [];

  afterEach(() => {
    for (const p of cleanupPaths) {
      try { unlinkSync(p); } catch { /* already gone */ }
    }
    cleanupPaths = [];
  });

  function trackPath(path: string): string {
    cleanupPaths.push(path);
    return path;
  }

  it('generates deterministic path from cwd', () => {
    const path = sessionCachePath(testCwd);
    expect(path).toMatch(/^\/tmp\/rig-session-[a-f0-9]{12}\.json$/);
    // Same cwd produces same path
    expect(sessionCachePath(testCwd)).toBe(path);
    // Different cwd produces different path
    expect(sessionCachePath('/other/path')).not.toBe(path);
  });

  it('loads fresh cache when no file exists', () => {
    const path = sessionCachePath(testCwd);
    if (existsSync(path)) { unlinkSync(path); }
    const cache = new SessionCache(testCwd);
    expect(cache.getEnvironment()).toBeUndefined();
    expect(cache.getEditedFiles('source')).toEqual([]);
    expect(cache.getCurrentPhase()).toBeNull();
    expect(cache.getMetricCounters()).toEqual({ rtkCalls: 0, jmCalls: 0, efficientCalls: 0 });
  });

  it('saves and round-trips all fields', () => {
    const cache = new SessionCache(testCwd);
    cache.setEnvironment(makeEnv({ rtkAvailable: true, rtkPath: '/usr/bin/rtk' }));
    cache.addEditedFile('src/foo.ts', 'source');
    cache.addEditedFile('tests/foo.test.ts', 'test');
    cache.setPhase('plan+');
    cache.setMetricsBaseline({ totalSaved: 50000, capturedAt: Date.now() });
    cache.incrementMetricCounter('rtkCalls');

    // Verify file was written
    const path = sessionCachePath(testCwd);
    expect(existsSync(path)).toBe(true);
    trackPath(path);

    // Load into a new cache instance
    const cache2 = new SessionCache(testCwd);
    expect(cache2.getEnvironment()).toBeDefined();
    expect(cache2.getEnvironment()!.rtkAvailable).toBe(true);
    expect(cache2.getEnvironment()!.rtkPath).toBe('/usr/bin/rtk');
    expect(cache2.getEditedFiles('source')).toEqual(['src/foo.ts']);
    expect(cache2.getEditedFiles('test')).toEqual(['tests/foo.test.ts']);
    expect(cache2.getCurrentPhase()).toBe('plan+');
    expect(cache2.getMetricsBaseline()!.totalSaved).toBe(50000);
    expect(cache2.getMetricCounters()).toEqual({ rtkCalls: 1, jmCalls: 0, efficientCalls: 0 });
  });

  it('clears stale environment on load', () => {
    const cache = new SessionCache(testCwd);
    cache.setEnvironment(makeEnv({ detectedAt: Date.now() - 31 * 60 * 1000 }));
    const path = sessionCachePath(testCwd);
    trackPath(path);

    // Load into new instance — stale env should be cleared
    const cache2 = new SessionCache(testCwd);
    expect(cache2.getEnvironment()).toBeUndefined();
  });

  it('preserves fresh environment on load', () => {
    const cache = new SessionCache(testCwd);
    cache.setEnvironment(makeEnv({ detectedAt: Date.now() }));
    const path = sessionCachePath(testCwd);
    trackPath(path);

    const cache2 = new SessionCache(testCwd);
    expect(cache2.getEnvironment()).toBeDefined();
    expect(cache2.getEnvironment()!.rtkAvailable).toBe(false);
  });

  it('works in-memory when no cwd provided', () => {
    const cache = new SessionCache();
    cache.setEnvironment(makeEnv());
    cache.addEditedFile('src/foo.ts', 'source');
    // No file should be written
    expect(cache.getEnvironment()).toBeDefined();
    expect(cache.getEditedFiles('source')).toEqual(['src/foo.ts']);
  });

  it('serializes to valid JSON with expected structure', () => {
    const cache = new SessionCache(testCwd);
    cache.setEnvironment(makeEnv());
    cache.setPhase('tdd+');

    const path = sessionCachePath(testCwd);
    trackPath(path);
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as SessionCacheFile;

    expect(parsed.updatedAt).toBeGreaterThan(0);
    expect(parsed.environment).toBeDefined();
    expect(parsed.editedFiles).toEqual({});
    expect(parsed.currentPhase).toBe('tdd+');
    expect(parsed.metricsBaseline).toBeNull();
    expect(parsed.metricCounters).toEqual({ rtkCalls: 0, jmCalls: 0, efficientCalls: 0 });
  });
});
