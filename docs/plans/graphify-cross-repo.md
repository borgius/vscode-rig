# Plan: Graphify Auto-Build for External Codebases

## Overview

Enable the scout agent to auto-build graphify knowledge graphs for any directory
it targets, not just the CWD repo. Mirrors the existing `ensureIndexed()` pattern
from jcodemunch cross-repo support.

## Constitutional Rules for This Plan

- Show command output before claiming done
- Every source file change requires corresponding test changes
- Full-loop assertions: verify primary + second-order + third-order effects

## Mock Policy

Unit tests (mocks ok): `execSync` calls (external CLI invocations)
No protected components involved — pure function logic with injectable exec.

## Design Decisions (from brain+)

1. **`ensureGraphBuilt()` mirrors `ensureIndexed()`** — checks if graph exists
   at `<directory>/graphify-out/graph.json`, runs `graphify update <directory>`
   if not. Returns a typed result.
2. **Read graph.json directly** — no MCP bridge, just read the JSON file from
   the target directory for stats.
3. **Scout agent runtime, not session cache** — per-directory graph availability
   is tracked in the scout agent's invocation context, not persisted.
4. **Session-start unchanged** — still only detects graphify for CWD.
5. **Graceful fallback** — if graphify not installed or build fails, proceed
   without graph context.

---

### Task 1: Add `GraphBuildResult` type and `ensureGraphBuilt()` to `cross-repo.ts`

**Files:** `src/scout/cross-repo.ts`
**Test strategy:** `tests/scout/cross-repo.test.ts` — new `describe('ensureGraphBuilt')` block
**Mock check:** `execSync` mocked (external CLI); `existsSync` mocked via injectable
**Evidence criteria:** All `ensureGraphBuilt` tests pass

- [ ] Step 1: Write failing tests for `ensureGraphBuilt`
  - Returns `{ alreadyBuilt: true, graphPath }` when graph.json exists
  - Returns `{ alreadyBuilt: false, graphPath }` after successful build
  - Returns `null` when graphify not available (env check)
  - Returns `null` when build fails (execSync throws)
  - Uses injectable `existsCheck` and `execFn` for testability
- [ ] Step 2: Verify tests fail (function not yet exported)
- [ ] Step 3: Implement `ensureGraphBuilt`:
  ```typescript
  interface GraphBuildResult {
    alreadyBuilt: boolean;
    graphPath: string;
  }

  export function ensureGraphBuilt(
    directory: string,
    env: Environment,
    exec: ExecFn,
    existsCheck: (path: string) => boolean = existsSync,
  ): GraphBuildResult | null {
    // 1. Check graphify is installed (env.graphifyAvailable)
    // 2. Check if graph.json already exists at <directory>/graphify-out/graph.json
    // 3. If exists, return { alreadyBuilt: true, graphPath: 'graphify-out/graph.json' }
    // 4. If not, run `graphify update <directory>` via execFn
    // 5. Re-check graph.json exists; return { alreadyBuilt: false, graphPath } or null
  }
  ```
- [ ] Step 4: Verify all tests pass
- [ ] Step 5: Commit

### Task 2: Update scout agent template with graphify build step

**Files:** `templates/agents/scout.md`
**Test strategy:** Manual verification — template renders correctly with `rig init`
**Mock check:** N/A (template file)
**Evidence criteria:** Scout template includes Step 1.5 that calls graphify build

- [ ] Step 1: Write a test verifying the scout template contains `graphify update`
  - Read the rendered template and check for graphify build instructions
  - Add to `tests/scout/` or a new template test file
- [ ] Step 2: Verify it fails (template not yet updated)
- [ ] Step 3: Update `templates/agents/scout.md`:
  - Add "Step 1.5: Build graph if needed" between Step 1 and Step 2
  - Instruction: check if `<target>/graphify-out/graph.json` exists
  - If not, run `graphify update <target>` via Bash
  - Gate on graphify being available (check `which graphify`)
  - Proceed with Step 2.5 relationship queries after successful build
- [ ] Step 4: Verify test passes
- [ ] Step 5: Commit

### Task 3: Add eval tests for cross-repo graphify scenarios

**Files:** `tests/eval/graphify-eval.test.ts` (update existing)
**Test strategy:** Eval tests verify end-to-end routing behavior with graphify cross-repo
**Mock check:** `execSync` mocked
**Evidence criteria:** New eval scenarios pass

- [ ] Step 1: Write failing tests for cross-repo graphify scenarios:
  - Scout invokes ensureGraphBuilt on external directory
  - ensureGraphBuilt correctly skips when graph already exists
  - ensureGraphBuilt triggers build for new directory
  - Routing unchanged when graphify not installed
- [ ] Step 2: Verify tests fail
- [ ] Step 3: Ensure tests work with the implementation from Task 1
  - May need minor adjustments to test setup (imports, mocks)
- [ ] Step 4: Verify all eval tests pass
- [ ] Step 5: Commit

### Task 4: Update `docs/architecture.md` cross-repo section

**Files:** `docs/architecture.md`
**Test strategy:** N/A (docs)
**Mock check:** N/A
**Evidence criteria:** Architecture docs describe `ensureGraphBuilt` alongside `ensureIndexed`

- [ ] Step 1: Update Layer 4: Scout Agent section to mention `ensureGraphBuilt`
- [ ] Step 2: Update the scout agent data flow diagram to include graphify build step
- [ ] Step 3: Commit

### Task 5: Build, full test suite, and verify

**Files:** None (verification only)
**Test strategy:** Full suite (`npm test`)
**Mock check:** N/A
**Evidence criteria:** All 300+ tests pass, `npm run build` succeeds, `npm run lint` clean

- [ ] Step 1: Run `npm run build` — must succeed
- [ ] Step 2: Run `npm test` — all tests pass
- [ ] Step 3: Run `npm run lint` — type-check clean
- [ ] Step 4: Commit any fixes if needed
