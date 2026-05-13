#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './init.js';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Read version from package.json so the CLI and the published package can't drift.
// __dirname is src/cli when compiled to src/cli/index.js, dist/cli when shipped.
// In both layouts the repo's package.json lives two levels up.
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf-8'),
) as { version: string };

const program = new Command();

program
  .name('rig')
  .description('Agent harness that enforces tool routing, skill chains, and multi-agent discipline for Claude Code')
  .version(pkg.version);

program
  .command('init')
  .description('Scaffold hooks, skills, agents, and config into .claude/')
  .option('--force', 'Overwrite existing files', false)
  .option('--dir <path>', 'Target project directory', process.cwd())
  .action(async (options) => {
    const projectDir = resolve(options.dir);
    console.log(`Initializing rig in ${projectDir}...`);
    await initCommand(projectDir, { force: options.force });
    console.log('Done. Start a new Claude Code session to activate.');
  });

program.parse();
