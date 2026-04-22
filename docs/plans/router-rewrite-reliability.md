# Router Rewrite Reliability

Three fixes to the hook pipeline that eliminate false-positive rewrites
and reduce permission prompt noise. No new abstractions.

## Problem

The hook system is over-triggering, causing unwanted permission prompts:

1. Python rewrite fires when `.py` files appear as arguments to
   non-Python commands (e.g., `git add store.py` → `uv run git add store.py`)
2. Python rewrite doesn't skip compound commands
3. Advisories fire on every call — noise that causes permission prompt fatigue

## Constitutional Rules

- No mocks — all tests use real module imports
- Evidence before assertions — show test output
- Stale test enforcement active — source edits need test updates

## Mock Policy

Unit tests (mocks ok): `existsCheck` injectable, `execRewrite` injectable
Stack/E2E (real deps): n/a — all tests are unit tests with injectable fakes

---

### Task 1: Fix Python rewrite to check binary, not args

**Files:** `src/router/python-rewrite.ts`, `tests/router/python-rewrite.test.ts`

Replace `hasPythonSignal` (regex on full command) with a binary check:

1. Extract the binary (first token)

2. Check if binary is a known Python tool

Known Python binaries: `python`, `python3`, `pip`, `pip3`, `pytest`,
`py.test`, `ruff`, `black`, `mypy`, `flake8`, `pylint`, `coverage`,
`uv`, `tox`, `nox`, `hatch`, `poetry`, `isort`, `celery`, `gunicorn`,
`uvicorn`

Remove `.py` in args as a signal entirely. The binary is the signal.

- [ ] Step 1: Write failing tests — `git add store.py` returns null,
  `pytest test_foo.py` rewrites, `black src/main.py` rewrites
- [ ] Step 2: Verify tests fail
- [ ] Step 3: Replace `hasPythonSignal` with `isPythonBinary`
- [ ] Step 4: Verify all tests pass
- [ ] Step 5: Commit

### Task 2: Add compound command guard to Python rewrite

**Files:** `src/router/hook.ts`, `tests/router/hook.test.ts`

The rtk rewrite already checks `isCompoundCommand` (hook.ts:135).
Add the same guard to the Python rewrite step (hook.ts:123).

- [ ] Step 1: Write failing test — compound command not rewritten
- [ ] Step 2: Verify test fails
- [ ] Step 3: Add `!isCompoundCommand(args.command)` guard
- [ ] Step 4: Verify test passes
- [ ] Step 5: Commit

### Task 3: First-occurrence advisory suppression

**Files:** `src/router/rules.ts`, `src/router/hook.ts`,
`src/session/cache.ts`, `tests/router/hook.test.ts`,
`tests/eval/first-occurrence-eval.test.ts`

Advisories fire on every call. Solution: fire once per intent per
session, then suppress. Different intents advise independently.
Eval tests verify first-call advises, second-call suppresses.

Also: exclude `.venv/bin/` paths from CWD path expansion advisory.

- [ ] Step 1: Write failing tests and eval scenarios
- [ ] Step 2: Verify tests fail
- [ ] Step 3: Add `advisedIntents` set to SessionCache,
  check in hook before returning advisory
- [ ] Step 4: Verify tests pass
- [ ] Step 5: Commit
