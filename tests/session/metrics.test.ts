import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  captureMetricsBaseline,
  incrementMetric,
  formatSavingsReport,
  writeSessionMetrics,
  readSessionMetrics,
  incrementSessionCounter,
  sessionFilePath,
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
    const result = incrementMetric('Read', { file_path: '/some/file.ts' });
    expect(result).toBeNull();
  });

  it('returns null for Bash without rtk', () => {
    const result = incrementMetric('Bash', { command: 'ls -la' });
    expect(result).toBeNull();
  });
});

describe('formatSavingsReport', () => {
  it('formats report with token delta and call counts', () => {
    const baseline: MetricsBaseline = { totalSaved: 5000000, capturedAt: Date.now() - 3600000 };
    const currentSaved = 5340000;
    const counters = { rtkCalls: 42, jmCalls: 28 };

    const report = formatSavingsReport(baseline, currentSaved, counters);
    expect(report).toContain('[rig] Session Savings');
    expect(report).toContain('rtk:');
    expect(report).toContain('340K');
    expect(report).toContain('42 calls');
    expect(report).toContain('jcodemunch:');
    expect(report).toContain('28 queries');
  });

  it('shows no savings when delta is zero', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const report = formatSavingsReport(baseline, 1000, { rtkCalls: 0, jmCalls: 0 });
    expect(report).toContain('no token savings');
  });
});

describe('session file persistence', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `rig-metrics-test-${Date.now()}`);
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('writes and reads session metrics', () => {
    const baseline: MetricsBaseline = { totalSaved: 5000000, capturedAt: Date.now() };
    writeSessionMetrics(testDir, { baseline, counters: { rtkCalls: 3, jmCalls: 7 } });

    const data = readSessionMetrics(testDir);
    expect(data).not.toBeNull();
    expect(data!.baseline.totalSaved).toBe(5000000);
    expect(data!.counters.rtkCalls).toBe(3);
    expect(data!.counters.jmCalls).toBe(7);
  });

  it('returns null when file does not exist', () => {
    expect(readSessionMetrics(testDir)).toBeNull();
  });

  it('increments session counters', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    writeSessionMetrics(testDir, { baseline, counters: { rtkCalls: 0, jmCalls: 0 } });

    incrementSessionCounter(testDir, 'rtkCalls');
    incrementSessionCounter(testDir, 'rtkCalls');
    incrementSessionCounter(testDir, 'jmCalls');

    const data = readSessionMetrics(testDir);
    expect(data!.counters.rtkCalls).toBe(2);
    expect(data!.counters.jmCalls).toBe(1);
  });

  it('creates file on first increment if missing', () => {
    incrementSessionCounter(testDir, 'rtkCalls');

    const data = readSessionMetrics(testDir);
    expect(data).not.toBeNull();
    expect(data!.counters.rtkCalls).toBe(1);
    expect(data!.counters.jmCalls).toBe(0);
  });
});
