# Worktree Promotion + Session Metrics

**Date:** 2026-04-01

## Overview

Two features for rig: (1) suggest git worktrees when starting on master/main, (2) track rtk and jcodemunch token savings per session with a `/savings` skill.

## Feature 1: Worktree Suggestion

### Behavior

When a Claude Code session starts in a rig-equipped project, the SessionStart hook checks if the current git branch is `master` or `main`. If so, it appends a one-line suggestion:

```
[rig] On master — consider /using-git-worktrees for isolated feature work.
```

This is a passive nudge. No new skill — the user invokes the existing `superpowers:using-git-worktrees` skill directly.

### Implementation

- Modify `src/session/start.ts` — add `checkWorktreeSuggestion(cwd)` function
- Uses injectable `ExecFn` to run `git branch --show-current`
- Returns the suggestion string or empty string
- `handleSessionStart()` appends it to output

### Config

New rule in `.harness.yaml`:

```yaml
rules:
  worktree_suggest: advise   # silent | advise
```

- `silent` — no suggestion printed (default)
- `advise` — print the one-line suggestion

### Tests

- Unit test: `checkWorktreeSuggestion()` returns suggestion for master/main, empty for feature branches, empty for non-git dirs
- Integration test: session-start hook output includes suggestion when on master

## Feature 2: Session Metrics

### Behavior

SessionStart hook captures a token-savings baseline from `rtk gain --format json`. PostToolUse hook counts how many times rtk and jcodemunch are invoked. A `/savings` skill reports the session delta.

Report format:

```
[rig] Session Savings
  rtk: 1.2M tokens saved (42 calls, +340K this session)
  jcodemunch: 28 queries
```

### Data flow

```
SessionStart:
  rtk gain --format json -> { total_saved: N } -> store as baseline in SessionCache
  init counters: { rtkCalls: 0, jmCalls: 0 } -> store in SessionCache

PostToolUse (each call):
  if tool_name == "Bash" && rtk was involved -> increment rtkCalls
  if tool_name involves jcodemunch MCP -> increment jmCalls

/savings skill:
  read baseline from SessionCache
  run rtk gain --format json -> { total_saved: M }
  delta = M - N
  read counters from SessionCache
  format and print report
```

### Implementation

New files:

- `src/session/metrics.ts` — `captureMetricsBaseline()`, `incrementMetric()`, `formatSavingsReport()`
- `templates/skills/savings/SKILL.md` — the `/savings` skill template

Modified files:

- `src/session/start.ts` — call `captureMetricsBaseline()` during session init
- `src/session/cache.ts` — add metrics fields to `SessionCache` (baseline + counters)
- `templates/hooks/post-tool-use.ts` — call `incrementMetric()` for rtk/jcodemunch usage
- `src/cli/init.ts` — add `savings` to the skill template copy list

### Detection logic

- **rtk usage**: PostToolUse hook checks if `tool_name === "Bash"` and the tool input command starts with or contains `rtk` (already rewritten by PreToolUse router)
- **jcodemunch usage**: PostToolUse hook checks if `tool_name` matches the jcodemunch MCP tools (`mcp__jcodemunch__*`)

### Tests

- Unit test: `captureMetricsBaseline()` parses rtk JSON output correctly, handles missing rtk gracefully
- Unit test: `incrementMetric()` increments correct counters for rtk and jcodemunch tool names
- Unit test: `formatSavingsReport()` formats human-readable output from baseline + counters
- Integration test: `/savings` skill template renders correctly with project name

## Scope exclusions

- No SessionEnd hook (Claude Code doesn't support it)
- No file-based metrics persistence (session-scoped only, dies with session)
- No jcodemunch token savings tracking (no session-scoped aggregate available from jcodemunch API)
- No new worktree skill (using existing superpowers skill as-is)
