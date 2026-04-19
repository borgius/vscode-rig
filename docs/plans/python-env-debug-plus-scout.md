# Plan: Python Environment Detection, debug+ Skill, Scout Integration

Three features: Python env detection in the tool router, a new `debug+` skill, and stronger scout integration in `plan+` and `debug+`.

## Constitutional Rules for This Plan

- Every source file change requires corresponding test changes
- Show command output before claiming done
- Use real filesystem for python env detection tests (injectable `ExecFn` + `existsSync`)

## Mock Policy

- Unit tests: mock `execSync`/`execFileSync` (injectable), use real `fs.existsSync` with temp dirs
- No mocks for SessionCache or config

---

### Task 1: Add PythonEnv type and cache integration
**Files:** `src/types.ts`, `src/session/cache.ts`, `tests/session/cache.test.ts`
**Test strategy:** Unit tests for PythonEnv round-trip through cache, staleness, reset
**Mock check:** None — pure data types and cache

- [ ] Add `PythonEnv` interface to `src/types.ts`: `{ venvPath: string | null; uvAvailable: boolean; uvPath: string | null; detectedAt: number }`
- [ ] Add `pythonEnv` field to `SessionCacheFile`
- [ ] Add `getPythonEnv()`, `setPythonEnv()` methods to `SessionCache`
- [ ] Wire into `serialize()`/`load()`/`reset()`
- [ ] Write tests: round-trip, reset clears pythonEnv, coexists with existing cache fields

### Task 2: Python environment detection
**Files:** `src/session/python-env.ts` (new), `tests/session/python-env.test.ts` (new)
**Test strategy:** Unit tests with injectable `ExecFn` and temp dirs for `.venv` detection
**Mock check:** None — injectable dependencies

- [ ] Write `detectPythonEnv(cwd, exec, existsCheck?)` that returns `PythonEnv`:
  - Check `.venv/bin/` exists in cwd → `venvPath`
  - Run `which uv` → `uvAvailable`, `uvPath`
  - Return `{ venvPath, uvAvailable, uvPath, detectedAt }`
- [ ] Write tests: venv detected, no venv, uv detected, neither detected, injectable exec

### Task 3: Python command rewrite in the tool router
**Files:** `src/router/python-rewrite.ts` (new), `src/router/hook.ts`, `tests/router/python-rewrite.test.ts` (new), `tests/router/hook.test.ts`
**Test strategy:** Unit tests for rewrite logic (signal detection + resolution), integration tests in hook.test.ts
**Mock check:** None

- [ ] Write `hasPythonSignal(command)` — returns true if command args contain a `.py` file path
- [ ] Write `tryPythonRewrite(command, cwd, pythonEnv, existsCheck?)` — resolution chain:
  1. Extract binary name from command
  2. If `.venv/bin/<binary>` exists → rewrite to `.venv/bin/<binary> <rest>`
  3. Else if `uvAvailable` → rewrite to `uv run <command>`
  4. Else → return null (pass through)
- [ ] Write tests for each resolution path, edge cases (no .py signal, binary in .venv but no .py file, etc.)
- [ ] Insert as Step 1.5 in `handlePreToolUse()` — after resolution blocks, before rtk rewrite
- [ ] Add integration tests in hook.test.ts: Python rewrite fires for `pytest foo.py`, doesn't fire for `pytest` alone, doesn't fire for non-Python commands

### Task 4: Wire python detection into session start
**Files:** `src/session/start.ts`, `tests/session/start.test.ts`
**Test strategy:** Unit tests verifying python env is detected and cached on session start
**Mock check:** None — injectable `ExecFn`

- [ ] Call `detectPythonEnv()` in `handleSessionStart()` alongside `detectEnvironment()`
- [ ] Cache result via `cache.setPythonEnv()`
- [ ] Update tests to verify python env is cached

### Task 5: Add debug+ skill and phase tracker integration
**Files:** `src/skills/phase-tracker.ts`, `templates/skills/debug-plus/SKILL.md` (new), `templates/skills/investigate/SKILL.md`, `tests/skills/phase-tracker.test.ts`, `src/cli/init.ts`
**Test strategy:** Unit tests for phase transitions, verify `debug+` is a free-transition phase
**Mock check:** None

- [ ] Add `'debug+'` to `PHASE_ORDER` as a standalone phase (after `review+`)
- [ ] Add `canTransitionTo('debug+')` → always true (like `review+`, no prerequisite)
- [ ] Create `templates/skills/debug-plus/SKILL.md` wrapping `superpowers:systematic-debugging` with:
  - Phase A: Scout agent invocation (same pattern as `brain+`)
  - Phase B: Delegate to `superpowers:systematic-debugging`
  - Phase C: Report findings
- [ ] Update `templates/skills/investigate/SKILL.md` to redirect to `/debug+` (backward compat alias)
- [ ] Add `'debug-plus'` to `skillDirs` array in `init.ts`
- [ ] Write tests: `debug+` transitions freely from any phase, phase tracker includes it

### Task 6: Strengthen scout integration in plan+ and debug+
**Files:** `templates/skills/plan-plus/SKILL.md`, `templates/skills/debug-plus/SKILL.md`
**Test strategy:** Manual verification (SKILL.md templates are prose, not code)
**Mock check:** None

- [ ] Add explicit Phase A scout invocation to `plan+`:
  ```
  1. Invoke the scout agent to map the codebase and validate file paths:
     Agent(subagent_type="scout", prompt="Map the codebase structure for [plan area]. Verify these file paths exist: [list from plan]. Focus on: dependencies, test files, and related modules.")
  ```
- [ ] Ensure `debug+` Phase A scout invocation matches `brain+` pattern:
  ```
  1. Invoke the scout agent to map the affected area:
     Agent(subagent_type="scout", prompt="Map the codebase around [affected files/modules]. Focus on: related functions, callers, test files, and recent changes.")
  ```

### Task 7: Update docs and init command
**Files:** `docs/architecture.md`, `docs/getting-started.md`, `README.md`
**Test strategy:** Manual review
**Mock check:** None

- [ ] Add Python environment detection to architecture docs (Layer 1 section)
- [ ] Add `debug+` to skill chain tables in README, getting-started, architecture
- [ ] Update `investigate` references to note it's an alias for `debug+`

## Evidence Criteria

- `npm test` passes with all new tests
- `npm run build` succeeds
- `npm run lint` passes
- Phase tracker accepts `debug+` from any phase
- Python rewrite fires for `.py` commands when venv/uv present
