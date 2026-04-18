# Portable Hook Paths + Auto-Permissions + Secret Deny List

## Context

brain+ design identified three improvements to rig's `rig init` process:

1. **FQ hardcoded paths** — settings.json has `/home/user/project/.claude/hooks/scripts/...` instead of using Claude Code's officially documented `${CLAUDE_PROJECT_DIR}` env var
2. **Repeated permission prompts** — every session prompts for rtk, jcodemunch, and /tmp access
3. **Secret file deny list** — no default protection against reading/writing sensitive files

## Constitutional Rules for This Plan

- Show command output before claiming done
- Every source file change requires corresponding test changes

## Mock Policy

Unit tests (mocks ok): environment detection (injectable ExecFn), filesystem operations (temp dirs)
No protected components in this plan.

## Files

- `src/cli/init.ts` — `updateSettingsJson()` + `resolveNpxPath()` + `initCommand()`
- `tests/cli/init.test.ts` — all init tests

## Tasks

### Task 1: Use `${CLAUDE_PROJECT_DIR}` for hook script paths

**Files:** `src/cli/init.ts`
**Test strategy:** Update existing test `resolves absolute npx path with PATH prefix` to verify `${CLAUDE_PROJECT_DIR}` appears in hook command instead of FQ project path
**Mock check:** none — uses injectable ExecFn
**Evidence:** Generated hook commands contain `${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/` instead of `/tmp/rig-test-xxx/.claude/hooks/scripts/`

Change `updateSettingsJson` to construct hook command as:

```
<npxCommand> ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/<script>
```

Instead of:

```
<npxCommand> /abs/path/to/project/.claude/hooks/scripts/<script>
```

The `claudeDir` parameter currently passed to `updateSettingsJson` is only used to build the absolute hook script path. After this change, we only need the relative `.claude/hooks/scripts/<script>` portion prefixed with `${CLAUDE_PROJECT_DIR}`.

Update `updateSettingsJson` signature: remove `claudeDir` parameter, no longer needed. Pass nothing project-specific — the function builds `${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/<script>` directly.

Update `initCommand` to pass only the settings directory path (for reading/writing settings.json), not the full claudeDir.

Update the old-format detection logic: matching `e.command.includes(script)` still works since the script filename (e.g., `pre-tool-use.ts`) is still present in the command string.

- [ ] Step 1: Write failing test — expect `${CLAUDE_PROJECT_DIR}` in hook command
- [ ] Step 2: Verify it fails
- [ ] Step 3: Change `updateSettingsJson` to use `${CLAUDE_PROJECT_DIR}` in command construction
- [ ] Step 4: Verify it passes
- [ ] Step 5: Commit

### Task 2: Add auto-permission allow entries for rtk and jcodemunch

**Files:** `src/cli/init.ts`
**Test strategy:** New tests: `adds rtk permission when rtk available`, `omits rtk permission when rtk unavailable`, `adds jcodemunch permission`, `preserves existing permissions on re-init`
**Mock check:** none
**Evidence:** Generated settings.json has `permissions.allow` containing `Bash(rtk:*)` (when rtk detected) and `mcp__jcodemunch__*`

In `updateSettingsJson`, after registering hooks, add permission entries:

1. Always add `mcp__jcodemunch__*` to `permissions.allow` (jcodemunch MCP tools are read-only search)
2. Conditionally add `Bash(rtk:*)` to `permissions.allow` when rtk is available (passed as parameter)

The function needs an additional parameter: `rtkAvailable: boolean`. Pass this from `initCommand` where `detectEnvironment` already runs.

Idempotent merge: before adding each permission, check if it already exists in the `allow` array. Use `.includes()` or `Set` to avoid duplicates.

Preserve existing: if `permissions.allow` already has user entries, keep them. Only append rig's entries.

- [ ] Step 1: Write failing test — expect `mcp__jcodemunch__*` in permissions.allow
- [ ] Step 2: Verify it fails
- [ ] Step 3: Add permission merge logic to `updateSettingsJson`
- [ ] Step 4: Verify all new tests pass
- [ ] Step 5: Commit

### Task 3: Add default secret file deny list

**Files:** `src/cli/init.ts`
**Test strategy:** New test: `adds secret deny list to permissions.deny`, `does not duplicate deny entries on re-init`
**Mock check:** none
**Evidence:** Generated settings.json has `permissions.deny` with entries for `**/secrets/**`, `**/credentials/**`, `**/*.pem`, `**/*.key` across Read, Edit, Write tools

Default deny entries (always added, environment-independent):

```
Read(**/secrets/**)
Read(**/credentials/**)
Read(**/*.pem)
Read(**/*.key)
Edit(**/secrets/**)
Edit(**/credentials/**)
Edit(**/*.pem)
Edit(**/*.key)
Write(**/secrets/**)
Write(**/credentials/**)
Write(**/*.pem)
Write(**/*.key)
```

Idempotent: check each entry before adding to avoid duplicates on re-init.

If user has manually removed a deny entry, re-init will re-add it. This is intentional — the deny list is a security baseline.

- [ ] Step 1: Write failing test — expect deny entries in settings.json
- [ ] Step 2: Verify it fails
- [ ] Step 3: Add deny list logic to `updateSettingsJson`
- [ ] Step 4: Verify all tests pass
- [ ] Step 5: Commit

### Task 4: Update existing tests for new path format

**Files:** `tests/cli/init.test.ts`
**Test strategy:** Update expectations in existing tests that check for FQ paths
**Mock check:** none
**Evidence:** All 33+ init tests pass with new `${CLAUDE_PROJECT_DIR}` format

Tests that need updates:
- `updates settings.json with hook registrations` — no change needed (checks structure, not path format)
- `writes hook entries in correct Claude Code format` — already checks `.claude/hooks/scripts/` which still appears in the command
- `resolves absolute npx path with PATH prefix` — update: should NOT contain FQ temp dir path, SHOULD contain `${CLAUDE_PROJECT_DIR}`
- `falls back to bare npx when command -v fails` — update: check for `${CLAUDE_PROJECT_DIR}` not bare relative path
- `updates hook commands on re-init when npx path changes` — update: verify `${CLAUDE_PROJECT_DIR}` persists through re-init
- `migrates old flat-format hook entries` — no change needed (tests structure, not path)
- `preserves existing settings when adding hooks` — verify permissions preserved (already has this test)

- [ ] Step 1: Update all affected test expectations
- [ ] Step 2: Run `npx vitest run tests/cli/init.test.ts` — all pass
- [ ] Step 3: Commit

### Task 5: Full suite verification + reinstall

**Files:** none (verification only)
**Test strategy:** Full test suite + build + reinstall
**Mock check:** n/a
**Evidence:** `npm test` passes, `npm run build` succeeds, `rig init --force` works in all 4 projects

- [ ] Step 1: `npm test` — 588+ tests pass
- [ ] Step 2: `npm run build` — clean compile
- [ ] Step 3: `rig init --force` in claude-rig, my-claw, ai-news, nothing-ever-happens
- [ ] Step 4: Verify generated settings.json in each project has portable paths and permissions
