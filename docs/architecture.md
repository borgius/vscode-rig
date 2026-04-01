# Architecture

## Design principles

Rig is a **layered middleware** system. Each layer has one responsibility and
communicates through typed interfaces. Layers compose but don't couple -- the
tool router works without the enforcement pipeline, the skill chain works
without the scout agent.

**Key decisions:**

1. **Hooks over prompts** -- Enforcement runs as code (Claude Code hooks), not as persuasive text. Hooks can't be ignored by the agent.
2. **Typed over unstructured** -- `CodebaseMap`, `Resolution`, `IntentType` are typed data structures, not prose. Downstream code queries them programmatically.
3. **Config over convention** -- `.harness.yaml` controls enforcement levels. Users adjust thresholds without touching code.
4. **Compose over inherit** -- Enforcement checks are independent functions composed in `handlePostToolUse()`. Each check is testable in isolation.

These principles come from the [agentic-patterns](https://github.com/franklywatson/agentic-patterns) L2 and L3 levels. Rig is their working implementation.

---

## Layer 1: Tool Router

The tool router intercepts shell commands before Claude Code executes them.

```
User types: grep -r "TODO" src/
     |
PreToolUse Hook (handlePreToolUse)
     |
classifyIntent("grep -r TODO src/") -> IntentType.text_search
     |
resolve(rule, environment) -> Resolution
     |
  +----------------------------------+
  | rtk available?   -> redirect rtk |
  | jcodemunch ready? -> redirect jm |
  | neither?         -> allow        |
  +----------------------------------+
     |
HookResult: { decision: "block"|"allow", reason? }
```

**Files:** `src/router/intent.ts`, `src/router/rules.ts`, `src/router/resolver.ts`, `src/router/hook.ts`

### Intent types

| Intent | Matches | Resolution |
| ------ | ------- | ---------- |
| `native_read` | `Read` tool on code files (no offset/limit) | jcodemunch `get_file_outline` or `get_symbol` |
| `native_grep` | `Grep` tool | jcodemunch `search_text` |
| `native_glob` | `Glob` tool on code file patterns | jcodemunch `get_file_tree` |
| `rtk_cat_code` | `rtk cat` on code files | Block, redirect to jcodemunch |
| `text_search` | Bash `grep`, `rg` | rtk or jcodemunch `search_text` |
| `file_discovery` | Bash `find`, `fd` | jcodemunch `get_file_tree` |
| `file_read` | Bash `cat`, `head`, `tail` | rtk or jcodemunch `get_symbol` |
| `file_modify` | Bash `sed -i`, `awk >` | Block, redirect to Edit tool |

### Priority chain

`_` (wildcard) -> `rtk` -> `jcodemunch` -> `claudeTool` -> `fallback` -> allow

The resolver checks each priority level. First match wins. The wildcard `_` always wins if present. If nothing matches, the command is allowed.

Native tool rules (Read, Grep, Glob) are placed before broader intent rules in the
rule array, so `findMatchingRule` returns the native-specific rule first. This prevents
circular advice where the router would suggest "use Grep" when the agent is already
on the Grep tool.

---

## Layer 2: Enforcement Pipeline

The enforcement pipeline runs after each tool use, checking for quality violations.

```
PostToolUse Hook (handlePostToolUse)
     |
+------------------+
| checkStaleTests   |  Source edited without test update?
+------------------+
| checkConstitutional| Mocks in test files?
+------------------+
| checkZeroDefect   |  Test output shows failures?
+------------------+
     |
Each check returns a violation message or null
     |
Combined violations joined as advisory output
     |
HookResult: { decision, reason }
```

> **Note:** `checkTestScope` exists in `src/enforcement/test-scope.ts` but is not
> yet wired into the pipeline. It redirects full-suite runs to scoped tests during
> `tdd+` phase when implemented.

### Enforcement levels

| Level | Behavior | Exit code |
| ----- | -------- | -------- |
| `block` | Hook exits nonzero, tool call rejected | 2 |
| `advise` | Warning printed, tool call proceeds | 0 |
| `silent` | Logged only, no output | 0 |

### Stale test detection

`FileTracker` records source/test edits with turn numbers. After a configurable
grace period, source edits without corresponding test edits trigger a warning.
The source's creation turn is exempt -- you don't get flagged for the edit you
just made.

### Test scope control

During `tdd+` phase, running the full test suite (e.g., `npm test`) is redirected to scoped runs targeting only the affected test file. This keeps iteration fast during red-green-refactor cycles.

### Constitutional rules

Regex-based detection of mocking patterns (`jest.mock`, `vi.mock`, `sinon.stub`, etc.) in test file content during edits. All constitutional rules are configurable via `.harness.yaml` -- set `no_mocks: silent` to disable no-mock enforcement, or `evidence_only: silent` to disable evidence-only enforcement. Active rules are emitted in session-start output so skill templates can reference them dynamically instead of hardcoding assumptions.

### Zero-defect check

Parses test output (vitest, jest, pytest patterns) for failure indicators. Classifies as pass, fail,
or unknown. Supports pre-existing failure classification via `git diff` — failures in untouched
files are reported separately from regressions based on `zero_defect.unrelated_errors` config.

**Files:** `src/enforcement/file-tracker.ts`, `src/enforcement/stale-test.ts`, `src/enforcement/test-scope.ts`, `src/enforcement/constitutional.ts`, `src/enforcement/zero-defect.ts`, `src/enforcement/post-tool-use.ts`

---

## Layer 3: Skill Chain Pipeline

Skills are ordered workflow stages. The `SkillPhaseTracker` enforces valid transitions.

```
brain+ -> plan+ -> tdd+ -> verify+ -> review+
   |        |       |        |          |
   |        |       |        |          +-- accessible from any phase
   |        |       |        +-- requires tdd+ visit
   |        |       +-- free transition
   |        +-- free transition
   +-- free transition
```

**Phase transition rules:**

- `review+` is accessible from any phase (no prerequisite)
- `verify+` requires a prior `tdd+` visit
- All other phases (`brain+`, `plan+`, `tdd+`) allow free transitions

Each skill wraps a `superpowers:*` skill with enforcement overlays. Skills are SKILL.md files with YAML frontmatter. Templates reference active enforcement rules from session-start context rather than hardcoding constitutional assumptions -- this keeps template prose in sync with `.harness.yaml` configuration.

**Files:** `src/skills/phase-tracker.ts`, `templates/skills/`

### Standalone skills

`savings` reports rtk and jcodemunch token savings for the current session.
It has no phase prerequisite and is accessible at any time via `/savings`.
The session-start hook captures a `MetricsBaseline` (rtk's cumulative
saved-token count), and the post-tool-use hook increments rtk/jcodemunch
call counters. The `/savings` skill computes the delta and formats the report
via `formatSavingsReport()`.

**Files:** `src/session/metrics.ts`, `templates/skills/savings/SKILL.md`

---

## Layer 4: Scout Agent

The scout agent builds a typed `CodebaseMap` from jcodemunch indexes.

```
Scout agent invoked
     |
ensureIndexed(directory) -> jcodemunch auto-index
     |
buildCodebaseMap(index) -> CodebaseMap
     |
CodebaseMap: {
  structure: { path, type, symbolCount? }[],
  entryPoints: string[],
  keyExports: SymbolSummary[],
  dependencies: string[],
  languages: Record<string, number>,
  symbols: { functions, classes, types }
}
     |
Formatted as structured context for the agent
```

**Cross-repo support:** `ensureIndexed()` indexes external directories on first reference. `ScoutCache` with 30-min TTL prevents redundant indexing.

**Entry point detection:** Derives from filename patterns: `index.*`, `main.*`, `cli.*`, `app.*`, `server.*`.

**Files:** `src/scout/mapper.ts`, `src/scout/cross-repo.ts`, `src/scout/scout-cache.ts`, `templates/agents/scout.md`

---

## Supporting modules

### Config (`src/config.ts`)

Loads `.harness.yaml` with layered merge (base config + local override). `getEnforcementLevel()` resolves level per rule.

### Session (`src/session/`)

`detectEnvironment()` checks for rtk, jcodemunch, and other tools via injectable
`ExecFn`. `SessionCache` with 30-min TTL persists to `/tmp/rig-session-{cwd-hash}.json`
for cross-process state sharing between hook invocations. Environment detection
results, edited file tracking, phase, metrics baseline, tool call counters, and a
`toolsWarned` flag all persist. `handleSessionStart()` auto-indexes the project,
captures a metrics baseline on first session, emits active enforcement rules from
`.harness.yaml` (so skill templates can reference them dynamically), and emits a
one-time warning if rtk or jcodemunch are not installed (suppressed for the rest
of the session via the `toolsWarned` cache flag).

### CLI (`src/cli/`)

`initCommand()` generates hooks, skills, agents, and config from templates via
`renderTemplate()` (`{{VAR}}` substitution). Registers hooks in
`.claude/settings.json` via `updateSettingsJson()` (idempotent, preserves
existing settings).

---

## Data flow: init command

```
npx rig init
     |
initCommand(options)
     |
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
  - skills/savings/SKILL.md
  - agents/scout.md
     |
renderTemplate() replaces {{VAR}} placeholders
     |
updateSettingsJson() registers hooks in .claude/settings.json
     |
Writes .harness.yaml with default enforcement config
```

---

## Design decisions

Key design decisions:

| Decision | Rationale |
| -------- | ---------- |
| Hooks over preamble text | GStack uses persuasive instructions; we use programmatic hooks that can't be skipped |
| Typed CodebaseMap over prose context | Composable, queryable by downstream code |
| File-backed cache in /tmp | Cross-process state sharing; hooks are separate processes that need shared state. OS cleans /tmp automatically. |
| `npx` over global install | Lower barrier, no global package management |
| Separate `.harness.yaml` over CLAUDE.md injection | Cleaner separation of concerns, version-controllable |
| Static SKILL.md templates over resolver pipeline | Simpler for 5 skills; resolver pipeline deferred |

---

## Known limitations

- No auto-test generation for coverage gaps
- No mode-aware enforcement (same thresholds regardless of workflow phase)
- No multi-agent specialist review pattern (single review+ pass)
- No REPO_MODE awareness (solo vs collaborative)
