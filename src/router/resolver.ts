import type { ToolRule, Environment, Resolution, EnvResolution } from '../types.js';

const ALLOW: Resolution = { action: 'allow' };

function normalizeResolution(raw: EnvResolution | undefined): Resolution | null {
  if (!raw) return null;
  if (raw === 'allow') return ALLOW;
  return raw as Resolution;
}

/**
 * Resolve the best tool for a matched rule given the current environment.
 *
 * Priority: wildcard (_) > rtk > jcodemunch > copilotTool > fallback > allow
 *
 * Wildcard resolutions (keyed by `_`) always win regardless of environment state.
 * This is used for hard blocks like sed -i that should never be allowed.
 */
export function resolve(rule: ToolRule, env: Environment): Resolution {
  const { resolutions } = rule;

  // Wildcard always wins
  const wildcard = normalizeResolution(resolutions._);
  if (wildcard) return wildcard;

  // Environment-aware priority chain
  if (env.rtkAvailable) {
    const rtk = normalizeResolution(resolutions.rtk);
    if (rtk) return rtk;
  }

  if (env.jcodemunchAvailable && env.jcodemunchCwdIndexed) {
    const jm = normalizeResolution(resolutions.jcodemunch);
    if (jm) return jm;
  }

  // Copilot built-in tools
  const copilot = normalizeResolution(resolutions.copilotTool);
  if (copilot) return copilot;

  // Fallback
  const fallback = normalizeResolution(resolutions.fallback);
  if (fallback) return fallback;

  // Default: allow
  return ALLOW;
}
