# Plan: Graphify Integration

Integrate graphify as rig's relationship/graph layer alongside jcodemunch.
Graphify provides knowledge graph traversal (communities, paths, god nodes);
jcodemunch provides symbol search (BM25, embeddings). They're complementary,
not competing.

Design source: brain+ session (2026-04-20).

## Constitutional Rules for This Plan

- Every source file change requires corresponding test changes
- Show command output before claiming done
- Full-loop assertions: verify primary + second-order effects

## Mock Policy

- Unit tests: use injectable `ExecFn` for environment detection (existing pattern)
- Unit tests: use `vi.mock('node:child_process')` for session-start (existing pattern)
- No mocks for config, types, or mapper pure functions
- Graphify MCP responses mocked as string returns from `callGraphifyMcpTool`

---

### Task 1: Add graphify fields to types

**Files:** `src/types.ts`, `tests/types.test.ts`
**Test strategy:** Add type guard test for `isEnvironment` with graphify fields
**Mock check:** None — pure type guard tests

- [ ] Add `graphifyAvailable: boolean` and `graphifyGraphPath: string | null` to `Environment` interface
- [ ] Add `graphifyStats` to `MetricsBaseline`:

  ```
  graphifyStats?: {
    nodes: number;
    edges: number;
    communities: number;
    extractedPct: number;
    inferredPct: number;
    ambiguousPct: number;
  } | null;
  ```

- [ ] Add `GraphContext` interface:

  ```
  GraphContext {
    godNodes: { label: string; degree: number }[];
    communities: { id: number; label: string; nodeCount: number }[];
    stats: { nodes: number; edges: number; communities: number };
  }
  ```

- [ ] Add `graphifyCalls: number` to `SessionCacheFile.metricCounters`
- [ ] Update `isEnvironment` type guard to validate `graphifyAvailable` (boolean)
- [ ] Add `isGraphContext` type guard
- [ ] **RED**: Write failing test — `isEnvironment` rejects object missing `graphifyAvailable`
- [ ] **RED**: Write failing test — `isGraphContext` validates shape
- [ ] **GREEN**: Implement type changes
- [ ] **GREEN**: Update type guard
- [ ] Verify: `npx vitest run tests/types.test.ts` passes
- [ ] Commit

### Task 2: Add graphify environment detection

**Files:** `src/session/environment.ts`, `tests/session/environment.test.ts`
**Test strategy:** Unit tests with injectable `ExecFn` (Pattern A from test map)
**Mock check:** None — injectable `ExecFn`

- [ ] **RED**: Write failing test — `detectGraphify` returns `available: true, graphPath: 'graphify-out/graph.json'` when `which graphify` succeeds and graph.json exists
- [ ] **RED**: Write failing test — `detectGraphify` returns `available: false` when `which graphify` fails
- [ ] **RED**: Write failing test — `detectGraphify` returns `available: false` when graphify CLI exists but graph.json doesn't exist
- [ ] **RED**: Write failing test — `detectEnvironment` result includes `graphifyAvailable` field
- [ ] **GREEN**: Add `detectGraphify(cwd, exec)` function — checks `which graphify` and `existsSync('graphify-out/graph.json')`
- [ ] **GREEN**: Wire into `detectEnvironment()` return, populating `graphifyAvailable` and `graphifyGraphPath`
- [ ] Verify: `npx vitest run tests/session/environment.test.ts` passes
- [ ] Commit

### Task 3: Add graphify stats capture to metrics

**Files:** `src/session/metrics.ts`, `tests/session/metrics.test.ts`
**Test strategy:** Unit tests with injectable `ExecFn`
**Mock check:** None — injectable `ExecFn`

- [ ] Add `callGraphifyMcpTool(exec, toolName, args)` — mirrors `callJcodemunchMcpTool` pattern but targets graphify MCP server via `which graphify` to find the binary, then JSON-RPC stdio
- [ ] Add `captureGraphifyStats(exec)` — calls graphify `graph_stats` MCP tool, parses response into `MetricsBaseline.graphifyStats`
- [ ] **RED**: Write failing test — `captureGraphifyStats` returns null when graphify not available (exec throws)
- [ ] **RED**: Write failing test — `captureGraphifyStats` parses valid graph_stats response into correct shape
- [ ] **RED**: Write failing test — `captureGraphifyStats` handles malformed JSON gracefully (returns null)
- [ ] **RED**: Write failing test — `incrementMetric` returns `'graphifyCalls'` for `mcp__graphify__*` tool names
- [ ] **GREEN**: Implement `callGraphifyMcpTool`
- [ ] **GREEN**: Implement `captureGraphifyStats`
- [ ] **GREEN**: Update `incrementMetric` to track `mcp__graphify__*` calls
- [ ] Verify: `npx vitest run tests/session/metrics.test.ts` passes
- [ ] Commit

### Task 4: Emit graphify stats in session-start

**Files:** `src/session/start.ts`, `tests/session/start.test.ts`
**Test strategy:** Unit tests with `vi.mock('node:child_process')` (Pattern B from test map)
**Mock check:** None — mock `execSync` only

- [ ] **RED**: Write failing test — session-start output includes `graphify: N nodes, M edges, K communities, X% EXTRACTED` when graphify available and graph.json exists
- [ ] **RED**: Write failing test — session-start output does NOT include graphify line when graphify not available
- [ ] **RED**: Write failing test — session-start output includes graphify MCP tools in subagent delegation instructions when available
- [ ] **RED**: Write failing test — session-start warning emitted when graphify not installed (one-time, like rtk/jcodemunch warnings)
- [ ] **GREEN**: Wire `detectGraphify` result into `handleSessionStart` — add `graphifyAvailable` and `graphifyGraphPath` to detected environment
- [ ] **GREEN**: If graphify available, call `captureGraphifyStats` and emit summary line
- [ ] **GREEN**: If graphify available, add graphify MCP tools to subagent delegation instructions:

  ```
  - mcp__graphify__query_graph for relationship context
  - mcp__graphify__god_nodes for core abstractions
  - mcp__graphify__get_community for module clustering
  - mcp__graphify__shortest_path for dependency paths
  - mcp__graphify__graph_stats for graph statistics
  ```

- [ ] **GREEN**: Add one-time warning if graphify not installed (after rtk/jcodemunch warning)
- [ ] Verify: `npx vitest run tests/session/start.test.ts` passes
- [ ] Commit

### Task 5: Add graphify context builder to scout mapper

**Files:** `src/scout/mapper.ts`, `tests/scout/mapper.test.ts`
**Test strategy:** Pure function unit tests (Pattern from existing mapper tests)
**Mock check:** None — pure functions

- [ ] Add `RawGraphifyStats` interface for parsed graph_stats response
- [ ] Add `RawGodNode` interface for parsed god_nodes response
- [ ] Add `buildGraphContext(statsResult, godNodesResult): GraphContext` formatter
- [ ] **RED**: Write failing test — `buildGraphContext` with valid stats returns correct `GraphContext`
- [ ] **RED**: Write failing test — `buildGraphContext` with empty god nodes returns empty array
- [ ] **RED**: Write failing test — `buildGraphContext` with null stats returns null
- [ ] **GREEN**: Implement `buildGraphContext`
- [ ] Verify: `npx vitest run tests/scout/mapper.test.ts` passes
- [ ] Commit

### Task 6: Update scout agent template with graphify step

**Files:** `templates/agents/scout.md`, `tests/scout/agent-definition.test.ts`
**Test strategy:** Template structure assertions (existing pattern)
**Mock check:** None

- [ ] **RED**: Write failing test — scout template tools list includes graphify MCP tools
- [ ] **RED**: Write failing test — scout template includes Step 2.5 (graphify relationship queries)
- [ ] **GREEN**: Add graphify MCP tools to agent `tools` frontmatter:
  `mcp__graphify__query_graph,mcp__graphify__get_community,mcp__graphify__god_nodes,mcp__graphify__shortest_path,mcp__graphify__graph_stats`
- [ ] **GREEN**: Add Step 2.5 between existing Steps 2 and 3:

  ```
  ### Step 2.5: Map relationships (if graphify available)

  If graphify is installed and `graphify-out/graph.json` exists:

  - Call `god_nodes(top_n=10)` to identify core abstractions
  - Call `get_community(community_id)` for the top 3 communities by size
  - Call `shortest_path(source, target)` when the user's query involves
    understanding how two components connect

  Skip this step entirely if graphify is not available.
  ```

- [ ] **GREEN**: Update Step 5 output format to include `GraphContext` section:

  ```
  ### GraphContext (if graphify available)
  - God nodes: [top 5 by degree]
  - Communities: [top 3 by size, with labels]
  - Stats: [nodes/edges/communities]
  ```

- [ ] Verify: `npx vitest run tests/scout/agent-definition.test.ts` passes
- [ ] Commit

### Task 7: Update /savings skill with graphify stats

**Files:** `templates/skills/savings/SKILL.md`, `src/session/metrics.ts`, `tests/session/metrics.test.ts`
**Test strategy:** Unit tests for `formatSavingsReport` with graphify data
**Mock check:** None — pure function

- [ ] Add `GraphifyStats` parameter to `formatSavingsReport` signature
- [ ] **RED**: Write failing test — `formatSavingsReport` includes graphify section when stats provided
- [ ] **RED**: Write failing test — `formatSavingsReport` omits graphify section when stats null
- [ ] **RED**: Write failing test — `formatSavingsReport` graphify section shows nodes/edges/communities and confidence breakdown
- [ ] **GREEN**: Add graphify section to `formatSavingsReport`:

  ```
  graphify: 450 nodes, 1200 edges, 8 communities (92% EXTRACTED, 6% INFERRED, 2% AMBIGUOUS)
  ```

- [ ] **GREEN**: Update savings SKILL.md procedure:
  - Add step 5.5: If graphify available, call `mcp__graphify__graph_stats` and include in report
  - Update output format to show graphify line
- [ ] Verify: `npx vitest run tests/session/metrics.test.ts` passes
- [ ] Commit

### Task 8: Add graphify eval scenarios

**Files:** `tests/eval/scenarios.ts`, `tests/eval/graphify-eval.test.ts` (new)
**Test strategy:** Scenario-driven eval following existing pattern (scoreResult + buildReport)
**Mock check:** None — injectable `existsCheck` and `execRewrite`

This task tests that graphify detection doesn't break existing routing and that
session-state routing works correctly with graphify present.

- [ ] Add `graphify` field to `EnvPreset` interface and `ENV_PRESETS`:
  - `full` preset: add `graphifyAvailable: true, graphifyGraphPath: 'graphify-out/graph.json'`
  - `rtk_only` preset: add `graphifyAvailable: false, graphifyGraphPath: null`
  - `jm_only` preset: add `graphifyAvailable: true, graphifyGraphPath: 'graphify-out/graph.json'`
  - `jm_not_indexed` preset: add `graphifyAvailable: false, graphifyGraphPath: null`
  - `neither` preset: add `graphifyAvailable: false, graphifyGraphPath: null`
- [ ] Add graphify-specific eval scenarios (category: `graphify`):
  - `graphify_session_start` — verify session-start output includes graphify line when available (tests session-state behavior, not routing)
  - `graphify_mcp_call` — verify `mcp__graphify__query_graph` increments graphifyCalls counter
  - `graphify_no_effect_on_routing` — verify existing routing (cat → rtk read) unchanged when graphify available
  - `graphify_unavailable_routing` — verify existing routing unchanged when graphify unavailable
  - `graphify_stats_in_cache` — verify graphify stats stored in session cache after detection
- [ ] Create `tests/eval/graphify-eval.test.ts` — runs graphify scenarios with graphify-aware env presets, uses `scoreResult` + `buildReport`
- [ ] Verify: `npx vitest run tests/eval/graphify-eval.test.ts` passes
- [ ] Commit

### Task 9: Update session-state eval with graphify presets

**Files:** `tests/eval/session-state-eval.test.ts`
**Test strategy:** Extend existing scenarios with graphify env variations
**Mock check:** None

- [ ] Add `graphifyAvailable` and `graphifyGraphPath` to all `NO_TOOLS_ENV` usages in session-state eval
- [ ] Add new scenario: `state_graphify_available` — verifies graphify detection stored in cache correctly affects session-start output
- [ ] Add new scenario: `state_graphify_with_python` — both graphify and Python env cached, both features work independently
- [ ] Verify: `npx vitest run tests/eval/session-state-eval.test.ts` passes
- [ ] Commit

### Task 10: Update init command for graphify

**Files:** `src/cli/init.ts`, `tests/cli/init.test.ts`
**Test strategy:** Integration-style init tests (existing pattern)
**Mock check:** None — temp dir based

- [ ] Verify `rig init` doesn't need changes — graphify detection is automatic (not config-driven)
- [ ] Verify settings.json permissions don't need graphify entries — graphify MCP tools are called by the agent, not by hooks
- [ ] If no changes needed, add a test asserting graphify is not in the init output (detection is runtime, not install-time)
- [ ] Verify: `npx vitest run tests/cli/init.test.ts` passes
- [ ] Commit

### Task 11: Update documentation

**Files:** `docs/architecture.md`, `docs/getting-started.md`, `README.md`
**Test strategy:** Manual review — docs don't have automated tests
**Mock check:** N/A

- [ ] Update `docs/architecture.md`:
  - Add graphify to Layer 4 (Scout Agent) description — "scout queries graphify for relationship traversal (communities, paths, god nodes) alongside jcodemunch for symbol search"
  - Add graphify to environment detection section
  - Add graphify to session-start data flow diagram
  - Add `GraphContext` to Key Types section
- [ ] Update `docs/getting-started.md`:
  - Add graphify to "Strongly recommended" section alongside rtk and jcodemunch
  - Add graphify to "What gets installed" table (note: graphify uses its own git hooks, not rig hooks)
  - Add graphify to "How the hooks work / Session Start" section — describe graphify stats emission
  - Add note: graphify rebuilds via its own post-commit/post-checkout hooks; rig only detects the existing graph
- [ ] Update `README.md`:
  - Add graphify to "Requirements" section (strongly recommended, alongside jcodemunch)
  - Add graphify to architecture diagram (Layer 4 alongside jcodemunch)
  - Add graphify to "Related projects" section
  - Update skill chain table — mention graphify context in debug+ and brain+
- [ ] Verify: `npm run lint` passes (tsc --noEmit)
- [ ] Commit

---

## Evidence Criteria

- `npx vitest run` — all tests pass (290+ existing + ~30 new)
- `npm run build` — TypeScript compiles cleanly
- `npx tsc --noEmit` — no type errors
- `npx vitest run tests/eval/` — all eval tests pass including new graphify eval
- Coverage gate: 80% statements/functions/lines, 75% branches maintained

## Task Dependency Order

```
Task 1 (types) ──┬── Task 2 (env detect) ──── Task 4 (session-start)
                 ├── Task 3 (metrics) ──────── Task 4
                 ├── Task 5 (mapper) ───────── Task 6 (scout template)
                 └── Task 7 (savings)
Task 1 ──────────── Task 8 (graphify eval)
Task 8 ──────────── Task 9 (session-state eval update)
Task 10 (init) ─── no deps (likely no-op)
Task 11 (docs) ─── after all code tasks
```

Tasks 2, 3, 5 can run in parallel after Task 1.
Tasks 8, 9 can run in parallel after Task 1.
Tasks 6, 7 can run in parallel after their respective deps.
Task 11 runs last.
