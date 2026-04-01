# Phase 1: Foundation - Types, Config, Environment Detection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the shared type system, configuration loader, and environment detection that all other layers depend on.

**Architecture:** Pure TypeScript modules with no framework dependencies. Types are defined
first, then config loader reads `.harness.yaml` with YAML override support, then environment
detector probes for rtk and jcodemunch availability. All modules are independently testable
with vitest.

**Tech Stack:** TypeScript, vitest, yaml (parser), Node.js fs/path

---

## File Structure

```
src/
  types.ts                    # All shared type definitions
  config.ts                   # Config loader with YAML + local override
  session/
    environment.ts            # Detect rtk, jcodemunch, index status
    cache.ts                  # Session-scoped cache for environment state
tests/
  types.test.ts               # Type guard tests
  config.test.ts              # Config loading tests
  session/
    environment.test.ts       # Environment detection tests
    cache.test.ts             # Cache behavior tests
fixtures/
  minimal-config.yaml         # Test fixture: minimal valid config
  full-config.yaml            # Test fixture: all rules specified
  broken-config.yaml          # Test fixture: malformed YAML
  local-override.yaml         # Test fixture: local override config
```

---

### Task 1: Project Scaffolding

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize the project**

```bash
cd ~/projects/claude-stack-utils
npm init -y
```

- [ ] **Step 2: Configure package.json**

Replace the generated `package.json` with:

```json
{
  "name": "claude-stack-utils",
  "version": "0.1.0",
  "description": "Agent harness that enforces tool routing, skill chains, and multi-agent discipline for Claude Code",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "claude-stack-utils": "dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "keywords": ["claude-code", "agent-harness", "guardrails"],
  "license": "MIT",
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  },
  "dependencies": {
    "yaml": "^2.7.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    fixtureDirs: ['fixtures'],
  },
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.js.map
*.d.ts.map
.harness.local.yaml
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: dependencies installed, no errors

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors (no source files yet, clean compile)

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore
git commit -m "feat: scaffold project with TypeScript, vitest, yaml deps"
```

---

### Task 2: Shared Type Definitions

**Files:**

- Create: `src/types.ts`
- Create: `tests/types.test.ts`

- [ ] **Step 1: Write the failing test for type guards**

Create `tests/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  isResolutionAllow,
  isResolutionAdvise,
  isResolutionBlock,
  isToolRule,
  isEnvironment,
} from '../src/types.js';

describe('type guards', () => {
  describe('isResolutionAllow', () => {
    it('returns true for a valid allow resolution', () => {
      expect(isResolutionAllow({ action: 'allow' })).toBe(true);
    });

    it('returns false for advise resolution', () => {
      expect(isResolutionAllow({ action: 'advise', tool: 'Read', reason: 'test' })).toBe(false);
    });

    it('returns false for non-object input', () => {
      expect(isResolutionAllow(null)).toBe(false);
      expect(isResolutionAllow('allow')).toBe(false);
    });
  });

  describe('isResolutionAdvise', () => {
    it('returns true for a valid advise resolution', () => {
      expect(isResolutionAdvise({ action: 'advise', tool: 'jcodemunch', reason: 'faster' })).toBe(true);
    });

    it('returns false when missing required fields', () => {
      expect(isResolutionAdvise({ action: 'advise', tool: 'jcodemunch' })).toBe(false);
    });
  });

  describe('isResolutionBlock', () => {
    it('returns true for a valid block resolution', () => {
      expect(isResolutionBlock({ action: 'block', reason: 'destructive' })).toBe(true);
    });

    it('returns false when missing reason', () => {
      expect(isResolutionBlock({ action: 'block' })).toBe(false);
    });
  });

  describe('isToolRule', () => {
    it('returns true for a regex-based rule', () => {
      expect(isToolRule({
        match: /^\s*grep/,
        intent: 'text_search',
        resolutions: { fallback: { action: 'advise', tool: 'Grep', reason: 'structured' } },
        enforcement: 'advise',
      })).toBe(true);
    });

    it('returns false when missing required fields', () => {
      expect(isToolRule({ match: /test/, intent: 'text_search' })).toBe(false);
    });
  });

  describe('isEnvironment', () => {
    it('returns true for a valid environment', () => {
      expect(isEnvironment({
        rtkAvailable: true,
        rtkPath: '/usr/local/bin/rtk',
        jcodemunchAvailable: true,
        jcodemunchCwdIndexed: true,
        jcodemunchCwdRepo: 'local/my-project',
        jcodemunchKnownRepos: ['local/my-project'],
        detectedAt: Date.now(),
      })).toBe(true);
    });

    it('returns false when missing required fields', () => {
      expect(isEnvironment({ rtkAvailable: true })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — module `../src/types.js` not found

- [ ] **Step 3: Write the type definitions and guards**

Create `src/types.ts`:

```typescript
// ── Intent Types ──

export type IntentType =
  | 'file_read'
  | 'text_search'
  | 'file_discovery'
  | 'file_modify'
  | 'symbol_search'
  | 'pass_through';

// ── Resolution Types ──

export type EnforcementLevel = 'block' | 'advise' | 'silent';

export interface ResolutionAllow {
  action: 'allow';
}

export interface ResolutionAdvise {
  action: 'advise';
  tool: string;
  reason: string;
}

export interface ResolutionBlock {
  action: 'block';
  reason: string;
}

export type Resolution = ResolutionAllow | ResolutionAdvise | ResolutionBlock;
export type EnvResolution = Resolution | 'allow';

// ── Tool Rule Types ──

export interface ToolRule {
  match: RegExp | ((tool: string, args: unknown) => boolean);
  intent: IntentType;
  resolutions: {
    rtk?: EnvResolution;
    jcodemunch?: EnvResolution;
    claudeTool?: EnvResolution;
    fallback?: EnvResolution;
  };
  enforcement: EnforcementLevel;
}

// ── Environment Types ──

export interface Environment {
  rtkAvailable: boolean;
  rtkPath: string | null;
  jcodemunchAvailable: boolean;
  jcodemunchCwdIndexed: boolean;
  jcodemunchCwdRepo: string | null;
  jcodemunchKnownRepos: string[];
  detectedAt: number;
}

// ── Config Types ──

export interface ToolRoutingRules {
  grep?: EnforcementLevel;
  find?: EnforcementLevel;
  glob?: EnforcementLevel;
  sed_i?: EnforcementLevel;
  cat?: EnforcementLevel;
  broad_scan?: EnforcementLevel;
}

export interface ConstitutionalRules {
  no_mocks?: EnforcementLevel;
  evidence_only?: EnforcementLevel;
  full_accounting?: EnforcementLevel;
}

export interface TestIntegrityRules {
  conditional_assert?: EnforcementLevel;
  skip_without_reason?: EnforcementLevel;
  empty_test?: EnforcementLevel;
}

export interface StaleTestRules {
  enforcement: EnforcementLevel;
  grace_period: number;
}

export interface TestScopeRules {
  enforcement: EnforcementLevel;
  allowed_unscoped: string[];
}

export interface ZeroDefectRules {
  tolerance: 'strict' | 'permissive';
  unrelated_errors?: EnforcementLevel;
}

export interface HarnessConfig {
  rules: {
    tool_routing?: ToolRoutingRules;
    constitutional?: ConstitutionalRules;
    test_integrity?: TestIntegrityRules;
    stale_tests?: StaleTestRules;
    test_scope?: TestScopeRules;
    zero_defect?: ZeroDefectRules;
    enforcement?: {
      default_level: EnforcementLevel;
    };
  };
}

// ── Codebase Map (Scout Output) ──

export interface SymbolSummary {
  name: string;
  kind: string;
  file: string;
  line: number;
  summary: string;
}

export interface CodebaseMap {
  structure: { path: string; type: 'file' | 'dir'; symbolCount?: number }[];
  entryPoints: string[];
  keyExports: SymbolSummary[];
  dependencies: string[];
  languages: Record<string, number>;
  symbols: { functions: number; classes: number; types: number };
}

// ── Type Guards ──

export function isResolutionAllow(val: unknown): val is ResolutionAllow {
  return typeof val === 'object' && val !== null && (val as ResolutionAllow).action === 'allow';
}

export function isResolutionAdvise(val: unknown): val is ResolutionAdvise {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as ResolutionAdvise).action === 'advise' &&
    typeof (val as ResolutionAdvise).tool === 'string' &&
    typeof (val as ResolutionAdvise).reason === 'string'
  );
}

export function isResolutionBlock(val: unknown): val is ResolutionBlock {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as ResolutionBlock).action === 'block' &&
    typeof (val as ResolutionBlock).reason === 'string'
  );
}

export function isToolRule(val: unknown): val is ToolRule {
  if (typeof val !== 'object' || val === null) return false;
  const rule = val as ToolRule;
  return (
    (rule.match instanceof RegExp || typeof rule.match === 'function') &&
    typeof rule.intent === 'string' &&
    typeof rule.resolutions === 'object' &&
    typeof rule.enforcement === 'string'
  );
}

export function isEnvironment(val: unknown): val is Environment {
  if (typeof val !== 'object' || val === null) return false;
  const env = val as Environment;
  return (
    typeof env.rtkAvailable === 'boolean' &&
    typeof env.jcodemunchAvailable === 'boolean' &&
    typeof env.jcodemunchCwdIndexed === 'boolean' &&
    typeof env.detectedAt === 'number'
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/types.test.ts
git commit -m "feat: add shared type definitions and type guards"
```

---

### Task 3: Configuration Loader

**Files:**

- Create: `src/config.ts`
- Create: `tests/config.test.ts`
- Create: `fixtures/minimal-config.yaml`
- Create: `fixtures/full-config.yaml`
- Create: `fixtures/broken-config.yaml`
- Create: `fixtures/local-override.yaml`

- [ ] **Step 1: Create test fixtures**

Create `fixtures/minimal-config.yaml`:

```yaml
rules:
  enforcement:
    default_level: advise
```

Create `fixtures/full-config.yaml`:

```yaml
rules:
  tool_routing:
    grep: block
    find: advise
    glob: advise
    sed_i: block
    cat: advise
    broad_scan: block
  constitutional:
    no_mocks: block
    evidence_only: block
    full_accounting: advise
  test_integrity:
    conditional_assert: block
    skip_without_reason: advise
    empty_test: block
  stale_tests:
    enforcement: advise
    grace_period: 0
  test_scope:
    enforcement: advise
    allowed_unscoped:
      - "vitest watch"
      - "jest --watch"
  zero_defect:
    tolerance: strict
    unrelated_errors: block
  enforcement:
    default_level: advise
```

Create `fixtures/broken-config.yaml`:

```yaml
rules:
  tool_routing:
    grep: not_a_real_level
  {{broken yaml
```

Create `fixtures/local-override.yaml`:

```yaml
rules:
  tool_routing:
    grep: advise
  stale_tests:
    enforcement: block
```

- [ ] **Step 2: Write the failing tests**

Create `tests/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig, mergeConfigs, DEFAULT_CONFIG } from '../src/config.js';
import { resolve } from 'node:path';
import { HarnessConfig } from '../src/types.js';

const FIXTURES = resolve(import.meta.dirname, '..', 'fixtures');

describe('config', () => {
  describe('DEFAULT_CONFIG', () => {
    it('has all rule categories with sensible defaults', () => {
      expect(DEFAULT_CONFIG.rules.enforcement?.default_level).toBe('advise');
      expect(DEFAULT_CONFIG.rules.tool_routing?.grep).toBe('block');
      expect(DEFAULT_CONFIG.rules.tool_routing?.sed_i).toBe('block');
      expect(DEFAULT_CONFIG.rules.stale_tests?.enforcement).toBe('advise');
      expect(DEFAULT_CONFIG.rules.test_scope?.enforcement).toBe('advise');
    });
  });

  describe('loadConfig', () => {
    it('returns default config when file does not exist', async () => {
      const config = await loadConfig('/nonexistent/path/.harness.yaml');
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('loads a minimal config and merges with defaults', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'minimal-config.yaml'));
      expect(config.rules.enforcement?.default_level).toBe('advise');
      // Defaults still present for unspecified rules
      expect(config.rules.tool_routing?.grep).toBe('block');
    });

    it('loads a full config with all rules', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'full-config.yaml'));
      expect(config.rules.tool_routing?.grep).toBe('block');
      expect(config.rules.constitutional?.no_mocks).toBe('block');
      expect(config.rules.test_integrity?.empty_test).toBe('block');
      expect(config.rules.stale_tests?.grace_period).toBe(0);
      expect(config.rules.test_scope?.allowed_unscoped).toContain('vitest watch');
      expect(config.rules.zero_defect?.tolerance).toBe('strict');
    });

    it('returns default config for broken YAML', async () => {
      const config = await loadConfig(resolve(FIXTURES, 'broken-config.yaml'));
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('mergeConfigs', () => {
    it('overrides base with local values', () => {
      const base: HarnessConfig = {
        rules: {
          tool_routing: { grep: 'block', find: 'advise' },
          stale_tests: { enforcement: 'advise', grace_period: 0 },
        },
      };
      const local: HarnessConfig = {
        rules: {
          tool_routing: { grep: 'advise' },
          stale_tests: { enforcement: 'block' },
        },
      };
      const merged = mergeConfigs(base, local);
      expect(merged.rules.tool_routing?.grep).toBe('advise');
      expect(merged.rules.tool_routing?.find).toBe('advise');
      expect(merged.rules.stale_tests?.enforcement).toBe('block');
      expect(merged.rules.stale_tests?.grace_period).toBe(0);
    });

    it('preserves base values when local does not override', () => {
      const base: HarnessConfig = {
        rules: { tool_routing: { grep: 'block', sed_i: 'block' } },
      };
      const local: HarnessConfig = {
        rules: { tool_routing: { grep: 'advise' } },
      };
      const merged = mergeConfigs(base, local);
      expect(merged.rules.tool_routing?.grep).toBe('advise');
      expect(merged.rules.tool_routing?.sed_i).toBe('block');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — module `../src/config.js` not found

- [ ] **Step 4: Write the config loader**

Create `src/config.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { HarnessConfig, EnforcementLevel } from './types.js';

export const DEFAULT_CONFIG: HarnessConfig = {
  rules: {
    tool_routing: {
      grep: 'block',
      find: 'advise',
      glob: 'advise',
      sed_i: 'block',
      cat: 'advise',
      broad_scan: 'block',
    },
    constitutional: {
      no_mocks: 'block',
      evidence_only: 'block',
      full_accounting: 'advise',
    },
    test_integrity: {
      conditional_assert: 'block',
      skip_without_reason: 'advise',
      empty_test: 'block',
    },
    stale_tests: {
      enforcement: 'advise',
      grace_period: 0,
    },
    test_scope: {
      enforcement: 'advise',
      allowed_unscoped: ['vitest watch', 'jest --watch'],
    },
    zero_defect: {
      tolerance: 'strict',
      unrelated_errors: 'block',
    },
    enforcement: {
      default_level: 'advise',
    },
  },
};

export async function loadConfig(configPath: string): Promise<HarnessConfig> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as HarnessConfig | null;
    if (!parsed || typeof parsed !== 'object') {
      return structuredClone(DEFAULT_CONFIG);
    }
    return mergeConfigs(structuredClone(DEFAULT_CONFIG), parsed);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function mergeConfigs(base: HarnessConfig, override: HarnessConfig): HarnessConfig {
  return {
    rules: {
      tool_routing: { ...base.rules.tool_routing, ...override.rules.tool_routing },
      constitutional: { ...base.rules.constitutional, ...override.rules.constitutional },
      test_integrity: { ...base.rules.test_integrity, ...override.rules.test_integrity },
      stale_tests: { ...base.rules.stale_tests, ...override.rules.stale_tests },
      test_scope: { ...base.rules.test_scope, ...override.rules.test_scope },
      zero_defect: { ...base.rules.zero_defect, ...override.rules.zero_defect },
      enforcement: { ...base.rules.enforcement, ...override.rules.enforcement },
    },
  };
}

export function getEnforcementLevel(
  config: HarnessConfig,
  category: string,
  rule: string,
): EnforcementLevel {
  const rules = config.rules as Record<string, Record<string, unknown>>;
  const categoryRules = rules[category];
  if (categoryRules && typeof categoryRules[rule] === 'string') {
    return categoryRules[rule] as EnforcementLevel;
  }
  return config.rules.enforcement?.default_level ?? 'advise';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/config.ts tests/config.test.ts fixtures/
git commit -m "feat: add config loader with YAML parsing and local override merge"
```

---

### Task 4: Environment Detection

**Files:**

- Create: `src/session/environment.ts`
- Create: `tests/session/environment.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/session/environment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectEnvironment } from '../../src/session/environment.js';
import type { Environment } from '../../src/types.js';

// Mock child_process.execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

describe('detectEnvironment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects rtk available when which succeeds', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') return '/usr/local/bin/rtk';
      if (cmd.includes('index_folder')) return '';
      if (cmd.includes('list_repos')) return '{"repos":[]}';
      return '';
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.rtkAvailable).toBe(true);
    expect(env.rtkPath).toBe('/usr/local/bin/rtk');
  });

  it('detects rtk unavailable when which fails', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd.includes('index_folder')) return '';
      if (cmd.includes('list_repos')) return '{"repos":[]}';
      return '';
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.rtkAvailable).toBe(false);
    expect(env.rtkPath).toBeNull();
  });

  it('detects jcodemunch available when which succeeds', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which jcodemunch') return '/usr/local/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":[]}';
      return '';
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.jcodemunchAvailable).toBe(true);
  });

  it('detects jcodemunch unavailable when which fails', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which jcodemunch') throw new Error('not found');
      return '';
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.jcodemunchAvailable).toBe(false);
    expect(env.jcodemunchCwdIndexed).toBe(false);
    expect(env.jcodemunchCwdRepo).toBeNull();
  });

  it('detects CWD as indexed when jcodemunch list_repos includes it', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which jcodemunch') return '/usr/local/bin/jcodemunch';
      if (cmd.includes('list_repos')) return JSON.stringify({ repos: ['local/claude-stack-utils'] });
      return '';
    });

    const env = await detectEnvironment('/home/jerome/projects/claude-stack-utils');
    expect(env.jcodemunchAvailable).toBe(true);
    expect(env.jcodemunchKnownRepos).toContain('local/claude-stack-utils');
  });

  it('returns valid timestamp', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const before = Date.now();
    const env = await detectEnvironment('/fake/cwd');
    const after = Date.now();
    expect(env.detectedAt).toBeGreaterThanOrEqual(before);
    expect(env.detectedAt).toBeLessThanOrEqual(after);
  });

  it('returns isEnvironment-compatible object', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const env = await detectEnvironment('/fake/cwd');
    expect(env.rtkAvailable).toBe(false);
    expect(env.rtkPath).toBeNull();
    expect(env.jcodemunchAvailable).toBe(false);
    expect(env.jcodemunchCwdIndexed).toBe(false);
    expect(env.jcodemunchCwdRepo).toBeNull();
    expect(env.jcodemunchKnownRepos).toEqual([]);
    expect(typeof env.detectedAt).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/environment.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the environment detector**

Create `src/session/environment.ts`:

```typescript
import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import type { Environment } from '../types.js';

export async function detectEnvironment(cwd: string): Promise<Environment> {
  const rtkResult = detectRtk();
  const jmResult = detectJcodemunch(cwd);

  return {
    rtkAvailable: rtkResult.available,
    rtkPath: rtkResult.path,
    jcodemunchAvailable: jmResult.available,
    jcodemunchCwdIndexed: jmResult.cwdIndexed,
    jcodemunchCwdRepo: jmResult.cwdRepo,
    jcodemunchKnownRepos: jmResult.knownRepos,
    detectedAt: Date.now(),
  };
}

function detectRtk(): { available: boolean; path: string | null } {
  try {
    const path = execSync('which rtk', { encoding: 'utf-8' }).trim();
    return { available: true, path };
  } catch {
    return { available: false, path: null };
  }
}

function detectJcodemunch(cwd: string): {
  available: boolean;
  cwdIndexed: boolean;
  cwdRepo: string | null;
  knownRepos: string[];
} {
  try {
    execSync('which jcodemunch', { encoding: 'utf-8' });
  } catch {
    return { available: false, cwdIndexed: false, cwdRepo: null, knownRepos: [] };
  }

  try {
    const raw = execSync('jcodemunch list_repos', { encoding: 'utf-8' }).trim();
    const parsed = JSON.parse(raw);
    const repos: string[] = parsed.repos ?? [];
    const folderName = basename(cwd);
    const cwdRepo = repos.find(r => r.endsWith(folderName)) ?? null;

    return {
      available: true,
      cwdIndexed: cwdRepo !== null,
      cwdRepo,
      knownRepos: repos,
    };
  } catch {
    return { available: true, cwdIndexed: false, cwdRepo: null, knownRepos: [] };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session/environment.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/environment.ts tests/session/environment.test.ts
git commit -m "feat: add environment detection for rtk and jcodemunch"
```

---

### Task 5: Session Cache

**Files:**

- Create: `src/session/cache.ts`
- Create: `tests/session/cache.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/session/cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionCache } from '../../src/session/cache.js';
import type { Environment } from '../../src/types.js';

function makeEnv(overrides: Partial<Environment> = {}): Environment {
  return {
    rtkAvailable: false,
    rtkPath: null,
    jcodemunchAvailable: false,
    jcodemunchCwdIndexed: false,
    jcodemunchCwdRepo: null,
    jcodemunchKnownRepos: [],
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe('SessionCache', () => {
  let cache: SessionCache;

  beforeEach(() => {
    cache = new SessionCache();
  });

  it('returns undefined when environment not set', () => {
    expect(cache.getEnvironment()).toBeUndefined();
  });

  it('stores and retrieves environment', () => {
    const env = makeEnv({ rtkAvailable: true });
    cache.setEnvironment(env);
    expect(cache.getEnvironment()).toEqual(env);
  });

  it('reports environment as stale after TTL expires', () => {
    const env = makeEnv({ detectedAt: Date.now() - 31 * 60 * 1000 }); // 31 min ago
    cache.setEnvironment(env);
    expect(cache.isEnvironmentStale()).toBe(true);
  });

  it('reports environment as fresh within TTL', () => {
    const env = makeEnv({ detectedAt: Date.now() });
    cache.setEnvironment(env);
    expect(cache.isEnvironmentStale()).toBe(false);
  });

  it('tracks edited source files', () => {
    cache.addEditedFile('src/router/resolver.ts', 'source');
    cache.addEditedFile('src/enforcement/zero-defect.ts', 'source');
    expect(cache.getEditedFiles('source')).toEqual([
      'src/router/resolver.ts',
      'src/enforcement/zero-defect.ts',
    ]);
  });

  it('tracks edited test files separately', () => {
    cache.addEditedFile('tests/router/resolver.test.ts', 'test');
    cache.addEditedFile('src/router/resolver.ts', 'source');
    expect(cache.getEditedFiles('test')).toEqual(['tests/router/resolver.test.ts']);
    expect(cache.getEditedFiles('source')).toEqual(['src/router/resolver.ts']);
  });

  it('tracks current skill phase', () => {
    expect(cache.getCurrentPhase()).toBeNull();
    cache.setPhase('tdd+');
    expect(cache.getCurrentPhase()).toBe('tdd+');
  });

  it('clears all state on reset', () => {
    cache.setEnvironment(makeEnv());
    cache.addEditedFile('src/foo.ts', 'source');
    cache.setPhase('tdd+');
    cache.reset();
    expect(cache.getEnvironment()).toBeUndefined();
    expect(cache.getEditedFiles('source')).toEqual([]);
    expect(cache.getCurrentPhase()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/cache.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the session cache**

Create `src/session/cache.ts`:

```typescript
import type { Environment } from '../types.js';

const ENV_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class SessionCache {
  private environment: Environment | undefined;
  private editedFiles: Map<string, Set<string>> = new Map();
  private currentPhase: string | null = null;

  getEnvironment(): Environment | undefined {
    return this.environment;
  }

  setEnvironment(env: Environment): void {
    this.environment = env;
  }

  isEnvironmentStale(): boolean {
    if (!this.environment) return true;
    return Date.now() - this.environment.detectedAt > ENV_TTL_MS;
  }

  addEditedFile(filePath: string, category: 'source' | 'test'): void {
    if (!this.editedFiles.has(category)) {
      this.editedFiles.set(category, new Set());
    }
    this.editedFiles.get(category)!.add(filePath);
  }

  getEditedFiles(category: 'source' | 'test'): string[] {
    return Array.from(this.editedFiles.get(category) ?? []);
  }

  setPhase(phase: string): void {
    this.currentPhase = phase;
  }

  getCurrentPhase(): string | null {
    return this.currentPhase;
  }

  reset(): void {
    this.environment = undefined;
    this.editedFiles.clear();
    this.currentPhase = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session/cache.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/cache.ts tests/session/cache.test.ts
git commit -m "feat: add session cache for environment, edited files, and phase tracking"
```

---

### Task 6: Verify All Phase 1 Tests Pass Together

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass, no failures

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: phase 1 complete - types, config, environment detection, session cache"
```

---

### Task 7: Phase Retrospective — GStack Comparison

Use `superpowers:debugging` to analyze Phase 1 design and code quality against the gstack reference implementation (indexed as `local/gstack`).

- [ ] **Step 1: Research gstack foundation patterns**

Use jcodemunch to find gstack's type system, config, and session infrastructure:

```
search_symbols(repo="local/gstack", query="config")
search_symbols(repo="local/gstack", query="environment")
search_symbols(repo="local/gstack", query="session")
search_symbols(repo="local/gstack", query="types")
get_file_tree(repo="local/gstack", path_prefix="src")
```

- [ ] **Step 2: Write comparative analysis**

Create `docs/retrospectives/phase-1-retrospective.md`:

```markdown
# Phase 1 Retrospective — Foundation vs GStack

## Shared Patterns
- [What patterns did both projects use?]

## Differences
- [Where do the designs diverge? Why?]

## GStack Pros (patterns worth adopting)
- [Proven patterns from gstack that improve our foundation]

## Our Pros Over GStack
- [Design decisions where our approach is better]

## Cons / Improvements Needed
- [Areas where gstack's approach is demonstrably better]

## Action Items
- [Concrete improvements to make before Phase 2]
```

- [ ] **Step 3: Commit retrospective**

```bash
git add docs/retrospectives/phase-1-retrospective.md
git commit -m "docs: phase 1 retrospective — gstack foundation comparison"
```
