#!/usr/bin/env node
/**
 * claude-stack-utils: PostToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Enforces stale test detection, constitutional rules, zero-defect.
 * Config: .harness.yaml
 */
import { handlePostToolUse } from 'claude-stack-utils/enforcement/post-tool-use.js';
import { FileTracker } from 'claude-stack-utils/enforcement/file-tracker.js';
import { SessionCache } from 'claude-stack-utils/session/cache.js';
import { loadConfig } from 'claude-stack-utils/config.js';
import { resolve } from 'node:path';

const cache = SessionCache.load();
const tracker = FileTracker.load();
const config = await loadConfig(resolve(process.cwd(), '.harness.yaml'));

const input = JSON.parse(process.argv[2] ?? '{}');
const result = handlePostToolUse(input.tool_name, input.tool_input, tracker, cache, config);

if (result) {
  console.error(result);
}
process.exit(0); // PostToolUse never blocks, only advises
