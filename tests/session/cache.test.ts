import { describe, it, expect, beforeEach } from 'vitest';
import { SessionCache } from '../../src/session/cache.js';
import type { Environment } from '../../src/types.js';

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
    expect(cache.getMetricCounters()).toEqual({ rtkCalls: 0, jmCalls: 0 });
    cache.incrementMetricCounter('rtkCalls');
    cache.incrementMetricCounter('rtkCalls');
    cache.incrementMetricCounter('jmCalls');
    expect(cache.getMetricCounters()).toEqual({ rtkCalls: 2, jmCalls: 1 });
  });
});
