# rig

Agent harness that enforces tool routing, skill chains, and multi-agent discipline for [Claude Code](https://claude.ai/code).

## What it does

Rig installs guardrails into a Claude Code project:

- **Tool Router** -- intercepts shell commands via PreToolUse hooks, redirects `grep`/`find`/`cat` to rtk or jcodemunch when available; advises on native Read/Grep/Glob when jcodemunch is indexed; blocks `rtk cat` on code files
- **Enforcement Pipeline** -- PostToolUse hooks check stale tests, test scope, constitutional rules (no mocks), and zero-defect status
- **Skill Chain** -- ordered workflow skills: `brain+` -> `plan+` -> `tdd+` -> `verify+` -> `review+`
- **Scout Agent** -- cross-repo indexing agent that builds a typed `CodebaseMap` for context injection

Built from the [agentic-patterns](https://github.com/franklywatson/agentic-patterns) L2 and L3 patterns.

## Requirements

- [Claude Code](https://claude.ai/code) CLI
- Node.js 18+
- [superpowers](https://github.com/obra/superpowers) -- base skills framework (required; all skill chain skills wrap `superpowers:*` skills)
- [rtk](https://github.com/franklywatson/rtk) -- token-optimized command proxy (strongly recommended; tool router redirects `grep`/`find`/`cat` through rtk when available)
- [jcodemunch](https://github.com/franklywatson/jcodemunch) -- indexed code search MCP server (strongly recommended; powers the scout agent and tool router fallback)

## Quick start

```bash
# Clone and build
git clone https://github.com/franklywatson/claude-rig.git
cd claude-rig
npm install
npm run build

# Link globally so `rig init` works anywhere
npm link

# Initialize in your project
cd /path/to/your/project
rig init

# Verify installation (in a Claude Code session)
/verify-harness
```

The `init` command generates hooks, skills, agents, and config into your project's `.claude/` directory.

## Architecture

```
+---------------------------------------------+
|                Claude Code                   |
+------------+------------+-------------------+
| PreToolUse | PostToolUse| Session Start     |
| Hook       | Hook       | Hook              |
| (router)   | (enforce)  | (auto-index)      |
+------------+------------+-------------------+
|              Skill Chain Pipeline            |
|  brain+ -> plan+ -> tdd+ -> verify+ -> rev+ |
+---------------------------------------------+
|              Scout Agent                     |
|         (CodebaseMap + cross-repo)           |
+---------------------------------------------+
|           .harness.yaml config               |
+---------------------------------------------+
```

Four layers, one config file. See [docs/architecture.md](docs/architecture.md) for the full design.

## Configuration

Rig uses `.harness.yaml` in your project root:

```yaml
rules:
  stale_tests:
    enforcement: advise        # block | advise | silent
    grace_period: 0
  test_scope:
    enforcement: advise
    allowed_unscoped: [vitest watch, jest --watch]
  constitutional:
    no_mocks: block
    evidence_only: block
  zero_defect:
    tolerance: strict
  tool_routing:
    native_read: advise        # advise jcodemunch for Read on code files
    native_grep: advise        # advise jcodemunch for Grep
    native_glob: advise        # advise jcodemunch for Glob on code patterns
    rtk_cat_code: block        # block rtk cat on code files
```

Each enforcement rule can be `block` (hook exits nonzero), `advise` (prints warning), or `silent` (logs only).

## Skill chain

| Skill | Purpose | Wraps |
| ----- | ------- | ----- |
| `brain+` | Ideation and requirements | `superpowers:brainstorming` |
| `plan+` | Implementation planning | `superpowers:writing-plans` |
| `tdd+` | Test-driven development | `superpowers:tdd` |
| `verify+` | Installation verification | `superpowers:code-reviewer` |
| `review+` | Code review | `superpowers:code-reviewer` |
| `savings` | Session token savings report | -- |

Skills enforce phase transitions: `tdd+` requires prior `plan+` visit, `verify+` requires prior `tdd+` visit. The `savings` skill is standalone (no phase prerequisite).

## What gets installed

```
.claude/
  settings.json          # Hook registrations
  hooks/
    scripts/
      pre-tool-use.ts    # Tool router
      post-tool-use.ts   # Enforcement pipeline
      session-start.ts   # Auto-indexing
  skills/
    brain-plus/          # brain+ skill
    plan-plus/           # plan+ skill
    tdd-plus/            # tdd+ skill
    verify-plus/         # verify+ skill
    review-plus/         # review+ skill
    verify-harness/      # Installation verifier
    savings/             # Session savings report
  agents/
    scout.md             # Cross-repo scout agent
```

## Development

```bash
npm install
npm test         # vitest, 240+ tests
npm run build    # TypeScript compile
npm run lint     # type-check only
```

## Dogfooding

Rig uses itself during development. After building, run `rig init` in this repo to install hooks, skills, and agents into the local `.claude/` directory:

```bash
npm run build && npm link
rig init
```

This wires the same guardrails that rig installs for consumers — the tool router
intercepts shell commands, the enforcement pipeline runs after edits, and
`/savings` reports token usage for the session.

## Design process

Rig was built in seven iterative phases, each evaluated against
[gstack](https://github.com/garrytan/gstack) — a mature agent skill framework
used as a reference implementation. The approach was to study gstack's patterns,
identify patterns worth adopting and avoiding, then build rig with deliberate
advantages at each layer. The full phase plans and retrospectives are preserved
in [commit a9ee32f](https://github.com/franklywatson/claude-rig/tree/a9ee32f9b8e78f138aafeb0dd1e13af272c8706e/docs).

| Phase | Layer | Key decision vs gstack |
| ----- | ----- | ---------------------- |
| 1 | Foundation | Adopted gstack's injectable env detection; chose hooks over preamble text for enforcement |
| 2 | Tool Router | Enforceable PreToolUse hooks vs gstack's persuasive preamble routing |
| 3 | Enforcement | Composable programmatic pipeline vs gstack's monolithic text-based approach |
| 4 | Scout Agent | Typed `CodebaseMap` vs gstack's unstructured preamble context injection |
| 5 | Skill Chain | Programmatic state machine wrapping superpowers vs gstack's standalone skill tiers |
| 6 | CLI Installer | `npx`-first with `/verify-harness` vs gstack's global install, no verification |
| 7 | CI Guardrails | CI-enforced coverage gates and docs lint vs gstack's in-session-only enforcement |

Every project has different requirements for rigor and oversight. A solo
prototype needs lighter guardrails than a production system handling financial
transactions. Some domains demand determinism — non-negotiable rules that can't
be talked around. Rig lets builders codify their project's non-negotiables as
enforceable hooks, then rest easy knowing Claude will follow them.

[superpowers](https://github.com/obra/superpowers) and
[gstack](https://github.com/garrytan/gstack) are excellent tools in their own
right. Rig doesn't replace them — it complements them by adding a layer of
programmatic enforcement that preamble-based approaches can't provide.

## Extending rig

Rig is designed to be extended. Add custom enforcement checks (secrets scanning,
version pinning, log level enforcement), new skills, or additional config rules.
See [docs/extending.md](docs/extending.md) for patterns and examples.

The skill chain wraps [superpowers](https://github.com/obra/superpowers) skills
with project-specific enforcement -- threat modeling in brainstorming,
compliance in planning, latency budgets in TDD, security checklists in review.
See [docs/skill-wrapping.md](docs/skill-wrapping.md) for the wrapping pattern
and domain-specific scenarios.

## Related projects

- [agentic-patterns](https://github.com/franklywatson/agentic-patterns) -- Pattern library (L0-L4) that guided this system's design
- [superpowers](https://github.com/obra/superpowers) -- Base skills framework that the skill chain wraps
- [gstack](https://github.com/garrytan/gstack) -- Alternative agent skill framework with resolver pipeline

## License

MIT
