# Plan: File-backed session cache, environment-aware init, and E2E hook tests

Implements retrospective action items 12, 13, and 17 — the three most-flagged
improvements across all seven phase retrospectives.

## Context

Rig's session cache is in-memory only. Each hook invocation is a separate
Node.js process, so state written by session-start is invisible to pre-tool-use
and post-tool-use. The template renderer has no environment awareness. Hook
protocol correctness is only tested at the function level, never as subprocesses.

## Constitutional Rules for This Plan

- No mocks for environment detection — use injectable `ExecFn`
- No mocks for file I/O — use real temp directories and real files
- No mocks for subprocess spawning — use real `child_process` in E2E tests
- Every source file change requires corresponding test changes
- Show command output before claiming done

## Mock Policy

Protected (never mock): file system operations, child process spawning,
environment detection (`detectEnvironment` with real `ExecFn`)
Allowed: nothing — all tests use real components

---

## Task 1: File-backed SessionCache with /tmp persistence

**Files:**

- `src/session/cache.ts` — add `load()`/`save()`, constructor accepts `cwd`
- `src/types.ts` — add `SessionCacheFile` interface
- `src/session/metrics.ts` — remove file I/O, delegate to cache
- `src/session/start.ts` — pass `cwd` to SessionCache constructor
- `templates/hooks/session-start.ts` — pass `cwd` to constructor
- `templates/hooks/pre-tool-use.ts` — pass `cwd` to constructor
- `templates/hooks/post-tool-use.ts` — pass `cwd` to constructor
- `tests/session/cache.test.ts` — add file-backed cache tests

**Test strategy:** Extend existing cache tests. Add tests for:

- `load()` from nonexistent file returns fresh cache
- `load()` from nonexistent file returns fresh cache
- `save()` writes valid JSON to `/tmp`
- `load()` round-trips all fields (environment, editedFiles, phase, metrics)
- TTL check on load: stale environment is cleared
- Constructor without `cwd` works in-memory (backward compat)
- Constructor with `cwd` loads from file

**Mock check:** No mocks. Real file I/O to `/tmp` with unique per-test paths.

- [ ] Step 1: Add `SessionCacheFile` interface to `src/types.ts`
- [ ] Step 2: Add `sessionCachePath(cwd)` helper using sha256 hash
- [ ] Step 3: Add `load(cwd)` — read file, deserialize, check TTL, return cache
- [ ] Step 4: Add `save(cwd)` — serialize to JSON, write to `/tmp` (best-effort)
- [ ] Step 5: Refactor constructor to accept optional `cwd`, call `load()` if provided
- [ ] Step 6: Call `save()` after every mutation (setEnvironment, addEditedFile, setPhase, etc.)
- [ ] Step 7: Remove `.rig-session.json` file I/O from `metrics.ts`
  — `incrementSessionCounter` reads/writes via cache instead
- [ ] Step 8: Update hook templates to pass `process.cwd()` to constructor
- [ ] Step 9: Write failing tests for file-backed behavior
- [ ] Step 10: Verify tests pass, run full suite
- [ ] Step 11: Commit

## Task 2: Environment-aware context building in init

**Files:**

- `src/cli/init.ts` — run `detectEnvironment()`, build conditional context
- `src/session/environment.ts` — export `detectEnvironment` (may already be exported)
- `templates/hooks/pre-tool-use.ts` — use env-aware template vars in comments
- `tests/cli/init.test.ts` — add env-aware context tests

**Test strategy:** Test that `initCommand()` builds different context based on
environment detection results. Use injectable `ExecFn` to control what
`detectEnvironment` returns.

**Mock check:** No mocks. Use injectable `ExecFn` per existing convention.

- [ ] Step 1: Import `detectEnvironment` in `init.ts`
- [ ] Step 2: Call `detectEnvironment(cwd, execSync)` during init
- [ ] Step 3: Add conditional context variables (RTK_PATH, JCODEMUNCH_AVAILABLE)
- [ ] Step 4: Update hook template comments to reference env-aware vars
- [ ] Step 5: Write failing test: init with rtk available sets RTK_PATH
- [ ] Step 6: Write failing test: init without rtk omits RTK_PATH
- [ ] Step 7: Verify tests pass, run full suite
- [ ] Step 8: Commit

## Task 3: E2E hook protocol tests

**Files:**

- `tests/helpers/hook-runner.ts` — new test helper
- `tests/integration/pre-tool-use.test.ts` — new E2E tests
- `tests/integration/post-tool-use.test.ts` — new E2E tests
- `tests/integration/session-start.test.ts` — new E2E tests

**Test strategy:** Spawn real subprocesses for each hook template. Verify
stdin/stdout JSON protocol, exit codes, and stderr output. Each test creates
a temp dir with `.harness.yaml` and session cache file.

**Mock check:** No mocks. Real subprocesses, real files, real config.

**Test cases (pre-tool-use):**

- Block `sed -i` command → exit 2, stderr contains `[BLOCK]`
- Advise `grep -r` command → exit 0, stderr contains `[ADVISE]`
- Allow `Read` tool → exit 0, no stderr
- Allow `Write` tool → exit 0, no stderr
- Malformed stdin → exit 0 (graceful)

**Test cases (post-tool-use):**

- Edit test file with mock pattern → stderr contains constitutional violation
- Edit source file (first edit) → no stale test warning (grace period)
- Bash test command with failure output → stderr contains zero-defect

**Test cases (session-start):**

- Creates session cache file in `/tmp`
- Returns init message on stderr
- Re-detects environment when cache is stale

- [ ] Step 1: Create `tests/helpers/hook-runner.ts` with `runHook()` helper
- [ ] Step 2: Write failing pre-tool-use E2E tests
- [ ] Step 3: Verify tests pass
- [ ] Step 4: Write failing post-tool-use E2E tests
- [ ] Step 5: Verify tests pass
- [ ] Step 6: Write failing session-start E2E tests
- [ ] Step 7: Verify tests pass
- [ ] Step 8: Run full test suite, confirm no regressions
- [ ] Step 9: Commit

## Task 4: Update docs and CLAUDE.md

**Files:**

- `CLAUDE.md` — update conventions (session cache now file-backed, not in-memory)
- `docs/architecture.md` — update session cache description, add E2E testing note
- `docs/getting-started.md` — no changes expected (init UX unchanged)
- `docs/extending.md` — no changes expected
- `README.md` — no changes expected

**Test strategy:** Run `./node_modules/.bin/markdownlint-cli2 '**/*.md'` to verify
docs pass lint. No code tests for doc changes.

**Mock check:** N/A

- [ ] Step 1: Update CLAUDE.md convention: "Session cache has 30-min TTL,
  file-backed in /tmp (cross-process persistence)"
- [ ] Step 2: Update `docs/architecture.md` session cache section:
  file-backed, /tmp storage, cwd-hash naming, JSON format, TTL on environment
- [ ] Step 3: Add E2E testing note to architecture.md testing section
- [ ] Step 4: Run markdownlint, verify 0 errors
- [ ] Step 5: Commit

## Implementation Order

1. Task 1 (file-backed cache) — foundation, tasks 2 and 3 depend on it
2. Task 2 (env-aware init) — independent of task 3, can follow task 1
3. Task 3 (E2E tests) — depends on task 1 for file-backed cache behavior
4. Task 4 (docs) — last, after all code changes settle

## Verification

After all tasks:

- `npm run build` — TypeScript compiles with no errors
- `npm test` — all tests pass (unit + integration)
- `./node_modules/.bin/markdownlint-cli2 '**/*.md'` — 0 lint errors
- Manual: run `rig init --force` in a test project, verify session cache
  appears in `/tmp/rig-session-*.json`
- Manual: run hooks in a Claude Code session, verify cross-invocation state
