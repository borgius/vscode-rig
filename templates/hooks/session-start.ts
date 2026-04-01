#!/usr/bin/env node
/**
 * @rig-generated
 * rig: SessionStart hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Detects environment (rtk, jcodemunch), auto-indexes CWD, initializes session cache.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { handleSessionStart } = require(join('{{RIG_DIST_PATH}}', 'session', 'start.js'));
const { SessionCache } = require(join('{{RIG_DIST_PATH}}', 'session', 'cache.js'));

const cache = new SessionCache();
const cwd = process.cwd();

handleSessionStart(cwd, cache).then((output: string) => {
  console.error(output);
  process.exit(0);
});
