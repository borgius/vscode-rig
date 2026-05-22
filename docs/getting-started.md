# Getting Started

## Prerequisites

- [GitHub Copilot in VS Code](https://code.visualstudio.com/docs/copilot/overview)
  with agent mode and hooks enabled
- Node.js 18+
- [superpowers](https://github.com/obra/superpowers) -- base skills framework.
  **Required.** Every skill in the chain (`brain+`, `plan+`, `tdd+`,
  `verify+`, `review+`) wraps a `superpowers:*` skill. Without superpowers
  installed, the skill chain will not function.
- A project you want to add guardrails to

Strongly recommended:

- [rtk](https://github.com/franklywatson/rtk) -- token-optimized command proxy.
  The tool router redirects shell commands through rtk when available,
  saving 60-90% on token usage for common dev operations.
- [jcodemunch](https://github.com/franklywatson/jcodemunch) -- indexed code
  search MCP server. Powers the scout agent for cross-repo indexing and
  serves as the tool router's fallback for `grep`/`find`/`cat` redirection.
  Note: jcodemunch indexes up to 2000 files per folder by default. For
  larger projects, increase `max_folder_files` in `~/.code-index/config.jsonc`.
  Rig emits a `[WARNING]` at session start when files are skipped.
- [graphify](https://github.com/safishamsi/graphify) -- knowledge graph builder.
  Powers the scout agent's relationship traversal alongside jcodemunch's symbol
  search. When installed, rig auto-builds graphs at session start and provides
  god nodes (core abstractions ranked by connection density), module communities
  (clustered subsystems), and dependency path queries via MCP tools. Graphify
  rebuilds via its own git hooks; rig detects the existing graph and auto-builds
  on first use if needed. Note: graphify may fail on very large codebases
  (6000+ files) due to Python AST recursion limits during tree-sitter traversal.
  The scout agent falls back to jcodemunch-only analysis in this case.

## Install and initialize

```bash
# Clone and build rig
git clone https://github.com/borgius/vscode-rig.git
cd vscode-rig
npm install
npm run build

# Link globally so `rig init` works anywhere
npm link

# Go to your project and initialize
cd /path/to/your/project
rig init

```

This generates:

| Path | Purpose |
| ---- | ------- |
| `.github/hooks/scripts/pre-tool-use.ts` | Tool router -- redirects grep/find/cat to better tools |
| `.github/hooks/scripts/post-tool-use.ts` | Enforcement -- stale tests, constitutional, zero-defect |
| `.github/hooks/scripts/session-start.ts` | Auto-indexes your project on session start |
| `.github/hooks/rig-hooks.json` | Copilot hook registrations |
| `.github/copilot-instructions.md` | Repository-wide Copilot instructions |
| `.github/skills/brain-plus/` | Ideation skill |
| `.github/skills/plan-plus/` | Planning skill |
| `.github/skills/tdd-plus/` | Test-driven development skill |
| `.github/skills/verify-plus/` | Verification skill |
| `.github/skills/review-plus/` | Code review skill |
| `.github/skills/debug-plus/` | Systematic debugging with scout context |
| `.github/skills/verify-harness/` | Installation verifier |
| `.github/skills/savings/` | Session token savings report |
| `.github/skills/investigate/` | Alias for debug+ |
| `.github/agents/scout.md` | Cross-repo scout agent |
| `.harness.yaml` | Enforcement configuration |

## Verify installation

Start a GitHub Copilot in VS Code session in your project and run:

```
/verify-harness
```

This runs a 28-point checklist confirming hooks, skills, agents, and config are correctly wired.

## Use the skill chain

Skills are invoked as slash commands in GitHub Copilot in VS Code:

```
/brain+    -> Ideate and gather requirements
/plan+     -> Create an implementation plan
/tdd+      -> Write tests, then implement
/verify+   -> Verify the implementation works
/review+   -> Review code quality
/debug+    -> Systematic debugging with scout context
/savings   -> Report token savings from rtk/jcodemunch this session
/investigate -> Alias for /debug+
```

Skills enforce ordering. You can't run `/tdd+` until you've visited `/plan+`. You can't run
`/verify+` until you've visited `/tdd+`. `/debug+`, `/savings`, and `/investigate` have no
prerequisites and work from any phase. `/debug+` mandates scout agent context harvesting
before debugging.

## Configure enforcement

Edit `.harness.yaml` to adjust enforcement levels:

```yaml
rules:
  stale_tests:
    enforcement: advise        # Change to "block" to reject edits without tests
    grace_period: 0            # Turns before flagging
  test_scope:
    enforcement: advise
    allowed_unscoped: [vitest watch, jest --watch]
  constitutional:
    no_mocks: advise             # Set to "block" for strict, "silent" to disable
    evidence_only: block
    full_accounting: advise
  zero_defect:
    tolerance: strict
    unrelated_errors: silent     # silent|advise|block — how to handle pre-existing failures
```

**Levels:**

| Level | What happens |
| ----- | ------------ |
| `block` | Hook returns `permissionDecision: "deny"` |
| `advise` | Warning printed, tool call proceeds |
| `silent` | Logged only, no visible output |

## How the hooks work

### PreToolUse: Tool Router

When Copilot tries to run a shell command like `grep -r "pattern" src/`, the pre-tool-use hook intercepts it:

1. **Classifies intent** -- `grep` becomes `text_search`
2. **Checks environment** -- rtk available? jcodemunch indexed?
3. **Resolves** -- redirects to the best available tool, or allows the original command

### PostToolUse: Enforcement Pipeline

After each tool use, the post-tool-use hook runs three checks:

1. **Stale tests** -- Did you edit source files without updating tests?
2. **Constitutional** -- Are there mocks in stack/E2E test files? (mocks are appropriate in unit tests; configurable — set `no_mocks: silent` to disable)
3. **Zero defect** -- Do the test results show failures?

Each check returns a violation message or null. All violations are combined as advisory output.

### Session Start: Auto-indexing

When a GitHub Copilot in VS Code session starts, the session-start hook:

1. Detects available tools (rtk, jcodemunch, graphify)
2. Auto-indexes the project via jcodemunch if not already indexed
3. Captures graphify graph stats (nodes, edges, communities) when available
4. Caches results for the session (30-min TTL)

## Re-initialize

To regenerate templates (e.g., after updating rig):

```bash
rig init --force
```

This overwrites existing hook and skill templates but preserves your `.harness.yaml` config.

## Uninstall

Remove the generated files:

```bash
rm -rf .github/hooks/ .github/skills/ .github/agents/scout.md .github/copilot-instructions.md .harness.yaml
```


## Next steps

- Read [docs/architecture.md](architecture.md) for the full system design
- Read [docs/extending.md](extending.md) to add custom enforcement checks and skills
- Read [docs/skill-wrapping.md](skill-wrapping.md) to wrap superpowers skills
  with domain-specific enforcement (security, compliance, performance)
