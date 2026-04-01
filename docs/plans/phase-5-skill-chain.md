# Phase 5: Skill Chain - brain+ / plan+ / tdd+ / verify+ / review+

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the five skill definitions that wrap superpowers skills with agentic-patterns discipline overlays. Each skill is a markdown template with YAML frontmatter that gets installed to `.claude/skills/`. Also build the phase tracker that the enforcement hooks use to adjust behavior based on current skill phase.

**Architecture:** Skills are markdown files with YAML frontmatter, following Claude Code's skill format. They do NOT reimplement superpowers — they wrap it by requiring superpowers to be installed and adding harness-specific preambles, hook activations, and discipline overlays. A `SkillPhaseTracker` module manages phase state transitions and exposes current phase to enforcement hooks.

**Tech Stack:** TypeScript, vitest

**Depends on:** Phase 1 (types, config, session cache), Phase 3 (enforcement hooks use phase state), Phase 4 (scout agent used by brain+)

---

## File Structure

```
src/
  skills/
    phase-tracker.ts          # Track and validate skill phase transitions
templates/
  skills/
    brain-plus/
      SKILL.md                # brain+ skill template
    plan-plus/
      SKILL.md                # plan+ skill template
    tdd-plus/
      SKILL.md                # tdd+ skill template
    verify-plus/
      SKILL.md                # verify+ skill template
    review-plus/
      SKILL.md                # review+ skill template
tests/
  skills/
    phase-tracker.test.ts     # Phase transition tests
    skill-definitions.test.ts # Validate all skill templates
```

---

### Task 1: Phase Tracker

**Files:**
- Create: `src/skills/phase-tracker.ts`
- Create: `tests/skills/phase-tracker.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/skills/phase-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SkillPhaseTracker } from '../../src/skills/phase-tracker.js';

describe('SkillPhaseTracker', () => {
  let tracker: SkillPhaseTracker;

  beforeEach(() => {
    tracker = new SkillPhaseTracker();
  });

  it('starts with no phase', () => {
    expect(tracker.getCurrentPhase()).toBeNull();
  });

  it('tracks phase transitions', () => {
    tracker.setPhase('brain+');
    expect(tracker.getCurrentPhase()).toBe('brain+');
    tracker.setPhase('plan+');
    expect(tracker.getCurrentPhase()).toBe('plan+');
  });

  it('records phase history', () => {
    tracker.setPhase('brain+');
    tracker.setPhase('plan+');
    tracker.setPhase('tdd+');
    const history = tracker.getHistory();
    expect(history).toEqual([
      { phase: 'brain+', enteredAt: expect.any(Number) },
      { phase: 'plan+', enteredAt: expect.any(Number) },
      { phase: 'tdd+', enteredAt: expect.any(Number) },
    ]);
  });

  it('validates forward transitions', () => {
    tracker.setPhase('brain+');
    expect(tracker.canTransitionTo('plan+')).toBe(true);
    expect(tracker.canTransitionTo('tdd+')).toBe(true);
    expect(tracker.canTransitionTo('brain+')).toBe(true); // re-entry allowed
  });

  it('allows review+ from any phase', () => {
    tracker.setPhase('brain+');
    expect(tracker.canTransitionTo('review+')).toBe(true);
  });

  it('allows verify+ only after tdd+', () => {
    tracker.setPhase('brain+');
    expect(tracker.canTransitionTo('verify+')).toBe(false);
    tracker.setPhase('plan+');
    expect(tracker.canTransitionTo('verify+')).toBe(false);
    tracker.setPhase('tdd+');
    expect(tracker.canTransitionTo('verify+')).toBe(true);
  });

  it('allows re-entry to same phase', () => {
    tracker.setPhase('brain+');
    tracker.setPhase('plan+');
    expect(tracker.canTransitionTo('brain+')).toBe(true); // can go back
  });

  it('returns all valid phases', () => {
    const phases = tracker.getAllPhases();
    expect(phases).toEqual(['brain+', 'plan+', 'tdd+', 'verify+', 'review+']);
  });

  it('returns phase index for ordering', () => {
    expect(tracker.getPhaseIndex('brain+')).toBe(0);
    expect(tracker.getPhaseIndex('plan+')).toBe(1);
    expect(tracker.getPhaseIndex('tdd+')).toBe(2);
    expect(tracker.getPhaseIndex('verify+')).toBe(3);
    expect(tracker.getPhaseIndex('review+')).toBe(4);
    expect(tracker.getPhaseIndex('unknown')).toBe(-1);
  });

  it('detects tdd+ phase', () => {
    tracker.setPhase('tdd+');
    expect(tracker.isTddPhase()).toBe(true);
    tracker.setPhase('verify+');
    expect(tracker.isTddPhase()).toBe(false);
  });

  it('detects verify+ phase', () => {
    tracker.setPhase('verify+');
    expect(tracker.isVerifyPhase()).toBe(true);
  });

  it('resets to no phase', () => {
    tracker.setPhase('brain+');
    tracker.reset();
    expect(tracker.getCurrentPhase()).toBeNull();
    expect(tracker.getHistory()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/skills/phase-tracker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the phase tracker**

Create `src/skills/phase-tracker.ts`:

```typescript
const PHASE_ORDER = ['brain+', 'plan+', 'tdd+', 'verify+', 'review+'] as const;
export type SkillPhase = (typeof PHASE_ORDER)[number];

interface PhaseEntry {
  phase: SkillPhase;
  enteredAt: number;
}

export class SkillPhaseTracker {
  private currentPhase: SkillPhase | null = null;
  private history: PhaseEntry[] = [];

  getCurrentPhase(): SkillPhase | null {
    return this.currentPhase;
  }

  setPhase(phase: SkillPhase): void {
    this.currentPhase = phase;
    this.history.push({ phase, enteredAt: Date.now() });
  }

  canTransitionTo(target: SkillPhase): boolean {
    // review+ is accessible from any phase
    if (target === 'review+') return true;

    // verify+ requires tdd+ to have been visited
    if (target === 'verify+') {
      return this.history.some(e => e.phase === 'tdd+');
    }

    // All other phases allow free transitions (re-entry, forward, backward)
    return true;
  }

  getHistory(): PhaseEntry[] {
    return [...this.history];
  }

  getAllPhases(): readonly SkillPhase[] {
    return PHASE_ORDER;
  }

  getPhaseIndex(phase: string): number {
    return PHASE_ORDER.indexOf(phase as SkillPhase);
  }

  isTddPhase(): boolean {
    return this.currentPhase === 'tdd+';
  }

  isVerifyPhase(): boolean {
    return this.currentPhase === 'verify+';
  }

  reset(): void {
    this.currentPhase = null;
    this.history = [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/skills/phase-tracker.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/phase-tracker.ts tests/skills/phase-tracker.test.ts
git commit -m "feat: add skill phase tracker with transition validation"
```

---

### Task 2: brain+ Skill Template

**Files:**
- Create: `templates/skills/brain-plus/SKILL.md`

- [ ] **Step 1: Create the brain+ skill**

Create `templates/skills/brain-plus/SKILL.md`:

```markdown
---
name: brain+
description: "Invoke BEFORE any design or feature work. Wraps superpowers:brainstorming with scout agent context harvesting, stack-first design considerations, and constitutional rule awareness. Asks questions one at a time to refine the design."
argument-hint: "[feature description]"
user-invocable: true
---

# brain+ — Context-Aware Design

Wraps `superpowers:brainstorming`. Requires superpowers to be installed.

## Before You Begin

Invoke this skill BEFORE starting any design work. It adds three capabilities on top of the base brainstorming skill:

1. **Scout context** — automatically harvests codebase context
2. **Stack-first design** — considers Docker, test infrastructure, and full-loop verification
3. **Constitutional awareness** — loads project rules from CLAUDE.md

## Procedure

### Phase A: Harvest Context

1. Invoke the scout agent to map the current codebase:
   ```
   Agent(subagent_type="scout", prompt="Map the codebase structure for [feature area]. Focus on: existing patterns, related modules, test infrastructure, and entry points relevant to [feature].")
   ```

2. Read the project's CLAUDE.md for constitutional rules.

3. Identify:
   - Existing patterns this feature should follow
   - Test infrastructure available (vitest, pytest, stack tests)
   - Modules that will be affected
   - Components that must NOT be mocked (constitutional rules)

### Phase B: Design (delegate to superpowers:brainstorming)

4. Invoke `superpowers:brainstorming` with the enriched context.

5. During brainstorming, add these stack-first considerations:
   - What Docker services does this feature need?
   - What are the full-loop assertions? (primary + second-order + third-order effects)
   - What test utilities need to exist before implementation?
   - Which components are protected from mocking?

6. Use positive framing in all design guidance:
   - "Use real database connections in tests" (not "don't mock the database")
   - "Write assertions that verify observable behavior" (not "don't test implementation details")
   - "Show command output before claiming done" (not "don't say tests pass without evidence")

### Phase C: Validate

7. Confirm the design addresses:
   - [ ] Feature purpose and scope
   - [ ] Affected modules identified
   - [ ] Testing strategy defined
   - [ ] Constitutional rules acknowledged
   - [ ] No mocks for protected components
   - [ ] Stack test user journey defined (if applicable)

## Output

Return the validated design with testing strategy to feed into `plan+`.

## Skill Chain

After completing brain+, the next step is:
- Invoke `/plan+` to create the implementation plan from this design
```

- [ ] **Step 2: Commit**

```bash
git add templates/skills/brain-plus/SKILL.md
git commit -m "feat: add brain+ skill template wrapping superpowers:brainstorming"
```

---

### Task 3: plan+ Skill Template

**Files:**
- Create: `templates/skills/plan-plus/SKILL.md`

- [ ] **Step 1: Create the plan+ skill**

Create `templates/skills/plan-plus/SKILL.md`:

```markdown
---
name: plan+
description: "Invoke AFTER brain+ design is approved. Wraps superpowers:writing-plans with constitutional rules, testing strategy per task, and mock policy. Creates bite-sized implementation plans."
argument-hint: "[plan description]"
user-invocable: true
---

# plan+ — Disciplined Planning

Wraps `superpowers:writing-plans`. Requires superpowers to be installed.

## Before You Begin

This skill runs after `brain+` has produced a validated design. It creates the implementation plan with testing discipline baked into every task.

## Procedure

### Phase A: Load Context

1. Read the design output from `brain+` (from the current session or saved spec).

2. Load constitutional rules from CLAUDE.md. Add a **Constitutional Compliance** section to the plan:
   ```
   ## Constitutional Rules for This Plan
   - Use real [database/payment/logger] connections — never mock protected components
   - Show command output before claiming done
   - Every source file change requires corresponding test changes
   - Full-loop assertions: verify primary + second-order + third-order effects
   ```

3. Identify the mock policy for this plan:
   ```
   ## Mock Policy
   Protected (never mock): [list from constitutional rules]
   Allowed: [external third-party services not yet containerized]
   ```

### Phase B: Create Plan (delegate to superpowers:writing-plans)

4. Invoke `superpowers:writing-plans` with the enriched context.

5. For each task in the plan, ensure it includes:
   - **Test strategy**: which tests cover this task's requirements
   - **Mock check**: does this task need to interact with protected components?
   - **Evidence criteria**: what output proves this task is done

6. Every task must follow the pattern:
   ```
   ### Task N: [Name]
   **Files:** [exact paths]
   **Test strategy:** [which tests, scoped to this task]
   **Mock check:** [are protected components involved?]
   - [ ] Step 1: Write failing test
   - [ ] Step 2: Verify it fails
   - [ ] Step 3: Write minimal implementation
   - [ ] Step 4: Verify it passes
   - [ ] Step 5: Commit
   ```

### Phase C: Validate Plan

7. Confirm the plan:
   - [ ] Every task has a test strategy
   - [ ] No task mocks a protected component
   - [ ] Plan references exact file paths (no TBDs)
   - [ ] Evidence criteria defined for each task
   - [ ] Constitutional rules section present

## Output

Save the plan to `docs/plans/` and feed into `tdd+` for implementation.

## Skill Chain

After completing plan+, the next step is:
- Invoke `/tdd+` to implement the plan task-by-task with RED-GREEN-REFACTOR
```

- [ ] **Step 2: Commit**

```bash
git add templates/skills/plan-plus/SKILL.md
git commit -m "feat: add plan+ skill template wrapping superpowers:writing-plans"
```

---

### Task 4: tdd+ Skill Template

**Files:**
- Create: `templates/skills/tdd-plus/SKILL.md`

- [ ] **Step 1: Create the tdd+ skill**

Create `templates/skills/tdd-plus/SKILL.md`:

```markdown
---
name: tdd+
description: "Invoke AFTER plan+ is approved. Wraps superpowers:test-driven-development with full-loop assertions, no-mock enforcement, zero-defect, stale test detection, and scoped test runs. Implements plan tasks with RED-GREEN-REFACTOR discipline."
argument-hint: "[plan file path or task range]"
user-invocable: true
---

# tdd+ — Disciplined Implementation

Wraps `superpowers:test-driven-development`. Requires superpowers to be installed.

**This skill activates tdd+ phase in the enforcement layer.** During this phase:
- Full test suite runs are redirected (use scoped tests only)
- Stale test warnings fire when source edits lack test updates
- Constitutional no-mock rules are enforced

## Procedure

### Phase A: Setup

1. Announce phase entry:
   ```
   Now using tdd+ skill. Enforcement layer active:
   - Test scope: scoped runs only (full suite reserved for verify+)
   - Stale tests: warnings when source edited without test updates
   - Zero-defect: every failure must be fixed before proceeding
   ```

2. Load the plan from `docs/plans/`.

3. Identify the task(s) to implement.

### Phase B: Implement Each Task (delegate to superpowers:test-driven-development)

4. For each task in the plan, follow RED-GREEN-REFACTOR:

   **RED — Write the failing test first:**
   - Write a test that captures the task's requirement
   - Use full-loop assertions where applicable:
     - Primary: does the function return the expected value?
     - Second-order: did the side effect occur? (state change, log entry, event)
     - Third-order: is the system still consistent? (no orphan records, no leaked connections)
   - Run the test: it MUST fail (if it passes immediately, the test is wrong)
   - Show the failure output

   **GREEN — Write minimal code to make the test pass:**
   - Write the smallest possible implementation
   - Do not add features not in the plan
   - Run the scoped test: `npx vitest run tests/path/to/specific.test.ts`
   - Show the passing output

   **REFACTOR — Clean up while tests pass:**
   - Improve code structure without changing behavior
   - Run scoped tests after each refactoring step
   - Commit after each completed task

5. After each source file edit, check:
   - Was the corresponding test file also updated?
   - If not, the enforcement layer will emit a stale test warning
   - Address it before proceeding to the next task

### Phase C: Task Completion

6. After each task, verify:
   - [ ] Test was written first and shown to fail
   - [ ] Implementation makes the test pass
   - [ ] Scoped test run passes (not full suite)
   - [ ] No constitutional rules violated
   - [ ] Commit made with descriptive message

7. Proceed to next task or exit tdd+ phase when all plan tasks complete.

## Test Scope Rules

During tdd+ phase, the enforcement layer redirects:
- `npx vitest run` (full suite) → advise to run scoped tests only
- `pytest` (full suite) → advise to run specific test file

Use scoped commands:
```
npx vitest run tests/router/resolver.test.ts
pytest tests/test_config.py::test_load_config
```

Full suite runs happen during `verify+` phase, not here.

## Skill Chain

After completing all plan tasks with tdd+:
- Invoke `/verify+` to run full suite and verify against plan acceptance criteria
```

- [ ] **Step 2: Commit**

```bash
git add templates/skills/tdd-plus/SKILL.md
git commit -m "feat: add tdd+ skill template wrapping superpowers:tdd with enforcement overlays"
```

---

### Task 5: verify+ Skill Template

**Files:**
- Create: `templates/skills/verify-plus/SKILL.md`

- [ ] **Step 1: Create the verify+ skill**

Create `templates/skills/verify-plus/SKILL.md`:

```markdown
---
name: verify+
description: "Invoke AFTER tdd+ implementation is complete. Wraps superpowers:verification-before-completion with evidence standards, spec drift check, and full-suite test run. This is the ONLY phase where full test suite runs are appropriate."
argument-hint: "[plan file path]"
user-invocable: true
---

# verify+ — Evidence-Based Verification

Wraps `superpowers:verification-before-completion`. Requires superpowers to be installed.

**This skill activates verify+ phase in the enforcement layer.** During this phase:
- Full test suite runs are ALLOWED (this is the verification phase)
- Zero-defect enforcement is at strict tolerance
- Evidence must be shown before claiming done

## Procedure

### Phase A: Preparation

1. Announce phase entry:
   ```
   Now using verify+ skill. Enforcement layer adjusted:
   - Test scope: full suite runs allowed (this is verification phase)
   - Zero-defect: strict — every failure must be fixed
   - Evidence: show command output before claiming done
   ```

2. Load the plan from `docs/plans/`.

3. List all acceptance criteria from the plan.

### Phase B: Full Verification (delegate to superpowers:verification-before-completion)

4. Invoke `superpowers:verification-before-completion` with the plan context.

5. Run the FULL test suite:
   ```
   npx vitest run
   ```
   Show the output. Every test must pass. Zero failures. Zero errors.

6. For each acceptance criterion in the plan:
   - Show evidence that it is met (command output, file contents, test results)
   - Use positive framing: "Criterion X is met: [evidence]"
   - Do NOT say "tests pass" — show the actual test output

7. Check for spec drift:
   - Compare the plan's task list against actual implementation
   - Were any tasks skipped? Added? Changed?
   - Document any deviations with reasons

### Phase C: Evidence Report

8. Produce a verification report:
   ```
   ## Verification Report

   ### Test Suite
   [Full test output — ALL must pass]

   ### Acceptance Criteria
   - [ ] Criterion 1: [evidence]
   - [ ] Criterion 2: [evidence]
   - [ ] ...

   ### Spec Drift
   - [No deviations / List deviations with reasons]

   ### Constitutional Compliance
   - [ ] No protected components mocked
   - [ ] Evidence shown for all claims
   - [ ] All source changes have test coverage
   ```

9. If ALL checks pass, verification is complete.
   If ANY check fails, return to tdd+ phase to fix.

## Skill Chain

After verify+ passes:
- Invoke `/review+` to run the compliance review agent
```

- [ ] **Step 2: Commit**

```bash
git add templates/skills/verify-plus/SKILL.md
git commit -m "feat: add verify+ skill template wrapping superpowers:verification"
```

---

### Task 6: review+ Skill Template

**Files:**
- Create: `templates/skills/review-plus/SKILL.md`

- [ ] **Step 1: Create the review+ skill**

Create `templates/skills/review-plus/SKILL.md`:

```markdown
---
name: review+
description: "Invoke AFTER verify+ passes. Wraps superpowers:requesting-code-review with constitutional compliance checklist, stale test validation, and reviewer agent invocation. Two-stage review: spec compliance + code quality."
argument-hint: "[plan file path]"
user-invocable: true
---

# review+ — Compliance Review

Wraps `superpowers:requesting-code-review`. Requires superpowers to be installed.

## Procedure

### Phase A: Gather Review Context

1. Load the plan from `docs/plans/`.

2. Get the list of files changed since the plan was created:
   ```
   git diff --name-only [plan-commit]..HEAD
   ```

3. Invoke the scout agent to get current codebase state for comparison:
   ```
   Agent(subagent_type="scout", prompt="Get current state of these files: [changed files list]. For each file, report: symbol count, key exports, test coverage status.")
   ```

### Phase B: Spec Compliance Review

4. For each task in the plan:
   - Check: was the task implemented? (file exists, code present)
   - Check: does the implementation match the plan's specification?
   - Check: are the specified tests present and passing?
   - Check: were any plan tasks skipped or significantly changed?

5. Check stale test status:
   - For each changed source file, verify a corresponding test file was also changed
   - Flag any source edits without test updates as stale test violations

6. Check constitutional compliance:
   - [ ] No protected components are mocked in any test file
   - [ ] All claims of success are backed by command output
   - [ ] Full-loop assertions present where applicable
   - [ ] No conditional test assertions (`if (condition) assert(...)`)
   - [ ] No empty test bodies
   - No `.skip` without documented reason

### Phase C: Code Quality Review (delegate to superpowers:requesting-code-review)

7. Invoke `superpowers:requesting-code-review` with the gathered context.

8. Check code quality:
   - Files are focused (one clear responsibility per file)
   - Interfaces are well-defined
   - No unnecessary abstractions
   - No speculative generalization
   - Positive framing in code comments and error messages

### Phase D: Review Report

9. Produce a two-stage review report:
   ```
   ## Review Report

   ### Stage 1: Spec Compliance
   - [ ] All plan tasks implemented
   - [ ] Implementation matches plan specification
   - [ ] No stale test violations
   - [ ] Constitutional rules followed

   ### Stage 2: Code Quality
   - [ ] Files are focused and well-structured
   - [ ] Interfaces are clean
   - [ ] No unnecessary complexity
   - [ ] Positive framing throughout

   ### Verdict
   PASS / FAIL with specific items to address
   ```

10. If PASS: the implementation is complete. Proceed to integration.
    If FAIL: list specific items, return to tdd+ to fix, then re-run verify+ and review+.

## Skill Chain

After review+ passes:
- The implementation is complete
- Proceed to merge/PR decision (superpowers:finishing-a-development-branch)
```

- [ ] **Step 2: Commit**

```bash
git add templates/skills/review-plus/SKILL.md
git commit -m "feat: add review+ skill template wrapping superpowers:code-review"
```

---

### Task 7: Skill Template Validation Tests

**Files:**
- Create: `tests/skills/skill-definitions.test.ts`

- [ ] **Step 1: Write the validation tests**

Create `tests/skills/skill-definitions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const TEMPLATES = resolve(import.meta.dirname, '..', '..', 'templates', 'skills');

const EXPECTED_SKILLS = ['brain-plus', 'plan-plus', 'tdd-plus', 'verify-plus', 'review-plus'];

describe('skill template validation', () => {
  it('all expected skill directories exist', () => {
    const dirs = readdirSync(TEMPLATES, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const expected of EXPECTED_SKILLS) {
      expect(dirs).toContain(expected);
    }
  });

  describe.each(EXPECTED_SKILLS)('%s', (skillDir) => {
    let content: string;
    let frontmatter: string;
    let body: string;

    beforeAll(() => {
      const path = join(TEMPLATES, skillDir, 'SKILL.md');
      content = readFileSync(path, 'utf-8');
      const parts = content.split('---');
      frontmatter = parts[1] ?? '';
      body = parts.slice(2).join('---');
    });

    it('has valid YAML frontmatter', () => {
      expect(content).toMatch(/^---\n/);
      expect(frontmatter).toContain('name:');
      expect(frontmatter).toContain('description:');
    });

    it('has user-invocable flag', () => {
      expect(frontmatter).toContain('user-invocable: true');
    });

    it('references superpowers wrapping', () => {
      expect(body.toLowerCase()).toContain('superpowers');
    });

    it('references skill chain navigation', () => {
      expect(body).toContain('Skill Chain');
    });

    it('uses positive framing (no "don\'t" as primary instruction)', () => {
      const lines = body.split('\n');
      const proceduralLines = lines.filter(
        l => l.trim().startsWith('-') || l.trim().startsWith('1.') || l.trim().startsWith('2.') || l.trim().startsWith('3.')
      );
      // Count negative imperatives vs positive imperatives
      const negativeCount = proceduralLines.filter(l => /\bdon'?t\b/i.test(l) && !l.includes('mock')).length;
      const positiveCount = proceduralLines.filter(
        l => /\b(use|write|invoke|run|check|verify|show|read|load|confirm|ensure|produce)\b/i.test(l),
      ).length;
      expect(positiveCount).toBeGreaterThan(negativeCount);
    });

    it('includes checklist items', () => {
      expect(body).toContain('- [ ]');
    });

    it('specifies argument hint', () => {
      expect(frontmatter).toContain('argument-hint:');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/skills/skill-definitions.test.ts`
Expected: all tests PASS (all 5 skill templates validated)

- [ ] **Step 3: Commit**

```bash
git add tests/skills/skill-definitions.test.ts
git commit -m "feat: add skill template validation tests for all 5 skill definitions"
```

---

### Task 8: Verify All Phase 5 Tests Pass Together

- [ ] **Step 1: Run full test suite (Phase 1 through 5)**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: phase 5 complete - skill chain with phase tracking and 5 skill templates"
```

---

### Task 9: Phase Retrospective — GStack Comparison

Use `superpowers:debugging` to analyze Phase 5 skill chain against gstack's skill generation and template patterns (indexed as `local/gstack`).

- [ ] **Step 1: Research gstack skill/template patterns**

```
search_symbols(repo="local/gstack", query="skill")
search_symbols(repo="local/gstack", query="template")
search_symbols(repo="local/gstack", query="chain")
search_symbols(repo="local/gstack", query="phase")
get_file_tree(repo="local/gstack", path_prefix="src")
get_file_tree(repo="local/gstack", path_prefix="templates")
```

- [ ] **Step 2: Write comparative analysis**

Create `docs/retrospectives/phase-5-retrospective.md` with sections: Shared Patterns, Differences, GStack Pros, Our Pros, Cons/Improvements, Action Items.

- [ ] **Step 3: Commit retrospective**

```bash
git add docs/retrospectives/phase-5-retrospective.md
git commit -m "docs: phase 5 retrospective — gstack skill chain comparison"
```
