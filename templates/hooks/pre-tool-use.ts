#!/usr/bin/env node
/**
 * @rig-generated
 * rig: PreToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Intercepts tool calls and routes to optimal tools based on environment.
 * Config: .harness.yaml
 * Detected tools: rtk={{RTK_PATH}} jcodemunch={{JCODEMUNCH_AVAILABLE}}
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

let handlePreToolUse: any;
let SessionCache: any;
let loadConfig: any;

try {
  ({ handlePreToolUse } = require(join('{{RIG_DIST_PATH}}', 'router', 'hook.js')));
  ({ SessionCache } = require(join('{{RIG_DIST_PATH}}', 'session', 'cache.js')));
  ({ loadConfig } = require(join('{{RIG_DIST_PATH}}', 'config.js')));
} catch {
  // rig dist not available — allow the tool call through
  process.exit(0);
}

const cwd = process.cwd();

// Parse stdin first to extract session_id for cache isolation
let input: any = {};
try {
  input = JSON.parse(readFileSync(0, 'utf-8') || '{}');
} catch {
  // Malformed input — allow the tool call through
  process.exit(0);
}

const cache = new SessionCache(cwd, input.session_id);

loadConfig(resolve(cwd, '.harness.yaml')).then((config: any) => {
  const result = handlePreToolUse(input.tool_name, input.tool_input, cache, config);

  // Transparent rewrite: output JSON with updatedInput
  if (result && typeof result === 'object' && result.type === 'rewrite') {
    const output = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { command: result.command },
      },
    });
    console.log(output);
    process.exit(0);
  }

  // Advise or block: output plain text
  if (result && typeof result === 'string') {
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
