#!/usr/bin/env node
/**
 * rig: SessionStart hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Detects environment (rtk, jcodemunch), auto-indexes CWD, initializes session cache.
 */
import { handleSessionStart } from 'rig/session/start.js';
import { SessionCache } from 'rig/session/cache.js';

const cache = new SessionCache();
const cwd = process.cwd();

const output = await handleSessionStart(cwd, cache);

console.error(output);
process.exit(0);
