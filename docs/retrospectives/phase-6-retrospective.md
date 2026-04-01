# Phase 6 Retrospective — CLI Installer vs GStack

**Date**: 2026-03-31
**Phase**: 6 (template renderer, hook templates, init command, CLI entry point, verify-harness skill)
**Reference**: `local/gstack` — 111 files, 696 symbols, TypeScript

## Shared Patterns

- **Scaffolding from templates**: Both systems scaffold project-specific files from templates. GStack uses `gstack setup` to install skills; we use `claude-stack-utils init`.
- **Idempotent installation**: Both check for existing files before overwriting. Our `--force` flag matches gstack's overwrite behavior.
- **Hook script generation**: Both generate hook scripts that integrate with Claude Code's hook protocol. GStack generates them during skill installation; we generate them during `init`.
- **Settings.json manipulation**: Both register hooks in `.claude/settings.json`. GStack does it during setup; our `updateSettingsJson()` does it during init.

## Differences

| Aspect | GStack | Claude-Stack-Utils |
|--------|--------|--------------------|
| **Installation mechanism** | `npm install -g gstack` + `gstack setup` per project | `npx claude-stack-utils init` per project |
| **Template rendering** | `TemplateContext` + `ResolverFn` pipeline (composable resolvers) | `renderTemplate()` with `{{VAR}}` substitution (flat) |
| **Skill installation** | Discovers and installs from `~/.claude/skills/gstack/skills/` | Copies from `templates/skills/` into project `.claude/skills/` |
| **Config generation** | Writes to CLAUDE.md (declarative routing rules) | Writes `.harness.yaml` (enforcement config) |
| **Verification** | No post-install verification skill | `verify-harness` skill with 28-point checklist |
| **Package management** | Global npm install + local skill symlinking | `npx`-first, no global install needed |

## GStack Pros (patterns worth adopting)

1. **Resolver pipeline for template rendering**: GStack's `ResolverFn = (ctx: TemplateContext, args?: string[]) => string` pattern composes template sections via function pipeline. Each resolver handles one concern (preamble, routing, test triage). **Why**: Our `renderTemplate()` only does `{{VAR}}` substitution. If we add conditional sections (skip jcodemunch config if not available), host-aware content, or compositional context, we'll need a resolver pipeline. This was also flagged in Phase 4 retro.

2. **Declarative routing injection into CLAUDE.md**: GStack's setup writes routing rules into CLAUDE.md for discoverability — the agent sees them every session. **Why**: Our routing rules live in `.harness.yaml` which the agent never reads directly. The hooks enforce them, but the agent isn't aware of the rules. A hybrid approach (write rules to both `.harness.yaml` and CLAUDE.md) would give both enforcement and visibility.

3. **Skill symlinking**: GStack symlinks skills from global install to project `.claude/skills/`. Updates to gstack automatically apply to all projects. **Why**: Our init copies templates — if we update templates, projects need `init --force` to get updates. Symlinking would auto-propagate updates.

4. **Multi-host path resolution**: GStack's `HostPaths` adapts installation paths per platform (claude/codex/gemini/factory). **Why**: Our installer is Claude Code-only. If we add Codex or Gemini support, path resolution needs to be host-aware.

## Our Pros Over GStack

1. **verify-harness post-install skill**: 28-point checklist that verifies hooks, skills, agents, and config after installation. GStack has no equivalent — users just hope setup worked. **Why**: This is a significant quality advantage. Users can run `/verify-harness` to confirm everything is wired correctly.

2. **`npx`-first, no global install**: Users can `npx claude-stack-utils init` without installing anything globally. GStack requires `npm install -g gstack`. **Why**: Lower barrier to entry. Users don't need to manage global packages.

3. **`.harness.yaml` config separation**: Enforcement config is in a separate file, not mixed into CLAUDE.md. **Why**: Cleaner separation of concerns. Users can version-control `.harness.yaml` independently. GStack mixes routing rules into CLAUDE.md which can cause conflicts.

4. **Programmatic settings.json update**: `updateSettingsJson()` reads existing settings, checks for existing hook registrations, and only adds missing ones. Idempotent by design. **Why**: Won't clobber user customizations in settings.json. GStack's setup can overwrite settings.

5. **Template renderer tested with edge cases**: 6 tests covering empty templates, missing variables, multiline templates, multiple occurrences. GStack's resolver pipeline is tested indirectly through skill E2E tests.

6. **Force flag for selective overwrite**: `--force` lets users selectively regenerate templates. GStack's setup is all-or-nothing.

## Cons / Improvements Needed

1. **Flat template rendering**: Only `{{VAR}}` substitution. Need conditional sections, host-aware logic, and compositional context for future phases.

2. **No symlink support**: Templates are copied, not linked. Updates require manual re-init. Consider symlinking for development efficiency.

3. **No CLAUDE.md integration**: Routing rules are not written to CLAUDE.md for agent discoverability. Hybrid approach would be better.

4. **No multi-host support**: Installer only generates Claude Code configs. Codex/Gemini support would need host-aware paths.

5. **Missing `reviewer.md` agent template**: Plan included `agentFiles = ['scout.md', 'reviewer.md']` but only scout.md exists. Need to add reviewer agent template.

## Action Items

- [ ] Add resolver pipeline to template rendering (conditional sections, host-aware)
- [ ] Consider symlinking templates instead of copying
- [ ] Write routing rules to both `.harness.yaml` and CLAUDE.md (hybrid approach)
- [ ] Add `reviewer.md` agent template
- [ ] Consider gitignore auto-management (deferred from Phase 1 retro)
- [ ] Consider file-backed session cache (deferred from Phase 1 retro)
