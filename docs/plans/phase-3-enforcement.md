# Phase 3: Enforcement - Stale Tests, Test Scope, Constitutional, Zero-Defect

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PostToolUse enforcement hooks that detect stale tests, enforce test scope
during iterative fix cycles, flag missing tests after source edits, enforce constitutional
rules, and implement zero-defect tolerance.

**Architecture:** PostToolUse hooks fire after Edit, Write, and Bash (test runs) tool calls.
Each hook reads the session cache for phase state and edited file tracking, then produces
allow/advise/block output. Hooks are composable — each enforcement concern is a separate
function that can be enabled/disabled via `.harness.yaml`.

**Tech Stack:** TypeScript, vitest

**Depends on:** Phase 1 (types, config, session cache), Phase 2 (intent classification)

---

## File Structure

```
src/
  enforcement/
    stale-test.ts             # Detect source edits without corresponding test edits
    test-scope.ts             # Redirect full-suite runs during tdd+ phase
    constitutional.ts         # Enforce no-mock, evidence-only rules
    zero-defect.ts            # Parse test output for failures/warnings
    file-tracker.ts           # Track source vs test file edits
    post-tool-use.ts          # PostToolUse hook entry point (composes all checks)
tests/
  enforcement/
    stale-test.test.ts
    test-scope.test.ts
    constitutional.test.ts
    zero-defect.test.ts
    file-tracker.test.ts
    post-tool-use.test.ts
```

---

### Task 1: File Tracker - Source vs Test Edit Tracking

**Files:**

- Create: `src/enforcement/file-tracker.ts`
- Create: `tests/enforcement/file-tracker.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/enforcement/file-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FileTracker } from '../../src/enforcement/file-tracker.js';

describe('FileTracker', () => {
  let tracker: FileTracker;

  beforeEach(() => {
    tracker = new FileTracker();
  });

  describe('classifyFile', () => {
    it('classifies .test.ts files as test', () => {
      expect(tracker.classifyFile('tests/router/resolver.test.ts')).toBe('test');
      expect(tracker.classifyFile('src/__tests__/hook.test.ts')).toBe('test');
      expect(tracker.classifyFile('foo.spec.ts')).toBe('test');
      expect(tracker.classifyFile('bar.test.js')).toBe('test');
    });

    it('classifies .test.py files as test', () => {
      expect(tracker.classifyFile('tests/test_resolver.py')).toBe('test');
      expect(tracker.classifyFile('tests/conftest.py')).toBe('test');
    });

    it('classifies source files as source', () => {
      expect(tracker.classifyFile('src/router/resolver.ts')).toBe('source');
      expect(tracker.classifyFile('src/config.py')).toBe('source');
      expect(tracker.classifyFile('lib/index.js')).toBe('source');
    });

    it('classifies fixture files as other', () => {
      expect(tracker.classifyFile('fixtures/test-data.yaml')).toBe('other');
      expect(tracker.classifyFile('docs/plans/phase-1.md')).toBe('other');
    });

    it('classifies test utility files as test', () => {
      expect(tracker.classifyFile('tests/helpers/mock-server.ts')).toBe('test');
      expect(tracker.classifyFile('test/utils/conftest.py')).toBe('test');
    });
  });

  describe('recordEdit', () => {
    it('records source file edits', () => {
      tracker.recordEdit('src/router/resolver.ts');
      expect(tracker.getSourceEdits()).toEqual([
        { file: 'src/router/resolver.ts', turn: 0 },
      ]);
    });

    it('records test file edits', () => {
      tracker.recordEdit('tests/router/resolver.test.ts');
      expect(tracker.getTestEdits()).toEqual([
        { file: 'tests/router/resolver.test.ts', turn: 0 },
      ]);
    });

    it('increments turn counter', () => {
      tracker.recordEdit('src/a.ts');
      tracker.nextTurn();
      tracker.recordEdit('src/b.ts');
      expect(tracker.getSourceEdits()).toEqual([
        { file: 'src/a.ts', turn: 0 },
        { file: 'src/b.ts', turn: 1 },
      ]);
    });
  });

  describe('getStaleSources', () => {
    it('returns source files edited without corresponding test edits', () => {
      tracker.recordEdit('src/router/resolver.ts');
      tracker.recordEdit('src/router/rules.ts');
      tracker.recordEdit('tests/router/resolver.test.ts');
      // resolver.ts has a test, rules.ts does not
      const stale = tracker.getStaleSources();
      expect(stale.map(s => s.file)).toContain('src/router/rules.ts');
      expect(stale.map(s => s.file)).not.toContain('src/router/resolver.ts');
    });

    it('matches source to test by name convention', () => {
      tracker.recordEdit('src/enforcement/zero-defect.ts');
      tracker.recordEdit('tests/enforcement/zero-defect.test.ts');
      const stale = tracker.getStaleSources();
      expect(stale.map(s => s.file)).not.toContain('src/enforcement/zero-defect.ts');
    });

    it('matches source to test by path component', () => {
      tracker.recordEdit('src/router/hook.ts');
      tracker.recordEdit('tests/router/hook.test.ts');
      const stale = tracker.getStaleSources();
      expect(stale).toEqual([]);
    });

    it('returns empty when no source edits', () => {
      tracker.recordEdit('tests/some.test.ts');
      const stale = tracker.getStaleSources();
      expect(stale).toEqual([]);
    });

    it('respects grace period', () => {
      tracker.recordEdit('src/router/resolver.ts');
      tracker.nextTurn();
      // Within grace period of 1 turn — not stale yet
      const staleGrace = tracker.getStaleSources(1);
      expect(staleGrace).toEqual([]);
      // With grace period 0 — immediately stale
      const staleNo = tracker.getStaleSources(0);
      expect(staleNo.map(s => s.file)).toContain('src/router/resolver.ts');
    });
  });

  describe('reset', () => {
    it('clears all tracked edits', () => {
      tracker.recordEdit('src/a.ts');
      tracker.recordEdit('tests/b.test.ts');
      tracker.reset();
      expect(tracker.getSourceEdits()).toEqual([]);
      expect(tracker.getTestEdits()).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/enforcement/file-tracker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the file tracker**

Create `src/enforcement/file-tracker.ts`:

```typescript
interface FileEdit {
  file: string;
  turn: number;
}

const TEST_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\/tests?\//,
  /\/__tests__\//,
  /\/test_\w+\.py$/,
  /\/conftest\.py$/,
];

const FIXTURE_PATTERNS = [
  /\/fixtures?\//,
  /\/docs?\//,
  /\.md$/,
  /\.ya?ml$/,
  /\.json$/,
];

export class FileTracker {
  private sourceEdits: FileEdit[] = [];
  private testEdits: FileEdit[] = [];
  private turn = 0;

  classifyFile(filePath: string): 'source' | 'test' | 'other' {
    if (FIXTURE_PATTERNS.some(p => p.test(filePath))) return 'other';
    if (TEST_PATTERNS.some(p => p.test(filePath))) return 'test';
    return 'source';
  }

  recordEdit(filePath: string): void {
    const category = this.classifyFile(filePath);
    const entry: FileEdit = { file: filePath, turn: this.turn };
    if (category === 'test') {
      this.testEdits.push(entry);
    } else if (category === 'source') {
      this.sourceEdits.push(entry);
    }
  }

  nextTurn(): void {
    this.turn++;
  }

  getSourceEdits(): FileEdit[] {
    return [...this.sourceEdits];
  }

  getTestEdits(): FileEdit[] {
    return [...this.testEdits];
  }

  /**
   * Return source files that were edited without a corresponding test file edit.
   * A source file is "covered" if a test file exists with a matching name component.
   */
  getStaleSources(gracePeriod: number = 0): FileEdit[] {
    const currentTurn = this.turn;
    const testBaseNames = new Set(
      this.testEdits.map(e => extractBaseName(e.file)),
    );

    return this.sourceEdits.filter(edit => {
      // Within grace period — not stale yet
      if (currentTurn - edit.turn < gracePeriod + 1) return false;

      const baseName = extractBaseName(edit.file);
      // Check if any test edit covers this source file
      return !testBaseNames.has(baseName);
    });
  }

  reset(): void {
    this.sourceEdits = [];
    this.testEdits = [];
    this.turn = 0;
  }
}

/**
 * Extract the meaningful base name from a file path for matching.
 * src/router/resolver.ts → resolver
 * tests/router/resolver.test.ts → resolver
 */
function extractBaseName(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? '';
  // Remove all extensions and test markers
  return fileName.replace(/\.test$/, '').replace(/\.spec$/, '').replace(/\.[tj]sx?$/, '').replace(/\.py$/, '').replace(/\.test$/, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/enforcement/file-tracker.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/enforcement/file-tracker.ts tests/enforcement/file-tracker.test.ts
git commit -m "feat: add file tracker for source vs test edit detection"
```

---

### Task 2: Stale Test Detection

**Files:**

- Create: `src/enforcement/stale-test.ts`
- Create: `tests/enforcement/stale-test.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/enforcement/stale-test.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { checkStaleTests } from '../../src/enforcement/stale-test.js';
import { FileTracker } from '../../src/enforcement/file-tracker.js';
import type { HarnessConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

describe('checkStaleTests', () => {
  let tracker: FileTracker;
  let config: HarnessConfig;

  beforeEach(() => {
    tracker = new FileTracker();
    config = structuredClone(DEFAULT_CONFIG);
  });

  it('returns null when no stale sources', () => {
    tracker.recordEdit('src/router/resolver.ts');
    tracker.recordEdit('tests/router/resolver.test.ts');
    const result = checkStaleTests(tracker, config);
    expect(result).toBeNull();
  });

  it('returns warning when source edited without test', () => {
    tracker.recordEdit('src/router/resolver.ts');
    tracker.recordEdit('src/router/rules.ts');
    tracker.recordEdit('tests/router/resolver.test.ts');
    const result = checkStaleTests(tracker, config);
    expect(result).not.toBeNull();
    expect(result).toContain('STALE TEST WARNING');
    expect(result).toContain('src/router/rules.ts');
    expect(result).not.toContain('src/router/resolver.ts');
  });

  it('includes enforcement level from config', () => {
    config.rules.stale_tests = { enforcement: 'block', grace_period: 0 };
    tracker.recordEdit('src/router/rules.ts');
    const result = checkStaleTests(tracker, config);
    expect(result).toContain('[BLOCK]');
  });

  it('shows advise level by default', () => {
    tracker.recordEdit('src/router/rules.ts');
    const result = checkStaleTests(tracker, config);
    expect(result).toContain('[ADVISE]');
  });

  it('respects grace period from config', () => {
    config.rules.stale_tests = { enforcement: 'advise', grace_period: 2 };
    tracker.recordEdit('src/router/rules.ts');
    // Same turn — within grace
    const result = checkStaleTests(tracker, config);
    expect(result).toBeNull();
  });

  it('fires after grace period expires', () => {
    config.rules.stale_tests = { enforcement: 'advise', grace_period: 1 };
    tracker.recordEdit('src/router/rules.ts');
    tracker.nextTurn(); // turn 1 — still within grace (grace=1 means skip 1 turn)
    tracker.nextTurn(); // turn 2 — grace expired
    const result = checkStaleTests(tracker, config);
    expect(result).not.toBeNull();
    expect(result).toContain('src/router/rules.ts');
  });

  it('includes turn count for each stale file', () => {
    tracker.recordEdit('src/router/rules.ts');
    tracker.nextTurn();
    tracker.recordEdit('src/enforcement/zero-defect.ts');
    tracker.nextTurn();
    const result = checkStaleTests(tracker, config);
    expect(result).toContain('edited 2 turns ago');
    expect(result).toContain('edited 1 turn ago');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/enforcement/stale-test.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the stale test checker**

Create `src/enforcement/stale-test.ts`:

```typescript
import { FileTracker } from './file-tracker.js';
import type { HarnessConfig } from '../types.js';

/**
 * Check if source files were edited without corresponding test file updates.
 * Returns null if no stale tests detected, or a warning message.
 */
export function checkStaleTests(tracker: FileTracker, config: HarnessConfig): string | null {
  const gracePeriod = config.rules.stale_tests?.grace_period ?? 0;
  const enforcement = config.rules.stale_tests?.enforcement ?? 'advise';
  const stale = tracker.getStaleSources(gracePeriod);

  if (stale.length === 0) return null;

  const prefix = enforcement === 'block' ? '[BLOCK]' : '[ADVISE]';
  const currentTurn = stale.reduce((max, s) => Math.max(max, s.turn), 0);

  const lines = [
    `${prefix} STALE TEST WARNING`,
    '',
    'The following source files were modified without updating their tests:',
  ];

  for (const edit of stale) {
    const turnsAgo = currentTurn - edit.turn + 1;
    const turnsLabel = turnsAgo === 1 ? '1 turn ago' : `${turnsAgo} turns ago`;
    lines.push(`  - ${edit.file} (edited ${turnsLabel})`);
  }

  lines.push('');
  lines.push('These test passes may be false positives — the tests still validate old behavior.');
  lines.push('Either update the tests to reflect the changes, or explicitly confirm the changes');
  lines.push("don't affect test assertions.");

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/enforcement/stale-test.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/enforcement/stale-test.ts tests/enforcement/stale-test.test.ts
git commit -m "feat: add stale test detection — warns when source edits lack test updates"
```

---

### Task 3: Test Scope Enforcement

**Files:**

- Create: `src/enforcement/test-scope.ts`
- Create: `tests/enforcement/test-scope.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/enforcement/test-scope.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { checkTestScope } from '../../src/enforcement/test-scope.js';
import { FileTracker } from '../../src/enforcement/file-tracker.js';
import type { HarnessConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

describe('checkTestScope', () => {
  let tracker: FileTracker;
  let config: HarnessConfig;

  beforeEach(() => {
    tracker = new FileTracker();
    config = structuredClone(DEFAULT_CONFIG);
  });

  it('returns null for scoped test command', () => {
    const result = checkTestScope(
      'npx vitest run tests/router/resolver.test.ts',
      'tdd+',
      tracker,
      config,
    );
    expect(result).toBeNull();
  });

  it('returns null for watch mode commands', () => {
    config.rules.test_scope = { enforcement: 'block', allowed_unscoped: ['vitest watch', 'jest --watch'] };
    const result = checkTestScope('npx vitest watch', 'tdd+', tracker, config);
    expect(result).toBeNull();
  });

  it('redirects unscoped test during tdd+ phase', () => {
    tracker.recordEdit('src/router/resolver.ts');
    tracker.recordEdit('src/enforcement/zero-defect.ts');
    config.rules.test_scope = { enforcement: 'advise', allowed_unscoped: ['vitest watch'] };

    const result = checkTestScope('npx vitest run', 'tdd+', tracker, config);
    expect(result).not.toBeNull();
    expect(result).toContain('TEST SCOPE');
    expect(result).toContain('resolver.test.ts');
    expect(result).toContain('zero-defect.test.ts');
  });

  it('returns null for unscoped test during verify+ phase', () => {
    const result = checkTestScope('npx vitest run', 'verify+', tracker, config);
    expect(result).toBeNull();
  });

  it('returns null for unscoped test when no phase set', () => {
    const result = checkTestScope('npx vitest run', null, tracker, config);
    expect(result).toBeNull();
  });

  it('detects pytest unscoped run', () => {
    tracker.recordEdit('src/config.py');
    config.rules.test_scope = { enforcement: 'advise', allowed_unscoped: [] };

    const result = checkTestScope('pytest', 'tdd+', tracker, config);
    expect(result).not.toBeNull();
    expect(result).toContain('TEST SCOPE');
  });

  it('returns null for scoped pytest run', () => {
    const result = checkTestScope('pytest tests/test_config.py', 'tdd+', tracker, config);
    expect(result).toBeNull();
  });

  it('includes enforcement level from config', () => {
    tracker.recordEdit('src/router/resolver.ts');
    config.rules.test_scope = { enforcement: 'block', allowed_unscoped: [] };

    const result = checkTestScope('npx vitest run', 'tdd+', tracker, config);
    expect(result).toContain('[BLOCK]');
  });

  it('shows advise by default', () => {
    tracker.recordEdit('src/router/resolver.ts');
    const result = checkTestScope('npx vitest run', 'tdd+', tracker, config);
    expect(result).toContain('[ADVISE]');
  });

  it('generates correct scoped command suggestion', () => {
    tracker.recordEdit('src/router/resolver.ts');
    tracker.recordEdit('src/router/rules.ts');

    const result = checkTestScope('npx vitest run', 'tdd+', tracker, config);
    expect(result).toContain('npx vitest run tests/router/resolver.test.ts tests/router/rules.test.ts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/enforcement/test-scope.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the test scope checker**

Create `src/enforcement/test-scope.ts`:

```typescript
import { FileTracker } from './file-tracker.js';
import type { HarnessConfig } from '../types.js';

const UNSCOPED_TEST_PATTERNS = [
  { pattern: /^(npx\s+)?vitest\s+run\s*$/, runner: 'npx vitest run' },
  { pattern: /^(npx\s+)?jest\s*$/, runner: 'npx jest' },
  { pattern: /^pytest\s*$/, runner: 'pytest' },
  { pattern: /^(npx\s+)?mocha\s*$/, runner: 'npx mocha' },
];

function isUnscopedTestRun(command: string): string | null {
  const trimmed = command.trim();
  for (const { pattern, runner } of UNSCOPED_TEST_PATTERNS) {
    if (pattern.test(trimmed)) return runner;
  }
  return null;
}

function isAllowedUnscoped(command: string, allowed: string[]): boolean {
  return allowed.some(a => command.includes(a));
}

/**
 * Derive the expected test file path for a given source file path.
 * src/router/resolver.ts → tests/router/resolver.test.ts
 */
function deriveTestPath(sourcePath: string): string {
  const dir = sourcePath.replace(/^src\//, 'tests/');
  const base = dir.replace(/\.[tj]sx?$/, '.test.ts');
  return base;
}

/**
 * Check if a test command should be scoped based on the current phase and
 * recent source edits. Returns null if no redirect needed.
 */
export function checkTestScope(
  command: string,
  currentPhase: string | null,
  tracker: FileTracker,
  config: HarnessConfig,
): string | null {
  // Only enforce during tdd+ phase
  if (currentPhase !== 'tdd+') return null;

  const runner = isUnscopedTestRun(command);
  if (!runner) return null;

  const allowed = config.rules.test_scope?.allowed_unscoped ?? [];
  if (isAllowedUnscoped(command, allowed)) return null;

  const sourceEdits = tracker.getSourceEdits();
  if (sourceEdits.length === 0) return null;

  const enforcement = config.rules.test_scope?.enforcement ?? 'advise';
  const prefix = enforcement === 'block' ? '[BLOCK]' : '[ADVISE]';

  const testPaths = sourceEdits.map(e => deriveTestPath(e.file));
  const scopedCommand = `${runner} ${testPaths.join(' ')}`;

  const lines = [
    `${prefix} TEST SCOPE REDIRECT`,
    '',
    `Running the full test suite, but recent changes affect:`,
    ...sourceEdits.map(e => `  - ${e.file}`),
    '',
    `During iterative fix cycles, run scoped tests only:`,
    `  ${scopedCommand}`,
    '',
    `Full suite runs are reserved for the verify+ phase (final verification).`,
  ];

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/enforcement/test-scope.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/enforcement/test-scope.ts tests/enforcement/test-scope.test.ts
git commit -m "feat: add test scope enforcement — redirects full suite runs during tdd+"
```

---

### Task 4: Constitutional Rule Enforcement

**Files:**

- Create: `src/enforcement/constitutional.ts`
- Create: `tests/enforcement/constitutional.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/enforcement/constitutional.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/enforcement/constitutional.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the constitutional checker**

Create `src/enforcement/constitutional.ts`:

```typescript
import type { HarnessConfig } from '../types.js';

const MOCK_PATTERNS = [
  /jest\.mock\(/,
  /vi\.mock\(/,
  /from\s+['"]unittest\.mock['"]/,
  /@patch\(/,
  /Mock\(/,
  /createMock\(/,
  /\.mock\(\{/,
];

const TEST_FILE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\/tests?\//,
  /\/__tests__\//,
  /\/test_\w+\.py$/,
];

const EVIDENCELESS_PASS_PATTERNS = [
  /\btests? (all )?pass(ed)?\b/i,
  /\ball tests pass\b/i,
  /\btest suite passes\b/i,
];

function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some(p => p.test(filePath));
}

/**
 * Check a file's content against constitutional rules.
 * Returns null if all rules satisfied, or a warning/error message.
 */
export function checkConstitutional(
  filePath: string,
  content: string,
  config: HarnessConfig,
): string | null {
  // Rule: no_mocks — only applies to test files
  const mockLevel = config.rules.constitutional?.no_mocks ?? 'block';
  if (mockLevel !== 'silent' && isTestFile(filePath)) {
    const mockMatch = MOCK_PATTERNS.find(p => p.test(content));
    if (mockMatch) {
      if (mockLevel === 'silent') return null;
      const prefix = mockLevel === 'block' ? '[BLOCK]' : '[ADVISE]';
      return [
        `${prefix} Constitutional Rule: no_mocks`,
        '',
        `Test file contains a mock: ${mockMatch.source}`,
        '',
        'Constitutional rule: never mock core system components.',
        'Use real components in tests. If a dependency cannot be used directly,',
        'wrap it in a thin adapter and test the adapter separately.',
      ].join('\n');
    }
  }

  // Rule: evidence_only — check for unsupported claims of success
  const evidenceLevel = config.rules.constitutional?.evidence_only ?? 'block';
  if (evidenceLevel !== 'silent') {
    const hasEvidencelessClaim = EVIDENCELESS_PASS_PATTERNS.some(p => p.test(content));
    const hasEvidence = content.includes('```') || content.includes('✓') || content.includes('PASS');
    if (hasEvidencelessClaim && !hasEvidence) {
      if (evidenceLevel === 'silent') return null;
      const prefix = evidenceLevel === 'block' ? '[BLOCK]' : '[ADVISE]';
      return [
        `${prefix} Constitutional Rule: evidence_only`,
        '',
        'Claim of test success without evidence. "Tests pass" is not evidence.',
        'Show the test output — command run, actual output, then claim done.',
      ].join('\n');
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/enforcement/constitutional.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/enforcement/constitutional.ts tests/enforcement/constitutional.test.ts
git commit -m "feat: add constitutional rule enforcement — no-mock, evidence-only"
```

---

### Task 5: Zero-Defect Enforcement

**Files:**

- Create: `src/enforcement/zero-defect.ts`
- Create: `tests/enforcement/zero-defect.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/enforcement/zero-defect.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { checkZeroDefect } from '../../src/enforcement/zero-defect.js';
import type { HarnessConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

describe('checkZeroDefect', () => {
  let config: HarnessConfig;

  beforeEach(() => {
    config = structuredClone(DEFAULT_CONFIG);
  });

  it('returns null for clean test output', () => {
    const output = [
      '✓ tests/router/resolver.test.ts (3 tests)',
      '✓ tests/router/rules.test.ts (5 tests)',
      '',
      'Tests: 8 passed',
      'Time: 1.2s',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).toBeNull();
  });

  it('detects FAIL in test output', () => {
    const output = [
      'FAIL tests/router/resolver.test.ts',
      '  resolve() with empty rules',
      '  AssertionError: expected "allow" received "block"',
      '',
      'Tests: 1 failed, 7 passed',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).not.toBeNull();
    expect(result).toContain('ZERO-DEFECT');
    expect(result).toContain('FAIL');
  });

  it('detects ERROR in test output', () => {
    const output = [
      'ERROR tests/setup.ts',
      '  Cannot find module ../src/types',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).not.toBeNull();
    expect(result).toContain('ERROR');
  });

  it('detects TypeScript compilation errors', () => {
    const output = [
      'src/router/resolver.ts(42,5): error TS2322: Type "string" is not assignable to type "Resolution"',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).not.toBeNull();
    expect(result).toContain('TS2322');
  });

  it('detects Python test failures', () => {
    const output = [
      'FAILED tests/test_config.py::test_load_config - AssertionError',
      '=== 1 failed, 12 passed in 2.1s ===',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).not.toBeNull();
    expect(result).toContain('FAILED');
  });

  it('extracts failure summary lines', () => {
    const output = [
      'FAIL tests/router/resolver.test.ts > resolve with empty rules',
      'FAIL tests/router/rules.test.ts > findMatchingRule returns undefined',
      '',
      'Tests: 2 failed, 6 passed',
    ].join('\n');

    const result = checkZeroDefect(output, config);
    expect(result).toContain('2 failure(s) found');
    expect(result).toContain('resolver.test.ts');
    expect(result).toContain('rules.test.ts');
  });

  it('respects permissive tolerance mode', () => {
    config.rules.zero_defect = { tolerance: 'permissive' };
    const output = 'FAIL tests/a.test.ts\nTests: 1 failed';
    const result = checkZeroDefect(output, config);
    // Permissive mode still flags but as advise
    expect(result).toContain('[ADVISE]');
  });

  it('uses block in strict mode', () => {
    config.rules.zero_defect = { tolerance: 'strict' };
    const output = 'FAIL tests/a.test.ts\nTests: 1 failed';
    const result = checkZeroDefect(output, config);
    expect(result).toContain('[BLOCK]');
  });

  it('returns null for warning-only output in permissive mode', () => {
    config.rules.zero_defect = { tolerance: 'permissive' };
    const output = [
      'WARN tests/deprecated.test.ts',
      '  This test uses deprecated API',
      '',
      'Tests: 10 passed',
    ].join('\n');
    const result = checkZeroDefect(output, config);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/enforcement/zero-defect.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the zero-defect checker**

Create `src/enforcement/zero-defect.ts`:

```typescript
import type { HarnessConfig } from '../types.js';

const FAILURE_PATTERNS = [
  /\bFAIL(?:ED)?\b/,
  /\bERROR\b/,
  /\berror TS\d{4}\b/,
  /\b\d+ failed\b/,
];

const FAILURE_LINE_PATTERNS = [
  /^(FAIL|FAILED)\s+(.+)/,
  /^(ERROR)\s+(.+)/,
  /^.+\((\d+),(\d+)\):\s*(error TS\d+ .+)/,
];

/**
 * Check test output for failures and errors.
 * Returns null if clean, or a zero-defect violation message.
 */
export function checkZeroDefect(testOutput: string, config: HarnessConfig): string | null {
  const tolerance = config.rules.zero_defect?.tolerance ?? 'strict';

  const hasFailure = FAILURE_PATTERNS.some(p => p.test(testOutput));
  if (!hasFailure) return null;

  // Extract failure summary lines
  const lines = testOutput.split('\n');
  const failureLines: string[] = [];
  for (const line of lines) {
    if (FAILURE_PATTERNS.some(p => p.test(line))) {
      failureLines.push(line.trim());
    }
  }

  const isStrict = tolerance === 'strict';
  const prefix = isStrict ? '[BLOCK]' : '[ADVISE]';

  const output = [
    `${prefix} ZERO-DEFECT VIOLATION`,
    '',
    `Test output contains ${failureLines.length} failure(s):`,
    ...failureLines.slice(0, 10).map(l => `  ${l}`),
    '',
    'Zero-defect tolerance: every error, warning, and failure must be addressed.',
    '"This failure is unrelated" is never acceptable.',
    'Fix ALL errors before proceeding.',
  ];

  return output.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/enforcement/zero-defect.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/enforcement/zero-defect.ts tests/enforcement/zero-defect.test.ts
git commit -m "feat: add zero-defect enforcement — parses test output for failures"
```

---

### Task 6: PostToolUse Hook Entry Point (Compose All Checks)

**Files:**

- Create: `src/enforcement/post-tool-use.ts`
- Create: `tests/enforcement/post-tool-use.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/enforcement/post-tool-use.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { handlePostToolUse } from '../../src/enforcement/post-tool-use.js';
import { FileTracker } from '../../src/enforcement/file-tracker.js';
import { SessionCache } from '../../src/session/cache.js';
import type { HarnessConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

describe('handlePostToolUse', () => {
  let tracker: FileTracker;
  let cache: SessionCache;
  let config: HarnessConfig;

  beforeEach(() => {
    tracker = new FileTracker();
    cache = new SessionCache();
    config = structuredClone(DEFAULT_CONFIG);
  });

  it('tracks source file edits via Edit tool', () => {
    const result = handlePostToolUse('Edit', { file_path: 'src/router/resolver.ts' }, tracker, cache, config);
    expect(tracker.getSourceEdits()).toHaveLength(1);
    expect(tracker.getSourceEdits()[0].file).toBe('src/router/resolver.ts');
    expect(result).toBeNull(); // no violation yet
  });

  it('tracks test file edits via Edit tool', () => {
    handlePostToolUse('Edit', { file_path: 'tests/router/resolver.test.ts' }, tracker, cache, config);
    expect(tracker.getTestEdits()).toHaveLength(1);
  });

  it('tracks file edits via Write tool', () => {
    handlePostToolUse('Write', { file_path: 'src/router/rules.ts' }, tracker, cache, config);
    expect(tracker.getSourceEdits()).toHaveLength(1);
  });

  it('emits stale test warning after second source edit without test', () => {
    handlePostToolUse('Edit', { file_path: 'src/router/resolver.ts' }, tracker, cache, config);
    handlePostToolUse('Edit', { file_path: 'tests/router/resolver.test.ts' }, tracker, cache, config);
    // resolver.ts has a test, no stale warning
    handlePostToolUse('Edit', { file_path: 'src/router/rules.ts' }, tracker, cache, config);
    tracker.nextTurn();
    tracker.nextTurn();
    const result = handlePostToolUse('Edit', { file_path: 'src/router/hook.ts' }, tracker, cache, config);
    // rules.ts is stale (no test edit)
    // Note: result from this call is about hook.ts edit itself, but stale check runs
    expect(tracker.getStaleSources()).toEqual(
      expect.arrayContaining([expect.objectContaining({ file: 'src/router/rules.ts' })]),
    );
  });

  it('checks zero-defect on Bash test commands', () => {
    const testOutput = 'FAIL tests/a.test.ts\nTests: 1 failed';
    const result = handlePostToolUse('Bash', { command: 'npx vitest run', output: testOutput }, tracker, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('ZERO-DEFECT');
  });

  it('checks constitutional on test file edits', () => {
    const result = handlePostToolUse(
      'Edit',
      {
        file_path: 'tests/router/resolver.test.ts',
        new_string: "jest.mock('../src/router/resolver.js');",
      },
      tracker,
      cache,
      config,
    );
    expect(result).not.toBeNull();
    expect(result).toContain('no_mocks');
  });

  it('combines multiple violations into single output', () => {
    // Edit a test file with a mock
    const result = handlePostToolUse(
      'Edit',
      {
        file_path: 'tests/router/resolver.test.ts',
        new_string: "vi.mock('../src/config.js');",
      },
      tracker,
      cache,
      config,
    );
    // Should contain the constitutional violation
    expect(result).toContain('no_mocks');
  });

  it('returns null for clean operations', () => {
    const result = handlePostToolUse(
      'Edit',
      { file_path: 'src/router/resolver.ts' },
      tracker,
      cache,
      config,
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/enforcement/post-tool-use.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the PostToolUse handler**

Create `src/enforcement/post-tool-use.ts`:

```typescript
import { FileTracker } from './file-tracker.js';
import { SessionCache } from '../session/cache.js';
import type { HarnessConfig } from '../types.js';
import { checkStaleTests } from './stale-test.js';
import { checkTestScope } from './test-scope.js';
import { checkConstitutional } from './constitutional.js';
import { checkZeroDefect } from './zero-defect.js';

/**
 * PostToolUse hook handler. Composes all enforcement checks.
 * Returns null if all clean, or a combined violation message.
 */
export function handlePostToolUse(
  tool: string,
  args: Record<string, unknown>,
  tracker: FileTracker,
  cache: SessionCache,
  config: HarnessConfig,
): string | null {
  const violations: string[] = [];

  // Track file edits
  if (tool === 'Edit' || tool === 'Write') {
    const filePath = args.file_path as string;
    if (filePath) {
      tracker.recordEdit(filePath);

      // Constitutional check on edited test files
      const content = (args.new_string as string) ?? '';
      const constitutional = checkConstitutional(filePath, content, config);
      if (constitutional) violations.push(constitutional);
    }

    // Stale test check
    const stale = checkStaleTests(tracker, config);
    if (stale) violations.push(stale);
  }

  // Zero-defect check on test command output
  if (tool === 'Bash') {
    const command = args.command as string;
    const output = args.output as string;

    if (command && output) {
      // Check if this was a test run
      const isTestCommand = /vitest|jest|pytest|mocha/.test(command);
      if (isTestCommand) {
        const zeroDefect = checkZeroDefect(output, config);
        if (zeroDefect) violations.push(zeroDefect);
      }
    }
  }

  if (violations.length === 0) return null;

  // Return combined violations separated by separator
  return violations.join('\n\n---\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/enforcement/post-tool-use.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/enforcement/post-tool-use.ts tests/enforcement/post-tool-use.test.ts
git commit -m "feat: add PostToolUse hook composing stale test, scope, constitutional, zero-defect"
```

---

### Task 7: Verify All Phase 3 Tests Pass Together

- [ ] **Step 1: Run full test suite (Phase 1 + 2 + 3)**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: phase 3 complete - enforcement layer with stale tests, scope, constitutional, zero-defect"
```

---

### Task 8: Phase Retrospective — GStack Comparison

Use `superpowers:debugging` to analyze Phase 3 enforcement code against gstack's enforcement/guardrails patterns (indexed as `local/gstack`).

- [ ] **Step 1: Research gstack enforcement patterns**

```
search_symbols(repo="local/gstack", query="enforce")
search_symbols(repo="local/gstack", query="guardrail")
search_symbols(repo="local/gstack", query="validate")
search_symbols(repo="local/gstack", query="check")
get_file_outline(repo="local/gstack", file_path="src/core/guardrails.ts")  # if exists
```

- [ ] **Step 2: Write comparative analysis**

Create `docs/retrospectives/phase-3-retrospective.md` with sections: Shared Patterns, Differences, GStack Pros, Our Pros, Cons/Improvements, Action Items.

- [ ] **Step 3: Commit retrospective**

```bash
git add docs/retrospectives/phase-3-retrospective.md
git commit -m "docs: phase 3 retrospective — gstack enforcement comparison"
```
