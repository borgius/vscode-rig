#!/usr/bin/env node
/**
 * @rig-generated
 * rig: PreToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Intercepts tool calls and routes to optimal tools based on environment.
 * Config: .harness.yaml
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { handlePreToolUse } = require(join('{{RIG_DIST_PATH}}', 'router', 'hook.js'));
const { SessionCache } = require(join('{{RIG_DIST_PATH}}', 'session', 'cache.js'));
const { loadConfig } = require(join('{{RIG_DIST_PATH}}', 'config.js'));

const cache = new SessionCache();

loadConfig(resolve(process.cwd(), '.harness.yaml')).then((config: any) => {
  let input: any = {};
  try {
    input = JSON.parse(readFileSync('/dev/stdin', 'utf-8') || '{}');
  } catch {
    // Malformed input — allow the tool call through
    process.exit(0);
  }
  const result = handlePreToolUse(input.tool_name, input.tool_input, cache, config);

  if (result) {
    console.error(result);
    if (result.startsWith('[BLOCK]')) {
      process.exit(2); // block
    }
  }
  process.exit(0); // allow
}).catch(() => {
  // Config load failed — allow the tool call through
  process.exit(0);
});
