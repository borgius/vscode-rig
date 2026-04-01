# Claude Stack Utils - Agent Harness Design Spec

**Date**: 2026-03-31
**Status**: Draft - pending user review
**Target Platform**: Claude Code (v1), multi-platform later
**Language**: TypeScript
**Distribution**: CLI installer (`npx claude-stack-utils init`)

## Overview

A bespoke, open-source agent harness that distills the best patterns from superpowers, gstack, claw-code, and damage-control-guardrails into a unified system.
The harness codifies the agentic-patterns pyramid (L0-L4) into enforceable tool routing, skill chains, and multi-agent discipline for continuous, unattended development.

## Source Project Analysis

| Project | What We Take |
| --- | --- |
| **superpowers** | **Used as-is, not replaced.** Skills are wrapped/extended, not reimplemented. The harness depends on superpowers being installed and adds overlays on top. |
| **gstack** | Template-based skill generation, resolver architecture, eval system, multi-platform adapter pattern |
| **claw-code** | Command graph routing, query engine turn loop, execution registry, tool pool concept |
| **damage-control-guardrails** | **Ported, not used as-is.** All hooks, guardrails, intent classification, environment-aware routing (rtk > jcodemunch > fallback), allow/advise/block resolution are ported into the harness and evolved. |
| **agentic-patterns** | Pattern pyramid as northstar: closed-loop verification, skill chains, scout pattern, zero-defect, constitutional rules |
| **claude-code-best-practice** | Subagent frontmatter patterns, hook event system, configuration hierarchy |

## Architecture: Layered Middleware

Four composable layers, each installable standalone. Maps to agentic-patterns pyramid levels.

```
Layer 1: Tool Router (hooks)        — intercepts tool calls, routes to optimal tool
Layer 2: Context Engineer (agent)   — scout agent for structured exploration
Layer 3: Skill Chain (skills)       — brain+ -> plan+ -> tdd+ -> verify+ -> review+
Layer 4: Enforcement (hooks+skills) — constitutional rules, zero-defect, test integrity
```

---

## Layer 1: Tool Router

### Purpose

Intercept every Claude Code tool call and route to the optimal tool based on intent + environment.
Forces jcodemunch/rtk usage when available for broad code operations, with Read/Explore as fallback only for targeted single-file lookups.

### Mechanism

`PreToolUse` hook that inspects tool calls at the Claude Code tool level (Bash, Read, Grep, Glob, Agent), not just bash commands.

### Intent Classification

| Intent | Matches | Default Resolution |
| --- | --- | --- |
| `file_read` | `Bash("cat ...")`, `Bash("head ...")` | Advise: Read tool |
| `text_search` | `Bash("grep ...")`, `Grep(...)` | Block/Advise: jcodemunch search_text or search_symbols |
| `file_discovery` | `Bash("find ...")`, `Glob(...)` | Block/Advise: jcodemunch get_file_tree |
| `file_modify` | `Bash("sed -i ...")`, `Bash("awk ... >")` | **Block**: use Edit tool |
| `symbol_search` | Any broad code scanning operation | Block: use jcodemunch search_symbols |
| `pass_through` | Unknown/benign commands | Allow |

### Environment Detection

Runs at `SessionStart`, caches for session duration:

```typescript
interface Environment {
  rtkAvailable: boolean;
  rtkPath: string | null;
  jcodemunchAvailable: boolean;
  jcodemunchCwdIndexed: boolean;
  jcodemunchCwdRepo: string | null;
  jcodemunchKnownRepos: string[];
  detectedAt: number;
}
```

### Session Start Auto-Indexing

1. `SessionStart` hook fires
2. Detects if jcodemunch is installed (`which jcodemunch`)
3. If yes, runs `index_folder` on CWD (if not already indexed or stale)
4. Caches repo identifier for the session
5. All subsequent tool routing uses this index

### Cross-Directory Indexing

- When user references external directory, hook detects and triggers `index_folder` automatically
- Already-indexed repos get incremental update only
- Agent advised: "Indexing {dir} with jcodemunch for optimal search"

### Priority Resolution

```
rtk > jcodemunch > Claude built-in tools (Read/Grep/Glob) > fallback > block
```

### Per-Rule Configuration

Each rule has a configurable enforcement level:

```yaml
# .harness.yaml
rules:
  tool_routing:
    grep: block           # Must use jcodemunch when available
    find: advise          # Warn but allow
    glob: advise          # Suggest jcodemunch get_file_tree
    sed_i: block          # Always block, use Edit
    cat: advise           # Suggest Read tool
    broad_scan: block     # Any broad directory scan → jcodemunch
  enforcement:
    default_level: advise # Global default for new rules
```

Enforcement levels:

- `block` - agent cannot proceed (returns error)
- `advise` - agent gets warning but can proceed
- `silent` - logged but no visible feedback

### Rule Format

```typescript
interface ToolRule {
  match: RegExp | ((tool: string, args: any) => boolean);
  intent: IntentType;
  resolutions: {
    rtk?: Resolution;
    jcodemunch?: Resolution;
    claudeTool?: Resolution;   // built-in Read/Grep/Glob
    fallback?: Resolution;
  };
  enforcement: 'block' | 'advise' | 'silent';
}

type Resolution = ResolutionAllow | ResolutionAdvise | ResolutionBlock;

interface ResolutionAllow { action: 'allow'; }
interface ResolutionAdvise { action: 'advise'; tool: string; reason: string; }
interface ResolutionBlock { action: 'block'; reason: string; }
```

### Key Interception Examples

| Tool Call | Intercepted? | Resolution |
| --- | --- | --- |
| `Bash("grep -r pattern .")` | Yes | Block → use jcodemunch search_text |
| `Grep("pattern")` | Yes | Advise → jcodemunch search_text (if indexed) |
| `Glob("**/*.ts")` | Yes | Advise → jcodemunch get_file_tree (if indexed) |
| `Bash("git status")` | Yes | Advise → rtk git status (if available) |
| `Read("specific-file.ts")` | **No** | Allow (targeted single-file read) |
| `Bash("sed -i ...")` | Yes | **Block** → always, use Edit tool |
| `Agent(subagent_type="Explore")` | Yes | Advise → scout agent with jcodemunch |

---

## Layer 2: Context Engineering

### Scout Agent

A lightweight agent that runs before implementation to map the codebase. Implements agentic-patterns Pattern 3.4 (WISC/Scout Pattern).

```yaml
# .claude/agents/scout.md
name: scout
description: "PROACTIVELY use when starting any non-trivial implementation task or when context about the codebase is needed. Context harvesting agent that maps codebase structure using jcodemunch and rtk."
tools: "mcp__jcodemunch__*,Bash"  # jcodemunch tools + bash (for rtk)
model: inherit  # Uses whatever the parent session is configured with (LLM_BASE_URL, LLM_MODEL, LLM_API_KEY)
maxTurns: 10
```

### Scout Output

Returns a structured `CodebaseMap`:

```typescript
interface CodebaseMap {
  structure: DirectoryInfo;      // File tree with symbol counts
  entryPoints: string[];         // Main entry points
  keyExports: SymbolSummary[];   // Exported symbols with summaries
  dependencies: string[];        // Module dependency list
  languages: Record<string, number>; // Language breakdown
  symbols: { functions: number; classes: number; types: number };
}
```

### Scout Integration Points

1. **brain+ skill** invokes scout before design begins
2. **plan+ skill** uses scout output to identify affected files
3. **review+ skill** can re-scout to detect spec drift

---

## Layer 3: Skill Chain

### Pipeline

```
brain+ (design with stack-first considerations + scout context)
  → plan+ (implementation plan with testing strategy, constitutional rules)
    → tdd+ (RED-GREEN-REFACTOR with full-loop assertions)
      → verify+ (evidence before claims, run commands, show output)
        → review+ (checklist compliance, constitutional rules, test integrity)
```

### Skill Definitions

**Important**: These skills do NOT replace superpowers. They require superpowers to be installed and wrap the existing skills with project-specific overlays.
The base skills (superpowers:brainstorming, superpowers:writing-plans, etc.) remain the authoritative implementation.
Our skills add harness-specific preambles, hook activations, and discipline overlays that inject before delegating to the superpowers original.

Each skill lives in `.claude/skills/<name>/SKILL.md` with YAML frontmatter.

#### brain+ (wraps superpowers:brainstorming)

- Requires superpowers:brainstorming to be available
- Adds scout agent invocation before design begins
- Adds stack-first design considerations (from agentic-patterns L1)
- Includes constitutional rules in design constraints
- Outputs: validated design with testing strategy

#### plan+ (wraps superpowers:writing-plans)

- Requires superpowers:writing-plans to be available
- Adds constitutional rules section in plan template
- Adds explicit testing strategy per task (from agentic-patterns L1)
- Adds mock policy: which components must not be mocked
- Outputs: step-by-step plan with test coverage matrix

#### tdd+ (wraps superpowers:test-driven-development)

- Requires superpowers:test-driven-development to be available
- Adds full-loop assertions (from agentic-patterns L1)
- Adds no-mock enforcement for protected components
- Adds zero-defect: every error must be addressed
- Adds stale test detection (see Layer 4)
- Adds test scope enforcement (see Layer 4)
- This harness is built using this skill (dogfooding)
- Outputs: passing tests + implementation

#### verify+ (wraps superpowers:verification-before-completion)

- Requires superpowers:verification-before-completion to be available
- Adds evidence standards: show command output, not assertions about output
- Adds spec drift check: does implementation match plan?
- Adds full-suite test run (this is the ONLY phase where full suite runs)
- All tests pass with zero failures/warnings
- Outputs: verified implementation with evidence

#### review+ (wraps superpowers:requesting-code-review)

- Requires superpowers:requesting-code-review to be available
- Adds reviewer agent invocation (runs in isolation)
- Adds constitutional compliance checklist
- Adds test integrity rules (no conditional assertions, no empty tests)
- Adds stale test detection validation (were tests updated to match code changes?)
- Two-stage review: spec compliance + code quality
- Outputs: review report with pass/fail per criterion

### Skill Chain Enforcement

The chain is enforced through:

1. Each skill's checklist mandates invoking the previous skill's output
2. Hooks track skill activation state across the session
3. The reviewer agent validates chain completeness

---

## Layer 4: Enforcement

### Constitutional Rules

Declared in project's CLAUDE.md, enforced by hooks + skills:

- `PostToolUse` hook tracks source file edits → flags when code changes lack corresponding test changes
- `PostToolUse` hook detects mock usage in test files → blocks if mocking protected components
- Skills read constitutional rules and include them in plan templates

### Zero-Defect Enforcement

- `PostToolUse` hook after test runs: if output contains FAIL or ERROR, blocks "task complete" claims
- The verify+ skill mandates: show command output, not assertions about output
- No error classification as "unrelated" without evidence

### Test Integrity Rules

From agentic-patterns Pattern 1.6:

- No conditional test assertions (`if (condition) assert(...)`)
- No empty test bodies
- No `.skip` without documented reason
- Every source file change triggers test task requirement

### Stale Test Detection

**Problem**: An agent edits application code, then runs the existing unit tests. The tests pass — but they weren't updated to reflect the code changes.
The pass is a false positive: the tests validate the old behavior, not the new behavior.

**Detection mechanism** (PostToolUse hook):

1. Track which source files have been edited in the current session (via `PostToolUse` on Edit/Write tools)
2. Track which test files have been edited in the current session
3. When the agent runs tests after source edits, check: were the corresponding test files also modified?
4. If source was edited but tests were NOT touched, emit a **stale test warning**:

```
STALE TEST WARNING: The following source files were modified without updating their tests:
  - src/router/resolver.ts (edited 2 turns ago)
  - src/enforcement/zero-defect.ts (edited 1 turn ago)

These test passes may be false positives — the tests still validate old behavior.
Either update the tests to reflect the changes, or explicitly confirm the changes
don't affect test assertions.
```

**Configurable behavior**:

```yaml
# .harness.yaml
rules:
  stale_tests:
    enforcement: advise        # advise | block
    # advise: warn the agent but allow proceeding
    # block: prevent test run until tests are updated or agent acknowledges
    grace_period: 0            # number of turns after source edit before warning fires
```

**Review+ integration**: The reviewer agent also checks for stale tests. It compares the diff of source files against the diff of test files.
If source changes have no corresponding test changes, the review fails with specific files listed.

### Test Scope Enforcement

**Problem**: When fixing a single type or file, the agent runs the entire test suite instead of the scoped tests that relate specifically to that file.
Full suite runs are expensive, slow, and wasteful during the iterative fix cycle. They belong in the final verification phase, not during TDD loops.

**Detection mechanism** (PreToolUse hook on Bash):

1. Intercept test commands (`vitest run`, `jest`, `pytest`, etc.)
2. Check if a test path/filter is specified, or if it's a broad run
3. If the agent has been working on specific files but runs a broad test command, redirect:

```
TEST SCOPE REDIRECT: You're running the full test suite, but your recent changes affect:
  - src/router/resolver.ts
  - src/enforcement/zero-defect.ts

During iterative fix cycles, run scoped tests only:
  npx vitest run tests/router/resolver.test.ts tests/enforcement/zero-defect.test.ts

Full suite runs are reserved for the verify+ phase (final verification).
```

**Configurable behavior**:

```yaml
# .harness.yaml
rules:
  test_scope:
    enforcement: advise        # advise | block
    # advise: warn but allow full suite
    # block: prevent full suite runs outside verify+ phase
    allowed_unscoped:          # commands that are always allowed unscoped
      - "vitest watch"
      - "jest --watch"
```

**Phase awareness**: The hook tracks which skill phase the session is in. During `tdd+` phase, unscoped test runs are blocked/redirected.
During `verify+` phase, unscoped test runs are allowed (that's the full verification step).

### Configuration

```yaml
# .harness.yaml
rules:
  constitutional:
    no_mocks: block              # Cannot mock protected components
    evidence_only: block         # Must show output before claiming done
    full_accounting: advise      # Every state change must be logged
  test_integrity:
    conditional_assert: block    # No if/can assertions in tests
    skip_without_reason: advise  # Warn about .skip without reason
    empty_test: block            # No empty test bodies
  stale_tests:
    enforcement: advise          # advise | block
    grace_period: 0              # turns after source edit before warning
  test_scope:
    enforcement: advise          # advise | block
    allowed_unscoped:            # commands always allowed unscoped
      - "vitest watch"
      - "jest --watch"
  zero_defect:
    tolerance: strict            # strict | permissive
    unrelated_errors: block      # Cannot dismiss errors as unrelated
```

---

## Project Structure

```
claude-stack-utils/
├── src/
│   ├── cli/
│   │   ├── init.ts             # Main init command
│   │   ├── config.ts           # Config management
│   │   └── index.ts            # CLI entry point
│   ├── router/
│   │   ├── intent.ts           # Intent classification
│   │   ├── environment.ts      # Environment detection
│   │   ├── rules.ts            # Default routing rules
│   │   ├── resolver.ts         # Priority resolution (rtk > jm > built-in)
│   │   └── hook.ts             # PreToolUse hook entry point
│   ├── enforcement/
│   │   ├── constitutional.ts   # Constitutional rule checker
│   │   ├── test-integrity.ts   # Test integrity rules
│   │   ├── zero-defect.ts      # Zero-defect enforcement
│   │   └── post-tool-use.ts    # PostToolUse hook entry point
│   ├── session/
│   │   ├── start.ts            # SessionStart hook (env detection, auto-index)
│   │   └── cache.ts            # Environment/session cache
│   └── types.ts                # Shared type definitions
├── templates/
│   ├── hooks/
│   │   ├── pre-tool-use.ts     # Hook template (delegates to src/router)
│   │   ├── post-tool-use.ts    # Hook template (delegates to src/enforcement)
│   │   └── session-start.ts    # Hook template (delegates to src/session)
│   ├── skills/
│   │   ├── brain-plus/
│   │   ├── plan-plus/
│   │   ├── tdd-plus/
│   │   ├── verify-plus/
│   │   ├── review-plus/
│   │   └── verify-harness/     # Session verification checklist skill
│   ├── agents/
│   │   ├── scout.md
│   │   └── reviewer.md
│   └── config/
│       └── default-config.yaml # Default .harness.yaml template
├── tests/
│   ├── router/
│   │   ├── intent.test.ts
│   │   ├── environment.test.ts
│   │   ├── rules.test.ts
│   │   └── resolver.test.ts
│   ├── enforcement/
│   │   ├── constitutional.test.ts
│   │   ├── test-integrity.test.ts
│   │   └── zero-defect.test.ts
│   ├── session/
│   │   └── start.test.ts
│   └── cli/
│       └── init.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## CLI Installer

### `npx claude-stack-utils init`

1. Detects environment (rtk, jcodemunch, platform)
2. Copies hook scripts to `.claude/hooks/scripts/`
3. Copies skills to `.claude/skills/`
4. Copies agents to `.claude/agents/`
5. Updates `.claude/settings.json` with hook registrations
6. Writes `.harness.yaml` with detected environment and default rule config

### Configuration Hierarchy

1. `.harness.yaml` (project-level, committed)
2. `.harness.local.yaml` (project-level, git-ignored, personal overrides)

---

## Testing Strategy

This harness is built using its own tdd+ skill. RED-GREEN-REFACTOR discipline throughout.

### Test Priority

1. **Router tests** - intent classification, environment detection, resolution logic
2. **Enforcement tests** - constitutional rules, test integrity, zero-defect
3. **Session tests** - auto-indexing, environment caching
4. **CLI tests** - init command, config management
5. **Integration tests** - full hook lifecycle, skill chain validation

### Test Requirements

- Every source module has a corresponding test file
- No mocking of jcodemunch/rtk in tests (constitutional rule: no mocks of core tools)
- Tests must be able to fail (no conditional assertions)
- Evidence-based: tests show actual vs expected, not just pass/fail

---

## Session Verification Checklist

Hooks and skills can only be truly validated in a live Claude Code session after installation.
This checklist is loaded via a `/verify-harness` command (implemented as a skill) that the user or CI runs in a fresh session to confirm everything works as designed.

### How It Works

1. After `npx claude-stack-utils init`, start a new Claude Code session
2. Run `/verify-harness`
3. The skill executes each verification step and reports pass/fail with evidence
4. Any failure includes remediation guidance

### Checklist

#### Session Start Hook

- [ ] **S1**: Session started without errors — check for hook error output in session startup
- [ ] **S2**: Environment detected correctly — rtk availability matches `which rtk`
- [ ] **S3**: Environment detected correctly — jcodemunch availability matches `which jcodemunch`
- [ ] **S4**: CWD auto-indexed — `jcodemunch list_repos` includes current project
- [ ] **S5**: Config loaded — `.harness.yaml` parsed without errors

#### Tool Router (PreToolUse Hook)

- [ ] **TR1**: `Bash("grep -r test .")` is intercepted and advised/blocked (depending on config)
- [ ] **TR2**: `Bash("find . -name '*.ts'")` is intercepted and advised/blocked
- [ ] **TR3**: `Bash("sed -i 's/old/new/g' file")` is blocked with "Use Edit tool" message
- [ ] **TR4**: `Bash("git status")` is intercepted and advised to use rtk (if rtk available)
- [ ] **TR5**: `Read("specific-file.ts")` passes through without interception
- [ ] **TR6**: `Grep("pattern")` is intercepted and advised to use jcodemunch (if indexed)
- [ ] **TR7**: `Glob("**/*.ts")` is intercepted and advised to use jcodemunch (if indexed)
- [ ] **TR8**: Cross-directory reference triggers auto-indexing of referenced directory

#### Enforcement (PostToolUse Hook)

- [ ] **E1**: Source file edit without test file edit triggers "TEST TASK REQUIRED" warning
- [ ] **E2**: Test file with mock of protected component is flagged/blocked
- [ ] **E3**: Test output containing FAIL blocks "task complete" claims
- [ ] **E4**: Source file edit without corresponding test edit triggers stale test warning
- [ ] **E5**: Full test suite run during tdd+ phase triggers scope redirect (if enforcement enabled)
- [ ] **E6**: Full test suite run during verify+ phase is allowed without redirection

#### Skills

- [ ] **SK1**: `/brain+` skill is discoverable (shows in /help)
- [ ] **SK2**: `/brain+` invokes scout agent successfully
- [ ] **SK3**: `/plan+` skill is discoverable and loads constitutional rules
- [ ] **SK4**: `/tdd+` skill is discoverable and enforces RED-GREEN-REFACTOR
- [ ] **SK5**: `/verify+` skill is discoverable and mandates evidence output
- [ ] **SK6**: `/review+` skill is discoverable and launches reviewer agent

#### Agents

- [ ] **AG1**: Scout agent can be invoked and returns structured codebase map
- [ ] **AG2**: Scout agent uses jcodemunch tools (not raw grep/find)
- [ ] **AG3**: Reviewer agent runs in isolation and cannot modify files

#### Configuration

- [ ] **CF1**: `.harness.yaml` is respected (change a rule from block to advise, verify behavior changes)
- [ ] **CF2**: `.harness.local.yaml` overrides project config
- [ ] **CF3**: Default config is generated when no config file exists

### Verification Output Format

```
Session Verification Report
============================
Session Start:  5/5 passed
Tool Router:    8/8 passed
Enforcement:    6/6 passed
Skills:         6/6 passed
Agents:         3/3 passed
Configuration:  3/3 passed

TOTAL: 31/31 passed ✓

Failures (if any):
- TR4: git status not intercepted. Expected: advise rtk. Got: no interception.
  Remediation: Check that PreToolUse hook is registered in .claude/settings.json
```

---

## Key Design Decisions

1. **Hooks over agents for enforcement** - agents can bypass rules; hooks cannot
2. **jcodemunch/rtk as primary, not optional** - when installed, they are the default path
3. **Configurable per-rule severity** - defaults to block for critical paths, advise for others
4. **Session start auto-index** - CWD is always indexed if jcodemunch is available
5. **Cross-directory auto-index** - external references trigger indexing automatically
6. **Scout agent has jcodemunch + rtk tools** - structured exploration only, no file editing
7. **Reviewer agent runs in isolation** - read-only compliance checking
8. **Dogfooding** - the harness is built using its own tdd+ skill
9. **Skills wrap superpowers, not replace** - superpowers remains the base; harness skills add overlays
10. **YAML config for per-project customization** - committed config + local overrides
11. **Port damage-control-guardrails** - all existing hooks/guardrails are ported and evolved, not used as dependency
12. **Stale test detection** - source edits without test edits trigger warnings (false positive prevention)
13. **Test scope enforcement** - full suite runs blocked during tdd+, only allowed during verify+
14. **Phase-aware enforcement** - hooks track current skill phase and adjust rules accordingly
15. **Positive framing in all skill instructions** - from bjcoombs' insight: agents respond better to "do X" behavioral contracts than "don't do Y" negative framing.
    All skill instructions use positive framing.
16. **CI guardrails for documentation** - from bjcoombs' PR: markdown lint, link integrity, doc reachability from CLAUDE.md, writing conventions (no filler words).
    The harness should scaffold these as CI jobs.
17. **Coverage gates as enforcement** - per-PR patch coverage + per-component thresholds. Forces agents to write tests during implementation, not as follow-up.

## Insights from bjcoombs (agentic-patterns contributor)

These informed the design but are not all in v1 scope:

- **Positive framing**: Agents respond to negative framing ("don't do X") with caution and avoidance rather than confident action.
  All harness skill instructions use positive behavioral contracts ("use constructor injection") instead of negative ones ("don't create singletons").
- **CI guardrails for docs** (v1): markdownlint, link integrity, CLAUDE.md line limits, doc reachability, writing conventions. Scaffolded by init command.
- **Coverage gates** (v1): Project-wide minimums + per-PR patch coverage. Forces test writing during implementation.
- **Denormalized availability** (v2): Commit generated files (proto, OpenAPI) so worktrees are immediately buildable. Important for multi-agent worktree workflows.
- **Type-level safety** (v2): Dimensional types, generated API clients, non-Turing-complete config languages. Compile-time prevention layer.
- **Machine-readable convention discovery** (v2): Structured front-matter with triggers so agents can programmatically find relevant guides.
- **Multi-agent coordination** (v2): Tag-based task isolation, worktree-per-task, sequential mutation rules for shared task state.
- **Assess command** (v1): Score a codebase's AI readiness against the L0-L4 pyramid. Valuable for verify-harness.
