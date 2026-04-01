import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePreToolUse } from '../../src/router/hook.js';
import { SessionCache } from '../../src/session/cache.js';
import type { Environment, HarnessConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

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

describe('handlePreToolUse', () => {
  let cache: SessionCache;
  let config: HarnessConfig;

  beforeEach(() => {
    cache = new SessionCache();
    config = structuredClone(DEFAULT_CONFIG);
  });

  it('allows Read tool without interception', () => {
    cache.setEnvironment(makeEnv());
    const result = handlePreToolUse('Read', { file_path: '/some/file.ts' }, cache, config);
    expect(result).toBeNull(); // null = allow, no output
  });

  it('advises jcodemunch for Grep when indexed', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Grep', { pattern: 'function' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('jcodemunch');
    expect(result).toContain('advise');
  });

  it('blocks sed -i regardless of environment', () => {
    cache.setEnvironment(makeEnv({ rtkAvailable: true, jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Bash', { command: "sed -i 's/old/new/g' file.ts" }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('block');
    expect(result).toContain('Edit');
  });

  it('advises rtk for grep when rtk available', () => {
    cache.setEnvironment(makeEnv({ rtkAvailable: true, rtkPath: '/usr/bin/rtk' }));
    const result = handlePreToolUse('Bash', { command: 'grep -r pattern .' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('rtk');
  });

  it('returns null for pass-through tools', () => {
    cache.setEnvironment(makeEnv());
    const result = handlePreToolUse('Bash', { command: 'ls -la' }, cache, config);
    expect(result).toBeNull();
  });

  it('returns null for Edit tool (allowed)', () => {
    cache.setEnvironment(makeEnv());
    const result = handlePreToolUse('Edit', { file_path: '/some/file.ts' }, cache, config);
    expect(result).toBeNull();
  });

  it('uses default advise level when environment not set', () => {
    // No environment set (session start hook hasn't run)
    const result = handlePreToolUse('Grep', { pattern: 'test' }, cache, config);
    // Should still work — uses fallback resolution
    expect(result).not.toBeNull();
    expect(result).toContain('Grep');
  });

  it('includes enforcement level in output', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Bash', { command: 'grep -r pattern .' }, cache, config);
    expect(result).not.toBeNull();
    // grep default enforcement is 'block'
    expect(result).toContain('block');
  });
});
