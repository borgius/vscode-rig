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

  it('creates verify-harness skill', async () => {
    await initCommand(tempDir, { force: false });
    expect(existsSync(join(tempDir, '.claude', 'skills', 'verify-harness', 'SKILL.md'))).toBe(true);
  });
});
