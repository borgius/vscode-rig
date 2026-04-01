#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './init.js';
import { resolve } from 'node:path';

const program = new Command();

program
  .name('rig')
  .description('Agent harness that enforces tool routing, skill chains, and multi-agent discipline for Claude Code')
  .version('0.1.0');

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
