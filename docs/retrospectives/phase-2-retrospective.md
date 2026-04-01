# Phase 2 Retrospective — Tool Router vs GStack

**Date**: 2026-03-31
**Phase**: 2 (intent classification, routing rules, resolver, PreToolUse hook, SessionStart hook)
**Reference**: `local/gstack` — 111 files, 696 symbols, TypeScript

## Shared Patterns

- **Skill routing via context injection**: GStack uses preamble text; we use PreToolUse hook messages. Same goal, different mechanism.
- **Environment-awareness**: Both check available tools and adapt. GStack checks filesystem flags; we check rtk/jcodemunch via `which`.
- **Test failure triage principle**: GStack has a sophisticated 4-step triage process; our zero-defect checker is simpler but same principle.

## Differences

| Aspect | GStack | Claude-Stack-Utils |
|--------|--------|--------------------|
| **Routing mechanism** | Preamble text (persuasive) | PreToolUse hooks (enforceable via block) |
| **Routing granularity** | Skill-level (which skill to invoke) | Tool-level (which tool within a skill) |
| **Intent classification** | N/A — routing is declarative | Regex + function-based `classifyIntent()` |
| **Resolution chain** | N/A | Priority: rtk > jcodemunch > claudeTool > fallback |
| **Hook testing** | `runHook()` spawns bash subprocess | Direct function calls with mock objects |
| **Config for routing** | `~/.gstack/` file flags | `.harness.yaml` per-rule enforcement |

## GStack Pros (patterns worth adopting)

1. **`runHook` test pattern**: Spawns actual subprocesses to test full hook lifecycle (stdin → stdout → exit code). We test functions directly — faster but misses protocol integration. Need E2E hook tests.

2. **Declarative routing in CLAUDE.md**: Writes routing rules into CLAUDE.md for discoverability. Our hooks are more enforceable but less visible. Hybrid approach could work.

3. **Repo mode awareness (solo vs collaborative)**: Changes test failure triage behavior. Our harness has no concept of this.

4. **One-time prompt management**: Uses filesystem flags for behavior preferences. Interactive setup wizard pattern.

## Our Pros Over GStack

1. **Enforceable routing via hooks**: PreToolUse hooks can block tool calls (exit 2). GStack routing is textual — Claude can ignore it. Key architectural advantage.

2. **Intent classification**: `classifyIntent()` handles bash commands (regex with precedence) AND Claude tool calls. GStack doesn't classify tool intent.

3. **Priority resolution chain**: Clean `resolve()` with rtk > jcodemunch > claudeTool > fallback > allow + wildcard overrides.

4. **Per-rule enforcement levels**: block/advise/silent per rule in `.harness.yaml`. GStack routing is binary.

5. **Session-aware auto-indexing**: SessionStart hook auto-indexes CWD with jcodemunch.

## Cons / Improvements Needed

1. **No E2E hook protocol tests**: Testing functions, not the hook protocol (stdin/stdout/exit codes).
2. **No repo mode awareness**: Solo vs collaborative distinction would improve enforcement.
3. **Field name consistency**: Verify `jcodemunch` naming in Environment type vs resolver.

## Action Items

- [ ] Add E2E hook protocol tests (spawn subprocess, verify exit codes)
- [ ] Consider repo mode awareness for enforcement behaviors
- [ ] Verify field name consistency in Environment type
