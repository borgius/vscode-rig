# rig

Agent harness that enforces tool routing, skill chains, and multi-agent discipline for [Claude Code](https://claude.ai/code).

## What it does

Rig installs guardrails into a Claude Code project:

- **Tool Router** -- intercepts shell commands via PreToolUse hooks, redirects `grep`/`find`/`cat` to rtk or jcodemunch when available
- **Enforcement Pipeline** -- PostToolUse hooks check stale tests, test scope, constitutional rules (no mocks), and zero-defect status
- **Skill Chain** -- ordered workflow skills: `brain+` -> `plan+` -> `tdd+` -> `verify+` -> `review+`
- **Scout Agent** -- cross-repo indexing agent that builds a typed `CodebaseMap` for context injection

Built from the [agentic-patterns](https://github.com/franklywatson/agentic-patterns) L2 and L3 patterns.

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

## Related projects

- [agentic-patterns](https://github.com/franklywatson/agentic-patterns) -- Pattern library (L0-L4) that guided this system's design
- [superpowers](https://github.com/obra/superpowers) -- Base skills framework that the skill chain wraps
- [gstack](https://github.com/garrytan/gstack) -- Alternative agent skill framework with resolver pipeline

## License

MIT
