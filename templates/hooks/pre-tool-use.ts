#!/usr/bin/env node
/**
 * @rig-generated
 * rig: Copilot PreToolUse hook
 * Project: {{PROJECT_NAME}}
 * Generated: {{GENERATED_DATE}}
 *
 * Intercepts tool calls and routes to optimal tools based on environment.
 * Config: .harness.yaml
 * Detected tools: rtk={{RTK_PATH}} jcodemunch={{JCODEMUNCH_AVAILABLE}}
 */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

(async () => {
  let handlePreToolUse: any;
  let SessionCache: any;
  let loadConfig: any;

  try {
    const hook = await import('{{RIG_DIST_PATH}}/router/hook.js');
    handlePreToolUse = hook.handlePreToolUse;
    const cache = await import('{{RIG_DIST_PATH}}/session/cache.js');
    SessionCache = cache.SessionCache;
    const config = await import('{{RIG_DIST_PATH}}/config.js');
    loadConfig = config.loadConfig;
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

  const sessionId = input.session_id ?? input.sessionId;
  const toolName = input.tool_name ?? input.toolName;
  const toolInput = input.tool_input ?? input.toolArgs ?? {};
  const cache = new SessionCache(cwd, sessionId);

  loadConfig(resolve(cwd, '.harness.yaml')).then((config: any) => {
    const result = handlePreToolUse(toolName, toolInput, cache, config);

    // Transparent rewrite: output Copilot hook JSON with modifiedArgs
    if (result && typeof result === 'object' && result.type === 'rewrite') {
      const output = JSON.stringify({
        permissionDecision: 'allow',
        modifiedArgs: { ...toolInput, command: result.command },
      });
      console.log(output);
      process.exit(0);
    }

    // Advise or block using Copilot's permissionDecision protocol.
    if (result && typeof result === 'string') {
      console.error(result);
      if (result.startsWith('[BLOCK]')) {
        console.log(JSON.stringify({
          permissionDecision: 'deny',
          permissionDecisionReason: result,
        }));
        process.exit(0);
      }
    }
    process.exit(0); // allow
  }).catch(() => {
    // Config load failed — allow the tool call through
    process.exit(0);
  });
})();
