import { describe, it, expect, beforeEach } from 'vitest';
import { checkZeroDefect } from '../../src/enforcement/zero-defect.js';
import type { HarnessConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

describe('checkZeroDefect', () => {
  let config: HarnessConfig;

  beforeEach(() => {
    config = structuredClone(DEFAULT_CONFIG);
  });

  it('returns null for clean test output', () => {
    const output = [
      '✓ tests/router/resolver.test.ts (3 tests)',
      '✓ tests/router/rules.test.ts (5 tests)',
      '',
      'Tests: 8 passed',
      'Time: 1.2s',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).toBeNull();
  });

  it('detects FAIL in test output', () => {
    const output = [
      'FAIL tests/router/resolver.test.ts',
      '  resolve() with empty rules',
      '  AssertionError: expected "allow" received "block"',
      '',
      'Tests: 1 failed, 7 passed',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).not.toBeNull();
    expect(result).toContain('ZERO-DEFECT');
    expect(result).toContain('FAIL');
  });

  it('detects ERROR in test output', () => {
    const output = [
      'ERROR tests/setup.ts',
      '  Cannot find module ../src/types',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).not.toBeNull();
    expect(result).toContain('ERROR');
  });

  it('detects TypeScript compilation errors', () => {
    const output = [
      'src/router/resolver.ts(42,5): error TS2322: Type "string" is not assignable to type "Resolution"',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).not.toBeNull();
    expect(result).toContain('TS2322');
  });

  it('detects Python test failures', () => {
    const output = [
      'FAILED tests/test_config.py::test_load_config - AssertionError',
      '=== 1 failed, 12 passed in 2.1s ===',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).not.toBeNull();
    expect(result).toContain('FAILED');
  });

  it('extracts failure summary lines', () => {
    const output = [
      'FAIL tests/router/resolver.test.ts > resolve with empty rules',
      'FAIL tests/router/rules.test.ts > findMatchingRule returns undefined',
      '',
      'Tests: 2 failed, 6 passed',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).toContain('2 failure(s) found');
    expect(result).toContain('resolver.test.ts');
    expect(result).toContain('rules.test.ts');
  });

  it('respects permissive tolerance mode', () => {
    config.rules.zero_defect = { tolerance: 'permissive' };
    const output = 'FAIL tests/a.test.ts\nTests: 1 failed';
    const result = checkZeroDefect(output, config);
    // Permissive mode still flags but as advise
    expect(result).toContain('[ADVISE]');
  });

  it('uses block in strict mode', () => {
    config.rules.zero_defect = { tolerance: 'strict' };
    const output = 'FAIL tests/a.test.ts\nTests: 1 failed';
    const result = checkZeroDefect(output, config);
    expect(result).toContain('[BLOCK]');
  });

  it('returns null for warning-only output in permissive mode', () => {
    config.rules.zero_defect = { tolerance: 'permissive' };
    const output = [
      'WARN tests/deprecated.test.ts',
      '  This test uses deprecated API',
      '',
      'Tests: 10 passed',
    ].join('\n');
    const result = checkZeroDefect(output, config);
    expect(result).toBeNull();
  });
});
