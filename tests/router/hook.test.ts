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

  it('allows native Grep when environment not set (no jcodemunch to advise)', () => {
    // No environment set — native_grep falls through to fallback: allow
    const result = handlePreToolUse('Grep', { pattern: 'test' }, cache, config);
    expect(result).toBeNull();
  });

  it('includes enforcement level in output', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Bash', { command: 'grep -r pattern .' }, cache, config);
    expect(result).not.toBeNull();
    // grep default enforcement is 'block'
    expect(result).toContain('block');
  });

  it('advises jcodemunch for native Read on code file when indexed', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Read', { file_path: '/some/file.ts' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('jcodemunch');
    expect(result).toContain('ADVISE');
  });

  it('allows native Read on code file when jcodemunch not indexed', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: false }));
    const result = handlePreToolUse('Read', { file_path: '/some/file.ts' }, cache, config);
    expect(result).toBeNull();
  });

  it('allows native Read on non-code file', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Read', { file_path: '/some/readme.txt' }, cache, config);
    expect(result).toBeNull();
  });

  it('allows native Read with offset (targeted re-read)', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Read', { file_path: '/some/file.ts', offset: 10 }, cache, config);
    expect(result).toBeNull();
  });

  it('advises jcodemunch for native Grep when indexed', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Grep', { pattern: 'function' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('jcodemunch');
    expect(result).toContain('ADVISE');
  });

  it('allows native Grep when jcodemunch not indexed', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: false }));
    const result = handlePreToolUse('Grep', { pattern: 'function' }, cache, config);
    expect(result).toBeNull();
  });

  it('advises jcodemunch for native Glob on code pattern when indexed', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Glob', { pattern: '**/*.ts' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('jcodemunch');
    expect(result).toContain('ADVISE');
  });

  it('allows native Glob when jcodemunch not indexed', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: false }));
    const result = handlePreToolUse('Glob', { pattern: '**/*.ts' }, cache, config);
    expect(result).toBeNull();
  });

  it('blocks rtk cat on code files', () => {
    cache.setEnvironment(makeEnv());
    const result = handlePreToolUse('Bash', { command: 'rtk cat /some/file.ts' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('BLOCK');
    expect(result).toContain('jcodemunch');
  });

  it('allows rtk cat on non-code files', () => {
    cache.setEnvironment(makeEnv());
    const result = handlePreToolUse('Bash', { command: 'rtk cat /some/readme.txt' }, cache, config);
    expect(result).toBeNull();
  });

  it('config override suppresses native_read advice', () => {
    config.rules.tool_routing!.native_read = 'silent';
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Read', { file_path: '/some/file.ts' }, cache, config);
    // silent enforcement still returns null (no output)
    expect(result).toBeNull();
  });

  it('config override blocks native_read advice', () => {
    config.rules.tool_routing!.native_read = 'block';
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Read', { file_path: '/some/file.ts' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('BLOCK');
  });
});
