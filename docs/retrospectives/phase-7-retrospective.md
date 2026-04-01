# Phase 7 Retrospective — CI Guardrails vs GStack

**Date**: 2026-03-31
**Phase**: 7 (markdown lint config, docs CI workflow, coverage gate workflow, vitest coverage config)
**Reference**: `local/gstack` — 111 files, 696 symbols, TypeScript

## Shared Patterns

- **Coverage auditing**: Both systems audit test coverage. GStack has a 380-line `generateTestCoverageAuditInner()` with mode-specific behavior (plan/ship/review). Our
  coverage gate is a vitest config with 80% thresholds in CI.
- **Coverage as gate, not just metric**: Both enforce coverage thresholds. GStack uses a multi-step interactive gate with AskUserQuestion (>= target: pass, >= minimum: ask,
  < minimum: override). Our CI workflow uses vitest's built-in threshold enforcement.
- **Quality scoring rubric**: GStack rates tests ★/★★/★★★. Our zero-defect checker classifies output as pass/fail. Same principle, different granularity.

## Differences

| Aspect | GStack | Claude-Stack-Utils |
| -------- | -------- | -------------------- |
| **Coverage enforcement** | Interactive: codepath tracing → ASCII diagram → test generation → coverage gate with AskUserQuestion | CI gate: vitest coverage thresholds (80% statements, 75% branches) |
| **Coverage audit granularity** | Per-codepath: traces every if/else, error handler, edge case via AST-like reading | Per-file: v8 coverage provider counts lines/branches/functions |
| **Test generation** | Auto-generates tests for uncovered paths (ship mode), caps at 20 tests, 30 code paths | No auto-generation — just flags low coverage |
| **Coverage modes** | 3 modes: plan (add tests to plan), ship (generate + gate), review (Fix-First ASK) | Single mode: CI threshold check |
| **Quality rubric** | 3-star: ★★+ tests behavior + edges, ★★ tests happy path, ★ smoke test | Binary: pass/fail based on test output parsing |
| **Test framework detection** | Auto-detects from CLAUDE.md, package.json, Gemfile, etc. | Assumes vitest (configured) |
| **CI guardrails** | No CI workflows in repo (enforcement is in-session via preamble) | GitHub Actions: docs lint + coverage gate |
| **Markdown lint** | Not configured | markdownlint-cli2 with permissive rules |

## GStack Pros (patterns worth adopting)

1. **Multi-mode coverage audit**: GStack's `CoverageAuditMode` (plan/ship/review) adapts the coverage check to the workflow phase. Plan mode adds tests to the plan; ship
   mode auto-generates and gates; review mode uses Fix-First. **Why**: Our CI coverage gate is binary — it passes or fails. A mode-aware approach would be more useful
   (lighter enforcement during brainstorming, strict during ship).

2. **Per-codepath tracing**: GStack traces every if/else, error handler, and edge case, then generates an ASCII coverage diagram. This is far more granular than line/branch
   coverage percentages. **Why**: 80% line coverage can hide uncovered error paths. Codepath tracing catches logical gaps that coverage numbers miss.

3. **Auto-test generation for gaps**: GStack auto-generates tests for uncovered paths (capped at 20 tests, 2-min per-test exploration). It reads existing test files to match
   conventions, then generates and commits. **Why**: Our CI just reports "coverage too low" — the developer has to figure out what to test and write it. Auto-generation would
   significantly reduce friction.

4. **Interactive coverage gate with override**: GStack presents options (generate more tests, accept risk, mark as intentionally uncovered) rather than just failing CI.
   **Why**: Hard CI gates cause frustration when legitimate code has low coverage (e.g., CLI entry points, config files). Interactive gates give developers agency.

5. **Test plan artifact**: GStack writes a structured test plan to `~/.gstack/projects/` for QA consumption. **Why**: Our verify-harness skill checks installation, not test
   coverage. A test plan artifact would help QA testers know what to verify.

## Our Pros Over GStack

1. **CI-enforced coverage gate**: Our coverage gate runs in GitHub Actions on every PR. GStack's coverage audit runs in-session via preamble — it can be skipped. CI enforcement is non-negotiable.

2. **Markdown lint in CI**: `.markdownlint-cli2.jsonc` with permissive rules + link checking via lychee. GStack has no markdown lint configured.

3. **Separate CI workflows**: `docs.yml` for documentation, `coverage.yml` for test coverage. GStack has no CI workflows — all enforcement is in-session.

4. **Coverage threshold configuration in vitest.config.ts**: Coverage thresholds are in the project config, not in a skill preamble. Anyone can see and adjust them.

5. **Simpler implementation**: Our coverage enforcement is 10 lines of vitest config. GStack's is 380 lines of preamble generation. For most projects, simple threshold enforcement is sufficient.

## Cons / Improvements Needed

1. **No auto-test generation for coverage gaps**: CI reports low coverage but doesn't help fix it. Need a `generate-tests-for-gaps` command or skill.
2. **No mode-aware coverage enforcement**: Same thresholds regardless of workflow phase.
3. **No codepath tracing**: Line/branch coverage is a proxy, not a guarantee. Consider adding codepath-level audit.
4. **No interactive coverage gate**: CI just fails. Need a way to accept risk or mark code as intentionally uncovered.
5. **No test plan artifact**: QA testers don't have structured guidance on what to verify.

## Action Items

- [ ] Consider auto-test generation skill for coverage gaps
- [ ] Add mode-aware coverage enforcement (lighter during brain+, strict during ship)
- [ ] Consider interactive coverage gate with override options
- [ ] Add test plan artifact generation for QA consumption
