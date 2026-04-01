#!/usr/bin/env node
/**
 * claude-stack-utils: PreToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Intercepts tool calls and routes to optimal tools based on environment.
 * Config: .harness.yaml
 */
import { handlePreToolUse } from 'claude-stack-utils/router/hook.js';
import { SessionCache } from 'claude-stack-utils/session/cache.js';
import { loadConfig } from 'claude-stack-utils/config.js';
import { resolve } from 'node:path';

const cache = SessionCache.load();
const config = await loadConfig(resolve(process.cwd(), '.harness.yaml'));

const input = JSON.parse(process.argv[2] ?? '{}');
const result = handlePreToolUse(input.tool_name, input.tool_input, cache, config);

if (result) {
  console.error(result);
  process.exit(2); // block
}
process.exit(0); // allow
