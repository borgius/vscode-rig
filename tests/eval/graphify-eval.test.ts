import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePreToolUse } from '../../src/router/hook.js';
import { incrementMetric } from '../../src/session/metrics.js';
import { SessionCache } from '../../src/session/cache.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import { ensureGraphBuilt } from '../../src/scout/cross-repo.js';
import { ENV_PRESETS, mockRtkRewrite } from './scenarios.js';
import { scoreResult, buildReport, parseResult, type EvalResult } from './score.js';

const MIN_OVERALL_SCORE = 0.7;

interface GraphifyScenario {
  id: string;
  description: string;
  run: (envPreset: typeof ENV_PRESETS[number]) => {
    expected: { action: string; tool?: string };
    actual: { action: string; tool?: string } | null;
    score: number;
    pass: boolean;
  };
}

const GRAPHIFY_SCENARIOS: GraphifyScenario[] = [
  {
    id: 'graphify_mcp_call',
    description: 'mcp__graphify__query_graph increments graphifyCalls counter',
    run: () => {
      const metric = incrementMetric('mcp__graphify__query_graph', {});
      return {
        expected: { action: 'graphifyCalls' },
        actual: metric ? { action: metric } : null,
        score: metric === 'graphifyCalls' ? 1.0 : 0.0,
        pass: metric === 'graphifyCalls',
      };
    },
  },
  {
    id: 'graphify_mcp_god_nodes',
    description: 'mcp__graphify__god_nodes increments graphifyCalls counter',
    run: () => {
      const metric = incrementMetric('mcp__graphify__god_nodes', {});
      return {
        expected: { action: 'graphifyCalls' },
        actual: metric ? { action: metric } : null,
        score: metric === 'graphifyCalls' ? 1.0 : 0.0,
        pass: metric === 'graphifyCalls',
      };
    },
  },
  {
    id: 'graphify_no_effect_on_routing',
    description: 'cat code file routing unchanged when graphify available (rtk still wins)',
    run: (envPreset) => {
      const cache = new SessionCache();
      const config = structuredClone(DEFAULT_CONFIG);
      cache.setEnvironment(envPreset.env);

      const actual = handlePreToolUse(
        'Bash',
        { command: 'cat src/router/resolver.ts' },
        cache,
        config,
        undefined,
        { execRewrite: mockRtkRewrite },
      );
      const parsed = parseResult(actual);

      // Routing should be same as before graphify: rtk rewrite when rtk available, else advise
      const rtkAvailable = envPreset.env.rtkAvailable;
      const expected: { action: string; tool?: string } = rtkAvailable
        ? { action: 'rewrite', tool: 'rtk read' }
        : { action: 'advise', tool: 'Read' };

      const score = scoreResult(expected as any, actual);
      return {
        expected,
        actual: parsed.action === 'allow' ? null : { action: parsed.action, tool: parsed.tool },
        score,
        pass: score >= 0.5,
      };
    },
  },
  {
    id: 'graphify_unavailable_routing',
    description: 'routing unchanged when graphify unavailable',
    run: (envPreset) => {
      const cache = new SessionCache();
      const config = structuredClone(DEFAULT_CONFIG);
      cache.setEnvironment(envPreset.env);

      const actual = handlePreToolUse(
        'Bash',
        { command: 'grep -r "TODO" src/' },
        cache,
        config,
        undefined,
        { execRewrite: mockRtkRewrite },
      );
      const parsed = parseResult(actual);

      const rtkAvailable = envPreset.env.rtkAvailable;
      const expected: { action: string; tool?: string } = rtkAvailable
        ? { action: 'rewrite', tool: 'rtk grep' }
        : { action: 'advise', tool: 'Grep' };

      const score = scoreResult(expected as any, actual);
      return {
        expected,
        actual: parsed.action === 'allow' ? null : { action: parsed.action, tool: parsed.tool },
        score,
        pass: score >= 0.5,
      };
    },
  },
  {
    id: 'graphify_stats_in_cache',
    description: 'graphify stats stored in session cache after detection',
    run: (envPreset) => {
      const cache = new SessionCache();
      cache.setEnvironment(envPreset.env);
      cache.setMetricsBaseline({
        totalSaved: 0,
        capturedAt: Date.now(),
        graphifyStats: envPreset.env.graphifyAvailable
          ? { nodes: 100, edges: 250, communities: 5, extractedPct: 80, inferredPct: 15, ambiguousPct: 5 }
          : null,
      });

      const baseline = cache.getMetricsBaseline();
      const hasStats = baseline?.graphifyStats !== null && baseline?.graphifyStats !== undefined;
      const expected = envPreset.env.graphifyAvailable;

      return {
        expected: { action: expected ? 'has_stats' : 'no_stats' },
        actual: { action: hasStats ? 'has_stats' : 'no_stats' },
        score: hasStats === expected ? 1.0 : 0.0,
        pass: hasStats === expected,
      };
    },
  },
  {
    id: 'cross_repo_graph_exists',
    description: 'ensureGraphBuilt returns status ready when graph exists at target',
    run: (envPreset) => {
      const existsCheck = () => true;
      const exec = () => '';
      const result = ensureGraphBuilt('/home/user/external-project', envPreset.env, exec, existsCheck);
      const expected = envPreset.env.graphifyAvailable;

      return {
        expected: { action: expected ? 'ready' : 'skip' },
        actual: { action: result ? result.status : 'skip' },
        score: (expected ? result !== null && result.status === 'ready' : result === null) ? 1.0 : 0.0,
        pass: (expected ? result !== null && result.status === 'ready' : result === null),
      };
    },
  },
  {
    id: 'cross_repo_graph_build',
    description: 'ensureGraphBuilt triggers build for new directory',
    run: (envPreset) => {
      let buildCalled = false;
      let callCount = 0;
      const existsCheck = () => { callCount++; return callCount > 1; };
      const exec = (cmd: string) => { if (cmd.includes('graphify update')) buildCalled = true; return ''; };
      const result = ensureGraphBuilt('/home/user/new-project', envPreset.env, exec, existsCheck);

      const expected = envPreset.env.graphifyAvailable;
      return {
        expected: { action: expected ? 'built' : 'skip' },
        actual: {
          action: result
            ? (result.status === 'ready' && buildCalled ? 'built' : result.status)
            : 'skip',
        },
        score: (expected ? result !== null && result.status === 'ready' && buildCalled : result === null) ? 1.0 : 0.0,
        pass: (expected ? result !== null && result.status === 'ready' && buildCalled : result === null),
      };
    },
  },
  {
    id: 'cross_repo_routing_unchanged',
    description: 'tool routing unchanged after ensureGraphBuilt (graphify does not affect router)',
    run: (envPreset) => {
      // Run ensureGraphBuilt first (simulate scout workflow)
      ensureGraphBuilt('/home/user/external-project', envPreset.env, () => '', () => true);

      // Then check routing — should be unaffected
      const cache = new SessionCache();
      const config = structuredClone(DEFAULT_CONFIG);
      cache.setEnvironment(envPreset.env);

      const actual = handlePreToolUse(
        'Bash',
        { command: 'grep -r "pattern" src/' },
        cache,
        config,
        undefined,
        { execRewrite: mockRtkRewrite },
      );
      const parsed = parseResult(actual);

      const rtkAvailable = envPreset.env.rtkAvailable;
      const expected: { action: string; tool?: string } = rtkAvailable
        ? { action: 'rewrite', tool: 'rtk grep' }
        : { action: 'advise', tool: 'Grep' };

      const score = scoreResult(expected as any, actual);
      return {
        expected,
        actual: parsed.action === 'allow' ? null : { action: parsed.action, tool: parsed.tool },
        score,
        pass: score >= 0.5,
      };
    },
  },
  {
    id: 'env_preset_graphify_consistency',
    description: 'env presets with graphifyAvailable=true must have graphifyGraphPath set',
    run: (envPreset) => {
      const { graphifyAvailable, graphifyGraphPath } = envPreset.env;
      const consistent = graphifyAvailable ? graphifyGraphPath !== null : true;

      return {
        expected: { action: 'consistent' },
        actual: { action: consistent ? 'consistent' : `available=${graphifyAvailable},path=${graphifyGraphPath}` },
        score: consistent ? 1.0 : 0.0,
        pass: consistent,
      };
    },
  },
];

// Scenarios that check file contents (run once, not per env preset)
const TEMPLATE_SCENARIOS: GraphifyScenario[] = [
  {
    id: 'scout_template_lists_graphify_tools',
    description: 'scout agent template includes all graphify MCP tools in tools field',
    run: () => {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const templatePath = resolve(__dirname, '..', '..', 'templates', 'agents', 'scout.md');
      const content = readFileSync(templatePath, 'utf-8');
      const toolsMatch = content.match(/^tools:\s*"(.+)"/m);
      const toolsField = toolsMatch ? toolsMatch[1] : '';

      const requiredTools = [
        'mcp__graphify__query_graph',
        'mcp__graphify__get_community',
        'mcp__graphify__god_nodes',
        'mcp__graphify__shortest_path',
        'mcp__graphify__graph_stats',
      ];
      const missing = requiredTools.filter(t => !toolsField.includes(t));

      return {
        expected: { action: 'all_graphify_tools_present' },
        actual: { action: missing.length === 0 ? 'all_present' : `missing:${missing.join(',')}` },
        score: missing.length === 0 ? 1.0 : (requiredTools.length - missing.length) / requiredTools.length,
        pass: missing.length === 0,
      };
    },
  },
  {
    id: 'scout_template_graphifyy_fallback',
    description: 'scout agent template mentions graphifyy as fallback CLI check',
    run: () => {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const templatePath = resolve(__dirname, '..', '..', 'templates', 'agents', 'scout.md');
      const content = readFileSync(templatePath, 'utf-8');

      const hasGraphifyy = content.includes('graphifyy');

      return {
        expected: { action: 'graphifyy_mentioned' },
        actual: { action: hasGraphifyy ? 'graphifyy_mentioned' : 'graphifyy_absent' },
        score: hasGraphifyy ? 1.0 : 0.0,
        pass: hasGraphifyy,
      };
    },
  },
  {
    id: 'scout_template_step_2_5_graphify',
    description: 'scout agent template Step 2.5 instructs agent to call graphify tools',
    run: () => {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const templatePath = resolve(__dirname, '..', '..', 'templates', 'agents', 'scout.md');
      const content = readFileSync(templatePath, 'utf-8');

      // Step 2.5 should reference specific graphify tool calls
      const hasGodNodes = content.includes('god_nodes');
      const hasCommunity = content.includes('get_community');
      const hasShortestPath = content.includes('shortest_path');

      const passed = hasGodNodes && hasCommunity && hasShortestPath;

      return {
        expected: { action: 'step_2_5_references_tools' },
        actual: { action: passed ? 'all_referenced' : 'missing_references' },
        score: passed ? 1.0 : 0.0,
        pass: passed,
      };
    },
  },
  {
    id: 'session_start_gates_graphify_on_env',
    description: 'session-start code gates graphify tool emissions on env.graphifyAvailable',
    run: () => {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const startPath = resolve(__dirname, '..', '..', 'src', 'session', 'start.ts');
      const content = readFileSync(startPath, 'utf-8');

      const hasGraphifyGate = content.includes('if (env.graphifyAvailable)');
      const hasQueryGraph = content.includes('mcp__graphify__query_graph');
      const hasGodNodes = content.includes('mcp__graphify__god_nodes');
      const hasCommunity = content.includes('mcp__graphify__get_community');
      const hasShortestPath = content.includes('mcp__graphify__shortest_path');

      const allPresent = hasGraphifyGate && hasQueryGraph && hasGodNodes && hasCommunity && hasShortestPath;

      return {
        expected: { action: 'code_correct' },
        actual: { action: allPresent ? 'code_correct' : 'code_missing_references' },
        score: allPresent ? 1.0 : 0.0,
        pass: allPresent,
      };
    },
  },
];

describe('Context Eval: graphify integration', () => {
  const results: EvalResult[] = [];

  // Env-dependent scenarios: run across all presets
  for (const scenario of GRAPHIFY_SCENARIOS) {
    for (const envPreset of ENV_PRESETS) {
      const testId = `${scenario.id} [${envPreset.name}]`;

      it(testId, () => {
        const result = scenario.run(envPreset);

        results.push({
          scenarioId: scenario.id,
          environment: envPreset.name,
          category: 'graphify',
          expected: result.expected as any,
          actual: result.actual,
          score: result.score,
          pass: result.pass,
        });

        if (!result.pass) {
          const expectedStr = `${result.expected.action}${result.expected.tool ? ` → ${result.expected.tool}` : ''}`;
          const actualStr = result.actual
            ? `${result.actual.action}${result.actual.tool ? ` → ${result.actual.tool}` : ''}`
            : 'allow (no routing)';
          expect.fail(
            `Graphify eval mismatch [${envPreset.name}]:\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`,
          );
        }

        expect(result.pass).toBe(true);
      });
    }
  }

  // Template/code scenarios: run once
  for (const scenario of TEMPLATE_SCENARIOS) {
    it(scenario.id, () => {
      const result = scenario.run(ENV_PRESETS[0]); // preset unused but required by type

      results.push({
        scenarioId: scenario.id,
        environment: 'template',
        category: 'graphify',
        expected: result.expected as any,
        actual: result.actual,
        score: result.score,
        pass: result.pass,
      });

      if (!result.pass) {
        expect.fail(`Graphify eval mismatch: ${scenario.description}\n  Expected: ${JSON.stringify(result.expected)}\n  Actual:   ${JSON.stringify(result.actual)}`);
      }

      expect(result.pass).toBe(true);
    });
  }

  it('overall score meets minimum threshold', () => {
    const report = buildReport(results);
    if (report.overallScore < MIN_OVERALL_SCORE) {
      console.error('\n=== Graphify Eval Report ===');
      console.error(`Overall score: ${report.overallScore.toFixed(2)} (minimum: ${MIN_OVERALL_SCORE})`);
      console.error(`Pass: ${report.passCount}/${report.totalCases}`);
      if (report.failures.length > 0) {
        console.error('\nFailures:');
        for (const f of report.failures) {
          console.error(`  ${f.scenarioId} [${f.environment}]: expected ${f.expected}, got ${f.actual}`);
        }
      }
    }
    expect(report.overallScore).toBeGreaterThanOrEqual(MIN_OVERALL_SCORE);
  });
});
