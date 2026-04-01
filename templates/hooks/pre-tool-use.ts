#!/usr/bin/env node
/**
 * rig: PreToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Intercepts tool calls and routes to optimal tools based on environment.
 * Config: .harness.yaml
 */
import { handlePreToolUse } from 'rig/router/hook.js';
import { SessionCache } from 'rig/session/cache.js';
import { loadConfig } from 'rig/config.js';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const cache = new SessionCache();
const config = await loadConfig(resolve(process.cwd(), '.harness.yaml'));

const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8') || '{}');
const result = handlePreToolUse(input.tool_name, input.tool_input, cache, config);

if (result) {
  console.error(result);
  process.exit(2); // block
}
process.exit(0); // allow
