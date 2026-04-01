---
name: investigate
description: "Invoke when encountering any bug, test failure, or unexpected behavior. Wraps superpowers:systematic-debugging with codebase context harvesting."
argument-hint: "[bug description or failure output]"
user-invocable: true
---

<!-- rig-generated -->

# investigate — Systematic Investigation

Wraps `superpowers:systematic-debugging`. Requires superpowers to be installed.

No phase prerequisite — invoke from any skill chain phase when you need to
investigate a bug, failure, or unexpected behavior.

## Procedure

### Phase A: Gather Context

1. Reproduce the issue — run the failing command or test and capture the exact output.

2. Invoke the scout agent to map the affected area:

   ```
   Agent(subagent_type="scout", prompt="Map the codebase around [affected files/modules]. Focus on: related functions, callers, test files, and recent changes.")
   ```

3. Identify:
   - The exact failure symptom (error message, wrong output, crash)
   - The code path that produces the symptom
   - Recent changes that may have introduced the issue
   - Related test coverage

### Phase B: Investigate (delegate to superpowers:systematic-debugging)

1. Invoke `superpowers:systematic-debugging` with the gathered context.

2. Follow the systematic debugging process:
   - State the hypothesis before investigating
   - Verify the hypothesis with evidence (command output, file reads)
   - If the hypothesis is wrong, state why and form a new one
   - Show the evidence at each step

### Phase C: Report Findings

1. Produce a finding summary:

   ```
   ## Investigation Report

   ### Symptom
   [Exact failure description]

   ### Root Cause
   [What caused the issue]

   ### Evidence
   - [Evidence 1: command output or file content]
   - [Evidence 2: ...]

   ### Fix
   [Specific change needed to resolve the issue]
   ```

2. If the fix is straightforward, implement it and run the relevant tests.
   If the fix requires a larger change, return to the current phase with the finding.

## Skill Chain

`/investigate` has no phase prerequisite — invoke it from any phase when you need to debug a bug or investigate unexpected behavior. After resolving the investigation, return to your current phase.

- [ ] Bug reproduced and symptom documented
- [ ] Root cause identified with evidence
- [ ] Fix applied and tests pass (or escalated to current phase)

## Completion

Report one of these states when the skill finishes:

- **DONE** — Root cause identified and fix applied with passing tests.
- **DONE_WITH_CONCERNS** — Root cause identified but fix has side effects or needs review.
- **BLOCKED** — Cannot reproduce the issue or insufficient context to diagnose.
- **NEEDS_CONTEXT** — Need user input to reproduce the issue or understand expected behavior.
