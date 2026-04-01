# Plan: Native Tool Advisory + Missing Tool Warning

**Status:** Draft
**Phase:** plan+
**Date:** 2026-04-01

## Context

The tool router currently only intercepts Bash commands (grep, find, cat). Native Claude tools (Read, Grep, Glob) pass through unchecked. When rtk is available, it fires first in the priority chain and gives wrong advice for native tools ("use Grep" when the agent is already on Grep). Additionally, `rtk cat` has no rule at all, allowing the exact inefficiency the router exists to prevent.

A separate UX problem: when rtk or jcodemunch are not installed, there is no notification. The agent carries on without tools the user may not know about.

## Constitutional Rules for This Plan

- Use real file I/O for cache operations — never mock `SessionCache`
- Show command output before claiming done
- Every source file change requires corresponding test changes
- No mocks for environment detection — use injectable `ExecFn`

## Mock Policy

**Protected (never mock):** `SessionCache`, file I/O (`readFileSync`, `writeFileSync`)
**Allowed:** `execSync` (already mocked in existing tests via `vi.mock('node:child_process')`)

---

## Task 1: Add `native_read`, `native_grep`, `native_glob`, `rtk_cat_code` config keys

**Files:**
- `src/types.ts` — extend `ToolRoutingRules`
- `src/config.ts` — add defaults to `DEFAULT_CONFIG`

**Test strategy:** Type-check passes (`npm run lint`). Existing config merge tests continue to pass.

**Mock check:** No protected components.

- [ ] Step 1: Add `native_read`, `native_grep`, `native_glob`, `rtk_cat_code`, `read_line_threshold` to `ToolRoutingRules` in `src/types.ts:76-83`
- [ ] Step 2: Add defaults to `DEFAULT_CONFIG.tool_routing` in `src/config.ts:13-20`:
  ```typescript
  native_read: 'advise',
  native_grep: 'advise',
  native_glob: 'advise',
  rtk_cat_code: 'block',
  read_line_threshold: 100,
  ```
- [ ] Step 3: Run `npm run lint` to verify types
- [ ] Step 4: Run `npm test` to verify no regressions

---

## Task 2: Add missing-tool warning to session start

**Files:**
- `src/session/cache.ts` — add `toolsWarned: boolean` to cache state
- `src/types.ts` — add `toolsWarned` to `SessionCacheFile`
- `src/session/start.ts` — emit one-time warning when rtk or jcodemunch missing
- `src/session/cache.ts` — add `getToolsWarned()` / `setToolsWarned()` methods

**Test strategy:** `tests/session/start.test.ts` — add tests for:
- Warning emitted when rtk missing (includes install hint)
- Warning emitted when jcodemunch missing (includes install hint)
- Warning emitted when both missing (combined message)
- No warning when both available
- Warning suppressed on second call (via `toolsWarned` flag in cache)

**Mock check:** `execSync` is already mocked in existing tests. `SessionCache` is used directly (not mocked — protected).

- [ ] Step 1: Add `toolsWarned: boolean` to `SessionCacheFile` in `src/types.ts:65-72`
- [ ] Step 2: Add `private toolsWarned = false` field to `SessionCache` in `src/session/cache.ts:19`
- [ ] Step 3: Add `getToolsWarned(): boolean` and `setToolsWarned(v: boolean): void` methods to `SessionCache`
- [ ] Step 4: Include `toolsWarned` in `serialize()` and restore in `load()` in `SessionCache`
- [ ] Step 5: In `handleSessionStart()` in `src/session/start.ts`, after environment detection:
  - Check `cache.getToolsWarned()` — if true, skip warning
  - If rtk not available OR jcodemunch not available, append warning lines to output
  - Call `cache.setToolsWarned(true)`
  - Warning format:
    ```
    [WARNING] rtk is not installed. Install for 60-90% token savings on dev operations: https://github.com/franklywatson/rtk
    [WARNING] jcodemunch is not installed. Install for indexed code search: https://github.com/franklywatson/jcodemunch
    ```
- [ ] Step 6: Write tests in `tests/session/start.test.ts`
- [ ] Step 7: Run tests to verify

---

## Task 3: Add `isCodeFile()` and `getCodeFileExtensions()` helpers

**Files:**
- `src/router/rules.ts` — add helper functions

**Test strategy:** `tests/router/rules.test.ts` — add describe block for helpers:
- `isCodeFile('file.ts')` returns true
- `isCodeFile('file.txt')` returns false
- `isCodeFile('file')` returns false
- `isCodeFile('.gitignore')` returns false
- Extensions list includes `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.h`, `.rb`, `.swift`, `.kt`, `.scala`

**Mock check:** No protected components.

- [ ] Step 1: Add `CODE_FILE_EXTENSIONS` constant and `isCodeFile(path: string): boolean` function to `src/router/rules.ts`
- [ ] Step 2: Write tests for the helper
- [ ] Step 3: Run tests to verify

---

## Task 4: Add native Read advisory rule

**Files:**
- `src/router/rules.ts` — add `native_read` rule to `getDefaultRules()`
- `src/router/hook.ts` — update `getEffectiveEnforcement()` to map `native_read` intent

**Test strategy:** `tests/router/rules.test.ts` + `tests/router/hook.test.ts`:
- `findMatchingRule('Read', { file_path: '/some/file.ts' })` matches the new rule
- `findMatchingRule('Read', { file_path: '/some/file.txt' })` returns undefined (not a code file)
- `findMatchingRule('Read', { file_path: '/some/file.ts', offset: 10, limit: 20 })` returns undefined (targeted re-read)
- `handlePreToolUse('Read', { file_path: '/some/file.ts' }, cache_with_jm_indexed, config)` returns advise mentioning jcodemunch
- `handlePreToolUse('Read', { file_path: '/some/file.ts' }, cache_no_jm, config)` returns null (no better alternative)

**Mock check:** No protected components.

- [ ] Step 1: Add new rule to `getDefaultRules()` in `src/router/rules.ts`:
  ```typescript
  // ── Native Read Advisory (code files only, no targeted re-read) ──
  {
    match: (tool: string, args: Record<string, unknown>) => {
      if (tool !== 'Read') return false;
      const filePath = args.file_path as string | undefined;
      if (!filePath || !isCodeFile(filePath)) return false;
      // Skip if targeted re-read (has offset or limit)
      if (args.offset != null || args.limit != null) return false;
      return true;
    },
    intent: 'native_read',
    resolutions: {
      jcodemunch: { action: 'advise', tool: 'jcodemunch get_file_outline or get_symbol', reason: 'For code files, get_file_outline returns structure with signatures (80-85% fewer tokens than full file read)' },
      fallback: { action: 'allow' },
    },
    enforcement: 'advise',
  },
  ```
  Note: No `rtk` resolution — rtk cat is what we're trying to avoid. No `claudeTool` resolution — the agent is already on the native tool.
- [ ] Step 2: Update `getEffectiveEnforcement()` in `src/router/hook.ts:68-80` to map `native_read` to `config.rules.tool_routing.native_read`
- [ ] Step 3: Write tests in `tests/router/rules.test.ts` and `tests/router/hook.test.ts`
- [ ] Step 4: Run tests to verify

---

## Task 5: Add native Grep advisory rule

**Files:**
- `src/router/rules.ts` — add `native_grep` rule
- `src/router/hook.ts` — update `getEffectiveEnforcement()` mapping

**Test strategy:** `tests/router/rules.test.ts` + `tests/router/hook.test.ts`:
- `findMatchingRule('Grep', { pattern: 'function', path: 'src/' })` matches the new rule
- `findMatchingRule('Grep', { pattern: 'TODO' })` matches (no path = code dir assumed)
- `handlePreToolUse('Grep', ..., cache_with_jm, config)` returns advise mentioning jcodemunch
- `handlePreToolUse('Grep', ..., cache_no_jm, config)` returns null

**Mock check:** No protected components.

- [ ] Step 1: Add new rule to `getDefaultRules()`:
  ```typescript
  // ── Native Grep Advisory (suggest jcodemunch when indexed) ──
  {
    match: (tool: string, args: Record<string, unknown>) => {
      return tool === 'Grep';
    },
    intent: 'native_grep',
    resolutions: {
      jcodemunch: { action: 'advise', tool: 'jcodemunch search_text', reason: 'jcodemunch provides indexed, token-efficient search with context lines (80-85% fewer tokens)' },
      fallback: { action: 'allow' },
    },
    enforcement: 'advise',
  },
  ```
- [ ] Step 2: Update `getEffectiveEnforcement()` to map `native_grep`
- [ ] Step 3: Write tests
- [ ] Step 4: Run tests

---

## Task 6: Add native Glob advisory rule

**Files:**
- `src/router/rules.ts` — add `native_glob` rule
- `src/router/hook.ts` — update `getEffectiveEnforcement()` mapping

**Test strategy:** `tests/router/rules.test.ts` + `tests/router/hook.test.ts`:
- `findMatchingRule('Glob', { pattern: '**/*.ts' })` matches the new rule
- `findMatchingRule('Glob', { pattern: '**/*.log' })` returns undefined (not code files)
- `handlePreToolUse('Glob', ..., cache_with_jm, config)` returns advise mentioning get_file_tree
- `handlePreToolUse('Glob', ..., cache_no_jm, config)` returns null

**Mock check:** No protected components.

- [ ] Step 1: Add new rule to `getDefaultRules()`:
  ```typescript
  // ── Native Glob Advisory (code file patterns only, suggest jcodemunch when indexed) ──
  {
    match: (tool: string, args: Record<string, unknown>) => {
      if (tool !== 'Glob') return false;
      const pattern = args.pattern as string | undefined;
      if (!pattern) return false;
      // Only match code file patterns
      return CODE_FILE_EXTENSIONS.some(ext => pattern.includes(ext));
    },
    intent: 'native_glob',
    resolutions: {
      jcodemunch: { action: 'advise', tool: 'jcodemunch get_file_tree', reason: 'jcodemunch provides cached, semantic file listing with symbol counts (80% fewer tokens)' },
      fallback: { action: 'allow' },
    },
    enforcement: 'advise',
  },
  ```
- [ ] Step 2: Update `getEffectiveEnforcement()` to map `native_glob`
- [ ] Step 3: Write tests
- [ ] Step 4: Run tests

---

## Task 7: Add rtk cat code file block rule

**Files:**
- `src/router/rules.ts` — add `rtk_cat_code` rule

**Test strategy:** `tests/router/rules.test.ts` + `tests/router/hook.test.ts`:
- `findMatchingRule('Bash', { command: 'rtk cat /some/file.ts' })` matches the new rule
- `findMatchingRule('Bash', { command: 'rtk cat /some/file.txt' })` returns undefined (not a code file)
- `findMatchingRule('Bash', { command: 'rtk cat /some/file.ts', command: 'rtk grep pattern .' })` — grep takes precedence (file_modify > rtk_cat_code)
- `handlePreToolUse('Bash', { command: 'rtk cat /some/file.ts' }, cache, config)` returns block mentioning jcodemunch

**Mock check:** No protected components.

- [ ] Step 1: Add new rule to `getDefaultRules()`, placed BEFORE the existing file_read rule:
  ```typescript
  // ── rtk cat on code files (close the bypass) ──
  {
    match: (tool: string, args: Record<string, unknown>) => {
      if (tool !== 'Bash') return false;
      const command = args.command as string | undefined;
      if (!command) return false;
      const rtkCatMatch = command.match(/^rtk\s+cat\s+(\S+)/);
      if (!rtkCatMatch) return false;
      return isCodeFile(rtkCatMatch[1]);
    },
    intent: 'rtk_cat_code',
    resolutions: {
      _: { action: 'block', reason: 'rtk cat on code files wastes tokens. Use jcodemunch get_file_outline for structure, get_symbol_source for definitions.' },
    },
    enforcement: 'block',
  },
  ```
- [ ] Step 2: Update `getEffectiveEnforcement()` to map `rtk_cat_code`
- [ ] Step 3: Write tests
- [ ] Step 4: Run tests

---

## Task 8: Fix circular advice — prevent native tool rules from firing when agent is already on the recommended tool

**Files:**
- `src/router/rules.ts` — add guard to native rules

**Problem:** The existing `text_search` rule matches ALL tools with text_search intent, including the native Grep tool. When rtk fires first, it advises "use Grep" — but the agent is already on Grep. Same for `file_discovery` and Glob.

**Solution:** The existing rules already have the right structure (rtk > jcodemunch > claudeTool > fallback). The issue is that native tool matches (Read, Grep, Glob) don't have a `claudeTool` resolution — they fall through to `fallback: allow`. The new native rules (Tasks 4-6) only have `jcodemunch` and `fallback` resolutions. This means:
- When jcodemunch is indexed: native tools get a jcodemunch advise (correct)
- When jcodemunch is NOT indexed: native tools fall through to `fallback: allow` (correct — no advice)

The existing Bash-only rules (grep, find, cat) already correctly narrow their match to `tool === 'Bash'`. The circular advice problem only existed because the text_search and file_discovery rules matched ALL tools including native ones. But with the new native-specific rules added FIRST in the array, `findMatchingRule` returns the native rule first (it matches before the broader rule).

**Test strategy:** Verify rule ordering ensures native rules fire before broader intent rules:
- `findMatchingRule('Grep', ...)` returns `native_grep` rule, not `text_search` rule
- `findMatchingRule('Glob', ...)` returns `native_glob` rule, not `file_discovery` rule
- `findMatchingRule('Read', ...)` returns `native_read` rule, not `file_read` rule
- `findMatchingRule('Bash', { command: 'grep ...' })` still returns `text_search` rule

**Mock check:** No protected components.

- [ ] Step 1: Verify rule order in `getDefaultRules()` is: `native_read`, `native_grep`, `native_glob`, `rtk_cat_code`, then existing `text_search`, `file_discovery`, `file_read`, `file_modify`
- [ ] Step 2: Write ordering verification tests
- [ ] Step 3: Run all tests

---

## Task 9: Update .harness.yaml template

**Files:**
- `src/cli/init.ts` — ensure new config keys are written to template

**Test strategy:** `tests/cli/init.test.ts` (if exists) — verify generated config includes new keys.

**Mock check:** No protected components.

- [ ] Step 1: Verify `DEFAULT_CONFIG` (already updated in Task 1) flows through to the generated `.harness.yaml` via `yamlStringify(DEFAULT_CONFIG)` in `initCommand()`
- [ ] Step 2: Write test or verify existing test covers new keys
- [ ] Step 3: Run tests

---

## Task 10: Update `getEffectiveEnforcement()` mapping

**Files:**
- `src/router/hook.ts` — consolidate intent-to-config-key mapping

**Problem:** Currently `getEffectiveEnforcement()` looks up `config.rules.tool_routing[intent]` directly. The new intents (`native_read`, `native_grep`, `native_glob`, `rtk_cat_code`) need to map to their config keys. Currently the existing intents (`text_search`, `file_discovery`, `file_read`) don't have matching config keys (`tool_routing` uses `grep`, `find`, `cat` instead).

**Solution:** Replace the direct lookup with an explicit intent-to-config-key map:

```typescript
const INTENT_CONFIG_KEYS: Record<string, string> = {
  text_search: 'grep',
  file_discovery: 'find',
  file_read: 'cat',
  native_read: 'native_read',
  native_grep: 'native_grep',
  native_glob: 'native_glob',
  rtk_cat_code: 'rtk_cat_code',
};
```

This also fixes the existing mismatch where `text_search` intent didn't have a `tool_routing.text_search` config key.

**Test strategy:** `tests/router/hook.test.ts`:
- Config override `tool_routing.native_read: 'silent'` suppresses native Read advice
- Config override `tool_routing.grep: 'advise'` changes Bash grep from block to advise (existing behavior, verify still works)
- Unknown intent falls through to rule default

**Mock check:** No protected components.

- [ ] Step 1: Add `INTENT_CONFIG_KEYS` map and use it in `getEffectiveEnforcement()`
- [ ] Step 2: Write tests for config override with new intents
- [ ] Step 3: Run all tests

---

## Task 11: Full integration verification

**Files:** None (test-only)

**Test strategy:** Run `npm test` (all 290+ tests) and `npm run lint`. Verify:
- All existing tests pass (no regressions)
- All new tests pass
- Type-check passes
- Coverage gate passes

**Mock check:** N/A

- [ ] Step 1: `npm test`
- [ ] Step 2: `npm run lint`
- [ ] Step 3: Verify coverage gate passes
- [ ] Step 4: Manual smoke test: `npm run build && rig init --force` in a test directory

---

## Summary

| Task | Scope | Files |
|------|-------|-------|
| 1 | Config types + defaults | `types.ts`, `config.ts` |
| 2 | Missing-tool warning | `cache.ts`, `types.ts`, `start.ts`, `start.test.ts` |
| 3 | `isCodeFile()` helper | `rules.ts`, `rules.test.ts` |
| 4 | Native Read advisory rule | `rules.ts`, `hook.ts`, tests |
| 5 | Native Grep advisory rule | `rules.ts`, `hook.ts`, tests |
| 6 | Native Glob advisory rule | `rules.ts`, `hook.ts`, tests |
| 7 | rtk cat code block rule | `rules.ts`, `hook.ts`, tests |
| 8 | Rule ordering verification | `rules.test.ts`, `hook.test.ts` |
| 9 | .harness.yaml template | `init.ts`, tests |
| 10 | Config mapping fix | `hook.ts`, tests |
| 11 | Full integration check | test-only |

**Dependencies:** Task 1 is unblocked. Tasks 2-3 are unblocked. Tasks 4-7 depend on Task 3 (for `isCodeFile`). Task 8 depends on Tasks 4-7. Task 9 depends on Task 1. Task 10 depends on Tasks 4-7. Task 11 depends on all.

## Open Questions (resolved)

1. **Line threshold** — Deferred. Native Read advisory doesn't need a line threshold since it has no `rtk` or `claudeTool` resolution. It only fires when jcodemunch is indexed, and the advise is always appropriate for full file reads of code files. The config key `read_line_threshold` is added but not used in this iteration.
2. **Code file extensions** — Hardcoded list in `CODE_FILE_EXTENSIONS` constant. Configurable in a future iteration if needed.
3. **rtk cat enforcement** — Block. It's always the wrong choice for code files.
4. **Separate vs integrated rules** — Integrated into existing `getDefaultRules()` array, with native rules placed first to prevent broader rules from matching.
