import type { ExpectedOutcome } from './scenarios.js';

export interface EvalResult {
  scenarioId: string;
  environment: string;
  category: string;
  expected: ExpectedOutcome;
  actual: { action: string; tool?: string } | null; // null = hook returned null (allow)
  score: number;
  pass: boolean;
}

export interface EvalReport {
  overallScore: number;
  totalCases: number;
  passCount: number;
  byCategory: Record<string, number>;
  byEnvironment: Record<string, number>;
  failures: Array<{
    scenarioId: string;
    environment: string;
    expected: string;
    actual: string;
  }>;
}

/**
 * Score a single routing result against the expected outcome.
 *
 * 1.0 = exact match (action + tool both correct)
 * 0.5 = partial match (action correct, tool missing/wrong)
 * 0.0 = miss (action wrong, or expected routing but got nothing)
 */
export function scoreResult(
  expected: ExpectedOutcome,
  actual: string | null,
): number {
  const actualAction = parseAction(actual);
  const actualTool = parseTool(actual);

  if (expected.action === 'allow') {
    return actual === null ? 1.0 : 0.0;
  }

  // Expected advise or block — hook must return a string
  if (actual === null) return 0.0;

  const actionMatch = actualAction === expected.action;

  if (!expected.tool) {
    // No specific tool expected — just check action
    return actionMatch ? 1.0 : 0.0;
  }

  const toolMatch = actualTool.includes(expected.tool.toLowerCase());

  if (actionMatch && toolMatch) return 1.0;
  if (actionMatch) return 0.5;
  return 0.0;
}

/** Parse the action (advise/block) from hook output. */
function parseAction(output: string | null): string {
  if (!output) return 'allow';
  if (output.includes('[BLOCK]')) return 'block';
  if (output.includes('[ADVISE]')) return 'advise';
  return 'unknown';
}

/** Parse the recommended tool from hook output. */
function parseTool(output: string | null): string {
  if (!output) return '';
  const match = output.match(/advise: use (.+?) —/i) ?? output.match(/advise: use (\S+)/i);
  return match ? match[1].trim().toLowerCase() : '';
}

/** Build a report from all eval results. */
export function buildReport(results: EvalResult[]): EvalReport {
  const totalCases = results.length;
  const passCount = results.filter(r => r.pass).length;
  const overallScore = totalCases > 0 ? results.reduce((sum, r) => sum + r.score, 0) / totalCases : 0;

  const byCategory: Record<string, number> = {};
  const byEnvironment: Record<string, number> = {};

  for (const r of results) {
    const catResults = results.filter(x => x.category === r.category);
    byCategory[r.category] = catResults.reduce((s, x) => s + x.score, 0) / catResults.length;

    const envResults = results.filter(x => x.environment === r.environment);
    byEnvironment[r.environment] = envResults.reduce((s, x) => s + x.score, 0) / envResults.length;
  }

  const failures = results
    .filter(r => !r.pass)
    .map(r => ({
      scenarioId: r.scenarioId,
      environment: r.environment,
      expected: `${r.expected.action}${r.expected.tool ? ` → ${r.expected.tool}` : ''}`,
      actual: r.actual
        ? `${r.actual.action}${r.actual.tool ? ` → ${r.actual.tool}` : ''}`
        : 'allow (no routing)',
    }));

  return { overallScore, totalCases, passCount, byCategory, byEnvironment, failures };
}
