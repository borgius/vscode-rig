# Phase 1 Retrospective — Foundation vs GStack

**Date**: 2026-03-31
**Phase**: 1 (types, config, environment, session cache)
**Reference**: `local/gstack` — 111 files, 696 symbols, TypeScript

## Shared Patterns

- **Config via YAML with layered resolution**: Both use YAML config with environment-based overrides. GStack uses `BROWSE_STATE_FILE` env var + git root detection; we use `.harness-conf.yaml` + `.harness-conf.local.yaml` merge.
- **Session state management**: Both track session-scoped state. GStack's `DesignSession` is file-backed (JSON in `/tmp`); our `SessionCache` is in-memory only.
- **TypeScript, strict types**: Both use TypeScript interfaces extensively rather than ad-hoc objects.
- **Graceful fallback on failure**: Both catch errors in detection/config loading and return sensible defaults rather than throwing.

## Differences

| Aspect | GStack | Claude-Stack-Utils |
|--------|--------|--------------------|
| **Scope** | Multi-tool platform (browse, design, skills) | Focused agent harness (hooks, enforcement) |
| **Config storage** | `.gstack/` dir with state files | `.harness-conf.yaml` project config |
| **Session persistence** | File-backed (`/tmp/design-session-*.json`) | In-memory only |
| **Multi-host support** | Yes (`Host = 'claude' \| 'codex' \| 'factory'`) | Claude Code only |
| **Config resolution** | Env var → git root → cwd | YAML file → local override merge |
| **Template system** | Rich: `TemplateContext`, `ResolverFn`, `HostPaths`, per-host path rewrites | Simple: `{{VAR}}` mustache replacement |
| **Worktree isolation** | Full git worktree management with `WorktreeInfo`, `HarvestResult`, dedup | Not in Phase 1 scope |

## GStack Pros (patterns worth adopting)

1. **File-backed session state**: GStack persists sessions to disk (`/tmp`), making them survive process restarts. Our in-memory `SessionCache` dies with the process. For hooks (short-lived processes), we'll need file-backed cache for cross-invocation state.

2. **Multi-host architecture via `HostPaths`**: GStack's `Host` type union + `HostPaths` record generates skills for Claude, Codex, and Factory from one codebase. Worth noting for future multi-platform work.

3. **Configurable `env` parameter in `resolveConfig`**: GStack passes `env` as a parameter (defaulting to `process.env`), making it trivially testable without mocking. Our `detectEnvironment` uses `vi.mock('node:child_process')` instead.

4. **`ensureStateDir` with gitignore auto-management**: GStack auto-creates `.gstack/` and adds it to `.gitignore`. Our init command creates directories but doesn't manage gitignore.

5. **Git-aware root detection**: GStack uses `git rev-parse --show-toplevel` with a 2-second timeout. We use `process.cwd()` directly.

## Our Pros Over GStack

1. **Much richer type system for enforcement**: Our `types.ts` defines intent classification, resolution types (allow/advise/block), tool rules, environment detection, and config. GStack has no equivalent enforcement layer.

2. **Type guards with runtime validation**: `isResolutionAllow()`, `isToolRule()`, `isEnvironment()` — runtime type guards alongside TypeScript types. GStack relies on TypeScript only.

3. **Configurable enforcement levels per rule**: Our `EnforcementLevel` (block/advise/silent) with per-rule config via YAML is more granular than anything in GStack.

4. **Environment detection for external tools**: Our `detectEnvironment()` specifically detects rtk and jcodemunch availability with repo indexing state. GStack doesn't need this — it IS the tool.

5. **Deep merge with fallbacks**: Our `mergeConfigs()` does shallow-merge-per-category with fallback to `DEFAULT_CONFIG`. Clean and predictable.

## Cons / Improvements Needed

1. **Session cache must become serializable**: Each hook invocation is a separate process. In-memory cache won't survive. Need file-backed cache (e.g., `.claude/session-cache.json`). GStack got this right.
2. **Environment detection should accept env parameter**: Following GStack's pattern, `detectEnvironment(cwd, env?)` would be more testable without mocking.
3. **Missing gitignore auto-management**: Init command should auto-add `.harness-conf.local.yaml` and session cache to `.gitignore`.

## Action Items

- [ ] Consider file-backed session cache for cross-process persistence (needed before Phase 6)
- [ ] Refactor `detectEnvironment` to accept optional env parameter for cleaner testing
- [ ] Add gitignore management to init command (Phase 6)
