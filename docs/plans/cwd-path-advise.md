# Plan: CWD Path Normalization Rule

Advise when Claude issues Bash commands with fully-qualified CWD paths instead
of `./` relative paths. Saves tokens and improves readability.

## Design Summary

New PreToolUse rule `cwd_path_expand` detects Bash commands starting with the
fully-qualified CWD path (e.g., `/home/user/proj/.venv/bin/pip`) and advises
using `./` relative form (e.g., `./.venv/bin/pip`). Leading path only, no
argument rewriting.

## Constitutional Rules for This Plan

- no_mocks (advise): real deps in stack/E2E tests; mocks fine in unit tests
- evidence_only (block): show command output before claiming done
- full_accounting (advise): account for second-order effects

## Mock Policy

Unit tests (mocks ok): all components — this is a pure routing rule with no
external dependencies. Mock `process.cwd()` via injectable parameter.

## Tasks

### Task 1: Add `cwd_path_expand` to types and config
**Files:** `src/types.ts`, `src/config.ts`
**Test strategy:** Existing type/config tests should pass after changes
**Mock check:** None — type definitions and config defaults only
- [ ] Step 1: Add `cwd_path_expand` to `IntentType` union in `src/types.ts`
- [ ] Step 2: Add `cwd_path_expand?: EnforcementLevel` to `ToolRoutingRules` in `src/types.ts`
- [ ] Step 3: Add `cwd_path_expand: 'advise'` to `DEFAULT_CONFIG.tool_routing` in `src/config.ts`
- [ ] Step 4: Verify `npm run build` passes

### Task 2: Add CWD path detection to router rules
**Files:** `src/router/rules.ts`, `src/router/hook.ts`
**Test strategy:** Unit tests in `tests/router/rules.test.ts` and `tests/router/hook.test.ts`
**Mock check:** None — pure function logic
- [ ] Step 1: Add new rule to `getDefaultRules()` in `src/router/rules.ts` with match function that:
  - Checks `tool === 'Bash'`
  - Gets `args.command` as string
  - Compares against CWD prefix (passed via closure from hook.ts since rule match functions don't receive cwd)
  - Returns true if command starts with `cwd + '/'`
- [ ] Step 2: Add `cwd_path_expand: 'cwd_path_expand'` mapping to `INTENT_CONFIG_KEYS` in `src/router/hook.ts`
- [ ] Step 3: Wire CWD through to `handlePreToolUse` — modify signature to accept optional `cwd` param (default `process.cwd()`) for testability
- [ ] Step 4: Wire CWD through to `getDefaultRules()` — modify to accept optional `cwd` param for testability
- [ ] Step 5: Verify `npm run build` passes

### Task 3: Write failing tests for CWD path rule
**Files:** `tests/router/rules.test.ts`, `tests/router/hook.test.ts`
**Test strategy:** RED phase — write tests that fail until implementation exists
**Mock check:** None — testing pure match functions and hook handler
- [ ] Step 1: Add test in `rules.test.ts`: match returns true when command starts with CWD path
- [ ] Step 2: Add test: match returns false when command starts with different path
- [ ] Step 3: Add test: match returns false for non-Bash tools
- [ ] Step 4: Add test: match returns false when command starts with bare command name
- [ ] Step 5: Add test in `hook.test.ts`: hook returns advise message with suggested `./` path
- [ ] Step 6: Add test: hook respects `silent` enforcement level
- [ ] Step 7: Add test: hook respects `block` enforcement level
- [ ] Step 8: Verify tests fail (`npm test`)

### Task 4: Implement CWD path rule and make tests pass
**Files:** `src/router/rules.ts`, `src/router/hook.ts`
**Test strategy:** GREEN phase — minimal implementation to pass all tests
**Mock check:** None
- [ ] Step 1: Implement the match function in `getDefaultRules()` using injected cwd
- [ ] Step 2: Update `handlePreToolUse` to pass cwd to `getDefaultRules()`
- [ ] Step 3: Verify all tests pass (`npm test`)
- [ ] Step 4: Verify build passes (`npm run build`)

### Task 5: Wire into hook script template
**Files:** `templates/hooks/pre-tool-use.ts`
**Test strategy:** Existing init tests verify template generation
**Mock check:** None
- [ ] Step 1: Verify the hook script passes cwd correctly (it already uses `process.cwd()`)
- [ ] Step 2: Verify no template changes needed — the hook script already passes `cwd` to cache, and `handlePreToolUse` will use `process.cwd()` by default
- [ ] Step 3: Run full test suite
- [ ] Step 4: Build, link, and re-init in test project

### Task 6: Update docs
**Files:** `docs/architecture.md`, `README.md`
**Test strategy:** None — documentation only
- [ ] Step 1: Add `cwd_path_expand` to the Intent table in `docs/architecture.md`
- [ ] Step 2: Add to config table in `README.md`
