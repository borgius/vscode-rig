# Worktree Promotion + Session Savings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add worktree suggestion at session start and a `/savings` skill that reports rtk/jcodemunch usage deltas per session.

**Architecture:** SessionStart hook gains a git-branch check for worktree promotion. It also captures an rtk gain baseline and initializes counters in SessionCache. PostToolUse hook increments counters. A new `/savings` skill computes the delta and prints a report.

**Tech Stack:** TypeScript, vitest, Node.js child_process

---

## File Structure

**New files:**
- `src/session/worktree.ts` — `checkWorktreeSuggestion(cwd, exec)` function
- `src/session/metrics.ts` — `captureMetricsBaseline(exec)`, `incrementMetric()`, `formatSavingsReport()`
- `templates/skills/savings/SKILL.md` — the `/savings` skill template
- `tests/session/worktree.test.ts` — worktree suggestion tests
- `tests/session/metrics.test.ts` — metrics capture/report tests

**Modified files:**
- `src/session/start.ts` — call worktree check + metrics baseline capture
- `src/session/cache.ts` — add metrics fields (baseline + counters)
- `src/types.ts` — add `MetricsBaseline` interface
- `src/cli/init.ts` — add `savings` to skill copy list

---

### Task 1: Add MetricsBaseline type and SessionCache fields

**Files:**
- Modify: `src/types.ts`
- Modify: `src/session/cache.ts`
- Test: `tests/session/cache.test.ts`

- [ ] **Step 1: Write failing test for metrics fields on SessionCache**

Add to `tests/session/cache.test.ts`:

```typescript
it('stores and retrieves metrics baseline', () => {
  const cache = new SessionCache();
  expect(cache.getMetricsBaseline()).toBeUndefined();
  cache.setMetricsBaseline({ totalSaved: 1000000, capturedAt: Date.now() });
  const baseline = cache.getMetricsBaseline();
  expect(baseline).toBeDefined();
  expect(baseline!.totalSaved).toBe(1000000);
});

it('stores and increments metric counters', () => {
  const cache = new SessionCache();
  expect(cache.getMetricCounters()).toEqual({ rtkCalls: 0, jmCalls: 0 });
  cache.incrementMetricCounter('rtkCalls');
  cache.incrementMetricCounter('rtkCalls');
  cache.incrementMetricCounter('jmCalls');
  expect(cache.getMetricCounters()).toEqual({ rtkCalls: 2, jmCalls: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/cache.test.ts`
Expected: FAIL — `getMetricsBaseline` is not a function

- [ ] **Step 3: Add MetricsBaseline to types.ts**

Add after the `Environment` interface in `src/types.ts`:

```typescript
export interface MetricsBaseline {
  totalSaved: number;
  capturedAt: number;
}
```

- [ ] **Step 4: Add metrics fields and methods to SessionCache**

Add to `src/session/cache.ts`:

Import `MetricsBaseline` at top. Add private fields after `currentPhase`:

```typescript
private metricsBaseline: MetricsBaseline | undefined;
private metricCounters = { rtkCalls: 0, jmCalls: 0 };
```

Add methods before `reset()`:

```typescript
getMetricsBaseline(): MetricsBaseline | undefined {
  return this.metricsBaseline;
}

setMetricsBaseline(baseline: MetricsBaseline): void {
  this.metricsBaseline = baseline;
}

getMetricCounters(): { rtkCalls: number; jmCalls: number } {
  return { ...this.metricCounters };
}

incrementMetricCounter(counter: 'rtkCalls' | 'jmCalls'): void {
  this.metricCounters[counter]++;
}
```

Update `reset()` to include:

```typescript
this.metricsBaseline = undefined;
this.metricCounters = { rtkCalls: 0, jmCalls: 0 };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/session/cache.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/session/cache.ts tests/session/cache.test.ts
git commit -m "feat: add MetricsBaseline type and SessionCache metrics fields"
```

---

### Task 2: Implement worktree suggestion

**Files:**
- Create: `src/session/worktree.ts`
- Test: `tests/session/worktree.test.ts`

- [ ] **Step 1: Write failing test for checkWorktreeSuggestion**

Create `tests/session/worktree.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkWorktreeSuggestion } from '../../src/session/worktree.js';

function makeExec(results: Record<string, string | Error>) {
  return (cmd: string): string => {
    const result = results[cmd];
    if (result instanceof Error) throw result;
    return result;
  };
}

describe('checkWorktreeSuggestion', () => {
  it('returns suggestion when on master', () => {
    const exec = makeExec({ 'git branch --show-current': 'master' });
    const result = checkWorktreeSuggestion('/some/project', exec);
    expect(result).toContain('master');
    expect(result).toContain('using-git-worktrees');
  });

  it('returns suggestion when on main', () => {
    const exec = makeExec({ 'git branch --show-current': 'main' });
    const result = checkWorktreeSuggestion('/some/project', exec);
    expect(result).toContain('main');
    expect(result).toContain('using-git-worktrees');
  });

  it('returns empty string for feature branch', () => {
    const exec = makeExec({ 'git branch --show-current': 'feat/my-feature' });
    const result = checkWorktreeSuggestion('/some/project', exec);
    expect(result).toBe('');
  });

  it('returns empty string when not a git repo', () => {
    const exec = makeExec({ 'git branch --show-current': new Error('not a git repo') });
    const result = checkWorktreeSuggestion('/some/project', exec);
    expect(result).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/worktree.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement checkWorktreeSuggestion**

Create `src/session/worktree.ts`:

```typescript
export type ExecFn = (cmd: string) => string;

const MAIN_BRANCHES = new Set(['master', 'main']);

export function checkWorktreeSuggestion(cwd: string, exec: ExecFn): string {
  try {
    const branch = exec('git branch --show-current').trim();
    if (MAIN_BRANCHES.has(branch)) {
      return `[rig] On ${branch} — consider /using-git-worktrees for isolated feature work.`;
    }
  } catch {
    // Not a git repo or git not available
  }
  return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session/worktree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/worktree.ts tests/session/worktree.test.ts
git commit -m "feat: add worktree suggestion check"
```

---

### Task 3: Wire worktree suggestion into session start

**Files:**
- Modify: `src/session/start.ts`
- Modify: `tests/session/start.test.ts`

- [ ] **Step 1: Write failing test for worktree suggestion in session output**

Add to `tests/session/start.test.ts`:

```typescript
it('includes worktree suggestion when on master', async () => {
  vi.mocked(execSync).mockImplementation((cmd: string) => {
    if (cmd === 'which rtk') throw new Error('not found');
    if (cmd === 'which jcodemunch') throw new Error('not found');
    if (cmd === 'git branch --show-current') return 'master';
    return '';
  });

  const output = await handleSessionStart('/home/user/test-project', cache);
  expect(output).toContain('using-git-worktrees');
});

it('omits worktree suggestion when on feature branch', async () => {
  vi.mocked(execSync).mockImplementation((cmd: string) => {
    if (cmd === 'which rtk') throw new Error('not found');
    if (cmd === 'which jcodemunch') throw new Error('not found');
    if (cmd === 'git branch --show-current') return 'feat/something';
    return '';
  });

  const output = await handleSessionStart('/home/user/test-project', cache);
  expect(output).not.toContain('using-git-worktrees');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/start.test.ts`
Expected: FAIL — output does not contain 'using-git-worktrees'

- [ ] **Step 3: Wire checkWorktreeSuggestion into handleSessionStart**

In `src/session/start.ts`, add import:

```typescript
import { checkWorktreeSuggestion } from './worktree.js';
```

Add at the end of `handleSessionStart()`, before the return:

```typescript
  const suggestion = checkWorktreeSuggestion(cwd, (cmd) => execSync(cmd, { encoding: 'utf-8' }));
  if (suggestion) {
    lines.push(suggestion);
  }

  return lines.join('\n');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session/start.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/start.ts tests/session/start.test.ts
git commit -m "feat: wire worktree suggestion into session start"
```

---

### Task 4: Implement metrics capture and report formatting

**Files:**
- Create: `src/session/metrics.ts`
- Test: `tests/session/metrics.test.ts`

- [ ] **Step 1: Write failing tests for metrics functions**

Create `tests/session/metrics.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { captureMetricsBaseline, incrementMetric, formatSavingsReport } from '../../src/session/metrics.js';
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

  it('shows "no savings" when delta is zero', () => {
    const baseline: MetricsBaseline = { totalSaved: 1000, capturedAt: Date.now() };
    const report = formatSavingsReport(baseline, 1000, { rtkCalls: 0, jmCalls: 0 });
    expect(report).toContain('no token savings');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/metrics.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement metrics.ts**

Create `src/session/metrics.ts`:

```typescript
import type { MetricsBaseline } from '../types.js';

export type ExecFn = (cmd: string) => string;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session/metrics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/metrics.ts tests/session/metrics.test.ts
git commit -m "feat: add metrics capture, increment, and report formatting"
```

---

### Task 5: Wire metrics into session start and PostToolUse

**Files:**
- Modify: `src/session/start.ts`
- Modify: `src/enforcement/post-tool-use.ts`

- [ ] **Step 1: Wire metrics baseline capture into session start**

In `src/session/start.ts`, add import:

```typescript
import { captureMetricsBaseline } from './metrics.js';
```

In `handleSessionStart()`, after `cache.setEnvironment(env);`, add:

```typescript
  const baseline = captureMetricsBaseline((cmd) => execSync(cmd, { encoding: 'utf-8' }));
  cache.setMetricsBaseline(baseline);
```

- [ ] **Step 2: Wire metric counter increment into PostToolUse**

In `src/enforcement/post-tool-use.ts`, add import:

```typescript
import { incrementMetric } from '../session/metrics.js';
```

At the start of `handlePostToolUse()`, add:

```typescript
  const metric = incrementMetric(toolName, toolInput);
  if (metric) {
    cache.incrementMetricCounter(metric);
  }
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/session/start.ts src/enforcement/post-tool-use.ts
git commit -m "feat: wire metrics capture into session start and post-tool-use"
```

---

### Task 6: Add /savings skill template and register with init

**Files:**
- Create: `templates/skills/savings/SKILL.md`
- Modify: `src/cli/init.ts`

- [ ] **Step 1: Create the /savings skill template**

Create `templates/skills/savings/SKILL.md`:

```markdown
---
name: savings
description: "Report rtk and jcodemunch token savings for the current session."
user-invocable: true
---

# savings — Session Savings Report

Report token savings from rtk and jcodemunch usage during this session.

## Procedure

1. Run `rtk gain --format json` to get current total savings
2. Use the session cache to retrieve the baseline captured at session start
3. Compute the delta: current - baseline
4. Retrieve the rtk call count and jcodemunch query count from session cache
5. Print the formatted report

## Output Format

```
[rig] Session Savings
  rtk: 1.2M saved (42 calls, +340K this session)
  jcodemunch: 28 queries
```

If no savings this session:

```
[rig] Session Savings
  rtk: no token savings this session
```
```

- [ ] **Step 2: Add savings to the skill copy list in init.ts**

In `src/cli/init.ts`, change the skillDirs array from:

```typescript
const skillDirs = ['brain-plus', 'plan-plus', 'tdd-plus', 'verify-plus', 'review-plus', 'verify-harness'];
```

to:

```typescript
const skillDirs = ['brain-plus', 'plan-plus', 'tdd-plus', 'verify-plus', 'review-plus', 'verify-harness', 'savings'];
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add templates/skills/savings/SKILL.md src/cli/init.ts
git commit -m "feat: add /savings skill template and register with init"
```

---

### Task 7: Build, re-init, verify end-to-end

**Files:** No code changes — verification only.

- [ ] **Step 1: Build and link**

Run: `npm run build && npm link`
Expected: Clean build, link succeeds

- [ ] **Step 2: Re-init in rig's own repo**

Run: `rig init`
Expected: Success

- [ ] **Step 3: Verify worktree suggestion appears when on master**

Run: `npx tsx .claude/hooks/scripts/session-start.ts 2>&1`
Expected: Output contains `[rig] On master` and `using-git-worktrees`

- [ ] **Step 4: Verify /savings skill template was installed**

Run: `cat .claude/skills/savings/SKILL.md | head -5`
Expected: Shows the skill frontmatter with name: savings

- [ ] **Step 5: Run full test suite one final time**

Run: `npm test`
Expected: All tests pass
