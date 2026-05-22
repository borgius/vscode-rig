import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTemplate } from './renderer.js';
import { DEFAULT_CONFIG } from '../config.js';
import { stringify as yamlStringify } from 'yaml';
import { detectEnvironment, type ExecFn } from '../session/environment.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '..', '..', 'templates');

interface InitOptions {
  force: boolean;
  broadPermissions?: boolean;
  exec?: ExecFn;
}

export async function initCommand(projectDir: string, options: InitOptions): Promise<void> {
  const githubDir = join(projectDir, '.github');
  const projectName = basename(projectDir);
  const generatedDate = new Date().toISOString().split('T')[0];
  const rigDistPath = resolve(__dirname, '..');

  // Build render context with environment-aware variables
  const renderContext: Record<string, string> = {
    PROJECT_NAME: projectName,
    GENERATED_DATE: generatedDate,
    RIG_DIST_PATH: rigDistPath,
  };

  try {
    const env = await detectEnvironment(projectDir, options.exec);
    if (env.rtkAvailable && env.rtkPath) {
      renderContext.RTK_PATH = env.rtkPath;
    }
    if (env.jcodemunchAvailable) {
      renderContext.JCODEMUNCH_AVAILABLE = 'true';
    }
  } catch {
    // Environment detection is best-effort; templates render with available vars
  }

  // Create directory structure
  const dirs = [
    join(githubDir, 'hooks', 'scripts'),
    join(githubDir, 'skills'),
    join(githubDir, 'agents'),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  // Copy and render hook scripts
  const hookTemplates = ['pre-tool-use.ts', 'post-tool-use.ts', 'session-start.ts'];

  // Prune old-format hooks (pre-scripts layout: files directly in .github/hooks/)
  const hooksDir = join(githubDir, 'hooks');
  for (const hookFile of hookTemplates) {
    const oldPath = join(hooksDir, hookFile);
    if (existsSync(oldPath)) {
      unlinkSync(oldPath);
    }
  }

  for (const hookFile of hookTemplates) {
    const src = join(TEMPLATES_DIR, 'hooks', hookFile);
    const dest = join(githubDir, 'hooks', 'scripts', hookFile);
    copyGeneratedTemplate(src, dest, renderContext);
  }

  // Copy skill templates
  const skillDirs = ['brain-plus', 'plan-plus', 'tdd-plus', 'verify-plus', 'review-plus', 'debug-plus', 'verify-harness', 'savings', 'investigate'];
  for (const skillDir of skillDirs) {
    const srcDir = join(TEMPLATES_DIR, 'skills', skillDir);
    if (!existsSync(srcDir)) continue;
    const destDir = join(githubDir, 'skills', skillDir);
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
    copyUserTemplate(src, join(githubDir, 'agents', agentFile), renderContext, options.force);
  }

  const instructionsSrc = join(TEMPLATES_DIR, 'copilot-instructions.md');
  if (existsSync(instructionsSrc)) {
    copyUserTemplate(
      instructionsSrc,
      join(githubDir, 'copilot-instructions.md'),
      renderContext,
      options.force,
    );
  }

  // Write default config
  const configPath = join(projectDir, '.harness.yaml');
  if (!existsSync(configPath) || options.force) {
    writeFileSync(configPath, yamlStringify(DEFAULT_CONFIG, { lineWidth: 0 }));
  }

  // Create graphify-out directory (graph built on-demand, no placeholder)
  const graphifyDir = join(projectDir, 'graphify-out');
  if (!existsSync(graphifyDir)) {
    mkdirSync(graphifyDir, { recursive: true });
  }

  // Write Copilot hook registrations
  const npxCommand = resolveNpxPath(options.exec);
  writeHookConfig(githubDir, npxCommand);

  // Update .gitignore with rig-managed section
  updateGitignore(projectDir);
}

const GITIGNORE_MARKER_START = '# --- rig-managed (do not edit below) ---';
const GITIGNORE_MARKER_END = '# --- end rig-managed ---';
const GITIGNORE_ENTRIES = [
  '.harness.yaml.local',
  '*.session-cache.json',
  'graphify-out/',
];

function updateGitignore(projectDir: string): void {
  const gitignorePath = join(projectDir, '.gitignore');
  let content = '';

  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf-8');
  }

  // Check if rig-managed section already exists
  if (content.includes(GITIGNORE_MARKER_START)) {
    // Update entries within existing section if any are missing
    const startIdx = content.indexOf(GITIGNORE_MARKER_START);
    const endIdx = content.indexOf(GITIGNORE_MARKER_END);
    if (endIdx > startIdx) {
      const section = content.substring(startIdx, endIdx + GITIGNORE_MARKER_END.length);
      let updated = section;
      for (const entry of GITIGNORE_ENTRIES) {
        if (!section.includes(entry)) {
          // Insert before the end marker
          updated = updated.replace(GITIGNORE_MARKER_END, `${entry}\n${GITIGNORE_MARKER_END}`);
        }
      }
      if (updated !== section) {
        writeFileSync(gitignorePath, content.replace(section, updated));
      }
    }
    return;
  }

  // Append rig-managed section
  const section = [
    '',
    GITIGNORE_MARKER_START,
    ...GITIGNORE_ENTRIES.map(e => e),
    GITIGNORE_MARKER_END,
    '',
  ].join('\n');

  writeFileSync(gitignorePath, content + section);
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

function resolveNpxPath(exec?: ExecFn): string {
  const runExec: ExecFn = exec ?? ((cmd, opts) =>
    execSync(cmd, { encoding: 'utf-8', ...opts } as Parameters<typeof execSync>[1]) as string);
  try {
    const npxPath = runExec('command -v npx').trim();
    if (!npxPath) return 'npx tsx';
    const nodeBinDir = npxPath.replace(/\/npx$/, '');
    // Prepend node bin dir to PATH so npx/tsx can find node in restricted shells
    return `PATH="${nodeBinDir}:$PATH" ${npxPath} tsx`;
  } catch {
    return 'npx tsx';
  }
}

function writeHookConfig(githubDir: string, npxCommand: string): void {
  const configPath = join(githubDir, 'hooks', 'rig-hooks.json');
  const commandFor = (script: string) => `${npxCommand} ".github/hooks/scripts/${script}"`;
  const hookConfig = {
    version: 1,
    hooks: {
      SessionStart: [
        {
          type: 'command',
          bash: commandFor('session-start.ts'),
          cwd: '.',
          timeoutSec: 30,
        },
      ],
      PreToolUse: [
        {
          type: 'command',
          bash: commandFor('pre-tool-use.ts'),
          cwd: '.',
          timeoutSec: 30,
        },
      ],
      PostToolUse: [
        {
          type: 'command',
          bash: commandFor('post-tool-use.ts'),
          cwd: '.',
          timeoutSec: 30,
        },
      ],
    },
  };

  writeFileSync(configPath, JSON.stringify(hookConfig, null, 2) + '\n');
}
