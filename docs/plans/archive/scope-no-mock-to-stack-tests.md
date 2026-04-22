# Plan: Scope No-Mock Enforcement to Stack/E2E Tests

## Context

The agentic-patterns repo (commit ae7d68a) reframed its constitutional rule from a blanket
"never mock core system components" to "real dependencies in E2E/integration and stack tests
— mocks are appropriate in unit tests for isolation." Rig's enforcement has not followed this
change. The `checkConstitutional()` function blocks mocks in ALL test files regardless of type,
and all skill templates use unscoped negative language.

This plan scopes the no-mock rule to stack/E2E tests only, changes the default from `block` to `advise`, and updates all language to positive framing. Zero-defect tolerance remains unchanged.

## Constitutional Rules for This Plan

- Show command output before claiming done
- Every source file change requires corresponding test changes

## Mock Policy

Protected (scope to stack/E2E): real dependencies in stack/E2E/integration tests
Allowed: mocks in unit test files for isolation

---

### Task 1: Add stack/E2E test file detection to constitutional check

**Files:** `src/enforcement/constitutional.ts`, `tests/enforcement/constitutional.test.ts`
**Test strategy:** Unit tests for `isStackOrE2ETest()` helper + updated mock detection tests
**Mock check:** No protected components involved

- [ ] Add `STACK_TEST_PATTERNS` array to match stack/E2E test filenames:
  - `/\.stack\.test\./`, `/\.e2e\.test\./`, `/\.e2e\.spec\./`, `/(^|\/)stack-tests?\//`, `/(^|\/)e2e\//`
- [ ] Extract `isStackOrE2ETest(filePath: string): boolean` helper
- [ ] Update `checkConstitutional()` no_mocks rule: only fire when file IS a stack/E2E test
  - For non-stack test files with mocks: skip the check (mocks are appropriate)
  - For stack/E2E test files with mocks: apply enforcement as configured
- [ ] Update the violation message from:
  - "Constitutional rule: never mock core system components."
  - "Use real components in tests. If a dependency cannot be used directly, wrap it in a thin adapter and test the adapter separately."
  - To: "Use real dependencies in stack/E2E tests."
  - "Mocks are appropriate in unit tests for isolation. In stack and E2E tests, use real databases, services, and caches."
- [ ] Add tests:
  - `isStackOrE2ETest` returns true for `.stack.test.ts`, `.e2e.test.ts`, `.e2e.spec.ts`, `stack-tests/foo.ts`, `e2e/bar.ts`
  - `isStackOrE2ETest` returns false for `.test.ts`, `.spec.ts`, `tests/foo.ts`
  - `checkConstitutional` blocks `vi.mock` in `foo.stack.test.ts`
  - `checkConstitutional` allows `vi.mock` in `foo.test.ts`
  - `checkConstitutional` allows `vi.mock` in `tests/a.test.ts`
  - Updated message assertions for new wording

### Task 2: Change default no_mocks enforcement level from block to advise

**Files:** `src/config.ts`, `fixtures/full-config.yaml`, `tests/config.test.ts`
**Test strategy:** Update existing config default assertion; full-config fixture keeps block
**Mock check:** No protected components involved

- [ ] Change `DEFAULT_CONFIG.rules.constitutional.no_mocks` from `'block'` to `'advise'` in `src/config.ts:22`
- [ ] Update `tests/config.test.ts:43` — the full-config fixture explicitly sets `block`, so that test stays correct. Add a new assertion that DEFAULT_CONFIG.constitutional.no_mocks is `'advise'`.
- [ ] `fixtures/full-config.yaml` keeps `no_mocks: block` (it's a full explicit config fixture, not the default)

### Task 3: Update brain+ skill template to scoped positive framing

**Files:** `templates/skills/brain-plus/SKILL.md`
**Test strategy:** Verify template renders correctly via existing init tests
**Mock check:** No protected components involved

- [ ] Line 62: `- [ ] No mocks for protected components` → `- [ ] Real dependencies in stack/E2E tests (mocks appropriate in unit tests)`
- [ ] Line 38: `Components that must NOT be mocked (constitutional rules)` → `Components requiring real dependencies in stack/E2E tests (constitutional rules)`

### Task 4: Update plan+ skill template to scoped positive framing

**Files:** `templates/skills/plan-plus/SKILL.md`
**Test strategy:** Verify template renders correctly
**Mock check:** No protected components involved

- [ ] Line 28: `- Use real [database/payment/logger] connections — never mock protected components`
  → `- Use real [database/payment/logger] connections in stack/E2E tests — mocks appropriate in unit tests`
- [ ] Line 38: `Protected (never mock): [list from constitutional rules]` → `Stack/E2E (real deps): [list from constitutional rules]`
- [ ] Line 39: `Allowed: [external third-party services not yet containerized]` → `Unit tests (mocks ok): [all components] / External without sandbox: [third-party services]`

### Task 5: Update tdd+ skill template to scoped language

**Files:** `templates/skills/tdd-plus/SKILL.md`
**Test strategy:** Verify template renders correctly
**Mock check:** No protected components involved

- [ ] Description (line 3): `no-mock enforcement` → `real-dependency enforcement for stack tests`
- [ ] Line 18: `Constitutional no-mock rules are enforced` → `Constitutional real-dependency rules enforced for stack/E2E tests`

### Task 6: Update verify+ skill template to scoped language

**Files:** `templates/skills/verify-plus/SKILL.md`
**Test strategy:** Verify template renders correctly
**Mock check:** No protected components involved

- [ ] Line 79: `- [ ] No protected components mocked` → `- [ ] Real dependencies used in stack/E2E tests (no mocks)`

### Task 7: Update review+ skill template to scoped language

**Files:** `templates/skills/review-plus/SKILL.md`
**Test strategy:** Verify template renders correctly
**Mock check:** No protected components involved

- [ ] Line 45: `- [ ] No protected components are mocked in any test file` → `- [ ] Real dependencies in stack/E2E test files (no mocks in stack tests; mocks appropriate in unit tests)`

### Task 8: Update README, getting-started, and architecture docs

**Files:** `README.md`, `docs/getting-started.md`, `docs/architecture.md`
**Test strategy:** Verify docs are consistent
**Mock check:** No protected components involved

- [ ] `README.md:73`: `no_mocks: block` → `no_mocks: advise`
- [ ] `README.md:10`: `constitutional rules (no mocks)` → `constitutional rules (real dependencies in stack tests)`
- [ ] `docs/getting-started.md:87`: `no_mocks: block` → `no_mocks: advise`
- [ ] `docs/getting-started.md:116`: `Are there mocks in test files?` → `Are there mocks in stack/E2E test files? (mocks are appropriate in unit tests)`
- [ ] `docs/architecture.md:107-109`: Update constitutional rules description to mention stack/E2E scoping:
  - `Regex-based detection of mocking patterns [...] in test file content during edits.` → `Regex-based detection of mocking patterns in stack/E2E test files only. Unit test mocks are permitted for isolation.`

### Task 9: Run full test suite and verify

**Files:** All changed files
**Test strategy:** Full `npm test` run
**Mock check:** N/A

- [ ] Run `npm test` — all 240+ tests pass
- [ ] Run `npm run lint` — no type errors
- [ ] Verify the `docs/plans/` directory doesn't need to be excluded from anything
