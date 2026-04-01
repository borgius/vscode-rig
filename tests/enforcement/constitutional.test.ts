import { describe, it, expect, beforeEach } from 'vitest';
import { checkConstitutional } from '../../src/enforcement/constitutional.js';
import type { HarnessConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

describe('checkConstitutional', () => {
  let config: HarnessConfig;

  beforeEach(() => {
    config = structuredClone(DEFAULT_CONFIG);
  });

  describe('mock detection', () => {
    it('detects jest.mock in test file', () => {
      const result = checkConstitutional(
        'tests/router/resolver.test.ts',
        `import { resolver } from '../src/router/resolver.js';
jest.mock('../src/router/resolver.js');`,
        config,
      );
      expect(result).not.toBeNull();
      expect(result).toContain('mock');
    });

    it('detects vi.mock in test file', () => {
      const result = checkConstitutional(
        'tests/router/resolver.test.ts',
        `vi.mock('../src/config.js');`,
        config,
      );
      expect(result).not.toBeNull();
      expect(result).toContain('mock');
    });

    it('detects unittest.mock in Python test file', () => {
      const result = checkConstitutional(
        'tests/test_config.py',
        `from unittest.mock import patch\n@patch('src.config.loadConfig')`,
        config,
      );
      expect(result).not.toBeNull();
      expect(result).toContain('mock');
    });

    it('allows mock in non-test files', () => {
      const result = checkConstitutional(
        'src/router/resolver.ts',
        `jest.mock('some-dep');`,
        config,
      );
      expect(result).toBeNull();
    });

    it('returns null for test file without mocks', () => {
      const result = checkConstitutional(
        'tests/router/resolver.test.ts',
        `import { resolve } from '../src/router/resolver.js';\nconst result = resolve(rule, env);\nexpect(result.action).toBe('allow');`,
        config,
      );
      expect(result).toBeNull();
    });
  });

  describe('enforcement level', () => {
    it('blocks when config says block', () => {
      config.rules.constitutional = { no_mocks: 'block' };
      const result = checkConstitutional(
        'tests/a.test.ts',
        'jest.mock("foo")',
        config,
      );
      expect(result).toContain('[BLOCK]');
    });

    it('advises when config says advise', () => {
      config.rules.constitutional = { no_mocks: 'advise' };
      const result = checkConstitutional(
        'tests/a.test.ts',
        'jest.mock("foo")',
        config,
      );
      expect(result).toContain('[ADVISE]');
    });

    it('silent when config says silent', () => {
      config.rules.constitutional = { no_mocks: 'silent' };
      const result = checkConstitutional(
        'tests/a.test.ts',
        'jest.mock("foo")',
        config,
      );
      expect(result).toBeNull();
    });
  });

  describe('evidence-only check', () => {
    it('detects "tests pass" claim without evidence', () => {
      config.rules.constitutional = { evidence_only: 'block' };
      const result = checkConstitutional(
        'COMMIT_MSG',
        'All tests pass. Ready to merge.',
        config,
      );
      expect(result).not.toBeNull();
      expect(result).toContain('evidence');
    });

    it('allows "tests pass" when backed by output', () => {
      config.rules.constitutional = { evidence_only: 'block' };
      const result = checkConstitutional(
        'COMMIT_MSG',
        `Tests pass:\n\n\`\`\`\n✓ tests/router/resolver.test.ts (3 tests)\nTests: 3 passed\n\`\`\``,
        config,
      );
      expect(result).toBeNull();
    });
  });
});
