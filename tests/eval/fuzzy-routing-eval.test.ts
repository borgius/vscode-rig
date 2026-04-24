import { describe, it, expect } from 'vitest';
import { classifyIntent, isCompoundCommand } from '../../src/router/intent.js';
import { handlePreToolUse } from '../../src/router/hook.js';
import { SessionCache } from '../../src/session/cache.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import { ENV_PRESETS, mockRtkRewrite } from './scenarios.js';
import { parseResult } from './score.js';
import type { IntentType } from '../../src/router/intent.js';

// ── Methodology ──
//
// Tests routing reliability under prompt perturbation, inspired by:
// - ToolFuzz (arxiv 2503.04479): automated fuzzing of tool documentation
// - ReliabilityBench (arxiv 2601.06112): agent reliability under production conditions
// - Prompt perturbation testing: systematic modification to measure robustness
//
// Measures two dimensions:
// 1. Intent consistency — does classifyIntent produce the same result for
//    semantically equivalent commands with increasing syntactic variation?
// 2. Routing determinism — does handlePreToolUse produce consistent routing
//    decisions across command variants at the same fuzziness level?
//
// Fuzziness levels:
//   L0 (canonical)  — standard command form
//   L1 (formatting) — whitespace, flag variations, quoting changes
//   L2 (synonym)    — different tool for same semantic intent
//   L3 (oblique)    — unusual syntax, indirect phrasing, wrapped forms

type FuzzLevel = 0 | 1 | 2 | 3;

const FUZZ_LABELS: Record<FuzzLevel, string> = {
  0: 'canonical',
  1: 'formatting',
  2: 'synonym',
  3: 'oblique',
};

interface FuzzyVariant {
  level: FuzzLevel;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  /** Override expected routing action for 'full' env preset. Defaults to group default. */
  expectedRouting?: string;
  /** If true, skip this variant from routing test (compound commands bypass routing). */
  skipRouting?: boolean;
}

interface FuzzyGroup {
  id: string;
  expectedIntent: IntentType;
  defaultRouting: string;
  variants: FuzzyVariant[];
}

// ── Command variant groups ──
//
// Each group targets one intent with variants at increasing fuzziness.
// expectedRouting overrides document edge cases where rtk can't rewrite
// the command form (e.g., sed-as-search, fd without mock handler).

const GROUPS: FuzzyGroup[] = [
  {
    id: 'file_read',
    expectedIntent: 'file_read',
    defaultRouting: 'rewrite',
    variants: [
      { level: 0, tool: 'Bash', args: { command: 'cat src/router/resolver.ts' }, description: 'cat code file' },
      { level: 0, tool: 'Bash', args: { command: 'head -20 package.json' }, description: 'head with line count' },
      { level: 0, tool: 'Bash', args: { command: 'tail -30 src/config.ts' }, description: 'tail with line count' },
      { level: 1, tool: 'Bash', args: { command: '  cat  src/router/resolver.ts' }, description: 'cat with extra whitespace' },
      { level: 1, tool: 'Bash', args: { command: 'cat -n src/router/resolver.ts' }, description: 'cat with -n flag' },
      { level: 1, tool: 'Bash', args: { command: 'head -n 20 package.json' }, description: 'head with -n flag' },
      { level: 1, tool: 'Bash', args: { command: 'tail -n 30 src/config.ts' }, description: 'tail with -n flag' },
      { level: 2, tool: 'Bash', args: { command: 'cat ./src/router/resolver.ts' }, description: 'cat with ./ path prefix' },
      { level: 2, tool: 'Bash', args: { command: 'head --lines=20 package.json' }, description: 'head with long-form flag' },
      { level: 3, tool: 'Bash', args: { command: 'tail -f /var/log/app.log' }, description: 'tail -f streaming' },
    ],
  },
  {
    id: 'text_search',
    expectedIntent: 'text_search',
    defaultRouting: 'rewrite',
    variants: [
      { level: 0, tool: 'Bash', args: { command: 'grep -r "TODO" src/' }, description: 'grep recursive' },
      { level: 0, tool: 'Bash', args: { command: 'rg "export.*function" .' }, description: 'rg basic search' },
      { level: 1, tool: 'Bash', args: { command: 'grep -rn "TODO" src/' }, description: 'grep with line numbers' },
      { level: 1, tool: 'Bash', args: { command: 'grep -ri "todo" src/' }, description: 'grep case insensitive' },
      { level: 1, tool: 'Bash', args: { command: 'rg -i "todo" src/' }, description: 'rg case insensitive' },
      { level: 1, tool: 'Bash', args: { command: 'grep -r --include="*.ts" "TODO" src/' }, description: 'grep with file filter' },
      { level: 2, tool: 'Bash', args: { command: 'rg --type ts "export function"' }, description: 'rg with type filter' },
      { level: 2, tool: 'Bash', args: { command: 'grep -E "TODO|FIXME" src/' }, description: 'grep extended regex' },
      // sed-as-search: intent is text_search but rtk has no sed rewrite rule
      { level: 3, tool: 'Bash', args: { command: 'sed -n "/TODO/p" src/router/resolver.ts' }, description: 'sed as search', expectedRouting: 'advise' },
    ],
  },
  {
    id: 'file_discovery',
    expectedIntent: 'file_discovery',
    defaultRouting: 'rewrite',
    variants: [
      { level: 0, tool: 'Bash', args: { command: 'find . -name "*.ts"' }, description: 'find by name' },
      { level: 1, tool: 'Bash', args: { command: 'find . -type f -name "*.ts"' }, description: 'find with type filter' },
      { level: 1, tool: 'Bash', args: { command: 'find . -name "*.ts" -not -path "*/node_modules/*"' }, description: 'find with exclusion' },
      { level: 2, tool: 'Bash', args: { command: 'fd "\\.ts$"' }, description: 'fd instead of find' },
      { level: 2, tool: 'Bash', args: { command: 'find ./src -name "*.test.ts"' }, description: 'find in subdirectory' },
      // find piped to head: compound command, routing bypasses advisory
      { level: 3, tool: 'Bash', args: { command: 'find . -name "*.ts" | head -20' }, description: 'find piped to head', skipRouting: true },
    ],
  },
  {
    id: 'file_modify',
    expectedIntent: 'file_modify',
    defaultRouting: 'block',
    variants: [
      { level: 0, tool: 'Bash', args: { command: "sed -i 's/foo/bar/' file.ts" }, description: 'sed -i basic' },
      { level: 1, tool: 'Bash', args: { command: "sed --in-place 's/foo/bar/' file.ts" }, description: 'sed with long flag' },
      { level: 1, tool: 'Bash', args: { command: "sed -i.bak 's/foo/bar/' file.ts" }, description: 'sed with backup suffix' },
      { level: 1, tool: 'Bash', args: { command: "sed -i -e 's/foo/bar/' -e 's/baz/qux/' file.ts" }, description: 'sed with multiple expressions' },
      { level: 2, tool: 'Bash', args: { command: "awk '{print $1 > \"output.txt\"}' input.txt" }, description: 'awk with redirect' },
      { level: 3, tool: 'Bash', args: { command: "sed -i 's|foo|bar|g' file.ts" }, description: 'sed with alternate delimiter' },
    ],
  },
  {
    id: 'pass_through',
    expectedIntent: 'pass_through',
    defaultRouting: 'allow',
    variants: [
      { level: 0, tool: 'Bash', args: { command: 'npm test' }, description: 'npm test' },
      // git status: pass_through intent but rtk transparently rewrites git commands
      { level: 0, tool: 'Bash', args: { command: 'git status' }, description: 'git status', expectedRouting: 'rewrite' },
      { level: 1, tool: 'Bash', args: { command: 'npm run build' }, description: 'npm run script' },
      { level: 1, tool: 'Bash', args: { command: 'docker compose up -d' }, description: 'docker command' },
      { level: 2, tool: 'Bash', args: { command: 'pnpm test' }, description: 'pnpm instead of npm' },
      { level: 2, tool: 'Bash', args: { command: 'yarn build' }, description: 'yarn instead of npm' },
      { level: 3, tool: 'Bash', args: { command: 'NODE_ENV=test npm test' }, description: 'env var prefix' },
      { level: 3, tool: 'Bash', args: { command: 'echo "hello world"' }, description: 'echo command' },
    ],
  },
];

// ── Results accumulator ──

interface FuzzyEvalResult {
  groupId: string;
  variantDesc: string;
  level: FuzzLevel;
  dimension: 'intent' | 'routing';
  expected: string;
  actual: string;
  pass: boolean;
}

const results: FuzzyEvalResult[] = [];

// ── Phase 1: Intent classification reliability ──

describe('Fuzzy Routing Eval', () => {
  describe('Phase 1: Intent classification reliability', () => {
    for (const group of GROUPS) {
      describe(`intent: ${group.id}`, () => {
        for (const v of group.variants) {
          it(`L${v.level} ${v.description}`, () => {
            const actual = classifyIntent(v.tool, v.args);
            const pass = actual === group.expectedIntent;

            results.push({
              groupId: group.id,
              variantDesc: v.description,
              level: v.level,
              dimension: 'intent',
              expected: group.expectedIntent,
              actual,
              pass,
            });

            if (!pass) {
              expect.fail(
                `Intent mismatch for "${v.description}":\n  Expected: ${group.expectedIntent}\n  Actual:   ${actual}\n  Command:  ${JSON.stringify(v.args)}`,
              );
            }
            expect(actual).toBe(group.expectedIntent);
          });
        }
      });
    }
  });

  // ── Phase 2: Routing determinism under perturbation ──
  //
  // Uses 'full' env preset (rtk + jcodemunch + graphify).
  // Compound commands (pipes, &&, ||, ;) are excluded — they intentionally
  // bypass advisory routing (design choice, not a reliability failure).

  describe('Phase 2: Routing determinism (full env)', () => {
    const fullPreset = ENV_PRESETS.find(p => p.name === 'full')!;

    for (const group of GROUPS) {
      describe(`routing: ${group.id}`, () => {
        for (const v of group.variants) {
          if (v.skipRouting) continue;

          const command = v.args.command as string;
          if (typeof command === 'string' && isCompoundCommand(command)) continue;

          it(`L${v.level} ${v.description}`, () => {
            const cache = new SessionCache();
            const config = structuredClone(DEFAULT_CONFIG);
            cache.setEnvironment(fullPreset.env);

            const result = handlePreToolUse(
              v.tool,
              v.args,
              cache,
              config,
              undefined,
              { execRewrite: mockRtkRewrite },
            );
            const parsed = parseResult(result);
            const expected = v.expectedRouting ?? group.defaultRouting;
            const pass = parsed.action === expected;

            results.push({
              groupId: group.id,
              variantDesc: v.description,
              level: v.level,
              dimension: 'routing',
              expected,
              actual: parsed.action,
              pass,
            });

            if (!pass) {
              expect.fail(
                `Routing mismatch for "${v.description}":\n  Expected: ${expected}\n  Actual:   ${parsed.action}\n  Command:  ${JSON.stringify(v.args)}`,
              );
            }
            expect(parsed.action).toBe(expected);
          });
        }
      });
    }
  });

  // ── Phase 3: Reliability report ──
  //
  // Aggregates results by fuzziness level and asserts minimum thresholds.
  // Levels 0-2 must be perfect (1.0); level 3 (oblique) allows 80%.

  describe('Phase 3: Reliability report', () => {
    it('meets minimum reliability thresholds per fuzziness level', () => {
      // [passed, total] per level per dimension
      const byLevel: Record<FuzzLevel, { intent: [number, number]; routing: [number, number] }> = {
        0: { intent: [0, 0], routing: [0, 0] },
        1: { intent: [0, 0], routing: [0, 0] },
        2: { intent: [0, 0], routing: [0, 0] },
        3: { intent: [0, 0], routing: [0, 0] },
      };

      for (const r of results) {
        const bucket = byLevel[r.level][r.dimension];
        bucket[1]++;
        if (r.pass) bucket[0]++;
      }

      const rate = (passed: number, total: number) => total > 0 ? passed / total : 1;

      const lines: string[] = ['\n=== Fuzzy Routing Reliability Report ===', ''];

      for (const level of [0, 1, 2, 3] as FuzzLevel[]) {
        const s = byLevel[level];
        lines.push(
          `  Level ${level} (${FUZZ_LABELS[level]}): ` +
          `intent ${s.intent[0]}/${s.intent[1]} (${(rate(...s.intent) * 100).toFixed(0)}%), ` +
          `routing ${s.routing[0]}/${s.routing[1]} (${(rate(...s.routing) * 100).toFixed(0)}%)`,
        );
      }

      const failures = results.filter(r => !r.pass);
      if (failures.length > 0) {
        lines.push('', 'Failures:');
        for (const f of failures) {
          lines.push(
            `  [L${f.level}] ${f.groupId}/${f.dimension}: ${f.variantDesc} — expected ${f.expected}, got ${f.actual}`,
          );
        }
      }

      const THRESHOLDS: Record<FuzzLevel, number> = { 0: 1.0, 1: 1.0, 2: 1.0, 3: 0.8 };
      const MIN_OVERALL = 0.95;

      const violations: string[] = [];

      for (const level of [0, 1, 2, 3] as FuzzLevel[]) {
        const s = byLevel[level];
        for (const dim of ['intent', 'routing'] as const) {
          const [passed, total] = s[dim];
          const r = rate(passed, total);
          if (total > 0 && r < THRESHOLDS[level]) {
            violations.push(
              `Level ${level} ${dim}: ${(r * 100).toFixed(0)}% < ${(THRESHOLDS[level] * 100).toFixed(0)}%`,
            );
          }
        }
      }

      const overallRate = results.length > 0 ? results.filter(r => r.pass).length / results.length : 1;
      if (overallRate < MIN_OVERALL) {
        violations.push(`Overall: ${(overallRate * 100).toFixed(1)}% < ${(MIN_OVERALL * 100).toFixed(0)}%`);
      }

      if (violations.length > 0) {
        console.error(lines.join('\n'));
        expect.fail(`Reliability thresholds not met:\n  ${violations.join('\n  ')}`);
      }

      console.log(lines.join('\n'));
      expect(violations).toHaveLength(0);
    });
  });
});
