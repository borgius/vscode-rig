import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
    // Create a minimal settings.json (need .claude dir first)
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({}));

    await initCommand(tempDir, { force: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();
  });

  it('writes hook entries in correct Claude Code format', async () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({}));

    await initCommand(tempDir, { force: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    // Each hook event should be an array of matcher+hooks entries
    for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart']) {
      const entries = settings.hooks[event];
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);

      const entry = entries[0];
      expect(entry).toHaveProperty('matcher');
      expect(entry).toHaveProperty('hooks');
      expect(Array.isArray(entry.hooks)).toBe(true);

      const hook = entry.hooks[0];
      expect(hook).toHaveProperty('type', 'command');
      expect(hook).toHaveProperty('command');
      expect(hook.command).toContain('.claude/hooks/scripts/');
    }
  });

  it('preserves existing settings when adding hooks', async () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ permissions: { allow: ['Bash'] } }));

    await initCommand(tempDir, { force: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.permissions.allow).toContain('Bash');
    expect(settings.hooks.PreToolUse[0].hooks[0].type).toBe('command');
  });

  it('does not duplicate hook entries on re-init', async () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({}));

    await initCommand(tempDir, { force: false });
    await initCommand(tempDir, { force: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.PostToolUse.length).toBe(1);
    expect(settings.hooks.SessionStart.length).toBe(1);
  });

  it('creates verify-harness skill', async () => {
    await initCommand(tempDir, { force: false });
    expect(existsSync(join(tempDir, '.claude', 'skills', 'verify-harness', 'SKILL.md'))).toBe(true);
  });

  it('generates hook scripts that import from rig, not claude-stack-utils', async () => {
    await initCommand(tempDir, { force: false });

    const hooksDir = join(tempDir, '.claude', 'hooks', 'scripts');
    for (const hookFile of ['pre-tool-use.ts', 'post-tool-use.ts', 'session-start.ts']) {
      const content = readFileSync(join(hooksDir, hookFile), 'utf-8');
      // Import lines should use 'rig', not 'claude-stack-utils'
      const importLines = content.split('\n').filter(l => l.trim().startsWith('import '));
      for (const line of importLines) {
        expect(line).not.toContain('claude-stack-utils');
        if (line.includes('router/') || line.includes('enforcement/') || line.includes('session/') || line.includes('config')) {
          expect(line).toContain("'rig/");
        }
      }
    }
  });

  it('generates hook scripts that use constructors, not load/save', async () => {
    await initCommand(tempDir, { force: false });

    const hooksDir = join(tempDir, '.claude', 'hooks', 'scripts');
    for (const hookFile of ['pre-tool-use.ts', 'post-tool-use.ts', 'session-start.ts']) {
      const content = readFileSync(join(hooksDir, hookFile), 'utf-8');
      // Must NOT call static load() or instance save()
      expect(content).not.toContain('SessionCache.load()');
      expect(content).not.toContain('FileTracker.load()');
      expect(content).not.toContain('cache.save()');
      // Must use constructors
      expect(content).toContain('new SessionCache()');
    }
  });

  it('generates hook scripts that read input from stdin, not argv', async () => {
    await initCommand(tempDir, { force: false });

    const hooksDir = join(tempDir, '.claude', 'hooks', 'scripts');
    for (const hookFile of ['pre-tool-use.ts', 'post-tool-use.ts']) {
      const content = readFileSync(join(hooksDir, hookFile), 'utf-8');
      expect(content).not.toContain('process.argv[2]');
      expect(content).toMatch(/stdin/);
    }
  });

  it('prunes old-format hooks from .claude/hooks/ on re-init', async () => {
    // Simulate old layout: hooks directly in .claude/hooks/ (pre-scripts layout)
    await initCommand(tempDir, { force: false });
    const oldHooksDir = join(tempDir, '.claude', 'hooks');
    // Plant stale old-format files
    writeFileSync(join(oldHooksDir, 'pre-tool-use.ts'), '// old format');
    writeFileSync(join(oldHooksDir, 'post-tool-use.ts'), '// old format');
    writeFileSync(join(oldHooksDir, 'session-start.ts'), '// old format');

    // Re-init should remove old-format files but keep scripts/ dir
    await initCommand(tempDir, { force: false });

    // Old files gone
    expect(existsSync(join(oldHooksDir, 'pre-tool-use.ts'))).toBe(false);
    expect(existsSync(join(oldHooksDir, 'post-tool-use.ts'))).toBe(false);
    expect(existsSync(join(oldHooksDir, 'session-start.ts'))).toBe(false);
    // scripts/ dir still present
    expect(existsSync(join(oldHooksDir, 'scripts', 'pre-tool-use.ts'))).toBe(true);
  });

  it('migrates old flat-format hook entries to nested format', async () => {
    const claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.json');
    // Simulate old-format settings.json (pre-fix)
    writeFileSync(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: '', command: 'npx tsx .claude/hooks/scripts/pre-tool-use.ts' }],
        PostToolUse: [{ matcher: '', command: 'npx tsx .claude/hooks/scripts/post-tool-use.ts' }],
        SessionStart: [{ matcher: '', command: 'npx tsx .claude/hooks/scripts/session-start.ts' }],
      },
    }));

    await initCommand(tempDir, { force: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart']) {
      const entries = settings.hooks[event];
      // Old flat entry should be removed, replaced by single new-format entry
      expect(entries.length).toBe(1);
      expect(entries[0]).toHaveProperty('hooks');
      expect(entries[0].hooks[0].type).toBe('command');
      // No flat-format entries should remain
      expect(entries.some((e: Record<string, unknown>) => 'command' in e && !('hooks' in e))).toBe(false);
    }
  });
});
