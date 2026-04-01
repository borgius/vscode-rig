import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MetricsBaseline } from '../types.js';

export type ExecFn = (cmd: string) => string;

export interface SessionMetricsFile {
  baseline: MetricsBaseline;
  counters: { rtkCalls: number; jmCalls: number };
}

const SESSION_FILE = '.rig-session.json';

export function sessionFilePath(cwd: string): string {
  return join(cwd, SESSION_FILE);
}

export function writeSessionMetrics(cwd: string, data: SessionMetricsFile): void {
  try {
    mkdirSync(cwd, { recursive: true });
    writeFileSync(sessionFilePath(cwd), JSON.stringify(data, null, 2) + '\n', 'utf-8');
  } catch {
    // Writing session metrics is best-effort; don't fail hooks if dir is unwritable
  }
}

export function readSessionMetrics(cwd: string): SessionMetricsFile | null {
  try {
    const raw = readFileSync(sessionFilePath(cwd), 'utf-8');
    return JSON.parse(raw) as SessionMetricsFile;
  } catch {
    return null;
  }
}

export function captureMetricsBaseline(exec: ExecFn): MetricsBaseline {
  try {
    const raw = exec('rtk gain --format json');
    const parsed = JSON.parse(raw);
    const totalSaved = parsed?.summary?.total_saved ?? 0;
    return { totalSaved, capturedAt: Date.now() };
  } catch {
    return { totalSaved: 0, capturedAt: Date.now() };
  }
}

export function incrementMetric(
  toolName: string,
  toolInput: Record<string, unknown>,
): 'rtkCalls' | 'jmCalls' | null {
  if (toolName === 'Bash' && typeof toolInput.command === 'string') {
    if (/\brtk\b/.test(toolInput.command)) {
      return 'rtkCalls';
    }
  }
  if (toolName.startsWith('mcp__jcodemunch__')) {
    return 'jmCalls';
  }
  return null;
}

export function incrementSessionCounter(
  cwd: string,
  counter: 'rtkCalls' | 'jmCalls',
): void {
  const data = readSessionMetrics(cwd) ?? {
    baseline: { totalSaved: 0, capturedAt: Date.now() },
    counters: { rtkCalls: 0, jmCalls: 0 },
  };
  data.counters[counter]++;
  writeSessionMetrics(cwd, data);
}

export function formatSavingsReport(
  baseline: MetricsBaseline,
  currentSaved: number,
  counters: { rtkCalls: number; jmCalls: number },
): string {
  const delta = currentSaved - baseline.totalSaved;
  const lines: string[] = ['[rig] Session Savings'];

  if (delta > 0 || counters.rtkCalls > 0) {
    const deltaStr = formatTokens(delta);
    const totalStr = formatTokens(currentSaved);
    lines.push(`  rtk: ${totalStr} saved (${counters.rtkCalls} calls, +${deltaStr} this session)`);
  } else {
    lines.push(`  rtk: no token savings this session`);
  }

  if (counters.jmCalls > 0) {
    lines.push(`  jcodemunch: ${counters.jmCalls} queries`);
  }

  return lines.join('\n');
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}
