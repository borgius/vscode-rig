#!/usr/bin/env node
/**
 * @rig-generated
 * rig: Copilot PostToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Enforces stale test detection, constitutional rules, zero-defect.
 * Config: .harness.yaml
 */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

(async () => {
  let handlePostToolUse: any;
  let FileTracker: any;
  let SessionCache: any;
  let loadConfig: any;

  try {
    const enforcement = await import('{{RIG_DIST_PATH}}/enforcement/post-tool-use.js');
    handlePostToolUse = enforcement.handlePostToolUse;
    const tracker = await import('{{RIG_DIST_PATH}}/enforcement/file-tracker.js');
    FileTracker = tracker.FileTracker;
    const cache = await import('{{RIG_DIST_PATH}}/session/cache.js');
    SessionCache = cache.SessionCache;
    const config = await import('{{RIG_DIST_PATH}}/config.js');
    loadConfig = config.loadConfig;
  } catch {
    // rig dist not available — exit cleanly
    process.exit(0);
  }

  const cwd = process.cwd();

  // Parse stdin first to extract session_id for cache isolation
  let input: any = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf-8') || '{}');
  } catch {
    // Malformed input — exit cleanly
    process.exit(0);
  }

  const sessionId = input.session_id ?? input.sessionId;
  const toolName = input.tool_name ?? input.toolName;
  const toolInput = { ...(input.tool_input ?? input.toolArgs ?? {}) };
  const toolResult = input.tool_result ?? input.toolResult;
  const resultText = toolResult?.text_result_for_llm ?? toolResult?.textResultForLlm;
  if (resultText && !toolInput.output) {
    toolInput.output = resultText;
  }

  const cache = new SessionCache(cwd, sessionId);
  const tracker = new FileTracker();

  loadConfig(resolve(cwd, '.harness.yaml')).then((config: any) => {
    const result = handlePostToolUse(toolName, toolInput, tracker, cache, config);

    if (result) {
      console.error(result);
      console.log(JSON.stringify({ additionalContext: result }));
    }
    process.exit(0); // PostToolUse never blocks, only advises
  }).catch(() => {
    // Config load failed — exit cleanly
    process.exit(0);
  });
})();
