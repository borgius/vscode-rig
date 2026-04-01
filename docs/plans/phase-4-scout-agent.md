# Phase 4: Context Engineering - Scout Agent

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scout agent and its supporting infrastructure. The scout agent runs before implementation to harvest context from the codebase using jcodemunch and rtk. It returns a structured CodebaseMap that feeds into the skill chain's brain+ and plan+ phases.

**Architecture:** The scout is a Claude Code agent definition (`.claude/agents/scout.md`) plus supporting TypeScript modules that format jcodemunch output into the CodebaseMap structure and provide a session-scoped cache for scout results. The agent definition constrains the scout to jcodemunch + bash tools only (no file editing), uses `model: inherit` to respect whatever model the parent session is configured with (set via `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` env vars — not hardcoded to any provider), and has a 10-turn budget.

**Tech Stack:** TypeScript, vitest, jcodemunch MCP tools, rtk

**Depends on:** Phase 1 (types, session cache)

---

## File Structure

```
src/
  scout/
    mapper.ts                # Format jcodemunch output into CodebaseMap
    cross-repo.ts            # Handle cross-directory indexing triggers
    scout-cache.ts           # Session-scoped cache for scout results
  templates/
    agents/
      scout.md               # Agent definition template
tests/
  scout/
    mapper.test.ts           # CodebaseMap formatting tests
    cross-repo.test.ts       # Cross-directory indexing tests
    scout-cache.test.ts      # Scout cache tests
```

---

### Task 1: CodebaseMap Formatter

**Files:**
- Create: `src/scout/mapper.ts`
- Create: `tests/scout/mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/scout/mapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatRepoOutline,
  formatFileTree,
  formatSymbolSearch,
  buildCodebaseMap,
} from '../../src/scout/mapper.js';
import type { CodebaseMap, SymbolSummary } from '../../src/types.js';

describe('formatRepoOutline', () => {
  it('formats a repo outline into summary lines', () => {
    const outline = {
      file_count: 42,
      symbol_count: 312,
      languages: { typescript: 38, python: 4 },
      directories: { src: 30, tests: 10, lib: 2 },
      symbol_kinds: { function: 200, class: 50, type: 62 },
    };
    const result = formatRepoOutline(outline);
    expect(result).toContain('42 files');
    expect(result).toContain('312 symbols');
    expect(result).toContain('typescript: 38');
    expect(result).toContain('functions: 200');
  });

  it('handles empty repo outline', () => {
    const result = formatRepoOutline({ file_count: 0, symbol_count: 0, languages: {}, directories: {}, symbol_kinds: {} });
    expect(result).toContain('0 files');
  });
});

describe('formatFileTree', () => {
  it('formats file tree into structure array', () => {
    const tree = [
      { path: 'src/router/intent.ts', type: 'file', symbol_count: 5 },
      { path: 'src/router/resolver.ts', type: 'file', symbol_count: 3 },
      { path: 'tests/', type: 'dir', children: [] },
    ];
    const result = formatFileTree(tree);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ path: 'src/router/intent.ts', type: 'file', symbolCount: 5 });
  });
});

describe('formatSymbolSearch', () => {
  it('formats symbol search results into SymbolSummary array', () => {
    const results = [
      { name: 'classifyIntent', kind: 'function', file: 'src/router/intent.ts', line: 10, summary: 'Classifies tool intent', score: 10 },
      { name: 'resolve', kind: 'function', file: 'src/router/resolver.ts', line: 5, summary: 'Resolves tool to optimal implementation', score: 8 },
    ];
    const result = formatSymbolSearch(results);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'classifyIntent',
      kind: 'function',
      file: 'src/router/intent.ts',
      line: 10,
      summary: 'Classifies tool intent',
    });
  });

  it('strips score field from results', () => {
    const results = [
      { name: 'test', kind: 'function', file: 'f.ts', line: 1, summary: 's', score: 99 },
    ];
    const result = formatSymbolSearch(results);
    expect(result[0]).not.toHaveProperty('score');
  });

  it('sorts by score descending', () => {
    const results = [
      { name: 'low', kind: 'function', file: 'a.ts', line: 1, summary: 'low match', score: 2 },
      { name: 'high', kind: 'function', file: 'b.ts', line: 1, summary: 'high match', score: 10 },
      { name: 'mid', kind: 'function', file: 'c.ts', line: 1, summary: 'mid match', score: 5 },
    ];
    const result = formatSymbolSearch(results);
    expect(result[0].name).toBe('high');
    expect(result[1].name).toBe('mid');
    expect(result[2].name).toBe('low');
  });
});

describe('buildCodebaseMap', () => {
  it('combines outline, tree, and symbols into CodebaseMap', () => {
    const outline = {
      file_count: 20,
      symbol_count: 150,
      languages: { typescript: 20 },
      directories: { src: 15, tests: 5 },
      symbol_kinds: { function: 100, class: 30, type: 20 },
    };
    const tree = [
      { path: 'src/index.ts', type: 'file' as const, symbol_count: 3 },
    ];
    const symbols: SymbolSummary[] = [
      { name: 'main', kind: 'function', file: 'src/index.ts', line: 1, summary: 'Entry point' },
    ];

    const result = buildCodebaseMap(outline, tree, symbols, ['dep-a', 'dep-b']);

    expect(result.languages).toEqual({ typescript: 20 });
    expect(result.symbols).toEqual({ functions: 100, classes: 30, types: 20 });
    expect(result.entryPoints).toEqual(['src/index.ts']);
    expect(result.keyExports).toHaveLength(1);
    expect(result.keyExports[0].name).toBe('main');
    expect(result.dependencies).toEqual(['dep-a', 'dep-b']);
  });

  it('derives entry points from files named index/main/app/cli', () => {
    const tree = [
      { path: 'src/index.ts', type: 'file' as const },
      { path: 'src/main.py', type: 'file' as const },
      { path: 'src/cli.ts', type: 'file' as const },
      { path: 'src/utils.ts', type: 'file' as const },
    ];

    const result = buildCodebaseMap(
      { file_count: 4, symbol_count: 10, languages: {}, directories: {}, symbol_kinds: {} },
      tree,
      [],
      [],
    );

    expect(result.entryPoints).toContain('src/index.ts');
    expect(result.entryPoints).toContain('src/main.py');
    expect(result.entryPoints).toContain('src/cli.ts');
    expect(result.entryPoints).not.toContain('src/utils.ts');
  });

  it('handles empty inputs gracefully', () => {
    const result = buildCodebaseMap(
      { file_count: 0, symbol_count: 0, languages: {}, directories: {}, symbol_kinds: {} },
      [],
      [],
      [],
    );
    expect(result.structure).toEqual([]);
    expect(result.entryPoints).toEqual([]);
    expect(result.keyExports).toEqual([]);
    expect(result.dependencies).toEqual([]);
    expect(result.symbols).toEqual({ functions: 0, classes: 0, types: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scout/mapper.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the mapper**

Create `src/scout/mapper.ts`:

```typescript
import type { CodebaseMap, SymbolSummary } from '../types.js';

interface RawOutline {
  file_count: number;
  symbol_count: number;
  languages: Record<string, number>;
  directories: Record<string, number>;
  symbol_kinds: Record<string, number>;
}

interface RawTreeEntry {
  path: string;
  type: 'file' | 'dir';
  symbol_count?: number;
  children?: RawTreeEntry[];
}

interface RawSymbolResult {
  name: string;
  kind: string;
  file: string;
  line: number;
  summary: string;
  score?: number;
}

export function formatRepoOutline(outline: RawOutline): string {
  const lines: string[] = [];
  lines.push(`${outline.file_count} files, ${outline.symbol_count} symbols`);

  const langs = Object.entries(outline.languages);
  if (langs.length > 0) {
    lines.push('Languages: ' + langs.map(([l, c]) => `${l}: ${c}`).join(', '));
  }

  const kinds = Object.entries(outline.symbol_kinds);
  if (kinds.length > 0) {
    lines.push('Symbols: ' + kinds.map(([k, c]) => `${k}s: ${c}`).join(', '));
  }

  return lines.join('\n');
}

export function formatFileTree(tree: RawTreeEntry[]): CodebaseMap['structure'] {
  return tree.map(entry => ({
    path: entry.path,
    type: entry.type,
    ...(entry.symbol_count !== undefined ? { symbolCount: entry.symbol_count } : {}),
  }));
}

export function formatSymbolSearch(results: RawSymbolResult[]): SymbolSummary[] {
  return results
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map(({ name, kind, file, line, summary }) => ({
      name,
      kind,
      file,
      line,
      summary,
    }));
}

const ENTRY_POINT_PATTERNS = [
  /(?:^|\/)index\.[tj]sx?$/,
  /(?:^|\/)main\.[tj]sx?$/,
  /(?:^|\/)main\.py$/,
  /(?:^|\/)cli\.[tj]sx?$/,
  /(?:^|\/)app\.[tj]sx?$/,
  /(?:^|\/)server\.[tj]sx?$/,
];

export function buildCodebaseMap(
  outline: RawOutline,
  tree: RawTreeEntry[],
  symbols: SymbolSummary[],
  dependencies: string[],
): CodebaseMap {
  const structure = formatFileTree(tree);

  const entryPoints = tree
    .filter(e => e.type === 'file')
    .map(e => e.path)
    .filter(path => ENTRY_POINT_PATTERNS.some(p => p.test(path)));

  const symbolKinds = outline.symbol_kinds;

  return {
    structure,
    entryPoints,
    keyExports: symbols,
    dependencies,
    languages: outline.languages,
    symbols: {
      functions: symbolKinds.function ?? symbolKinds.method ?? 0,
      classes: symbolKinds.class ?? 0,
      types: symbolKinds.type ?? 0,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scout/mapper.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scout/mapper.ts tests/scout/mapper.test.ts
git commit -m "feat: add CodebaseMap formatter for jcodemunch output"
```

---

### Task 2: Cross-Directory Indexing

**Files:**
- Create: `src/scout/cross-repo.ts`
- Create: `tests/scout/cross-repo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/scout/cross-repo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureIndexed } from '../../src/scout/cross-repo.js';
import type { Environment } from '../../src/types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

describe('ensureIndexed', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns existing repo when already indexed', () => {
    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: true,
      jcodemunchCwdRepo: 'local/my-project',
      jcodemunchKnownRepos: ['local/my-project', 'local/superpowers'],
      detectedAt: Date.now(),
    };

    const result = ensureIndexed('/home/user/my-project', env);
    expect(result.alreadyIndexed).toBe(true);
    expect(result.repo).toBe('local/my-project');
    expect(execSync).not.toHaveBeenCalledWith(expect.stringContaining('index_folder'), expect.anything());
  });

  it('indexes new directory when jcodemunch available but not indexed', () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('index_folder')) {
        return JSON.stringify({ success: true, repo: 'local/other-project' });
      }
      return '';
    });

    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    };

    const result = ensureIndexed('/home/user/other-project', env);
    expect(result.alreadyIndexed).toBe(false);
    expect(result.repo).toBe('local/other-project');
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('index_folder'),
      expect.anything(),
    );
  });

  it('returns null when jcodemunch not available', () => {
    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: false,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    };

    const result = ensureIndexed('/home/user/some-project', env);
    expect(result).toBeNull();
  });

  it('returns null when indexing fails', () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('index_folder')) {
        throw new Error('indexing failed');
      }
      return '';
    });

    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: [],
      detectedAt: Date.now(),
    };

    const result = ensureIndexed('/home/user/broken-project', env);
    expect(result).toBeNull();
  });

  it('detects already-indexed repo by directory basename', () => {
    const env: Environment = {
      rtkAvailable: false,
      rtkPath: null,
      jcodemunchAvailable: true,
      jcodemunchCwdIndexed: false,
      jcodemunchCwdRepo: null,
      jcodemunchKnownRepos: ['local/superpowers', 'local/gstack'],
      detectedAt: Date.now(),
    };

    // Directory is ~/tools/superpowers, which matches repo 'local/superpowers'
    const result = ensureIndexed('/home/user/tools/superpowers', env);
    expect(result.alreadyIndexed).toBe(true);
    expect(result.repo).toBe('local/superpowers');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scout/cross-repo.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the cross-repo indexer**

Create `src/scout/cross-repo.ts`:

```typescript
import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import type { Environment } from '../types.js';

interface IndexResult {
  alreadyIndexed: boolean;
  repo: string;
}

/**
 * Ensure a directory is indexed by jcodemunch.
 * Returns the repo identifier if indexed, or null if indexing is not possible.
 */
export function ensureIndexed(directory: string, env: Environment): IndexResult | null {
  if (!env.jcodemunchAvailable) return null;

  // Check if already indexed by directory basename
  const dirName = basename(directory);
  const existing = env.jcodemunchKnownRepos.find(r => r.endsWith(dirName));
  if (existing) {
    return { alreadyIndexed: true, repo: existing };
  }

  // Index it
  try {
    const raw = execSync(
      `jcodemunch index_folder --path "${directory}"`,
      { encoding: 'utf-8', timeout: 120_000 },
    ).trim();
    const parsed = JSON.parse(raw);
    if (parsed.success) {
      return { alreadyIndexed: false, repo: parsed.repo };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scout/cross-repo.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scout/cross-repo.ts tests/scout/cross-repo.test.ts
git commit -m "feat: add cross-directory indexing for external repo references"
```

---

### Task 3: Scout Result Cache

**Files:**
- Create: `src/scout/scout-cache.ts`
- Create: `tests/scout/scout-cache.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/scout/scout-cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ScoutCache } from '../../src/scout/scout-cache.js';
import type { CodebaseMap } from '../../src/types.js';

function makeMap(overrides: Partial<CodebaseMap> = {}): CodebaseMap {
  return {
    structure: [],
    entryPoints: [],
    keyExports: [],
    dependencies: [],
    languages: { typescript: 10 },
    symbols: { functions: 50, classes: 10, types: 5 },
    ...overrides,
  };
}

describe('ScoutCache', () => {
  let cache: ScoutCache;

  beforeEach(() => {
    cache = new ScoutCache();
  });

  it('returns undefined when no map cached', () => {
    expect(cache.getMap('/home/user/project')).toBeUndefined();
  });

  it('stores and retrieves map by directory', () => {
    const map = makeMap();
    cache.setMap('/home/user/project', map);
    expect(cache.getMap('/home/user/project')).toEqual(map);
  });

  it('stores maps for multiple directories', () => {
    const map1 = makeMap({ languages: { typescript: 10 } });
    const map2 = makeMap({ languages: { python: 5 } });
    cache.setMap('/home/user/project-a', map1);
    cache.setMap('/home/user/project-b', map2);
    expect(cache.getMap('/home/user/project-a')?.languages).toEqual({ typescript: 10 });
    expect(cache.getMap('/home/user/project-b')?.languages).toEqual({ python: 5 });
  });

  it('overwrites map for same directory', () => {
    cache.setMap('/home/user/project', makeMap({ languages: { typescript: 5 } }));
    cache.setMap('/home/user/project', makeMap({ languages: { typescript: 10 } }));
    expect(cache.getMap('/home/user/project')?.languages.typescript).toBe(10);
  });

  it('reports stale maps after TTL', () => {
    const map = makeMap();
    cache.setMap('/home/user/project', map, Date.now() - 31 * 60 * 1000);
    expect(cache.isStale('/home/user/project')).toBe(true);
  });

  it('reports fresh maps within TTL', () => {
    const map = makeMap();
    cache.setMap('/home/user/project', map, Date.now());
    expect(cache.isStale('/home/user/project')).toBe(false);
  });

  it('returns all cached directories', () => {
    cache.setMap('/a', makeMap());
    cache.setMap('/b', makeMap());
    cache.setMap('/c', makeMap());
    expect(cache.getCachedDirectories()).toEqual(['/a', '/b', '/c']);
  });

  it('clears all maps on reset', () => {
    cache.setMap('/a', makeMap());
    cache.setMap('/b', makeMap());
    cache.reset();
    expect(cache.getCachedDirectories()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scout/scout-cache.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the scout cache**

Create `src/scout/scout-cache.ts`:

```typescript
import type { CodebaseMap } from '../types.js';

const SCOUT_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedMap {
  map: CodebaseMap;
  cachedAt: number;
}

export class ScoutCache {
  private maps: Map<string, CachedMap> = new Map();

  getMap(directory: string): CodebaseMap | undefined {
    return this.maps.get(directory)?.map;
  }

  setMap(directory: string, map: CodebaseMap, cachedAt: number = Date.now()): void {
    this.maps.set(directory, { map, cachedAt });
  }

  isStale(directory: string): boolean {
    const cached = this.maps.get(directory);
    if (!cached) return true;
    return Date.now() - cached.cachedAt > SCOUT_TTL_MS;
  }

  getCachedDirectories(): string[] {
    return Array.from(this.maps.keys());
  }

  reset(): void {
    this.maps.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scout/scout-cache.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scout/scout-cache.ts tests/scout/scout-cache.test.ts
git commit -m "feat: add scout result cache with TTL-based staleness"
```

---

### Task 4: Scout Agent Definition

**Files:**
- Create: `templates/agents/scout.md`
- Create: `tests/scout/agent-definition.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scout/agent-definition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEMPLATES = resolve(import.meta.dirname, '..', '..', 'templates');

describe('scout agent definition', () => {
  const agentPath = resolve(TEMPLATES, 'agents', 'scout.md');
  let content: string;

  it('template file exists', () => {
    content = readFileSync(agentPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('has valid YAML frontmatter', () => {
    expect(content).toMatch(/^---\n/);
    const frontmatter = content.split('---')[1];
    expect(frontmatter).toContain('name: scout');
    expect(frontmatter).toContain('model: inherit');
    expect(frontmatter).toContain('maxTurns: 10');
  });

  it('specifies jcodemunch and bash tools', () => {
    const frontmatter = content.split('---')[1];
    expect(frontmatter).toContain('mcp__jcodemunch');
    expect(frontmatter).toContain('Bash');
  });

  it('does not include Edit or Write tools', () => {
    const frontmatter = content.split('---')[1];
    expect(frontmatter).not.toContain('Edit');
    expect(frontmatter).not.toContain('Write');
  });

  it('includes context harvesting instructions', () => {
    expect(content).toContain('context harvesting');
    expect(content).toContain('get_repo_outline');
    expect(content).toContain('get_file_tree');
    expect(content).toContain('search_symbols');
  });

  it('includes structured output format', () => {
    expect(content).toContain('CodebaseMap');
    expect(content).toContain('entryPoints');
    expect(content).toContain('keyExports');
  });

  it('includes rtk usage instructions', () => {
    expect(content).toContain('rtk');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scout/agent-definition.test.ts`
Expected: FAIL — file not found

- [ ] **Step 3: Create the agent definition template**

Create `templates/agents/scout.md`:

```markdown
---
name: scout
description: "PROACTIVELY use when starting any non-trivial implementation task, when context about the codebase is needed before making changes, or when the user references unfamiliar code. Context harvesting agent that maps codebase structure using jcodemunch and rtk for token-efficient exploration."
tools: "mcp__jcodemunch__get_repo_outline,mcp__jcodemunch__get_file_tree,mcp__jcodemunch__get_file_outline,mcp__jcodemunch__search_symbols,mcp__jcodemunch__get_symbol,mcp__jcodemunch__get_symbols,mcp__jcodemunch__search_text,mcp__jcodemunch__list_repos,mcp__jcodemunch__index_folder,Bash"
model: inherit
maxTurns: 10
---

# Scout Agent — Context Harvesting

You are a context harvesting agent. Your job is to map the codebase structure so the implementer can make targeted decisions instead of blind searches.

## Rules

1. Use jcodemunch tools for ALL code exploration. Never use grep, find, or cat.
2. Use rtk for git operations when available (check: `which rtk`).
3. Do NOT edit any files. You are read-only.
4. Return a structured summary, not raw dumps.

## Procedure

### Step 1: Get the lay of the land

Call `get_repo_outline` to understand:
- File count, symbol count, languages
- Directory structure, symbol kinds

### Step 2: Map the file structure

Call `get_file_tree` to understand:
- Directory layout
- Where code lives vs where tests live

### Step 3: Find key exports

Call `search_symbols` with relevant queries to identify:
- Main entry points
- Key exported functions and classes
- Public interfaces

### Step 4: Map dependencies

If a package.json or requirements.txt exists, read it to identify:
- Direct dependencies
- Dev dependencies
- Key framework versions

### Step 5: Return structured output

Format your findings as a CodebaseMap:

```
## CodebaseMap

### Structure
[Summary of directory layout — 2-3 sentences]

### Entry Points
- [List of main entry files]

### Key Exports
- [Symbol name] ([kind]) — [file:line] — [summary]
- ...

### Dependencies
- [List of key dependencies]

### Languages
- [Language]: [file count]

### Symbols
- Functions: [count]
- Classes: [count]
- Types: [count]
```

## When to Index New Directories

If the user references a directory outside the current project, index it first:
```
Call index_folder with the referenced path
Then proceed with steps 1-5 on the newly indexed repo
```

## What NOT to Do

- Do not read entire files unless specifically needed for a symbol summary
- Do not output raw JSON or YAML — always summarize
- Do not make changes to any file
- Do not run tests or build commands
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scout/agent-definition.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add templates/agents/scout.md tests/scout/agent-definition.test.ts
git commit -m "feat: add scout agent definition template with jcodemunch + rtk tools"
```

---

### Task 5: Verify All Phase 4 Tests Pass Together

- [ ] **Step 1: Run full test suite (Phase 1 + 2 + 3 + 4)**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: phase 4 complete - scout agent with CodebaseMap, cross-repo indexing, cache"
```

---

### Task 6: Phase Retrospective — GStack Comparison

Use `superpowers:debugging` to analyze Phase 4 scout/context engineering against gstack's context/skill generation patterns (indexed as `local/gstack`).

- [ ] **Step 1: Research gstack context engineering patterns**

```
search_symbols(repo="local/gstack", query="context")
search_symbols(repo="local/gstack", query="skill")
search_symbols(repo="local/gstack", query="template")
search_symbols(repo="local/gstack", query="generate")
get_file_tree(repo="local/gstack", path_prefix="src/skills")
```

- [ ] **Step 2: Write comparative analysis**

Create `docs/retrospectives/phase-4-retrospective.md` with sections: Shared Patterns, Differences, GStack Pros, Our Pros, Cons/Improvements, Action Items.

- [ ] **Step 3: Commit retrospective**

```bash
git add docs/retrospectives/phase-4-retrospective.md
git commit -m "docs: phase 4 retrospective — gstack context engineering comparison"
```
