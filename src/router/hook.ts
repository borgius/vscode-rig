import type { HarnessConfig } from '../types.js';
import { SessionCache } from '../session/cache.js';
import { findMatchingRule, getDefaultRules } from './rules.js';
import { resolve } from './resolver.js';

interface HookResult {
  decision: 'block' | 'allow';
  reason?: string;
}

/**
 * PreToolUse hook handler. Returns null to allow, or a string message
 * to advise/block the tool call.
 *
 * Claude Code hook protocol: stdout is shown to the agent.
 * Exit 0 = allow, Exit 2 = block.
 */
export function handlePreToolUse(
  tool: string,
  args: Record<string, unknown>,
  cache: SessionCache,
  config: HarnessConfig,
): string | null {
  const rules = getDefaultRules();
  const match = findMatchingRule(tool, args, rules);

  if (!match) return null; // No matching rule = pass through

  const env = cache.getEnvironment() ?? {
    rtkAvailable: false,
    rtkPath: null,
    jcodemunchAvailable: false,
    jcodemunchCwdIndexed: false,
    jcodemunchCwdRepo: null,
    jcodemunchKnownRepos: [],
    detectedAt: Date.now(),
  };

  const resolution = resolve(match, env);

  if (resolution.action === 'allow') return null;

  // Get effective enforcement level from config
  const enforcementLevel = getEffectiveEnforcement(match.intent, config, match.enforcement);

  if (resolution.action === 'advise') {
    const prefix = enforcementLevel === 'block' ? '[BLOCK]' : '[ADVISE]';
    return [
      `${prefix} Tool Router: ${match.intent} detected`,
      `advise: use ${resolution.tool} — ${resolution.reason}`,
      enforcementLevel === 'block'
        ? `This operation is blocked by .harness-conf.yaml. Use the recommended tool instead.`
        : `Consider using the recommended tool for better efficiency.`,
    ].join('\n');
  }

  if (resolution.action === 'block') {
    return [
      `[BLOCK] Tool Router: ${match.intent} operation blocked`,
      `Reason: ${resolution.reason}`,
      `This operation is always blocked. Use the recommended alternative.`,
    ].join('\n');
  }

  return null;
}

function getEffectiveEnforcement(
  intent: string,
  config: HarnessConfig,
  ruleDefault: string,
): string {
  // Check config for intent-specific override
  const configRules = config.rules as Record<string, Record<string, unknown>>;
  const toolRouting = configRules.tool_routing;
  if (toolRouting && typeof toolRouting[intent] === 'string') {
    return toolRouting[intent] as string;
  }
  return ruleDefault;
}
