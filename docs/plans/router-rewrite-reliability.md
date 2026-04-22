# Router Rewrite Reliability

Three fixes to the hook pipeline that eliminate false-positive rewrites and reduce permission prompt noise. No new abstractions.

## Problem

The hook system is over-triggering, causing unwanted permission prompts:
1. Python rewrite fires when `.py` files appear as arguments to non-Python commands (e.g., `git add store.py` → `uv run git add store.py`)
2. Python rewrite doesn't skip compound commands
3. Advisories fire on in-flight tool calls the agent can't change (Read, Grep, Glob, Explore)

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
**Test strategy:** Unit tests for `isPythonBinary` and updated `hasPythonSignal`; verify `git add store.py` does NOT trigger rewrite

Replace `hasPythonSignal` (regex on full command) with a two-part check:
1. Extract the binary (first token)
2. Check if binary is a known Python tool

Known Python binaries: `python`, `python3`, `python3.x`, `pip`, `pip3`, `pytest`, `py.test`, `ruff`, `black`, `mypy`, `flake8`, `pylint`, `coverage`, `uv`, `tox`, `nox`, `hatch`, `poetry`, `isort`, `pyproject`, `pyinstaller`, `celery`, `gunicorn`, `uvicorn`

Remove `.py` in args as a signal entirely. The binary is the signal.

- [ ] Step 1: Write failing tests — `git add store.py` returns null, `pytest test_foo.py` rewrites, `git commit -m ".py file"` returns null, `black src/main.py` rewrites
- [ ] Step 2: Verify tests fail
- [ ] Step 3: Replace `hasPythonSignal` with `isPythonBinary` check; update `tryPythonRewrite` to use it
- [ ] Step 4: Verify all tests pass
- [ ] Step 5: Commit

### Task 2: Add compound command guard to Python rewrite

**Files:** `src/router/hook.ts`, `tests/router/hook.test.ts`
**Test strategy:** Unit test that `git add store.py && git commit -m "msg"` is NOT rewritten by Python env

The rtk rewrite already checks `isCompoundCommand` (hook.ts:135). Add the same guard to the Python rewrite step (hook.ts:123).

- [ ] Step 1: Write failing test — compound command with `.py` args does not get Python rewrite
- [ ] Step 2: Verify test fails
- [ ] Step 3: Add `!isCompoundCommand(args.command)` to the Python rewrite condition
- [ ] Step 4: Verify test passes
- [ ] Step 5: Commit

### Task 3: Suppress in-flight advisories

**Files:** `src/router/rules.ts`, `src/router/hook.ts`, `tests/router/hook.test.ts`
**Test strategy:** Unit tests verify Read/Grep/Glob/Explore return null when the agent can't switch tools

The native_read, native_grep, native_glob, and scout_explore rules fire advisories after the agent has already chosen its tool. The agent can't switch mid-call, so these are noise that cause permission prompts.

Change default enforcement to `silent` for these four intents. Users who want the nudge can set them to `advise` in `.harness.yaml`. The config override already works — just change the rule defaults.

Also: the CWD path expansion advisory fires on `.venv/bin/` paths, which are legitimate. Add an exclusion for paths containing `.venv/`.

- [ ] Step 1: Write failing tests — Read on code file returns null, Grep returns null, Glob returns null, Agent Explore returns null (all with jcodemunch indexed). Also: `.venv/bin/pip` does not trigger cwd_path_expand.
- [ ] Step 2: Verify tests fail
- [ ] Step 3: Change enforcement defaults to `silent` for native_read, native_grep, native_glob, scout_explore. Add `.venv/` exclusion to cwd_path_expand match.
- [ ] Step 4: Verify tests pass, update existing tests that expect ADVISE output to expect null
- [ ] Step 5: Commit
