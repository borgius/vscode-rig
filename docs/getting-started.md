# Getting Started

## Prerequisites

- [Claude Code](https://claude.ai/code) CLI installed and configured
- Node.js 18+
- A project you want to add guardrails to

Optional but recommended:

- [rtk](https://github.com/franklywatson/rtk) -- token-optimized command proxy
- [jcodemunch](https://github.com/franklywatson/jcodemunch) -- indexed code search MCP server

## Install and initialize

From your project's root directory:

```bash
npx rig init
```

This generates:

| Path | Purpose |
| ---- | ------- |
| `.claude/hooks/pre-tool-use.ts` | Tool router -- redirects grep/find/cat to better tools |
| `.claude/hooks/post-tool-use.ts` | Enforcement -- stale tests, scope, constitutional, zero-defect |
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
/brain+    -> Ideate and gather requirements
/plan+     -> Create an implementation plan
/tdd+      -> Write tests, then implement
/verify+   -> Verify the implementation works
/review+   -> Review code quality
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
| ----- | ------------ |
| `block` | Hook rejects the tool call (exit 2) |
| `advise` | Warning printed, tool call proceeds |
| `silent` | Logged only, no visible output |

## How the hooks work

### PreToolUse: Tool Router

When Claude tries to run a shell command like `grep -r "pattern" src/`, the pre-tool-use hook intercepts it:

1. **Classifies intent** -- `grep` becomes `text_search`
2. **Checks environment** -- rtk available? jcodemunch indexed?
3. **Resolves** -- redirects to the best available tool, or allows the original command

### PostToolUse: Enforcement Pipeline

After each tool use, the post-tool-use hook runs four checks:

1. **Stale tests** -- Did you edit source files without updating tests?
2. **Test scope** -- Are you running the full suite when you should be running scoped tests?
3. **Constitutional** -- Are there mocks in test files? Claims without evidence?
4. **Zero defect** -- Do the test results show failures?

Each check returns an enforcement level. The most severe level determines the hook result.

### Session Start: Auto-indexing

When a Claude Code session starts, the session-start hook:

1. Detects available tools (rtk, jcodemunch)
2. Auto-indexes the project via jcodemunch if not already indexed
3. Caches results for the session (30-min TTL)

## Re-initialize

To regenerate templates (e.g., after updating rig):

```bash
npx rig init --force
```

This overwrites existing hook and skill templates but preserves your `.harness.yaml` config and any custom settings in `.claude/settings.json`.

## Uninstall

Remove the generated files:

```bash
rm -rf .claude/hooks/ .claude/skills/ .claude/agents/scout.md .harness.yaml
```

Then remove hook registrations from `.claude/settings.json`. The `init` command added entries under `hooks.PreToolUse` and `hooks.PostToolUse` and `hooks.SessionStart` -- remove those arrays.

## Next steps

- Read [docs/architecture.md](architecture.md) for the full system design
- Check [docs/retrospectives/](retrospectives/) for design decisions and GStack comparison notes
