# Plan: Expand Context Eval Test Coverage

Five new eval categories to verify deterministic behavior across the full toolkit.

## Constitutional Rules for This Plan

- Every source file change requires corresponding test changes
- Show command output before claiming done
- Full-loop assertions: verify primary + second-order effects

## Mock Policy

- Unit tests: mock `execSync`/`execFileSync`/`existsSync` (injectable), use real SessionCache
- No mocks for config or types

---

### Task 1: Add PythonEnv presets and scenarios
**Files:** `tests/eval/scenarios.ts`, `tests/eval/python-eval.test.ts` (new)
**Test strategy:** New eval test file with PythonEnv-aware scenarios + scoring
**Mock check:** None — injectable `existsCheck`

- [ ] Add `PYTHON_ENV_PRESETS` to `scenarios.ts`: `venv` (.venv path set), `uv_only` (uv available, no venv), `both` (venv + uv), `no_python` (neither)
- [ ] Add Python eval scenarios to `ALL_SCENARIOS` (category: `python`):
  - `python_pytest_venv` — `pytest tests/test_foo.py -v` with .venv → rewrite to `.venv/bin/pytest`
  - `python_pytest_uv` — `pytest tests/test_foo.py -v` with uv only → rewrite to `uv run pytest`
  - `python_pytest_noenv` — `pytest tests/test_foo.py -v` with no python env → allow
  - `python_pytest_nopy` — `pytest --version` (no .py signal) with venv → allow
  - `python_python_venv` — `python src/main.py` with .venv → rewrite to `.venv/bin/python`
  - `python_custom_tool_venv` — `my-custom-runner tests/foo.py` with binary in venv → rewrite
  - `python_custom_tool_uv` — `my-custom-runner tests/foo.py` with uv → rewrite to `uv run`
- [ ] Create `tests/eval/python-eval.test.ts` — runs Python scenarios across `PYTHON_ENV_PRESETS` × existing `ENV_PRESETS`, uses `scoreResult` + `buildReport`
- [ ] Wire Python env into cache via `cache.setPythonEnv()` in the eval runner
- [ ] Verify: `npx vitest run tests/eval/python-eval.test.ts` passes

### Task 2: Add config override scenarios
**Files:** `tests/eval/scenarios.ts`, `tests/eval/config-override-eval.test.ts` (new)
**Test strategy:** New eval test file with custom config overrides
**Mock check:** None

- [ ] Add config override eval scenarios (category: `config_override`):
  - `config_native_read_block` — Read code file with `native_read: 'block'` config → block
  - `config_native_read_silent` — Read code file with `native_read: 'silent'` config → allow (suppressed)
  - `config_native_grep_block` — Grep with `native_grep: 'block'` config → block
  - `config_grep_block` — Bash grep with `grep: 'block'` config → block
  - `config_cwd_path_block` — CWD path expand with `cwd_path_expand: 'block'` → block
  - `config_cwd_path_silent` — CWD path expand with `cwd_path_expand: 'silent'` → allow
- [ ] Create `tests/eval/config-override-eval.test.ts` — applies config overrides per scenario, asserts routing changes
- [ ] Verify: `npx vitest run tests/eval/config-override-eval.test.ts` passes

### Task 3: Add session state scenarios
**Files:** `tests/eval/scenarios.ts`, `tests/eval/session-state-eval.test.ts` (new)
**Test strategy:** New eval test file with pre-populated session cache
**Mock check:** None

- [ ] Add session state eval scenarios (category: `session_state`):
  - `state_python_env_cached` — Bash pytest with .py file, python env cached → rewrite
  - `state_python_env_empty` — same command, no python env cached → allow
  - `state_stale_env` — environment detected 5h ago → still routes correctly (env cleared, falls through)
  - `state_phase_tdd` — phase set to tdd+, python rewrite still fires → rewrite
- [ ] Create `tests/eval/session-state-eval.test.ts` — pre-populates cache with various states
- [ ] Verify: `npx vitest run tests/eval/session-state-eval.test.ts` passes

### Task 4: Add enforcement pipeline scenarios
**Files:** `tests/eval/enforcement-eval.test.ts` (new), `tests/eval/enforcement-scenarios.ts` (new)
**Test strategy:** New eval test file testing PostToolUse determinism
**Mock check:** None — uses real FileTracker and SessionCache

- [ ] Create `tests/eval/enforcement-scenarios.ts` with enforcement eval scenarios:
  - `enforce_source_no_test` — edit source file, no test edit → stale test violation
  - `enforce_source_with_test` — edit source + test file → no violation
  - `enforce_mock_in_stack_test` — `vi.mock` in stack test file → constitutional violation
  - `enforce_mock_in_unit_test` — `vi.mock` in unit test file → no violation
  - `enforce_test_failure` — test output with failures → zero-defect violation
  - `enforce_test_pass` — test output with all pass → no violation
- [ ] Create `tests/eval/enforcement-eval.test.ts` — runs `handlePostToolUse` with various contexts, scores results
- [ ] Verify: `npx vitest run tests/eval/enforcement-eval.test.ts` passes

### Task 5: Add determinism (idempotency) scenarios
**Files:** `tests/eval/determinism-eval.test.ts` (new)
**Test strategy:** Run same input twice, assert identical output
**Mock check:** None

- [ ] Create determinism eval test that:
  - Takes a representative sample of scenarios (at least 1 per category)
  - Runs each scenario twice with same inputs
  - Asserts `JSON.stringify(result1) === JSON.stringify(result2)`
  - Tests: routing idempotency, enforcement idempotency, python rewrite idempotency
- [ ] Verify: `npx vitest run tests/eval/determinism-eval.test.ts` passes

### Task 6: Wire new eval categories into existing eval runner
**Files:** `tests/eval/eval.test.ts`
**Test strategy:** Update main eval runner to include python scenarios
**Mock check:** None

- [ ] Add Python eval scenarios to the main `eval.test.ts` runner (they use the same `handlePreToolUse` interface)
- [ ] Verify all eval tests pass: `npx vitest run tests/eval/`

## Evidence Criteria

- `npx vitest run tests/eval/` passes with all new eval tests
- `npm run build` succeeds
- `npx tsc --noEmit` passes
- Total eval scenarios increase from ~100 to ~150+
