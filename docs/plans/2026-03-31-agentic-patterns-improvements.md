# Agentic-Patterns Improvement Analysis

**Date**: 2026-03-31
**Source**: claude-stack-utils (26 files, 108 symbols, 240+ tests) compared against agentic-patterns (9 files, 73 symbols)

---

## Relationship

claude-stack-utils is a **working implementation** of the agentic-patterns L2 and L3 levels.
The pattern docs describe *what to build*; claude-stack-utils is *a working build*.
This analysis identifies gaps where the working system has patterns that the docs don't yet cover.

## Gaps in agentic-patterns

### L2 Gaps

| Pattern | Doc says | claude-stack-utils built |
| --- | --- | --- |
| Hook Automation (2.3) | Pseudocode for individual hooks | Composable pipeline: `handlePostToolUse()` runs 4 checks, resolves most-severe level |
| Skill Chain (2.2) | Conceptual chain description | `SkillPhaseTracker` state machine with transition validation + history |
| Constitutional Rules (2.4) | "Never mock" as prose | `checkConstitutional()` regex detection of jest.mock/vi.mock/sinon.stub patterns |
| Zero-Defect (2.5) | "Every error must be addressed" | `checkZeroDefect()` parses vitest/jest/pytest output for failure indicators |

### L3 Gaps

| Pattern | Doc says | claude-stack-utils built |
| --- | --- | --- |
| Smart Routing (3.1) | Routing table concept | `resolve()` with priority chain: rtk > jcodemunch > claudeTool > fallback > wildcard > allow |
| Intent Classification (3.2) | Pattern matching example | `classifyIntent()` with bash patterns + Claude Code tool mapping (Grep, Read, Glob, Edit) |
| Environment Detection (3.3) | Detection checklist | `detectEnvironment()` with injectable `ExecFn`, `SessionCache` with 30-min TTL |
| Scout Pattern (3.4) | Conceptual description | Working scout agent with `CodebaseMap` type, cross-repo `ensureIndexed()`, `ScoutCache` |

### Missing Patterns (no doc exists)

| New pattern | What it covers |
| --- | --- |
| Enforcement Pipeline Composition | Composable check pipeline, configurable levels (block/advise/silent), severity resolution |
| Phase Transition Validation | State machine for skill chain ordering, visit history, prerequisite enforcement |
| Session Lifecycle | Session start hook, auto-indexing, environment caching with TTL |
| CI Guardrails | Coverage gates in CI, docs lint in CI, thresholds in project config |
| CLI Installer / Project Setup | Template rendering, settings.json registration, idempotent init |

## Cross-Reference Map

Where claude-stack-utils source maps to agentic-patterns pattern numbers:

| Source file | Pattern |
| --- | --- |
| `src/router/intent.ts` | L3 Pattern 3.2 |
| `src/router/rules.ts` | L3 Pattern 3.1 |
| `src/router/resolver.ts` | L3 Pattern 3.1 |
| `src/router/hook.ts` | L2 Pattern 2.3 |
| `src/enforcement/post-tool-use.ts` | New: Enforcement Pipeline Composition |
| `src/enforcement/stale-test.ts` | New: Enforcement Pipeline Composition |
| `src/enforcement/test-scope.ts` | New: Enforcement Pipeline Composition |
| `src/enforcement/constitutional.ts` | L2 Pattern 2.4 |
| `src/enforcement/zero-defect.ts` | L2 Pattern 2.5 |
| `src/skills/phase-tracker.ts` | New: Phase Transition Validation |
| `src/scout/mapper.ts` | L3 Pattern 3.4 |
| `src/scout/cross-repo.ts` | L3 Pattern 3.4 |
| `src/scout/scout-cache.ts` | L3 Pattern 3.4 |
| `src/session/environment.ts` | L3 Pattern 3.3 |
| `src/session/cache.ts` | New: Session Lifecycle |
| `src/session/start.ts` | New: Session Lifecycle |
| `src/cli/init.ts` | New: CLI Installer |
| `src/config.ts` | New: Config-driven enforcement |
| `.github/workflows/coverage.yml` | New: CI Guardrails |
| `.github/workflows/docs.yml` | New: CI Guardrails |

## Action

A design spec has been written into the agentic-patterns repo at:
`/home/jerome/projects/agentic-patterns/specs/2026-03-31-cross-ref-and-compound-improvements-design.md`

This covers 4 changes:

1. Reference Implementations section in README + CLAUDE.md
2. New patterns (2.6, 2.7, 3.8, CI guardrails) with cross-references
3. Upgraded examples/guardrails with enforcement + config + session
4. Cross-references from existing L2/L3 pattern docs to claude-stack-utils source
