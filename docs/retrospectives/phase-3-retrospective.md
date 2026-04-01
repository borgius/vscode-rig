# Phase 3 Retrospective — Enforcement vs GStack

**Date**: 2026-03-31
**Phase**: 3 (stale tests, test scope, constitutional, zero-defect, PostToolUse hook)
**Reference**: `local/gstack` — 111 files, 696 symbols, TypeScript

## Shared Patterns

- **Test failure triage principle**: GStack's `generateTestFailureTriage()` and our `checkZeroDefect()` both parse test output for failures. Same goal — never ship broken tests.
- **Configurable behavior**: Both use configuration to control strictness. GStack uses `REPO_MODE` (solo/collaborative); we use `.harness.yaml` enforcement levels (block/advise/silent).
- **Evidence-over-claims**: GStack's preamble includes "Evidence provided for each claim" in completion protocol. Our `checkConstitutional()` enforces the same programmatically.

## Differences

| Aspect | GStack | Claude-Stack-Utils |
|--------|--------|--------------------|
| **Enforcement mechanism** | Preamble text (persuasive instructions) | PostToolUse hooks (programmatic, can advise/block) |
| **Test failure triage** | 4-step heuristic in prompt (classify, stop/ask, execute, commit) | `checkZeroDefect()` regex parser + tolerance config |
| **Stale test detection** | None — no source/test edit tracking | `FileTracker` + `getStaleSources()` with grace period |
| **Test scope control** | None — no phase-aware test scoping | `checkTestScope()` redirects full suite runs during tdd+ |
| **Constitutional rules** | Ethos/CLAUDE.md prose ("never mock") | `checkConstitutional()` with regex detection + enforcement levels |
| **Pre-existing failure handling** | Sophisticated: git diff classification, blame+assign, REPO_MODE awareness | Not implemented — all failures treated equally |
| **Repo mode awareness** | solo vs collaborative changes triage behavior | No concept of repo mode |

## GStack Pros (patterns worth adopting)

1. **4-step test failure triage**: GStack classifies failures as "in-branch" vs "pre-existing" using `git diff origin/<base>...HEAD --name-only`. This is significantly more nuanced than our blanket zero-defect approach. Pre-existing failures get different handling based on repo ownership. **Why**: In real projects, pre-existing test failures are common. Treating them the same as regressions causes false positives and alert fatigue.

2. **Repo mode awareness (solo vs collaborative)**: Changes triage behavior — solo repos get "fix it yourself" recommendations; collaborative repos get blame+assign with GitHub/GitLab issue creation. **Why**: Our enforcement is context-free. A solo dev on a personal project needs different enforcement than a team on a shared repo.

3. **Blame + auto-assign for pre-existing failures**: GStack uses `git log` to find who broke it, then creates an issue with `gh issue create --assignee`. **Why**: This is the right behavior for collaborative repos — route failures to the right person automatically.

4. **Structured AskUserQuestion format**: GStack requires re-grounding (project, branch, task), simplified explanation, recommendation with completeness scores (X/10), and effort estimates (human vs CC time). **Why**: Our enforcement messages are flat strings. Adding completeness scoring would help users make better decisions.

## Our Pros Over GStack

1. **Programmatic enforcement via hooks**: PostToolUse hooks run actual code, not text instructions. Our `checkZeroDefect()` parses test output with regex; GStack relies on Claude to interpret triage instructions. Hooks can't be ignored.

2. **Stale test detection**: `FileTracker` + `getStaleSources()` tracks which source files were edited without corresponding test updates, with configurable grace period. GStack has zero awareness of this pattern — it relies on the agent to remember.

3. **Test scope enforcement**: `checkTestScope()` redirects unscoped test runs during tdd+ phase. Forces scoped testing during iterative fix cycles. GStack has no equivalent.

4. **Constitutional rules as code**: `checkConstitutional()` detects mocks in test files via regex patterns. GStack's "never mock" rule is prose in ETHOS.md — easily ignored. Our rule can block tool calls.

5. **Composable enforcement pipeline**: `handlePostToolUse()` composes stale-test + test-scope + constitutional + zero-defect into a single hook. Each check is independent and configurable. GStack's enforcement is monolithic preamble text.

6. **Grace period semantics**: Source edits are exempt during their creation turn, then become stale after N additional turns. This prevents false positives during normal edit-test cycles.

## Cons / Improvements Needed

1. **No pre-existing failure classification**: All failures are treated equally. Need git-diff-based classification to distinguish in-branch from pre-existing failures.

2. **No repo mode awareness**: Enforcement doesn't change based on whether it's a solo project or a team repo. Need `REPO_MODE` concept.

3. **No blame/issue creation**: GStack auto-assigns pre-existing failures to the breaker via GitHub/GitLab. We just flag them.

4. **Constitutional mock detection is regex-based**: Could miss sophisticated mocking patterns. GStack doesn't have programmatic detection at all, but both approaches are brittle.

5. **Zero-defect output parsing is framework-specific**: Vitest/Jest/pytest patterns covered, but newer frameworks or custom reporters may not match.

## Action Items

- [ ] Add pre-existing failure classification using `git diff` (prioritize for Phase 5 or Phase 8)
- [ ] Add `REPO_MODE` concept to config (solo/collaborative/unknown)
- [ ] Consider blame + issue creation for pre-existing failures
- [ ] Add E2E hook protocol tests for PostToolUse (spawn subprocess, verify exit codes + output)
