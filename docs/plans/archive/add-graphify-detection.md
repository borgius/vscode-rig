# Plan: Add Graphify Detection to Rig's Environment System

## Context

Graphify (`/home/jerome/.local/bin/graphify`) is installed but rig's environment
detection only knows about rtk and jcodemunch. The session start output and
`/savings` report don't mention graphify at all.

Graphify is a CLI tool (no MCP server, no token-savings API). Detection is a
simple `which graphify` check. The savings report will show availability only
— no delta computation since graphify doesn't expose token metrics.

## Constitutional Rules for This Plan

- Active enforcement: no_mocks (advise), evidence_only (block), full_accounting (advise)
- Use real exec calls in environment detection tests (injectable ExecFn pattern already in place — no mocks needed)
- Every source file change requires corresponding test changes

## Mock Policy

- Unit tests: injectable ExecFn (project convention — not a mock framework)
- Integration tests: real subprocess calls (may fail gracefully in CI)

---

### Task 1: Add graphify fields to Environment type

**Files:** `src/types.ts`
**Test strategy:** Type-checked at compile time (`npm run lint`); validated by environment detection tests in Task 2
**Mock check:** None (type definition only)

Add two fields to the `Environment` interface (lines 63-71):

```typescript
graphifyAvailable: boolean;
graphifyPath: string | null;
```

No changes to `SessionCacheFile` — graphify fields are nested inside `environment: Environment`.

- [ ] Step 1: Add fields to `Environment` in `src/types.ts`
- [ ] Step 2: Run `npm run lint` to confirm type-check passes downstream

---

### Task 2: Add detectGraphify and wire into detectEnvironment

**Files:** `src/session/environment.ts`, `tests/session/environment.test.ts`
**Test strategy:** 3 new unit tests in `environment.test.ts`: graphify available,
graphify unavailable, co-detection with rtk/jcodemunch. Update existing tests
to include `which graphify` in mock exec maps.
**Mock check:** Uses injectable ExecFn (project convention)

Add `detectGraphify(exec)` function following the same pattern as `detectRtk` (line 30-37):

```typescript
function detectGraphify(exec: ExecFn): { available: boolean; path: string | null } {
  try {
    const path = exec('which graphify').trim();
    return { available: true, path };
  } catch {
    return { available: false, path: null };
  }
}
```

Call it from `detectEnvironment()` and populate the new fields in the return object.

Update existing test `makeExec` maps to include `'which graphify': new Error('not found')` in all tests that don't already handle it. Add 3 new test cases:

1. `detects graphify available when which succeeds` — mock returns path, verify `graphifyAvailable: true` and `graphifyPath`
2. `detects graphify unavailable when which fails` — verify `graphifyAvailable: false`, `graphifyPath: null`
3. `detects all three tools simultaneously` — rtk + jcodemunch + graphify all available

- [ ] Step 1: Write failing test for graphify detection
- [ ] Step 2: Verify it fails (`npm test -- tests/session/environment.test.ts`)
- [ ] Step 3: Add `detectGraphify` function and wire into `detectEnvironment`
- [ ] Step 4: Verify all environment tests pass
- [ ] Step 5: Commit

---

### Task 3: Add graphify to session start output

**Files:** `src/session/start.ts`
**Test strategy:** Integration test in `tests/integration/session-start.test.ts` checks session start output contains graphify status
**Mock check:** None — integration test runs real hooks

In `handleSessionStart()` (line 35-39), add graphify status line after jcodemunch:

```typescript
`  graphify: ${env.graphifyAvailable ? `available (${env.graphifyPath})` : 'not found'}`,
```

In the missing-tools warning block (line 74-81), add graphify:

```typescript
if (!env.graphifyAvailable) {
  lines.push('[WARNING] graphify is not installed. Install for knowledge graph generation: https://github.com/franklywatson/graphify');
}
```

Update the integration test to verify the graphify line appears in session start output (resilient to CI subprocess failures per project convention).

- [ ] Step 1: Write failing integration test for graphify in session start output
- [ ] Step 2: Verify it fails
- [ ] Step 3: Add graphify status line to session start output
- [ ] Step 4: Add graphify to missing-tools warning
- [ ] Step 5: Verify integration tests pass
- [ ] Step 6: Commit

---

### Task 4: Add graphify to savings report

**Files:** `src/session/metrics.ts`, `templates/skills/savings/SKILL.md`, `tests/session/metrics.test.ts`
**Test strategy:** Unit tests for `formatSavingsReport` with graphify available/unavailable
**Mock check:** None — pure function tests

In `formatSavingsReport()` (line 56-87), add `graphifyAvailable?: boolean` parameter. After the jcodemunch line, add:

```typescript
if (graphifyAvailable) {
  lines.push(`  graphify: available`);
}
```

Update the savings skill template to:

1. Add step 5: check `environment.graphifyAvailable` from the cache file
2. Add graphify line to the output format examples
3. Add formatting rule: graphify shows availability only (no savings data)

Add 2 test cases:

1. `includes graphify line when available` — verify output contains `graphify: available`
2. `omits graphify line when not available` — verify no graphify mention

- [ ] Step 1: Write failing tests for graphify in formatSavingsReport
- [ ] Step 2: Verify they fail
- [ ] Step 3: Add `graphifyAvailable` param to `formatSavingsReport` and output line
- [ ] Step 4: Update savings skill template with graphify procedure and output format
- [ ] Step 5: Verify all metrics tests pass
- [ ] Step 6: Commit

---

### Task 5: Run full test suite and verify

**Files:** None (verification only)
**Test strategy:** Full `npm test` + `npm run lint`
**Mock check:** N/A

- [ ] Step 1: Run `npm run lint` — zero errors
- [ ] Step 2: Run `npm test` — all tests pass, coverage gates met
- [ ] Step 3: Run `npm run build` — clean compile
