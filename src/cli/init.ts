import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTemplate } from './renderer.js';
import { DEFAULT_CONFIG } from '../config.js';
import { stringify as yamlStringify } from 'yaml';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '..', '..', 'templates');

interface InitOptions {
  force: boolean;
}

export async function initCommand(projectDir: string, options: InitOptions): Promise<void> {
  const claudeDir = join(projectDir, '.claude');
  const projectName = basename(projectDir);
  const generatedDate = new Date().toISOString().split('T')[0];
  const rigDistPath = resolve(__dirname, '..');
  const renderContext = { PROJECT_NAME: projectName, GENERATED_DATE: generatedDate, RIG_DIST_PATH: rigDistPath };

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

  // Prune old-format hooks (pre-scripts layout: files directly in .claude/hooks/)
  const hooksDir = join(claudeDir, 'hooks');
  for (const hookFile of hookTemplates) {
    const oldPath = join(hooksDir, hookFile);
    if (existsSync(oldPath)) {
      unlinkSync(oldPath);
    }
  }

  for (const hookFile of hookTemplates) {
    const src = join(TEMPLATES_DIR, 'hooks', hookFile);
    const dest = join(claudeDir, 'hooks', 'scripts', hookFile);
    copyGeneratedTemplate(src, dest, renderContext);
  }

  // Copy skill templates
  const skillDirs = ['brain-plus', 'plan-plus', 'tdd-plus', 'verify-plus', 'review-plus', 'verify-harness', 'savings'];
  for (const skillDir of skillDirs) {
    const srcDir = join(TEMPLATES_DIR, 'skills', skillDir);
    if (!existsSync(srcDir)) continue;
    const destDir = join(claudeDir, 'skills', skillDir);
    mkdirSync(destDir, { recursive: true });
    copyUserTemplate(
      join(srcDir, 'SKILL.md'),
      join(destDir, 'SKILL.md'),
      renderContext,
      options.force,
    );
  }

  // Copy agent templates
  const agentFiles = ['scout.md'];
  for (const agentFile of agentFiles) {
    const src = join(TEMPLATES_DIR, 'agents', agentFile);
    if (!existsSync(src)) continue;
    copyUserTemplate(src, join(claudeDir, 'agents', agentFile), renderContext, options.force);
  }

  // Write default config
  const configPath = join(projectDir, '.harness.yaml');
  if (!existsSync(configPath) || options.force) {
    writeFileSync(configPath, yamlStringify(DEFAULT_CONFIG, { lineWidth: 0 }));
  }

  // Update settings.json with hook registrations
  updateSettingsJson(claudeDir, projectName);
}

function isRigGenerated(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  return content.includes('@rig-generated') || content.includes('<!-- rig-generated -->');
}

function copyGeneratedTemplate(
  src: string,
  dest: string,
  context: Record<string, string>,
): void {
  // Always overwrite: hook scripts are generated code users shouldn't edit.
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
    const entries = hooks[event] as Array<Record<string, unknown>>;
    const command = `npx tsx .claude/hooks/scripts/${script}`;

    // Remove old-format entries (flat matcher+command without nested hooks array)
    let i = entries.length;
    while (i--) {
      const e = entries[i];
      if (
        typeof e === 'object' &&
        e !== null &&
        'command' in e &&
        typeof e.command === 'string' &&
        e.command.includes(script) &&
        !('hooks' in e)
      ) {
        entries.splice(i, 1);
      }
    }

    // Check if new-format entry already exists
    const exists = entries.some(
      e =>
        typeof e === 'object' &&
        e !== null &&
        'hooks' in e &&
        Array.isArray((e as Record<string, unknown>).hooks) &&
        ((e as Record<string, unknown>).hooks as Array<Record<string, string>>).some(
          h => h.command?.includes(script),
        ),
    );
    if (!exists) {
      entries.push({
        matcher: '',
        hooks: [{ type: 'command', command }],
      });
    }
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}
