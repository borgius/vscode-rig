import type { ToolRule } from '../types.js';
import { classifyIntent } from './intent.js';

/**
 * Default routing rules — ported and evolved from damage-control-guardrails.
 *
 * Priority resolution for each rule: rtk > jcodemunch > claudeTool > fallback
 * Enforcement: block | advise | silent (configurable per-rule in .harness-conf.yaml)
 */
export function getDefaultRules(): ToolRule[] {
  return [
    // ── Text Search ──
    {
      match: (tool: string, args: Record<string, unknown>) => {
        return classifyIntent(tool, args) === 'text_search';
      },
      intent: 'text_search',
      resolutions: {
        rtk: { action: 'advise', tool: 'rtk grep', reason: 'rtk provides filtered, token-optimized grep output (60-90% savings)' },
        jcodemunch: { action: 'advise', tool: 'jcodemunch search_text or search_symbols', reason: 'jcodemunch provides typed, indexed results with summaries (80-85% token savings)' },
        claudeTool: { action: 'advise', tool: 'Grep', reason: 'Claude Grep tool is preferred over raw bash grep — structured output' },
        fallback: { action: 'allow' },
      },
      enforcement: 'block',
    },

    // ── File Discovery ──
    {
      match: (tool: string, args: Record<string, unknown>) => {
        return classifyIntent(tool, args) === 'file_discovery';
      },
      intent: 'file_discovery',
      resolutions: {
        rtk: { action: 'advise', tool: 'rtk find', reason: 'rtk provides filtered file discovery' },
        jcodemunch: { action: 'advise', tool: 'jcodemunch get_file_tree or get_repo_outline', reason: 'jcodemunch provides cached, semantic file tree with symbol counts (80% token savings)' },
        claudeTool: { action: 'advise', tool: 'Glob', reason: 'Claude Glob tool is preferred over raw bash find — targeted patterns' },
        fallback: { action: 'allow' },
      },
      enforcement: 'advise',
    },

    // ── File Read (Bash cat/head only — Claude Read tool is pass-through) ──
    {
      match: (tool: string, args: Record<string, unknown>) => {
        return tool === 'Bash' && classifyIntent(tool, args) === 'file_read';
      },
      intent: 'file_read',
      resolutions: {
        rtk: { action: 'allow' },
        jcodemunch: { action: 'allow' },
        claudeTool: { action: 'advise', tool: 'Read', reason: 'Use Claude Read tool instead of cat/head — cleaner output, no artifacts' },
        fallback: { action: 'allow' },
      },
      enforcement: 'advise',
    },

    // ── File Modify (always block destructive operations) ──
    {
      match: (tool: string, args: Record<string, unknown>) => {
        return classifyIntent(tool, args) === 'file_modify';
      },
      intent: 'file_modify',
      resolutions: {
        _: { action: 'block', reason: 'Use Claude Edit tool for file modifications — validates exact matches before applying changes. Never use sed -i or awk redirects.' },
      },
      enforcement: 'block',
    },
  ];
}

/**
 * Find the first rule whose match function accepts the given tool call.
 * Returns undefined if no rule matches (pass-through).
 */
export function findMatchingRule(
  tool: string,
  args: Record<string, unknown>,
  rules: ToolRule[],
): ToolRule | undefined {
  for (const rule of rules) {
    const matchFn = rule.match;
    if (matchFn instanceof RegExp) {
      // For bash commands, test against the command string
      if (tool === 'Bash' && typeof args.command === 'string') {
        if (matchFn.test(args.command)) return rule;
      }
    } else if (typeof matchFn === 'function') {
      if (matchFn(tool, args)) return rule;
    }
  }
  return undefined;
}
