#!/usr/bin/env node
/**
 * rig: PostToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Enforces stale test detection, constitutional rules, zero-defect.
 * Config: .harness.yaml
 */
import { handlePostToolUse } from 'rig/enforcement/post-tool-use.js';
import { FileTracker } from 'rig/enforcement/file-tracker.js';
import { SessionCache } from 'rig/session/cache.js';
import { loadConfig } from 'rig/config.js';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const cache = new SessionCache();
const tracker = new FileTracker();
const config = await loadConfig(resolve(process.cwd(), '.harness.yaml'));

const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8') || '{}');
const result = handlePostToolUse(input.tool_name, input.tool_input, tracker, cache, config);

if (result) {
  console.error(result);
}
process.exit(0); // PostToolUse never blocks, only advises
