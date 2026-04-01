import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  const agentFiles = ['scout.md'];
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
