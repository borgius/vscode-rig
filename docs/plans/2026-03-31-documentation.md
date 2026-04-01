# Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write public-facing documentation that makes claude-stack-utils discoverable, understandable, and installable without reading source code.

**Architecture:** Four documents: README.md (entry point), CLAUDE.md (agent instructions), docs/architecture.md (system design), docs/getting-started.md (hands-on guide).
No separate API reference — the type surface is small enough (108 symbols, 26 files) that inline types + architecture doc suffice.
Retrospectives already document the development journey.

**Tech Stack:** Markdown, mermaid diagrams (code-fenced), existing markdownlint config

---

## File Structure

| File | Responsibility |
| --- | --- |
| `README.md` | Project entry point: what, why, quick start, architecture overview, config, contributing |
| `CLAUDE.md` | Project-level agent instructions: conventions, test commands, architecture notes |
| `docs/architecture.md` | System design: layered middleware, data flow, module map, design decisions |
| `docs/getting-started.md` | Hands-on: prerequisites, install, init, verify, first skill chain run |

No other files needed. The 7 retrospectives in `docs/retrospectives/` and 7+1 plans in `docs/plans/` already document the development history.
These four new files fill the gap for users who haven't read the source.

---

### Task 1: README.md

**Files:**

- Create: `README.md`

- [ ] **Step 1: Write the README**

```markdown
# claude-stack-utils

Agent harness that enforces tool routing, skill chains, and multi-agent discipline for [Claude Code](https://claude.ai/code).

## What it does

claude-stack-utils installs guardrails into a Claude Code project:

- **Tool Router** — intercepts shell commands via PreToolUse hooks, redirects `grep`/`find`/`cat` to rtk or jcodemunch when available
- **Enforcement Pipeline** — PostToolUse hooks check stale tests, test scope, constitutional rules (no mocks), and zero-defect status
- **Skill Chain** — ordered workflow skills: `brain+` → `plan+` → `tdd+` → `verify+` → `review+`
- **Scout Agent** — cross-repo indexing agent that builds a typed `CodebaseMap` for context injection

## Quick start

```bash
# Install and initialize in your project
npx claude-stack-utils init

# Verify installation
# (in Claude Code session)
/verify-harness
```

That's it. The `init` command generates hooks, skills, agents, and config into your project's `.claude/` directory.

## Architecture

```
┌─────────────────────────────────────────────┐
│                Claude Code                  │
├──────────┬──────────┬───────────┬───────────┤
│ PreToolUse Hook │ PostToolUse Hook │ Session Start Hook │
│  (tool router)  │ (enforcement)    │ (auto-indexing)    │
├──────────┴──────────┴───────────┴───────────┤
│              Skill Chain Pipeline           │
│  brain+ → plan+ → tdd+ → verify+ → review+ │
├─────────────────────────────────────────────┤
│              Scout Agent                    │
│         (CodebaseMap + cross-repo)          │
├─────────────────────────────────────────────┤
│           .harness.yaml config              │
└─────────────────────────────────────────────┘
```

Four layers, one config file. See [docs/architecture.md](../../docs/architecture.md) for the full design.

## Configuration

claude-stack-utils uses `.harness.yaml` in your project root:

```yaml
enforcement:
  staleTests:
    level: advise        # block | advise | silent
    gracePeriod: 3
  testScope:
    level: advise
  constitutional:
    level: advise
  zeroDefect:
    level: advise
```

Each enforcement rule can be `block` (hook exits nonzero), `advise` (prints warning), or `silent` (logs only).

## Skill chain

| Skill | Purpose | Wraps |
| --- | --- | --- |
| `brain+` | Ideation and requirements | `superpowers:brainstorming` |
| `plan+` | Implementation planning | `superpowers:writing-plans` |
| `tdd+` | Test-driven development | `superpowers:tdd` |
| `verify+` | Installation verification | `superpowers:code-reviewer` |
| `review+` | Code review | `superpowers:code-reviewer` |

Skills enforce phase transitions: `tdd+` requires prior `plan+` visit, `verify+` requires prior `tdd+` visit.

## What gets installed

```
.claude/
├── settings.json          # Hook registrations
├── hooks/
│   ├── pre-tool-use.ts    # Tool router
│   ├── post-tool-use.ts   # Enforcement pipeline
│   └── session-start.ts   # Auto-indexing
├── skills/
│   ├── brain-plus/        # brain+ skill
│   ├── plan-plus/         # plan+ skill
│   ├── tdd-plus/          # tdd+ skill
│   ├── verify-plus/       # verify+ skill
│   ├── review-plus/       # review+ skill
│   └── verify-harness/    # Installation verifier
└── agents/
    └── scout.md           # Cross-repo scout agent
```

## Requirements

- [Claude Code](https://claude.ai/code) CLI
- Node.js 18+
- Optional: [rtk](https://github.com/franklywatson/rtk) for token-optimized command proxy
- Optional: [jcodemunch](https://github.com/franklywatson/jcodemunch) MCP server for indexed code search

## Development

```bash
npm install
npm test         # vitest, 240+ tests
npm run build    # TypeScript compile
npm run lint     # type-check only
```

## License

MIT

```

- [ ] **Step 2: Run markdown lint**

Run: `npx markdownlint-cli2 README.md`
Expected: PASS (permissive config in `.markdownlint-cli2.jsonc`)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README.md"
```

---

### Task 2: CLAUDE.md

**Files:**

- Create: `CLAUDE.md`

- [ ] **Step 1: Write CLAUDE.md**

```markdown
# claude-stack-utils — Project Instructions

## Overview

Agent harness for Claude Code. TypeScript, vitest, commander CLI.

## Commands

```bash
npm test          # Run all tests (vitest run)
npm run test:watch # Watch mode
npm run build     # Compile TypeScript to dist/
npm run lint      # Type-check (tsc --noEmit)
```

## System Architecture

Four-layer middleware:

1. **Tool Router** (`src/router/`) — PreToolUse hook, intent classification, priority resolution (rtk > jcodemunch > claudeTool > fallback > allow)
2. **Enforcement** (`src/enforcement/`) — PostToolUse hook, composable pipeline: stale tests → test scope → constitutional → zero-defect
3. **Skill Chain** (`src/skills/`) — Phase tracker validates transitions (brain+ → plan+ → tdd+ → verify+ → review+)
4. **Scout** (`src/scout/`) — Cross-repo indexing, CodebaseMap formatter, TTL cache

Supporting: `src/config.ts` (YAML config), `src/session/` (environment detection, session cache), `src/cli/` (init command, template renderer)

## Key Types

All types in `src/types.ts`. Important ones:

- `IntentType` — file_read, text_search, file_discovery, file_modify
- `EnforcementLevel` — block, advise, silent
- `Resolution` — redirect, advise, block, allow
- `ToolRule` — match pattern + resolutions per environment
- `CodebaseMap` — languages, symbols, entryPoints, keyExports, dependencies
- `HarnessConfig` — enforcement rules with levels and grace periods

## Conventions

- Config via `.harness.yaml` (YAML, layered merge with base + local)
- Environment detection uses injectable `ExecFn` for testability
- Session cache has 30-min TTL, in-memory only
- All hooks read JSON from stdin, write JSON to stdout (Claude Code hook protocol)
- Skill templates use `{{VAR}}` substitution via `renderTemplate()`
- Enforcement levels are per-rule: block (exit 2), advise (print + exit 0), silent (log + exit 0)

## Testing

- 240+ tests, all in `tests/` mirroring `src/` structure
- Vitest with v8 coverage provider
- Coverage gate: 80% statements/functions/lines, 75% branches
- No mocks for environment detection — use injectable `ExecFn`

```

- [ ] **Step 2: Run markdown lint**

Run: `npx markdownlint-cli2 CLAUDE.md`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md project instructions"
```

---

### Task 3: docs/architecture.md

**Files:**

- Create: `docs/architecture.md`

- [ ] **Step 1: Write architecture.md**

```markdown
# Architecture

## Design principles

claude-stack-utils is a **layered middleware** system. Each layer has one responsibility and communicates through typed interfaces. Layers compose but don't couple — the tool router works without the enforcement pipeline, the skill chain works without the scout agent.

**Key decisions:**

1. **Hooks over prompts** — Enforcement runs as code (Claude Code hooks), not as persuasive text. Hooks can't be ignored by the agent.
2. **Typed over unstructured** — `CodebaseMap`, `Resolution`, `IntentType` are typed data structures, not prose. Downstream code queries them programmatically.
3. **Config over convention** — `.harness.yaml` controls enforcement levels. Users adjust thresholds without touching code.
4. **Compose over inherit** — Enforcement checks are independent functions composed in `handlePostToolUse()`. Each check is testable in isolation.

## Layer 1: Tool Router

The tool router intercepts shell commands before Claude Code executes them.

```

User types: grep -r "TODO" src/
     ↓
PreToolUse Hook (handlePreToolUse)
     ↓
classifyIntent("grep -r TODO src/") → IntentType.text_search
     ↓
resolve(rule, environment) → Resolution
     ↓
  ┌──────────────────────────────────┐
  │ rtk available? → redirect to rtk │
  │ jcodemunch indexed? → redirect   │
  │ neither? → allow original        │
  └──────────────────────────────────┘
     ↓
HookResult: { decision: "block"|"allow", reason? }

```

**Files:** `src/router/intent.ts` (classification), `src/router/rules.ts` (default rules), `src/router/resolver.ts` (priority resolution), `src/router/hook.ts` (hook entry point)

**Intent types:**

| Intent | Matches | Safer alternative |
|--------|---------|-------------------|
| `text_search` | `grep`, `rg`, `grepr` | rtk, jcodemunch `search_text` |
| `file_discovery` | `find`, `fd`, `ls` | jcodemunch `get_file_tree` |
| `file_read` | `cat`, `head`, `tail` | rtk, jcodemunch `get_symbol` |
| `file_modify` | `sed -i`, `awk >` | Edit tool |

**Priority chain:** `rtk` → `jcodemunch` → `claudeTool` → `fallback` → `_` (wildcard) → allow

## Layer 2: Enforcement Pipeline

The enforcement pipeline runs after each tool use, checking for quality violations.

```

PostToolUse Hook (handlePostToolUse)
     ↓
┌─────────────────┐
│ checkStaleTests  │ → Source edited without test update?
├─────────────────┤
│ checkTestScope   │ → Running full suite during tdd+ phase?
├─────────────────┤
│ checkConstitutional│ → Mocks in test files? Claims without evidence?
├─────────────────┤
│ checkZeroDefect  │ → Test output shows failures?
└─────────────────┘
     ↓
Each check returns EnforcementResult: { level, message }
     ↓
getEffectiveEnforcement() → most severe level wins
     ↓
HookResult: { decision, reason }

```

**Enforcement levels:**

| Level | Behavior | Exit code |
|-------|----------|-----------|
| `block` | Hook exits nonzero, tool call rejected | 2 |
| `advise` | Warning printed, tool call proceeds | 0 |
| `silent` | Logged only, no output | 0 |

**Stale test detection:** `FileTracker` records source/test edits with turn numbers. After a configurable grace period, source edits without corresponding test edits trigger a warning. The source's creation turn is exempt.

**Test scope control:** During `tdd+` phase, running the full test suite (e.g., `npm test`) is redirected to scoped runs targeting only the affected test file. This keeps iteration fast.

**Constitutional rules:** Regex-based detection of mocking patterns (`jest.mock`, `vi.mock`, `sinon.stub`, etc.) in test files. Also checks for claims without evidence in commit messages.

**Zero-defect check:** Parses test output (vitest, jest, pytest patterns) for failure indicators. Classifies as pass, fail, or unknown.

**Files:** `src/enforcement/file-tracker.ts`, `src/enforcement/stale-test.ts`, `src/enforcement/test-scope.ts`, `src/enforcement/constitutional.ts`, `src/enforcement/zero-defect.ts`, `src/enforcement/post-tool-use.ts`

## Layer 3: Skill Chain Pipeline

Skills are ordered workflow stages. The `SkillPhaseTracker` enforces valid transitions.

```

brain+ → plan+ → tdd+ → verify+ → review+
   │        │       │        │         │
   │        │       │        │         └─ requires verify+ visit
   │        │       │        └─ requires tdd+ visit
   │        │       └─ requires plan+ visit
   │        └─ no prerequisite (entry point for planning)
   └─ no prerequisite (entry point for ideation)

```

**Phase transition rules:**
- `plan+` requires prior `brain+` visit
- `tdd+` requires prior `plan+` visit
- `verify+` requires prior `tdd+` visit
- `review+` requires prior `verify+` visit

Each skill wraps a `superpowers:*` skill with enforcement overlays. Skills are SKILL.md files with YAML frontmatter.

**Files:** `src/skills/phase-tracker.ts`, `templates/skills/`

## Layer 4: Scout Agent

The scout agent builds a typed `CodebaseMap` from jcodemunch indexes.

```

Scout agent invoked
     ↓
ensureIndexed(directory) → jcodemunch auto-index
     ↓
buildCodebaseMap(index) → CodebaseMap
     ↓
CodebaseMap: {
  languages: Map<string, number>,
  symbols: SymbolSummary[],
  entryPoints: string[],
  keyExports: string[],
  dependencies: string[]
}
     ↓
Formatted as structured context for the agent

```

**Cross-repo support:** `ensureIndexed()` indexes external directories on first reference. `ScoutCache` with 30-min TTL prevents redundant indexing.

**Entry point detection:** Derives from filename patterns: `index.*`, `main.*`, `cli.*`, `app.*`, `server.*`.

**Files:** `src/scout/mapper.ts`, `src/scout/cross-repo.ts`, `src/scout/scout-cache.ts`, `templates/agents/scout.md`

## Supporting modules

**Config** (`src/config.ts`): Loads `.harness.yaml` with layered merge (base config + local override). `getEnforcementLevel()` resolves level per rule.

**Session** (`src/session/`): `detectEnvironment()` checks for rtk, jcodemunch, and other tools via injectable `ExecFn`. `SessionCache` with 30-min TTL stores environment detection results. `handleSessionStart()` auto-indexes the project on first session.

**CLI** (`src/cli/`): `initCommand()` generates hooks, skills, agents, and config from templates via `renderTemplate()` (`{{VAR}}` substitution). Registers hooks in `.claude/settings.json` via `updateSettingsJson()` (idempotent, preserves existing settings).

## Data flow: init command

```

npx claude-stack-utils init
     ↓
initCommand(options)
     ↓
copyTemplate() for each:

- hooks/pre-tool-use.ts
- hooks/post-tool-use.ts
- hooks/session-start.ts
- skills/brain-plus/SKILL.md
- skills/plan-plus/SKILL.md
- skills/tdd-plus/SKILL.md
- skills/verify-plus/SKILL.md
- skills/review-plus/SKILL.md
- skills/verify-harness/SKILL.md
- agents/scout.md
     ↓
renderTemplate() replaces {{VAR}} placeholders
     ↓
updateSettingsJson() registers hooks in .claude/settings.json
     ↓
Writes .harness.yaml with default enforcement config

```

## Design decisions from retrospectives

Seven phase retrospectives are in `docs/retrospectives/`. Key decisions:

| Decision | Rationale |
|----------|-----------|
| Hooks over preamble text | GStack uses persuasive instructions; we use programmatic hooks that can't be skipped |
| Typed CodebaseMap over prose context | Composable, queryable by downstream code |
| In-memory cache over file-backed | Session-scoped, simpler, no stale file issues |
| `npx` over global install | Lower barrier, no global package management |
| Separate `.harness.yaml` over CLAUDE.md injection | Cleaner separation of concerns, version-controllable |
| Static SKILL.md templates over resolver pipeline | Simpler for 5 skills; resolver pipeline deferred to future phase |

## Known limitations (from retrospective action items)

- No auto-test generation for coverage gaps
- No mode-aware enforcement (same thresholds regardless of workflow phase)
- No multi-agent specialist review pattern (single review+ pass)
- No REPO_MODE awareness (solo vs collaborative)
- No pre-existing failure classification (git-diff-based)
- No file-backed session cache (in-memory only, dies with session)
```

- [ ] **Step 2: Run markdown lint**

Run: `npx markdownlint-cli2 docs/architecture.md`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: add architecture.md"
```

---

### Task 4: docs/getting-started.md

**Files:**

- Create: `docs/getting-started.md`

- [ ] **Step 1: Write getting-started.md**

```markdown
# Getting Started

## Prerequisites

- [Claude Code](https://claude.ai/code) CLI installed and configured
- Node.js 18+
- A project you want to add guardrails to

Optional but recommended:
- [rtk](https://github.com/franklywatson/rtk) — token-optimized command proxy
- [jcodemunch](https://github.com/franklywatson/jcodemunch) — indexed code search MCP server

## Install and initialize

From your project's root directory:

```bash
npx claude-stack-utils init
```

This generates:

| Path | Purpose |
| --- | --- |
| `.claude/hooks/pre-tool-use.ts` | Tool router — redirects grep/find/cat to better tools |
| `.claude/hooks/post-tool-use.ts` | Enforcement — stale tests, scope, constitutional, zero-defect |
| `.claude/hooks/session-start.ts` | Auto-indexes your project on session start |
| `.claude/skills/brain-plus/` | Ideation skill |
| `.claude/skills/plan-plus/` | Planning skill |
| `.claude/skills/tdd-plus/` | Test-driven development skill |
| `.claude/skills/verify-plus/` | Verification skill |
| `.claude/skills/review-plus/` | Code review skill |
| `.claude/skills/verify-harness/` | Installation verifier |
| `.claude/agents/scout.md` | Cross-repo scout agent |
| `.claude/settings.json` | Hook registrations (merged, not overwritten) |
| `.harness.yaml` | Enforcement configuration |

## Verify installation

Start a Claude Code session in your project and run:

```
/verify-harness
```

This runs a 28-point checklist confirming hooks, skills, agents, and config are correctly wired.

## Use the skill chain

Skills are invoked as slash commands in Claude Code:

```
/brain+    → Ideate and gather requirements
/plan+     → Create an implementation plan
/tdd+      → Write tests, then implement
/verify+   → Verify the implementation works
/review+   → Review code quality
```

Skills enforce ordering. You can't run `/tdd+` until you've visited `/plan+`. You can't run `/verify+` until you've visited `/tdd+`.

## Configure enforcement

Edit `.harness.yaml` to adjust enforcement levels:

```yaml
enforcement:
  staleTests:
    level: advise        # Change to "block" to reject edits without tests
    gracePeriod: 3       # Turns before flagging
  testScope:
    level: advise
  constitutional:
    level: advise
  zeroDefect:
    level: advise
```

**Levels:**

| Level | What happens |
| --- | --- |
| `block` | Hook rejects the tool call (exit 2) |
| `advise` | Warning printed, tool call proceeds |
| `silent` | Logged only, no visible output |

## What the hooks do

### PreToolUse: Tool Router

When Claude tries to run a shell command like `grep -r "pattern" src/`, the pre-tool-use hook intercepts it:

1. **Classifies intent** — `grep` → `text_search`
2. **Checks environment** — rtk available? jcodemunch indexed?
3. **Resolves** — redirects to the best available tool, or allows the original command

### PostToolUse: Enforcement Pipeline

After each tool use, the post-tool-use hook runs four checks:

1. **Stale tests** — Did you edit source files without updating tests?
2. **Test scope** — Are you running the full suite when you should be running scoped tests?
3. **Constitutional** — Are there mocks in test files? Claims without evidence?
4. **Zero defect** — Do the test results show failures?

Each check returns an enforcement level. The most severe level determines the hook result.

### Session Start: Auto-indexing

When a Claude Code session starts, the session-start hook:

1. Detects available tools (rtk, jcodemunch)
2. Auto-indexes the project via jcodemunch if not already indexed
3. Caches results for the session (30-min TTL)

## Re-initialize

To regenerate templates (e.g., after updating claude-stack-utils):

```bash
npx claude-stack-utils init --force
```

This overwrites existing hook and skill templates but preserves your `.harness.yaml` config and any custom settings in `.claude/settings.json`.

## Uninstall

Remove the generated files:

```bash
rm -rf .claude/hooks/ .claude/skills/ .claude/agents/scout.md .harness.yaml
```

Then remove hook registrations from `.claude/settings.json`. The `init` command added entries under `hooks.PreToolUse` and `hooks.PostToolUse` and `hooks.SessionStart` — remove those arrays.

## Next steps

- Read [docs/architecture.md](../architecture.md) for the full system design
- Check `docs/retrospectives/` for design decisions and GStack comparison notes

```

- [ ] **Step 2: Run markdown lint**

Run: `npx markdownlint-cli2 docs/getting-started.md`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/getting-started.md
git commit -m "docs: add getting-started.md"
```

---

### Task 5: Lint and link check

**Files:**

- Modify: (none — validation only)

- [ ] **Step 1: Run full markdown lint**

Run: `npx markdownlint-cli2 README.md CLAUDE.md docs/architecture.md docs/getting-started.md`
Expected: PASS for all four files

- [ ] **Step 2: Verify internal links**

Check that relative links resolve:

- `README.md` links to `docs/architecture.md` — must exist
- `docs/getting-started.md` links to `architecture.md` — must exist (same directory)
- `docs/getting-started.md` references `docs/retrospectives/` — must exist

Run: `ls docs/architecture.md docs/getting-started.md docs/retrospectives/`
Expected: All paths exist

- [ ] **Step 3: Final commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "docs: fix lint issues"
```

---

### Task 6: Agentic-patterns improvement plan

**Files:**

- Create: `docs/plans/2026-03-31-agentic-patterns-improvements.md` (analysis and recommendations)
- Create: in agentic-patterns repo: plan document with concrete improvement tasks

- [ ] **Step 1: Write the gap analysis into this repo**

The analysis covers 7 improvement areas for agentic-patterns based on what claude-stack-utils built and learned. See the analysis below in the self-review section. Save the plan to `docs/plans/2026-03-31-agentic-patterns-improvements.md`.

- [ ] **Step 2: Write the improvement plan into agentic-patterns repo**

Using the gap analysis, write a concrete improvement plan into `/home/jerome/projects/agentic-patterns/specs/` following the established convention in that repo.

- [ ] **Step 3: Commit both**

```bash
git add docs/plans/2026-03-31-agentic-patterns-improvements.md
git commit -m "docs: add agentic-patterns improvement analysis"
```

---

## Self-Review

**1. Spec coverage:** The user asked for docs "suitably structured" with "agentic-patterns principles" and learning from "claw-code, superpower, gstack."
This plan creates four documents covering all those angles — README (entry, like any good OSS project), CLAUDE.md (agent instructions, following superpowers pattern),
architecture.md (system design, covering the guardrails pattern from agentic-patterns), and getting-started.md (hands-on). No gaps.

**2. Placeholder scan:** No TBD, TODO, or "implement later" patterns. All content is concrete.

**3. Type consistency:** No code types to cross-reference — this is a documentation plan. File paths are consistent with the actual project structure verified via rtk.

**4. Verbosity check:** README covers what/why/quick-start/architecture/config/skills in ~100 lines. CLAUDE.md is agent-scoped conventions in ~50 lines.
Architecture is the deepest doc at ~180 lines with ASCII diagrams and data flows. Getting-started is practical walkthrough at ~130 lines. Total: ~460 lines across 4 files. Precise, not bloated.
