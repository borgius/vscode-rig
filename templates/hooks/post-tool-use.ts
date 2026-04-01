#!/usr/bin/env node
/**
 * @rig-generated
 * rig: PostToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Enforces stale test detection, constitutional rules, zero-defect.
 * Config: .harness.yaml
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { handlePostToolUse } = require(join('{{RIG_DIST_PATH}}', 'enforcement', 'post-tool-use.js'));
const { FileTracker } = require(join('{{RIG_DIST_PATH}}', 'enforcement', 'file-tracker.js'));
const { SessionCache } = require(join('{{RIG_DIST_PATH}}', 'session', 'cache.js'));
const { loadConfig } = require(join('{{RIG_DIST_PATH}}', 'config.js'));

const cwd = process.cwd();
const cache = new SessionCache(cwd);
const tracker = new FileTracker();

loadConfig(resolve(cwd, '.harness.yaml')).then((config: any) => {
  let input: any = {};
  try {
    input = JSON.parse(readFileSync('/dev/stdin', 'utf-8') || '{}');
  } catch {
    // Malformed input — exit cleanly
    process.exit(0);
  }
  const result = handlePostToolUse(input.tool_name, input.tool_input, tracker, cache, config);

  if (result) {
    console.error(result);
  }
  process.exit(0); // PostToolUse never blocks, only advises
}).catch(() => {
  // Config load failed — exit cleanly
  process.exit(0);
});
