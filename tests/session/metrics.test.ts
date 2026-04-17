import { describe, it, expect } from 'vitest';
import {
  captureMetricsBaseline,
  incrementMetric,
  formatSavingsReport,
} from '../../src/session/metrics.js';
import type { MetricsBaseline } from '../../src/types.js';

function makeExec(results: Record<string, string | Error>) {
  return (cmd: string): string => {
    const result = results[cmd];
    if (result instanceof Error) throw result;
    return result;
  };
}

describe('captureMetricsBaseline', () => {
  it('parses rtk gain JSON output', () => {
    const exec = makeExec({
      'rtk gain --format json': JSON.stringify({ summary: { total_saved: 5000000 } }),
    });
    const baseline = captureMetricsBaseline(exec);
    expect(baseline).toEqual({ totalSaved: 5000000, capturedAt: expect.any(Number) });
  });

  it('returns zero baseline when rtk not available', () => {
    const exec = makeExec({
      'rtk gain --format json': new Error('not found'),
    });
    const baseline = captureMetricsBaseline(exec);
    expect(baseline).toEqual({ totalSaved: 0, capturedAt: expect.any(Number) });
  });

  it('returns zero baseline when JSON is malformed', () => {
    const exec = makeExec({
      'rtk gain --format json': 'not json',
    });
    const baseline = captureMetricsBaseline(exec);
    expect(baseline).toEqual({ totalSaved: 0, capturedAt: expect.any(Number) });
  });
});

describe('incrementMetric', () => {
  it('detects rtk usage from Bash tool with rtk command', () => {
    const result = incrementMetric('Bash', { command: 'rtk git status' });
    expect(result).toBe('rtkCalls');
  });

  it('detects rtk usage from Bash tool with rtk in piped command', () => {
    const result = incrementMetric('Bash', { command: 'something | rtk gain --format json' });
    expect(result).toBe('rtkCalls');
  });

  it('detects jcodemunch usage from MCP tool name', () => {
    const result = incrementMetric('mcp__jcodemunch__search_symbols', { query: 'test' });
    expect(result).toBe('jmCalls');
  });

  it('returns null for unrelated tools', () => {
    const result = incrementMetric('Edit', { file_path: '/some/file.txt' });
    expect(result).toBeNull();
  });

  it('returns null for Bash without rtk', () => {
    const result = incrementMetric('Bash', { command: 'ls -la' });
    expect(result).toBeNull();
  });

  it('detects efficient Read on code files', () => {
    const result = incrementMetric('Read', { file_path: '/src/router/resolver.ts' });
    expect(result).toBe('efficientCalls');
  });

  it('detects efficient Grep on code patterns', () => {
    const result = incrementMetric('Grep', { pattern: 'classifyIntent' });
    expect(result).toBe('efficientCalls');
  });

  it('detects efficient Glob on code patterns', () => {
    const result = incrementMetric('Glob', { pattern: '**/*.test.ts' });
    expect(result).toBe('efficientCalls');
  });

  it('returns null for Read on non-code files', () => {
    const result = incrementMetric('Read', { file_path: '/package.json' });
    expect(result).toBeNull();
  });
});

describe('formatSavingsReport', () => {
  it('formats report with token delta, call counts, and jcodemunch stats', () => {
    const baseline: MetricsBaseline = { totalSaved: 5000000, capturedAt: Date.now() - 3600000 };
    const currentSaved = 5340000;
    const counters = { rtkCalls: 42, jmCalls: 0, efficientCalls: 0 };
    const jmStats = { session_tokens_saved: 85000, session_calls: 23, total_tokens_saved: 150000000 };

    const report = formatSavingsReport(baseline, currentSaved, counters, jmStats);
    expect(report).toContain('[rig] Session Savings');
    expect(report).toContain('rtk:');
    expect(report).toContain('340K');
    expect(report).toContain('42 calls');
    expect(report).toContain('jcodemunch:');
    expect(report).toContain('85K saved');
    expect(report).toContain('23 queries');
    expect(report).toContain('150.0M total all-time');
  });

  it('shows no savings when delta is zero', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const report = formatSavingsReport(baseline, 1000, { rtkCalls: 0, jmCalls: 0, efficientCalls: 0 });
    expect(report).toContain('no token savings');
  });

  it('shows jcodemunch available with no queries', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const jmStats = { session_tokens_saved: 0, session_calls: 0 };
    const report = formatSavingsReport(baseline, 1000, { rtkCalls: 0, jmCalls: 0, efficientCalls: 0 }, jmStats);
    expect(report).toContain('jcodemunch');
    expect(report).toContain('no queries this session');
  });

  it('omits jcodemunch line when stats not provided', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const report = formatSavingsReport(baseline, 1000, { rtkCalls: 0, jmCalls: 0, efficientCalls: 0 });
    expect(report).not.toContain('jcodemunch');
  });

  it('omits jcodemunch line when stats are null', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const report = formatSavingsReport(baseline, 1000, { rtkCalls: 0, jmCalls: 0, efficientCalls: 0 }, null);
    expect(report).not.toContain('jcodemunch');
  });
});
