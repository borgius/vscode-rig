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
