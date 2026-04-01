# Stale Artifact Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `rig init` to always overwrite stale generated hook scripts,
while preserving user-customizable files (skills, agents) unless `--force`.

**Architecture:** Add a version marker comment (`@rig-generated`) to all
generated hook files. On init, always regenerate hook scripts (these are
non-editable generated code). Skills and agents keep the current
skip-without-force behavior but also check for the marker to detect stale
vs user-customized. Introduce `copyGeneratedTemplate` (always overwrites)
separate from `copyUserTemplate` (respects --force).

**Tech Stack:** TypeScript, Node.js fs, vitest

---

## Task 1: Add version marker to generated hook templates

**Files:**

- Modify: `templates/hooks/pre-tool-use.ts`
- Modify: `templates/hooks/post-tool-use.ts`
- Modify: `templates/hooks/session-start.ts`

- [ ] **Step 1: Add `@rig-generated` marker to each hook template**

Add `@rig-generated` to the existing header comment in each template.

```typescript
#!/usr/bin/env node
/**
 * @rig-generated
 * rig: PreToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 */
```

- [ ] **Step 2: Verify templates build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add templates/hooks/pre-tool-use.ts templates/hooks/post-tool-use.ts templates/hooks/session-start.ts
git commit -m "feat: add @rig-generated marker to hook templates"
```

---

## Task 2: Write failing tests for stale hook overwriting

**Files:**

- Modify: `tests/cli/init.test.ts`

- [ ] **Step 1: Write test — stale hooks overwritten without --force**

- [ ] **Step 2: Write test — user skills preserved without --force**

- [ ] **Step 3: Write test — generated files contain @rig-generated**

- [ ] **Step 4: Run tests to verify they fail**

- [ ] **Step 5: Commit**

---

## Task 3: Implement two-tier copyTemplate (generated vs user-customizable)

**Files:**

- Modify: `src/cli/init.ts`

- [ ] **Step 1: Add `isRigGenerated` helper and `copyGeneratedTemplate`**

- [ ] **Step 2: Update hook copying to use `copyGeneratedTemplate`**

- [ ] **Step 3: Update skill/agent copying to use `copyUserTemplate`**

- [ ] **Step 4: Remove old `copyTemplate` function**

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Commit**

---

## Task 4: Verify end-to-end with real target project

- [ ] **Step 1: Build and link**

- [ ] **Step 2: Re-init in agentic-patterns**

- [ ] **Step 3: Verify hook files are regenerated**

- [ ] **Step 4: Run full test suite**

- [ ] **Step 5: Commit final state**
