import { describe, it, expect } from 'vitest';
import { handlePreToolUse } from '../../src/router/hook.js';
import { SessionCache } from '../../src/session/cache.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import { ALL_SCENARIOS, ENV_PRESETS, mockRtkRewrite } from './scenarios.js';
import { scoreResult, buildReport, parseResult, type EvalResult } from './score.js';

const MIN_OVERALL_SCORE = 0.7;

describe('Context Eval: routing effectiveness', () => {
  const results: EvalResult[] = [];

  for (const scenario of ALL_SCENARIOS) {
    for (const preset of ENV_PRESETS) {
      const testId = `${scenario.id} [${preset.name}]`;

      it(testId, () => {
        const cache = new SessionCache();
        const config = structuredClone(DEFAULT_CONFIG);
        cache.setEnvironment(preset.env);

        const actual = handlePreToolUse(
          scenario.toolCall.tool,
          scenario.toolCall.args,
          cache,
          config,
          scenario.cwd,
          mockRtkRewrite,
        );

        const expected = scenario.expected[preset.name];
        const score = scoreResult(expected, actual);
        const pass = score >= 0.5;

        const parsed = parseResult(actual);

        results.push({
          scenarioId: scenario.id,
          environment: preset.name,
          category: scenario.category,
          expected,
          actual: parsed.action === 'allow' ? null : { action: parsed.action, tool: parsed.tool },
          score,
          pass,
        });

        if (!pass) {
          const expectedStr = `${expected.action}${expected.tool ? ` → ${expected.tool}` : ''}`;
          const actualStr = `${parsed.action}${parsed.tool ? ` → ${parsed.tool}` : ''}`;
          expect.fail(
            `Routing mismatch:\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}\n  Hook output: ${JSON.stringify(actual)}`,
          );
        }

        expect(pass).toBe(true);
      });
    }
  }

  it('overall score meets minimum threshold', () => {
    const report = buildReport(results);
    if (report.overallScore < MIN_OVERALL_SCORE) {
      console.error('\n=== Context Eval Report ===');
      console.error(`Overall score: ${report.overallScore.toFixed(2)} (minimum: ${MIN_OVERALL_SCORE})`);
      console.error(`Pass: ${report.passCount}/${report.totalCases}`);
      console.error('\nBy category:');
      for (const [cat, score] of Object.entries(report.byCategory)) {
        console.error(`  ${cat}: ${score.toFixed(2)}`);
      }
      console.error('\nBy environment:');
      for (const [env, score] of Object.entries(report.byEnvironment)) {
        console.error(`  ${env}: ${score.toFixed(2)}`);
      }
      if (report.failures.length > 0) {
        console.error('\nFailures:');
        for (const f of report.failures) {
          console.error(`  ${f.scenarioId} [${f.environment}]: expected ${f.expected}, got ${f.actual}`);
        }
      }
    }
    expect(report.overallScore).toBeGreaterThanOrEqual(MIN_OVERALL_SCORE);
  });
});
