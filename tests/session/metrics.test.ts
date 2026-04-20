import { describe, it, expect } from 'vitest';
import {
  captureMetricsBaseline,
  captureGraphifyStats,
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

  it('detects graphify usage from MCP tool name', () => {
    const result = incrementMetric('mcp__graphify__query_graph', { query: 'find cycles' });
    expect(result).toBe('graphifyCalls');
  });

  it('detects graphify usage from any mcp__graphify__ prefix', () => {
    const result = incrementMetric('mcp__graphify__get_stats', {});
    expect(result).toBe('graphifyCalls');
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

  it('includes graphify stats line when stats are provided', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const graphifyStats = {
      nodes: 450,
      edges: 1200,
      communities: 8,
      extractedPct: 92,
      inferredPct: 6,
      ambiguousPct: 2,
    };
    const report = formatSavingsReport(
      baseline,
      1000,
      { rtkCalls: 0, jmCalls: 0, efficientCalls: 0, graphifyCalls: 5 },
      undefined,
      graphifyStats,
    );
    expect(report).toContain('graphify:');
    expect(report).toContain('450 nodes');
    expect(report).toContain('1200 edges');
    expect(report).toContain('8 communities');
    expect(report).toContain('92% EXTRACTED');
    expect(report).toContain('6% INFERRED');
    expect(report).toContain('2% AMBIGUOUS');
    expect(report).toContain('5 queries');
  });

  it('omits graphify line when stats are null', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const report = formatSavingsReport(
      baseline,
      1000,
      { rtkCalls: 0, jmCalls: 0, efficientCalls: 0, graphifyCalls: 0 },
      undefined,
      null,
    );
    expect(report).not.toContain('graphify');
  });

  it('omits graphify line when stats are undefined', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const report = formatSavingsReport(
      baseline,
      1000,
      { rtkCalls: 0, jmCalls: 0, efficientCalls: 0, graphifyCalls: 0 },
    );
    expect(report).not.toContain('graphify');
  });

  it('falls back to all-time format when baseline is null', () => {
    const report = formatSavingsReport(
      null,
      5955925,
      { rtkCalls: 13, jmCalls: 0, efficientCalls: 0, graphifyCalls: 0 },
    );
    expect(report).toContain('[rig] Session Savings (all-time)');
    expect(report).toContain('rtk:');
    expect(report).toContain('6.0M saved');
    expect(report).toContain('all-time');
  });

  it('falls back to all-time format when baseline is undefined', () => {
    const report = formatSavingsReport(
      undefined,
      5955925,
      { rtkCalls: 13, jmCalls: 0, efficientCalls: 0, graphifyCalls: 0 },
    );
    expect(report).toContain('[rig] Session Savings (all-time)');
    expect(report).toContain('rtk:');
  });

  it('shows jcodemunch all-time stats when baseline is null and no session calls', () => {
    const jmStats = { session_tokens_saved: 0, session_calls: 0, total_tokens_saved: 181819680 };
    const report = formatSavingsReport(
      null,
      5955925,
      { rtkCalls: 13, jmCalls: 0, efficientCalls: 0, graphifyCalls: 0 },
      jmStats,
    );
    expect(report).toContain('jcodemunch:');
    expect(report).toContain('181.8M saved all-time');
    expect(report).toContain('no queries this session');
  });

  it('shows graphify stats in all-time format', () => {
    const graphifyStats = {
      nodes: 261,
      edges: 460,
      communities: 21,
      extractedPct: 90,
      inferredPct: 10,
      ambiguousPct: 0,
    };
    const report = formatSavingsReport(
      null,
      5955925,
      { rtkCalls: 13, jmCalls: 0, efficientCalls: 0, graphifyCalls: 0 },
      undefined,
      graphifyStats,
    );
    expect(report).toContain('graphify:');
    expect(report).toContain('261 nodes');
    expect(report).toContain('460 edges');
    expect(report).toContain('21 communities');
    expect(report).toContain('90% EXTRACTED');
  });

  it('shows all tools in all-time format', () => {
    const jmStats = { session_tokens_saved: 0, session_calls: 0, total_tokens_saved: 50000000 };
    const graphifyStats = {
      nodes: 100,
      edges: 200,
      communities: 5,
      extractedPct: 80,
      inferredPct: 20,
      ambiguousPct: 0,
    };
    const report = formatSavingsReport(
      null,
      5955925,
      { rtkCalls: 13, jmCalls: 0, efficientCalls: 14, graphifyCalls: 3 },
      jmStats,
      graphifyStats,
    );
    expect(report).toContain('[rig] Session Savings (all-time)');
    expect(report).toContain('rtk:');
    expect(report).toContain('jcodemunch:');
    expect(report).toContain('graphify:');
    expect(report).toContain('efficient tools:');
  });

  it('handles null baseline with zero rtk savings', () => {
    const report = formatSavingsReport(
      null,
      0,
      { rtkCalls: 0, jmCalls: 0, efficientCalls: 0, graphifyCalls: 0 },
    );
    expect(report).toContain('[rig] Session Savings (all-time)');
    expect(report).toContain('rtk: no data');
  });
});

describe('captureGraphifyStats', () => {
  it('returns null when graph.json not available (exec throws)', () => {
    const exec = makeExec({
      'cat "/project/graphify-out/graph.json"': new Error('no such file'),
    });
    const result = captureGraphifyStats('/project', exec);
    expect(result).toBeNull();
  });

  it('parses valid graph.json into correct shape', () => {
    const graphData = {
      nodes: [
        { id: 'n1', label: 'ModuleA', community: 1 },
        { id: 'n2', label: 'ModuleB', community: 1 },
        { id: 'n3', label: 'ModuleC', community: 2 },
      ],
      links: [
        { source: 'n1', target: 'n2', relation: 'imports', confidence: 'EXTRACTED' },
        { source: 'n1', target: 'n3', relation: 'calls', confidence: 'INFERRED' },
        { source: 'n2', target: 'n3', relation: 'uses', confidence: 'AMBIGUOUS' },
      ],
    };
    const exec = makeExec({
      'cat "/project/graphify-out/graph.json"': JSON.stringify(graphData),
    });
    const result = captureGraphifyStats('/project', exec);
    expect(result).toEqual({
      nodes: 3,
      edges: 3,
      communities: 2,
      extractedPct: 33,
      inferredPct: 33,
      ambiguousPct: 33,
    });
  });

  it('handles malformed JSON gracefully (returns null)', () => {
    const exec = makeExec({
      'cat "/project/graphify-out/graph.json"': 'not valid json {{{',
    });
    const result = captureGraphifyStats('/project', exec);
    expect(result).toBeNull();
  });

  it('handles empty graph (zero nodes and edges)', () => {
    const graphData = { nodes: [], links: [] };
    const exec = makeExec({
      'cat "/project/graphify-out/graph.json"': JSON.stringify(graphData),
    });
    const result = captureGraphifyStats('/project', exec);
    expect(result).toEqual({
      nodes: 0,
      edges: 0,
      communities: 0,
      extractedPct: 0,
      inferredPct: 0,
      ambiguousPct: 0,
    });
  });

  it('treats links without confidence as EXTRACTED', () => {
    const graphData = {
      nodes: [{ id: 'n1' }, { id: 'n2' }],
      links: [{ source: 'n1', target: 'n2' }],
    };
    const exec = makeExec({
      'cat "/project/graphify-out/graph.json"': JSON.stringify(graphData),
    });
    const result = captureGraphifyStats('/project', exec);
    expect(result).toEqual({
      nodes: 2,
      edges: 1,
      communities: 0,
      extractedPct: 100,
      inferredPct: 0,
      ambiguousPct: 0,
    });
  });
});
