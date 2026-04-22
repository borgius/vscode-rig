# Skip rtk Rewrite for Compound/Piped Commands

**Status: COMPLETED** (2026-04-20) — PR #6

## Problem

When an agent issues a chained command like `ls -la file; diff file -`, the
PreToolUse hook rewrites it through rtk (e.g., `rtk ls ...; diff ...`). This
rewritten command is different from the original, requiring user approval
because Claude Code treats it as a new command.

## Solution

Skip rtk rewriting for compound commands (commands containing `;`, `&&`, `||`, or `|`). Let them pass through as-is. Simple single commands still benefit from rtk token savings.

## Constitutional Rules

- No mocks needed (unit tests with injectable `ExecRewriteFn`)
- Show test output before claiming done
- Source + test changes paired

## Mock Policy

Unit tests (mocks ok): `execRewrite` function (injected, standard pattern)

---

### Task 1: Add `isCompoundCommand` helper to intent.ts

**Files:** `src/router/intent.ts`, `tests/router/intent.test.ts`
**Test strategy:** Unit tests for the helper function — test each operator (`;`, `&&`, `||`, `|`) and negative cases
**Mock check:** No protected components

- [ ] Step 1: Write failing tests for `isCompoundCommand` in `tests/router/intent.test.ts`
  - Returns true for `;` separator: `ls file; diff file -`
  - Returns true for `&&` separator: `git status && git diff`
  - Returns true for `||` separator: `cmd1 || cmd2`
  - Returns true for `|` pipe: `cat file | grep pattern`
  - Returns true for mixed: `cat file | grep foo && ls`
  - Returns false for simple command: `cat file.ts`
  - Returns false for `||` inside a string literal: `grep "a||b" file`
  - Returns false for `&&` inside a string literal: `echo "&&"`
  - Returns false for redirect `2>/dev/null` (no `|` pipe)
- [ ] Step 2: Verify tests fail
- [ ] Step 3: Implement `isCompoundCommand` in `src/router/intent.ts`
  - Detects `;`, `&&`, `||`, `|` outside of quoted strings
  - Ignores operators inside single/double quotes and `2>&1` style redirects
- [ ] Step 4: Verify tests pass
- [ ] Step 5: Commit

### Task 2: Guard rtk rewrite against compound commands in hook.ts

**Files:** `src/router/hook.ts`, `tests/router/rewrite.test.ts`
**Test strategy:** Integration tests — verify compound commands pass through without rewrite
**Mock check:** No protected components (uses injectable `execRewrite`)

- [ ] Step 1: Write failing tests in `tests/router/rewrite.test.ts`
  - `ls -la /path/file 2>/dev/null; diff /path/file -` returns null (no rewrite, no advise)
  - `cat file | grep pattern` returns null (no rewrite)
  - `git status && git diff` returns null (no rewrite)
  - `grep "TODO" src/ 2>/dev/null || echo "none"` returns null (no rewrite)
  - Simple `cat file.ts` still gets rtk rewrite (unchanged)
  - `grep -r "TODO" src/` still gets rtk rewrite (unchanged)
  - `rg pattern . ; sed -i 's/a/b/g' f` still blocked (file_modify in chain — block fires before rewrite)
- [ ] Step 2: Verify tests fail
- [ ] Step 3: Add `isCompoundCommand` guard in `handlePreToolUse` Step 3 (rtk rewrite section)
  - Import `isCompoundCommand` from intent.ts
  - Skip `tryRtkRewrite` when command is compound
- [ ] Step 4: Verify tests pass
- [ ] Step 5: Commit

### Task 3: Run full test suite and verify no regressions

**Files:** None (verification only)
**Test strategy:** Full suite run
**Mock check:** N/A

- [ ] Step 1: Run `npm test` — all 290+ tests pass
- [ ] Step 2: Run `npm run lint` — no type errors
- [ ] Step 3: Commit if any adjustments needed
