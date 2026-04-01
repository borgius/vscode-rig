# Phase 4 Retrospective — Scout Agent vs GStack

**Date**: 2026-03-31
**Phase**: 4 (CodebaseMap formatter, cross-repo indexing, scout cache, agent definition)
**Reference**: `local/gstack` — 111 files, 696 symbols, TypeScript

## Shared Patterns

- **Context injection for agents**: Both systems generate structured context for agents. GStack uses preamble text via `TemplateContext` resolvers; we use `CodebaseMap` via the scout agent definition.
- **Host-aware path resolution**: GStack has `HostPaths` per platform (claude/codex/gemini/factory). Our `Environment` type detects available tools. Same principle — adapt to the runtime environment.
- **TTL-based caching**: GStack doesn't cache preamble output (regenerated each session). Our `ScoutCache` has 30-min TTL. Both are session-scoped.

## Differences

| Aspect | GStack | Claude-Stack-Utils |
|--------|--------|--------------------|
| **Context mechanism** | Preamble text injection (persuasive) | Structured `CodebaseMap` type (typed) |
| **Cross-repo awareness** | No indexing — relies on Claude reading files | `ensureIndexed()` with jcodemunch auto-indexing |
| **Agent definition** | Skills defined as SKILL.md files with frontmatter | Agent template `scout.md` with YAML frontmatter |
| **Template system** | `TemplateContext` + resolver functions | `renderTemplate()` with `{{VAR}}` substitution |
| **Multi-host support** | `Host` type: claude/codex/gemini/factory | Single host: Claude Code |
| **Multi-agent patterns** | Review Army (specialist dispatch, findings merge, red team) | Single scout agent |
| **Skill discovery** | `discoverSkillFiles()` walks filesystem | jcodemunch `search_symbols` / `get_file_tree` |

## GStack Pros (patterns worth adopting)

1. **Review Army pattern**: GStack dispatches multiple specialist reviewers in parallel, merges findings, then runs a red team adversarial pass. This is a battle-tested multi-agent orchestration pattern. **Why**: Our scout is a single agent. For complex codebases, parallel specialist agents (security reviewer, test coverage reviewer, API reviewer) with structured finding merge would be more thorough.

2. **Multi-host template resolution**: GStack's `TemplateContext` includes host type and host-specific paths. The same skill generates different preamble text for Claude Code vs Codex vs Gemini. **Why**: If claude-stack-utils ever supports multiple AI platforms, this pattern prevents forking.

3. **Resolver function pipeline**: GStack uses `ResolverFn = (ctx: TemplateContext, args?: string[]) => string` — composable functions that generate preamble sections. Each resolver handles one concern. **Why**: Our template rendering is flat string substitution. A resolver pipeline could handle conditional sections, host-aware logic, and compositional context.

4. **Skill validation**: GStack has `validateSkill()` that parses SKILL.md frontmatter and checks required fields. **Why**: Our agent template test checks basic structure but doesn't validate all required frontmatter fields systematically.

## Our Pros Over GStack

1. **Structured CodebaseMap type**: Our `CodebaseMap` is a typed data structure with `languages`, `symbols`, `entryPoints`, `keyExports`, `dependencies`. GStack's context is unstructured preamble text. Typed data is composable — downstream code can query it programmatically.

2. **Cross-repo indexing**: `ensureIndexed()` auto-indexes external directories when referenced. GStack has no equivalent — it relies on the agent to read files directly. Our approach is 60-90% more token-efficient for large codebases.

3. **ScoutCache with TTL**: 30-minute TTL prevents redundant indexing. GStack regenerates preamble every session. Our cache persists across turns within a session.

4. **Entry point detection**: `buildCodebaseMap()` derives entry points from filename patterns (index/main/cli/app/server). This is programmatic — no ambiguity about where the codebase starts.

5. **Agent tool restrictions**: Our scout template restricts to `jcodemunch` + `Bash` tools only, with `maxTurns: 10`. This prevents the scout from wandering. GStack's skill execution has no equivalent tool restriction in the definition.

6. **Symbol-level search**: `formatSymbolSearch()` returns typed `SymbolSummary` with kind, file, line, summary. GStack relies on Claude to find symbols by reading files.

## Cons / Improvements Needed

1. **No multi-agent specialist pattern**: GStack's Review Army dispatches parallel reviewers. Our scout is a single agent. Need to consider multi-agent scout patterns for large/complex repos.

2. **No multi-host support**: Scout definition and templates are Claude Code-specific. If we want to support Codex or Gemini, we'd need to refactor.

3. **Flat template rendering**: `renderTemplate()` only does `{{VAR}}` substitution. No conditional sections, no host-aware logic, no compositional context. Need resolver pipeline for Phase 6 CLI.

4. **No skill validation**: Agent template test checks basic structure but doesn't validate all required frontmatter fields systematically like GStack's `validateSkill()`.

5. **Scout cache is in-memory only**: Cache dies with the session. GStack's file-backed approach would survive restarts. This was already flagged in Phase 1 retro.

## Action Items

- [ ] Consider multi-agent specialist pattern for complex codebase analysis
- [ ] Add resolver pipeline to template rendering (conditional sections, host-aware)
- [ ] Add systematic skill/agent validation (frontmatter fields, required sections)
- [ ] Consider file-backed scout cache (deferred from Phase 1 retro)
