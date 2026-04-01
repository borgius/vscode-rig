# Phase 6: CLI Installer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `claude-stack-utils init` CLI command that scaffolds hooks, skills, agents, and config into a project's `.claude/` directory. Also build the `verify-harness` skill template for post-install session verification.

**Architecture:** A Node.js CLI entry point that reads templates from the installed package, detects the current environment, and copies/renders them into the target project. Uses `commander` for arg parsing. The init command is idempotent — running it twice does not overwrite user customizations unless `--force` is passed.

**Tech Stack:** TypeScript, vitest, commander, Node.js fs/path

**Depends on:** Phase 1-5 (all templates and source modules)

---

## File Structure

```
src/
  cli/
    index.ts                # CLI entry point (bin)
    init.ts                 # Init command implementation
    renderer.ts             # Template rendering (variable substitution)
    verifier.ts             # Post-install verification checks
templates/
  hooks/
    pre-tool-use.ts         # Hook script template
    post-tool-use.ts        # Hook script template
    session-start.ts        # Hook script template
  config/
    default-config.yaml     # Default .harness.yaml template
tests/
  cli/
    init.test.ts            # Init command tests
    renderer.test.ts        # Template rendering tests
    verifier.test.ts        # Verification check tests
```

---

### Task 1: Template Renderer

**Files:**
- Create: `src/cli/renderer.ts`
- Create: `tests/cli/renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/cli/renderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../src/cli/renderer.js';

describe('renderTemplate', () => {
  it('replaces {{VARIABLE}} placeholders', () => {
    const template = 'Hello {{NAME}}, your project is {{PROJECT}}.';
    const result = renderTemplate(template, { NAME: 'World', PROJECT: 'my-app' });
    expect(result).toBe('Hello World, your project is my-app.');
  });

  it('leaves unknown placeholders unchanged', () => {
    const template = 'Hello {{NAME}}, {{UNKNOWN}}.';
    const result = renderTemplate(template, { NAME: 'World' });
    expect(result).toBe('Hello World, {{UNKNOWN}}.');
  });

  it('handles missing variables gracefully', () => {
    const template = 'No vars here.';
    const result = renderTemplate(template, {});
    expect(result).toBe('No vars here.');
  });

  it('handles empty template', () => {
    const result = renderTemplate('', { NAME: 'test' });
    expect(result).toBe('');
  });

  it('replaces multiple occurrences of same variable', () => {
    const template = '{{PATH}} and {{PATH}} again';
    const result = renderTemplate(template, { PATH: '/usr/bin' });
    expect(result).toBe('/usr/bin and /usr/bin again');
  });

  it('handles multiline templates', () => {
    const template = `#!/usr/bin/env node
// Harness hook for {{PROJECT}}
// Generated at {{DATE}}
import { handlePreToolUse } from 'claude-stack-utils';
`;
    const result = renderTemplate(template, { PROJECT: 'my-app', DATE: '2026-03-31' });
    expect(result).toContain('// Harness hook for my-app');
    expect(result).toContain('// Generated at 2026-03-31');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/renderer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the renderer**

Create `src/cli/renderer.ts`:

```typescript
/**
 * Simple mustache-style template renderer.
 * Replaces {{KEY}} placeholders with values from the context.
 */
export function renderTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return context[key] ?? match;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/renderer.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/renderer.ts tests/cli/renderer.test.ts
git commit -m "feat: add simple template renderer for CLI scaffolding"
```

---

### Task 2: Hook Templates

**Files:**
- Create: `templates/hooks/pre-tool-use.ts`
- Create: `templates/hooks/post-tool-use.ts`
- Create: `templates/hooks/session-start.ts`

- [ ] **Step 1: Create the PreToolUse hook template**

Create `templates/hooks/pre-tool-use.ts`:

```typescript
#!/usr/bin/env node
/**
 * claude-stack-utils: PreToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Intercepts tool calls and routes to optimal tools based on environment.
 * Config: .harness.yaml
 */
import { handlePreToolUse } from 'claude-stack-utils/router/hook.js';
import { SessionCache } from 'claude-stack-utils/session/cache.js';
import { loadConfig } from 'claude-stack-utils/config.js';
import { resolve } from 'node:path';

const cache = SessionCache.load();
const config = await loadConfig(resolve(process.cwd(), '.harness.yaml'));

const input = JSON.parse(process.argv[2] ?? '{}');
const result = handlePreToolUse(input.tool_name, input.tool_input, cache, config);

if (result) {
  console.error(result);
  process.exit(2); // block
}
process.exit(0); // allow
```

- [ ] **Step 2: Create the PostToolUse hook template**

Create `templates/hooks/post-tool-use.ts`:

```typescript
#!/usr/bin/env node
/**
 * claude-stack-utils: PostToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Enforces stale test detection, constitutional rules, zero-defect.
 * Config: .harness.yaml
 */
import { handlePostToolUse } from 'claude-stack-utils/enforcement/post-tool-use.js';
import { FileTracker } from 'claude-stack-utils/enforcement/file-tracker.js';
import { SessionCache } from 'claude-stack-utils/session/cache.js';
import { loadConfig } from 'claude-stack-utils/config.js';
import { resolve } from 'node:path';

const cache = SessionCache.load();
const tracker = FileTracker.load();
const config = await loadConfig(resolve(process.cwd(), '.harness.yaml'));

const input = JSON.parse(process.argv[2] ?? '{}');
const result = handlePostToolUse(input.tool_name, input.tool_input, tracker, cache, config);

if (result) {
  console.error(result);
}
process.exit(0); // PostToolUse never blocks, only advises
```

- [ ] **Step 3: Create the SessionStart hook template**

Create `templates/hooks/session-start.ts`:

```typescript
#!/usr/bin/env node
/**
 * claude-stack-utils: SessionStart hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Detects environment (rtk, jcodemunch), auto-indexes CWD, initializes session cache.
 */
import { handleSessionStart } from 'claude-stack-utils/session/start.js';
import { SessionCache } from 'claude-stack-utils/session/cache.js';
import { resolve } from 'node:path';

const cache = new SessionCache();
const cwd = process.cwd();

const output = await handleSessionStart(cwd, cache);
cache.save();

console.error(output);
process.exit(0);
```

- [ ] **Step 4: Commit**

```bash
git add templates/hooks/
git commit -m "feat: add hook script templates for pre/post tool use and session start"
```

---

### Task 3: Init Command

**Files:**
- Create: `src/cli/init.ts`
- Create: `tests/cli/init.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/cli/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { initCommand } from '../../src/cli/init.js';

describe('initCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'claude-stack-utils-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .claude directory structure', async () => {
    await initCommand(tempDir, { force: false });
    expect(existsSync(join(tempDir, '.claude'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'hooks', 'scripts'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'agents'))).toBe(true);
  });

  it('creates hook scripts', async () => {
    await initCommand(tempDir, { force: false });
    expect(existsSync(join(tempDir, '.claude', 'hooks', 'scripts', 'pre-tool-use.ts'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'hooks', 'scripts', 'post-tool-use.ts'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'hooks', 'scripts', 'session-start.ts'))).toBe(true);
  });

  it('creates skill directories from templates', async () => {
    await initCommand(tempDir, { force: false });
    expect(existsSync(join(tempDir, '.claude', 'skills', 'brain-plus', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills', 'plan-plus', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills', 'tdd-plus', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills', 'verify-plus', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tempDir, '.claude', 'skills', 'review-plus', 'SKILL.md'))).toBe(true);
  });

  it('creates scout agent definition', async () => {
    await initCommand(tempDir, { force: false });
    expect(existsSync(join(tempDir, '.claude', 'agents', 'scout.md'))).toBe(true);
  });

  it('creates .harness.yaml with defaults', async () => {
    await initCommand(tempDir, { force: false });
    const configPath = join(tempDir, '.harness.yaml');
    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain('tool_routing');
    expect(content).toContain('constitutional');
    expect(content).toContain('stale_tests');
  });

  it('does not overwrite existing files without --force', async () => {
    await initCommand(tempDir, { force: false });
    // Modify a file
    const skillPath = join(tempDir, '.claude', 'skills', 'brain-plus', 'SKILL.md');
    const original = readFileSync(skillPath, 'utf-8');
    writeFileSync(skillPath, original + '\n# Custom addition\n');

    // Re-run init
    await initCommand(tempDir, { force: false });

    // Should NOT have overwritten
    const after = readFileSync(skillPath, 'utf-8');
    expect(after).toContain('Custom addition');
  });

  it('overwrites existing files with --force', async () => {
    await initCommand(tempDir, { force: false });
    const skillPath = join(tempDir, '.claude', 'skills', 'brain-plus', 'SKILL.md');
    writeFileSync(skillPath, 'overwritten');

    await initCommand(tempDir, { force: true });

    const after = readFileSync(skillPath, 'utf-8');
    expect(after).not.toBe('overwritten');
    expect(after).toContain('brain+');
  });

  it('updates settings.json with hook registrations', async () => {
    // Create a minimal settings.json
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({}));

    await initCommand(tempDir, { force: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();
  });

  it('creates verify-harness skill', async () => {
    await initCommand(tempDir, { force: false });
    expect(existsSync(join(tempDir, '.claude', 'skills', 'verify-harness', 'SKILL.md'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/init.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the init command**

Create `src/cli/init.ts`:

```typescript
import { mkdirSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { renderTemplate } from './renderer.js';
import { DEFAULT_CONFIG } from '../config.js';
import { stringify as yamlStringify } from 'yaml';

const TEMPLATES_DIR = resolve(import.meta.dirname, '..', '..', 'templates');

interface InitOptions {
  force: boolean;
}

export async function initCommand(projectDir: string, options: InitOptions): Promise<void> {
  const claudeDir = join(projectDir, '.claude');
  const projectName = basename(projectDir);
  const generatedDate = new Date().toISOString().split('T')[0];
  const renderContext = { PROJECT_NAME: projectName, GENERATED_DATE: generatedDate };

  // Create directory structure
  const dirs = [
    join(claudeDir, 'hooks', 'scripts'),
    join(claudeDir, 'skills'),
    join(claudeDir, 'agents'),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  // Copy and render hook scripts
  const hookTemplates = ['pre-tool-use.ts', 'post-tool-use.ts', 'session-start.ts'];
  for (const hookFile of hookTemplates) {
    const src = join(TEMPLATES_DIR, 'hooks', hookFile);
    const dest = join(claudeDir, 'hooks', 'scripts', hookFile);
    copyTemplate(src, dest, renderContext, options.force);
  }

  // Copy skill templates
  const skillDirs = ['brain-plus', 'plan-plus', 'tdd-plus', 'verify-plus', 'review-plus', 'verify-harness'];
  for (const skillDir of skillDirs) {
    const srcDir = join(TEMPLATES_DIR, 'skills', skillDir);
    if (!existsSync(srcDir)) continue;
    const destDir = join(claudeDir, 'skills', skillDir);
    mkdirSync(destDir, { recursive: true });
    copyTemplate(
      join(srcDir, 'SKILL.md'),
      join(destDir, 'SKILL.md'),
      renderContext,
      options.force,
    );
  }

  // Copy agent templates
  const agentFiles = ['scout.md', 'reviewer.md'];
  for (const agentFile of agentFiles) {
    const src = join(TEMPLATES_DIR, 'agents', agentFile);
    if (!existsSync(src)) continue;
    copyTemplate(src, join(claudeDir, 'agents', agentFile), renderContext, options.force);
  }

  // Write default config
  const configPath = join(projectDir, '.harness.yaml');
  if (!existsSync(configPath) || options.force) {
    writeFileSync(configPath, yamlStringify(DEFAULT_CONFIG, { lineWidth: 0 }));
  }

  // Update settings.json with hook registrations
  updateSettingsJson(claudeDir, projectName);
}

function copyTemplate(
  src: string,
  dest: string,
  context: Record<string, string>,
  force: boolean,
): void {
  if (existsSync(dest) && !force) return;
  const content = readFileSync(src, 'utf-8');
  writeFileSync(dest, renderTemplate(content, context));
}

function updateSettingsJson(claudeDir: string, projectName: string): void {
  const settingsPath = join(claudeDir, 'settings.json');
  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;

  // Register hooks if not already present
  const hookRegistrations: Record<string, string> = {
    PreToolUse: 'pre-tool-use.ts',
    PostToolUse: 'post-tool-use.ts',
    SessionStart: 'session-start.ts',
  };

  for (const [event, script] of Object.entries(hookRegistrations)) {
    if (!hooks[event]) {
      hooks[event] = [];
    }
    const entries = hooks[event] as Array<Record<string, string>>;
    const exists = entries.some(
      e => typeof e === 'object' && e.command?.includes(script),
    );
    if (!exists) {
      entries.push({
        matcher: '',
        command: `npx tsx .claude/hooks/scripts/${script}`,
      });
    }
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/init.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/init.ts tests/cli/init.test.ts
git commit -m "feat: add CLI init command with idempotent scaffolding"
```

---

### Task 4: CLI Entry Point

**Files:**
- Create: `src/cli/index.ts`

- [ ] **Step 1: Write the CLI entry point**

Create `src/cli/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './init.js';
import { resolve } from 'node:path';

const program = new Command();

program
  .name('claude-stack-utils')
  .description('Agent harness that enforces tool routing, skill chains, and multi-agent discipline for Claude Code')
  .version('0.1.0');

program
  .command('init')
  .description('Scaffold hooks, skills, agents, and config into .claude/')
  .option('--force', 'Overwrite existing files', false)
  .option('--dir <path>', 'Target project directory', process.cwd())
  .action(async (options) => {
    const projectDir = resolve(options.dir);
    console.log(`Initializing claude-stack-utils in ${projectDir}...`);
    await initCommand(projectDir, { force: options.force });
    console.log('Done. Start a new Claude Code session to activate.');
  });

program.parse();
```

- [ ] **Step 2: Install commander**

Run: `npm install commander && npm install -D @types/commander`

- [ ] **Step 3: Update package.json bin field**

Ensure `package.json` has:
```json
{
  "bin": {
    "claude-stack-utils": "dist/cli/index.js"
  }
}
```

- [ ] **Step 4: Verify CLI runs**

Run: `npx tsx src/cli/index.ts --help`
Expected: shows help text with init command

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts package.json package-lock.json
git commit -m "feat: add CLI entry point with commander"
```

---

### Task 5: verify-harness Skill Template

**Files:**
- Create: `templates/skills/verify-harness/SKILL.md`

- [ ] **Step 1: Create the verify-harness skill**

Create `templates/skills/verify-harness/SKILL.md`:

```markdown
---
name: verify-harness
description: "Run after `claude-stack-utils init` to verify all hooks, skills, and agents are installed and working correctly in the live session."
user-invocable: true
---

# verify-harness — Post-Install Verification

Run this skill after `claude-stack-utils init` to confirm everything is working.

## Procedure

Run each check and report PASS/FAIL with evidence.

### Session Start Hook

- [ ] **S1**: Session started without hook errors
- [ ] **S2**: Run `which rtk` — report if available
- [ ] **S3**: Run `which jcodemunch` — report if available
- [ ] **S4**: Check if CWD is indexed: run `jcodemunch list_repos` if available
- [ ] **S5**: Check `.harness.yaml` exists and parses

### Tool Router (PreToolUse Hook)

- [ ] **TR1**: Run `grep -r test .` in a test call — does the hook intercept it?
- [ ] **TR2**: Run `find . -name '*.ts'` — does the hook intercept it?
- [ ] **TR3**: Run `sed -i 's/old/new/g' file` — does the hook BLOCK it?
- [ ] **TR4**: Run `git status` — does the hook advise rtk (if available)?
- [ ] **TR5**: Run `Read` on a specific file — does it pass through?
- [ ] **TR6**: Run `Grep` tool — does it advise jcodemunch (if indexed)?
- [ ] **TR7**: Run `Glob` tool — does it advise jcodemunch (if indexed)?
- [ ] **TR8**: Reference an external directory — does it trigger auto-index?

### Enforcement (PostToolUse Hook)

- [ ] **E1**: Edit a source file — does it warn about missing test update?
- [ ] **E2**: Write a test with `jest.mock()` — does constitutional check fire?
- [ ] **E3**: Run a test that fails — does zero-defect check fire?
- [ ] **E4**: Edit source without test — does stale test warning appear?
- [ ] **E5**: During tdd+ phase, run full suite — does scope redirect fire?
- [ ] **E6**: During verify+ phase, run full suite — is it allowed?

### Skills

- [ ] **SK1**: `/brain+` shows in skill list
- [ ] **SK2**: `/plan+` shows in skill list
- [ ] **SK3**: `/tdd+` shows in skill list
- [ ] **SK4**: `/verify+` shows in skill list
- [ ] **SK5**: `/review+` shows in skill list

### Agents

- [ ] **AG1**: Scout agent definition exists
- [ ] **AG2**: Scout can be invoked with `Agent(subagent_type="scout")`

### Configuration

- [ ] **CF1**: Change a rule in `.harness.yaml` — does behavior change?
- [ ] **CF2**: Default config was generated correctly

## Report Format

```
Session Verification Report
============================
Session Start:  X/5 passed
Tool Router:    X/8 passed
Enforcement:    X/6 passed
Skills:         X/5 passed
Agents:         X/2 passed
Configuration:  X/2 passed

TOTAL: XX/28 passed

Failures:
- [ID]: [what happened]. Expected: [expected]. Got: [actual].
  Remediation: [how to fix]
```
```

- [ ] **Step 2: Commit**

```bash
git add templates/skills/verify-harness/SKILL.md
git commit -m "feat: add verify-harness skill template for post-install verification"
```

---

### Task 6: Verify All Phase 6 Tests Pass Together

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Test init command manually in temp dir**

Run: `npx tsx src/cli/index.ts init --dir /tmp/test-init && ls -R /tmp/test-init/.claude/`
Expected: directory structure with hooks, skills, agents, and config

- [ ] **Step 4: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: phase 6 complete - CLI installer with idempotent scaffolding and verify-harness"
```

---

### Task 7: Phase Retrospective — GStack Comparison

Use `superpowers:debugging` to analyze Phase 6 CLI installer against gstack's scaffolding/CLI patterns (indexed as `local/gstack`).

- [ ] **Step 1: Research gstack CLI/scaffolding patterns**

```
search_symbols(repo="local/gstack", query="init")
search_symbols(repo="local/gstack", query="scaffold")
search_symbols(repo="local/gstack", query="install")
search_symbols(repo="local/gstack", query="cli")
search_symbols(repo="local/gstack", query="render")
get_file_tree(repo="local/gstack", path_prefix="src/cli")
```

- [ ] **Step 2: Write comparative analysis**

Create `docs/retrospectives/phase-6-retrospective.md` with sections: Shared Patterns, Differences, GStack Pros, Our Pros, Cons/Improvements, Action Items.

- [ ] **Step 3: Commit retrospective**

```bash
git add docs/retrospectives/phase-6-retrospective.md
git commit -m "docs: phase 6 retrospective — gstack CLI installer comparison"
```
