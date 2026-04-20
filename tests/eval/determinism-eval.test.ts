import { describe, it, expect } from 'vitest';
import { handlePreToolUse } from '../../src/router/hook.js';
import { handlePostToolUse } from '../../src/enforcement/post-tool-use.js';
import { SessionCache } from '../../src/session/cache.js';
import { FileTracker } from '../../src/enforcement/file-tracker.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import { ENV_PRESETS, PYTHON_ENV_PRESETS, mockRtkRewrite } from './scenarios.js';

/**
 * Determinism eval: run the same input twice, assert identical output.
 * Verifies that the toolkit produces the same result given the same input state.
 */

interface DeterminismCase {
  id: string;
  category: string;
  run: () => unknown; // returns hook result
  serialize: (result: unknown) => string;
}

const FULL_ENV = ENV_PRESETS[0].env;

const CASES: DeterminismCase[] = [
  {
    id: 'determinism_grep_rtk',
    category: 'routing',
    run: () => {
      const cache = new SessionCache();
      cache.setEnvironment(FULL_ENV);
      return handlePreToolUse('Bash', { command: 'grep -r "TODO" src/' }, cache, DEFAULT_CONFIG, undefined, mockRtkRewrite);
    },
    serialize: (r) => JSON.stringify(r),
  },
  {
    id: 'determinism_read_jm',
    category: 'routing',
    run: () => {
      const cache = new SessionCache();
      cache.setEnvironment(FULL_ENV);
      return handlePreToolUse('Read', { file_path: '/project/src/types.ts' }, cache, DEFAULT_CONFIG);
    },
    serialize: (r) => JSON.stringify(r),
  },
  {
    id: 'determinism_sed_block',
    category: 'routing',
    run: () => {
      const cache = new SessionCache();
      cache.setEnvironment(FULL_ENV);
      return handlePreToolUse('Bash', { command: "sed -i 's/old/new/g' file.ts" }, cache, DEFAULT_CONFIG);
    },
    serialize: (r) => JSON.stringify(r),
  },
  {
    id: 'determinism_python_venv',
    category: 'python',
    run: () => {
      const cache = new SessionCache();
      cache.setEnvironment({ rtkAvailable: false, rtkPath: null, jcodemunchAvailable: false, jcodemunchCwdIndexed: false, jcodemunchCwdRepo: null, jcodemunchKnownRepos: [], graphifyAvailable: false, graphifyGraphPath: null, detectedAt: Date.now() });
      cache.setPythonEnv({ venvPath: '/project/.venv', uvAvailable: false, uvPath: null, detectedAt: Date.now() });
      return handlePreToolUse('Bash', { command: 'pytest tests/test_foo.py -v' }, cache, DEFAULT_CONFIG, '/project', { existsCheck: (p) => p.startsWith('/project/.venv/bin/') });
    },
    serialize: (r) => JSON.stringify(r),
  },
  {
    id: 'determinism_enforcement_mock',
    category: 'enforcement',
    run: () => {
      const cache = new SessionCache();
      const tracker = new FileTracker();
      return handlePostToolUse('Edit', { file_path: '/project/tests/stack/api.stack.test.ts', new_string: 'vi.mock("../src/api")' }, tracker, cache, DEFAULT_CONFIG);
    },
    serialize: (r) => JSON.stringify(r),
  },
  {
    id: 'determinism_enforcement_stale',
    category: 'enforcement',
    run: () => {
      const cache = new SessionCache();
      const tracker = new FileTracker();
      tracker.recordEdit('/project/src/utils/helpers.ts');
      tracker.nextTurn();
      return handlePostToolUse('Edit', { file_path: '/project/src/utils/format.ts', new_string: 'export function fmt() {}' }, tracker, cache, DEFAULT_CONFIG);
    },
    serialize: (r) => JSON.stringify(r),
  },
];

describe('Context Eval: determinism (idempotency)', () => {
  for (const c of CASES) {
    it(`${c.id} produces identical output on repeated runs`, () => {
      const result1 = c.run();
      const result2 = c.run();
      const serialized1 = c.serialize(result1);
      const serialized2 = c.serialize(result2);
      expect(serialized1).toBe(serialized2);
    });
  }
});
