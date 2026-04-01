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
| `text_search` | `grep`, `rg` | rtk or jcodemunch `search_text` |
| `file_discovery` | `find`, `fd` | jcodemunch `get_file_tree` |
| `file_read` | `cat`, `head`, `tail` | rtk or jcodemunch `get_symbol` |
| `file_modify` | `sed -i`, `awk >` | Block, redirect to Edit tool |

### Priority chain

`rtk` -> `jcodemunch` -> `claudeTool` -> `fallback` -> `_` (wildcard) -> allow

The resolver checks each priority level. First match wins. If nothing matches, the command is allowed.

---

## Layer 2: Enforcement Pipeline

The enforcement pipeline runs after each tool use, checking for quality violations.

```
PostToolUse Hook (handlePostToolUse)
     |
+------------------+
| checkStaleTests   |  Source edited without test update?
+------------------+
| checkTestScope    |  Running full suite during tdd+ phase?
+------------------+
| checkConstitutional| Mocks in test files? Claims without evidence?
+------------------+
| checkZeroDefect   |  Test output shows failures?
+------------------+
     |
Each check returns EnforcementResult: { level, message }
     |
getEffectiveEnforcement() -> most severe level wins
     |
HookResult: { decision, reason }
```

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

Regex-based detection of mocking patterns (`jest.mock`, `vi.mock`, `sinon.stub`, etc.) in test files. Also checks for claims without evidence in commit messages.

### Zero-defect check

Parses test output (vitest, jest, pytest patterns) for failure indicators. Classifies as pass, fail, or unknown.

**Files:** `src/enforcement/file-tracker.ts`, `src/enforcement/stale-test.ts`, `src/enforcement/test-scope.ts`, `src/enforcement/constitutional.ts`, `src/enforcement/zero-defect.ts`, `src/enforcement/post-tool-use.ts`

---

## Layer 3: Skill Chain Pipeline

Skills are ordered workflow stages. The `SkillPhaseTracker` enforces valid transitions.

```
brain+ -> plan+ -> tdd+ -> verify+ -> review+
   |        |       |        |          |
   |        |       |        |          +-- requires verify+ visit
   |        |       |        +-- requires tdd+ visit
   |        |       +-- requires plan+ visit
   |        +-- no prerequisite (entry point for planning)
   +-- no prerequisite (entry point for ideation)
```

**Phase transition rules:**

- `plan+` requires prior `brain+` visit
- `tdd+` requires prior `plan+` visit
- `verify+` requires prior `tdd+` visit
- `review+` requires prior `verify+` visit

Each skill wraps a `superpowers:*` skill with enforcement overlays. Skills are SKILL.md files with YAML frontmatter.

**Files:** `src/skills/phase-tracker.ts`, `templates/skills/`

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
  languages: Map<string, number>,
  symbols: SymbolSummary[],
  entryPoints: string[],
  keyExports: string[],
  dependencies: string[]
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
`ExecFn`. `SessionCache` with 30-min TTL stores detection results.
`handleSessionStart()` auto-indexes the project on first session.

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

Seven phase retrospectives are in `docs/retrospectives/`. Key decisions:

| Decision | Rationale |
| -------- | ---------- |
| Hooks over preamble text | GStack uses persuasive instructions; we use programmatic hooks that can't be skipped |
| Typed CodebaseMap over prose context | Composable, queryable by downstream code |
| In-memory cache over file-backed | Session-scoped, simpler, no stale file issues |
| `npx` over global install | Lower barrier, no global package management |
| Separate `.harness.yaml` over CLAUDE.md injection | Cleaner separation of concerns, version-controllable |
| Static SKILL.md templates over resolver pipeline | Simpler for 5 skills; resolver pipeline deferred |

---

## Known limitations

From retrospective action items:

- No auto-test generation for coverage gaps
- No mode-aware enforcement (same thresholds regardless of workflow phase)
- No multi-agent specialist review pattern (single review+ pass)
- No REPO_MODE awareness (solo vs collaborative)
- No pre-existing failure classification (git-diff-based)
- No file-backed session cache (in-memory only, dies with session)
