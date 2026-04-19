import { describe, it, expect } from 'vitest';
import { handlePreToolUse } from '../../src/router/hook.js';
import { SessionCache } from '../../src/session/cache.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import { scoreResult, buildReport, parseResult, type EvalResult } from './score.js';
import type { Environment } from '../../src/types.js';

const MIN_OVERALL_SCORE = 0.7;

const NO_TOOLS_ENV: Environment = {
  rtkAvailable: false,
  rtkPath: null,
  jcodemunchAvailable: false,
  jcodemunchCwdIndexed: false,
  jcodemunchCwdRepo: null,
  jcodemunchKnownRepos: [],
  detectedAt: Date.now(),
};

interface SessionStateScenario {
  id: string;
  description: string;
  toolCall: { tool: string; args: Record<string, unknown> };
  cwd?: string;
  setupCache: (cache: SessionCache) => void;
  expected: { action: string; tool?: string };
}

const SESSION_STATE_SCENARIOS: SessionStateScenario[] = [
  {
    id: 'state_python_cached',
    description: 'pytest .py with Python env cached → rewrite to .venv',
    toolCall: { tool: 'Bash', args: { command: 'pytest tests/test_foo.py -v' } },
    cwd: '/project',
    setupCache: (cache) => {
      cache.setPythonEnv({ venvPath: '/project/.venv', uvAvailable: false, uvPath: null, detectedAt: Date.now() });
    },
    expected: { action: 'rewrite', tool: '/project/.venv/bin/pytest' },
  },
  {
    id: 'state_python_empty',
    description: 'pytest .py with no Python env cached → allow',
    toolCall: { tool: 'Bash', args: { command: 'pytest tests/test_foo.py -v' } },
    cwd: '/project',
    setupCache: () => { /* no python env */ },
    expected: { action: 'allow' },
  },
  {
    id: 'state_stale_env',
    description: 'cat with stale environment (5h old) → allow (env cleared, cat rule advises)',
    toolCall: { tool: 'Bash', args: { command: 'cat src/main.py' } },
    setupCache: (cache) => {
      cache.setEnvironment({
        rtkAvailable: false,
        rtkPath: null,
        jcodemunchAvailable: false,
        jcodemunchCwdIndexed: false,
        jcodemunchCwdRepo: null,
        jcodemunchKnownRepos: [],
        detectedAt: Date.now() - 5 * 60 * 60 * 1000,
      });
    },
    expected: { action: 'advise', tool: 'Read' },
  },
  {
    id: 'state_phase_tdd',
    description: 'pytest .py in tdd+ phase with Python env → still rewrites',
    toolCall: { tool: 'Bash', args: { command: 'pytest tests/test_foo.py -v' } },
    cwd: '/project',
    setupCache: (cache) => {
      cache.setPhase('tdd+');
      cache.setPythonEnv({ venvPath: '/project/.venv', uvAvailable: false, uvPath: null, detectedAt: Date.now() });
    },
    expected: { action: 'rewrite', tool: '/project/.venv/bin/pytest' },
  },
  {
    id: 'state_edited_files',
    description: 'cat with edited files tracked → still routes normally (advise)',
    toolCall: { tool: 'Bash', args: { command: 'cat src/router/resolver.ts' } },
    setupCache: (cache) => {
      cache.addEditedFile('src/router/resolver.ts', 'source');
    },
    expected: { action: 'advise', tool: 'Read' },
  },
];

describe('Context Eval: session state routing', () => {
  const results: EvalResult[] = [];

  for (const scenario of SESSION_STATE_SCENARIOS) {
    it(scenario.id, () => {
      const cache = new SessionCache();
      const config = structuredClone(DEFAULT_CONFIG);
      cache.setEnvironment(NO_TOOLS_ENV);
      scenario.setupCache(cache);

      const actual = handlePreToolUse(
        scenario.toolCall.tool,
        scenario.toolCall.args,
        cache,
        config,
        scenario.cwd,
        { existsCheck: (p) => p.startsWith('/project/.venv/bin/') },
      );

      const parsed = parseResult(actual);
      const score = scoreResult(scenario.expected as any, actual);
      const pass = score >= 0.5;

      results.push({
        scenarioId: scenario.id,
        environment: 'session_state',
        category: 'session_state',
        expected: scenario.expected as any,
        actual: parsed.action === 'allow' ? null : { action: parsed.action, tool: parsed.tool },
        score,
        pass,
      });

      if (!pass) {
        const expectedStr = `${scenario.expected.action}${scenario.expected.tool ? ` → ${scenario.expected.tool}` : ''}`;
        const actualStr = `${parsed.action}${parsed.tool ? ` → ${parsed.tool}` : ''}`;
        expect.fail(
          `Session state mismatch:\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}\n  Hook output: ${JSON.stringify(actual)}`,
        );
      }

      expect(pass).toBe(true);
    });
  }

  it('overall score meets minimum threshold', () => {
    const report = buildReport(results);
    expect(report.overallScore).toBeGreaterThanOrEqual(MIN_OVERALL_SCORE);
  });
});
