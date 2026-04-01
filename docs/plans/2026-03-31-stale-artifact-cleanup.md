# Stale Artifact Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `rig init` to always overwrite stale generated hook scripts, while preserving user-customizable files (skills, agents) unless `--force`.

**Architecture:** Add a version marker comment (`@rig-generated`) to all generated hook files. On init, always regenerate hook scripts (these are non-editable generated code). Skills and agents keep the current skip-without-force behavior but also check for the marker to detect stale vs user-customized. Introduce `copyGeneratedTemplate` (always overwrites) separate from `copyUserTemplate` (respects --force).

**Tech Stack:** TypeScript, Node.js fs, vitest

---

### Task 1: Add version marker to generated hook templates

**Files:**
- Modify: `templates/hooks/pre-tool-use.ts`
- Modify: `templates/hooks/post-tool-use.ts`
- Modify: `templates/hooks/session-start.ts`

- [ ] **Step 1: Add `@rig-generated` marker to each hook template**

Add `@rig-generated` to the existing header comment in each template. The templates already have a header comment block — just add the marker line.

`templates/hooks/pre-tool-use.ts` — change header to:
```typescript
#!/usr/bin/env node
/**
 * @rig-generated
 * rig: PreToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Intercepts tool calls and routes to optimal tools based on environment.
 * Config: .harness.yaml
 */
```

`templates/hooks/post-tool-use.ts` — change header to:
```typescript
#!/usr/bin/env node
/**
 * @rig-generated
 * rig: PostToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Enforces stale test detection, constitutional rules, zero-defect.
 * Config: .harness.yaml
 */
```

`templates/hooks/session-start.ts` — change header to:
```typescript
#!/usr/bin/env node
/**
 * @rig-generated
 * rig: SessionStart hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Detects environment (rtk, jcodemunch), auto-indexes CWD, initializes session cache.
 */
```

- [ ] **Step 2: Verify templates build**

Run: `npm run build`
Expected: Clean compile, no errors

- [ ] **Step 3: Commit**

```bash
git add templates/hooks/pre-tool-use.ts templates/hooks/post-tool-use.ts templates/hooks/session-start.ts
git commit -m "feat: add @rig-generated marker to hook templates"
```

---

### Task 2: Write failing tests for stale hook overwriting

**Files:**
- Modify: `tests/cli/init.test.ts`

- [ ] **Step 1: Write test — stale hook scripts are overwritten without --force**

This test simulates the exact bug: a hook file with old imports (e.g. `claude-stack-utils`) already exists. Running `init` (without --force) should overwrite it with the current template.

Add after the existing `it('prunes old-format hooks...')` test:

```typescript
it('overwrites stale hook scripts without --force', async () => {
  // First init
  await initCommand(tempDir, { force: false });

  // Simulate stale artifact: replace hook content with old package name
  const hookPath = join(tempDir, '.claude', 'hooks', 'scripts', 'session-start.ts');
  const staleContent = `#!/usr/bin/env node
import { handleSessionStart } from 'claude-stack-utils/session/start.js';
console.log('stale');
`;
  writeFileSync(hookPath, staleContent);

  // Re-init without --force should overwrite the stale file
  await initCommand(tempDir, { force: false });

  const content = readFileSync(hookPath, 'utf-8');
  expect(content).toContain("from 'rig/");
  expect(content).not.toContain('claude-stack-utils');
});
```

- [ ] **Step 2: Write test — user-modified skill files are preserved without --force**

```typescript
it('preserves user-modified skill files without --force', async () => {
  await initCommand(tempDir, { force: false });

  const skillPath = join(tempDir, '.claude', 'skills', 'brain-plus', 'SKILL.md');
  writeFileSync(skillPath, '# My custom brain skill\n');

  await initCommand(tempDir, { force: false });

  const content = readFileSync(skillPath, 'utf-8');
  expect(content).toBe('# My custom brain skill\n');
});
```

- [ ] **Step 3: Write test — generated files contain @rig-generated marker**

```typescript
it('generates hook scripts with @rig-generated marker', async () => {
  await initCommand(tempDir, { force: false });

  const hooksDir = join(tempDir, '.claude', 'hooks', 'scripts');
  for (const hookFile of ['pre-tool-use.ts', 'post-tool-use.ts', 'session-start.ts']) {
    const content = readFileSync(join(hooksDir, hookFile), 'utf-8');
    expect(content).toContain('@rig-generated');
  }
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- tests/cli/init.test.ts`
Expected: The "overwrites stale hook scripts" test FAILS (stale file persists). The "user-modified skill" and "@rig-generated marker" tests should also inform the expected behavior.

- [ ] **Step 5: Commit**

```bash
git add tests/cli/init.test.ts
git commit -m "test: add failing tests for stale hook overwriting"
```

---

### Task 3: Implement two-tier copyTemplate (generated vs user-customizable)

**Files:**
- Modify: `src/cli/init.ts`

- [ ] **Step 1: Add `isRigGenerated` helper and `copyGeneratedTemplate` function**

Replace the existing `copyTemplate` function (lines 82-91) with two functions:

```typescript
function isRigGenerated(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  return content.includes('@rig-generated');
}

function copyGeneratedTemplate(
  src: string,
  dest: string,
  context: Record<string, string>,
): void {
  // Always overwrite: hook scripts are generated code users shouldn't edit.
  // Also overwrite if file exists but lacks the marker (stale artifact).
  const content = readFileSync(src, 'utf-8');
  writeFileSync(dest, renderTemplate(content, context));
}

function copyUserTemplate(
  src: string,
  dest: string,
  context: Record<string, string>,
  force: boolean,
): void {
  if (!force) {
    if (!existsSync(dest)) {
      // File doesn't exist — write it
      const content = readFileSync(src, 'utf-8');
      writeFileSync(dest, renderTemplate(content, context));
      return;
    }
    // File exists — only overwrite if it's a stale rig-generated file
    if (!isRigGenerated(dest)) return;
  }
  const content = readFileSync(src, 'utf-8');
  writeFileSync(dest, renderTemplate(content, context));
}
```

- [ ] **Step 2: Update hook script copying to use `copyGeneratedTemplate`**

Change the hook loop (lines 43-47) from:

```typescript
  for (const hookFile of hookTemplates) {
    const src = join(TEMPLATES_DIR, 'hooks', hookFile);
    const dest = join(claudeDir, 'hooks', 'scripts', hookFile);
    copyTemplate(src, dest, renderContext, options.force);
  }
```

to:

```typescript
  for (const hookFile of hookTemplates) {
    const src = join(TEMPLATES_DIR, 'hooks', hookFile);
    const dest = join(claudeDir, 'hooks', 'scripts', hookFile);
    copyGeneratedTemplate(src, dest, renderContext);
  }
```

- [ ] **Step 3: Update skill and agent copying to use `copyUserTemplate`**

Change the skill copy call (lines 56-61) from:

```typescript
    copyTemplate(
      join(srcDir, 'SKILL.md'),
      join(destDir, 'SKILL.md'),
      renderContext,
      options.force,
    );
```

to:

```typescript
    copyUserTemplate(
      join(srcDir, 'SKILL.md'),
      join(destDir, 'SKILL.md'),
      renderContext,
      options.force,
    );
```

Change the agent copy call (lines 67-69) from:

```typescript
    copyTemplate(src, join(claudeDir, 'agents', agentFile), renderContext, options.force);
```

to:

```typescript
    copyUserTemplate(src, join(claudeDir, 'agents', agentFile), renderContext, options.force);
```

- [ ] **Step 4: Remove old `copyTemplate` function**

Delete the old `copyTemplate` function entirely (it's no longer called).

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: ALL tests pass, including the new stale-artifact tests.

- [ ] **Step 6: Commit**

```bash
git add src/cli/init.ts
git commit -m "fix: always overwrite stale hook scripts on rig init"
```

---

### Task 4: Verify end-to-end with real target project

**Files:** No code changes — verification only.

- [ ] **Step 1: Build and link**

Run: `npm run build && npm link`
Expected: Clean build, link succeeds

- [ ] **Step 2: Re-init in agentic-patterns**

Run: `cd ~/projects/agentic-patterns && rig init`
Expected: "Initializing rig in /home/jerome/projects/agentic-patterns..." — no error

- [ ] **Step 3: Verify hook files are regenerated**

Run: `head -5 ~/projects/agentic-patterns/.claude/hooks/scripts/session-start.ts`
Expected: Header contains `@rig-generated` and `rig:` — NOT `claude-stack-utils`

- [ ] **Step 4: Run full test suite one final time**

Run: `cd ~/projects/claude-rig && npm test`
Expected: All 240+ tests pass

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: stale artifact cleanup for rig init"
```
