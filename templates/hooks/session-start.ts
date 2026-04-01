#!/usr/bin/env node
/**
 * @rig-generated
 * rig: SessionStart hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Detects environment (rtk, jcodemunch), auto-indexes CWD, initializes session cache.
 * Detected tools: rtk={{RTK_PATH}} jcodemunch={{JCODEMUNCH_AVAILABLE}}
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

let handleSessionStart: any;
let SessionCache: any;

try {
  ({ handleSessionStart } = require(join('{{RIG_DIST_PATH}}', 'session', 'start.js')));
  ({ SessionCache } = require(join('{{RIG_DIST_PATH}}', 'session', 'cache.js')));
} catch {
  // rig dist not available — don't block the session
  process.exit(0);
}

const cwd = process.cwd();
const cache = new SessionCache(cwd);

handleSessionStart(cwd, cache).then((output: string) => {
  console.error(output);
  process.exit(0);
}).catch(() => {
  // Session init failed — don't block the session
  process.exit(0);
});
