# Phase 5 Retrospective — Skill Chain vs GStack

**Date**: 2026-03-31
**Phase**: 5 (phase tracker, 5 skill templates: brain+/plan+/tdd+/verify+/review+)
**Reference**: `local/gstack` — 111 files, 696 symbols, TypeScript

## Shared Patterns

- **Skill chain sequencing**: Both enforce ordered execution. GStack uses preamble-tier system (T1-T4) where higher tiers include all lower-tier sections plus extras. Our `SkillPhaseTracker` validates transitions (verify+ requires prior tdd+ visit).
- **Skill wrapping**: Both wrap base capabilities with project-specific overlays. GStack skills include preamble sections that modify behavior per-host. Our skills wrap `superpowers:*` with enforcement overlays.
- **Template-based skill definitions**: Both use SKILL.md files with YAML frontmatter. GStack validates with `validateSkill()` checking required fields. Our tests check frontmatter, user-invocable flag, and chain navigation.

## Differences

| Aspect | GStack | Claude-Stack-Utils |
|--------|--------|--------------------|
| **Phase enforcement** | Preamble tier system (T1-T4) controls which sections are included | `SkillPhaseTracker` class with transition validation and history |
| **Skill count** | 20+ skills (ship, investigate, review, design, browse, etc.) | 5 core skills (brain+/plan+/tdd+/verify+/review+) |
| **Skill generation** | Resolver pipeline: `ResolverFn` functions generate preamble text | Static SKILL.md templates with `{{VAR}}` substitution |
| **Skill validation** | `validateSkill()` with structured `ValidationResult` | Test-based validation of frontmatter and content |
| **Multi-host skills** | Same skill generates different content for Claude/Codex/Gemini | Single host: Claude Code only |
| **Review pattern** | Review Army (parallel specialists + red team) | Single review+ skill |
| **Completion protocol** | Structured: DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT | No formal completion protocol |

## GStack Pros (patterns worth adopting)

1. **Tiered preamble system**: GStack's 4-tier system (T1-T4) progressively includes more behavioral instructions. T1 skills (browse, benchmark) get minimal preamble; T4 skills (ship, review) get the full suite including test failure triage and completeness scoring. **Why**: Our skills all get the same enforcement regardless of complexity. A simple brain+ session shouldn't have the same overhead as a full tdd+ cycle.

2. **Review Army multi-agent pattern**: GStack dispatches specialist reviewers (security, testing, API, etc.) in parallel, merges findings with structured JSON, then runs a red-team adversarial pass. **Why**: Our review+ is a single-pass review. Multi-agent specialist review catches more issues — GStack reports 40% more findings than single-pass in their evals.

3. **Structured completion protocol**: DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT with escalation rules (3 failures = stop and escalate, security-sensitive = stop and escalate). **Why**: Our skills have no formal completion protocol. Adding one would improve error handling and user communication.

4. **Skill count and specialization**: GStack has 20+ specialized skills (investigate, cso, retro, canary, design-consult, office-hours). Each is focused on one workflow. **Why**: Our 5 skills cover the core TDD cycle but miss specialized workflows (investigation, deployment, retrospectives). The modular skill template system we built in Phase 6 makes adding new skills easy.

## Our Pros Over GStack

1. **Programmatic phase transitions**: `SkillPhaseTracker` enforces valid transitions at the code level — `verify+` can only be entered after `tdd+` visit. GStack's tier system is about content inclusion, not state machine enforcement.

2. **Skill chain navigation**: Each skill template includes explicit "Next" and "Previous" navigation (brain+ → plan+ → tdd+ → verify+ → review+). GStack skills don't have explicit chain navigation — they rely on the user knowing the order.

3. **Positive framing ratio requirement**: Our skill template tests verify >=60% positive framing (do X) vs negative framing (don't Y). GStack skills are mixed — some are heavily negative ("NEVER do X").

4. **Constitutional compliance in skills**: plan+ template includes explicit constitutional compliance rules (no mocks, evidence-only). GStack's constitutional rules are in the preamble, not skill-specific.

5. **Superpowers wrapping**: Our skills explicitly wrap `superpowers:*` skills, adding enforcement overlays. This is additive — users get both the superpowers behavior and our enforcement. GStack skills are standalone.

## Cons / Improvements Needed

1. **No tiered skill complexity**: All skills get the same enforcement. Need tier-based preamble inclusion like GStack.
2. **No multi-agent review**: review+ is single-pass. Need Review Army pattern.
3. **No structured completion protocol**: Skills should report DONE/BLOCKED/NEEDS_CONTEXT.
4. **No investigation skill**: GStack has `/investigate` for root-cause analysis. We should add one.
5. **Only 5 skills**: Need more specialized workflows (deploy, canary, retro, office-hours).

## Action Items

- [ ] Add tiered enforcement to skills (brain+ gets lighter enforcement than tdd+)
- [ ] Consider multi-agent specialist review for review+ skill
- [ ] Add structured completion protocol to skill templates
- [ ] Add investigation skill template
