# Phase 2: Tool Router - Intent Classification, Resolution, Hook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PreToolUse hook that intercepts every tool call, classifies intent, checks the environment, and returns allow/advise/block resolutions. Also includes SessionStart hook for auto-indexing CWD.

**Architecture:** Three-stage pipeline: intent classifier parses tool+args into an intent type, resolver matches intent against routing rules with environment awareness, hook entry point formats the response for Claude Code's hook protocol. The hook reads the session cache for environment state and current phase.

**Tech Stack:** TypeScript, vitest, Node.js child_process (for auto-indexing)

**Depends on:** Phase 1 (types, config, environment detection, session cache)

---

## File Structure

```
src/
  router/
    intent.ts                 # Classify tool call into intent type
    rules.ts                  # Default routing rules (ported from damage-control-guardrails)
    resolver.ts               # Environment-aware resolution (rtk > jm > built-in > fallback)
    hook.ts                   # PreToolUse hook entry point (Claude Code protocol)
  session/
    start.ts                  # SessionStart hook (env detect + auto-index)
tests/
  router/
    intent.test.ts            # Intent classification tests
    rules.test.ts             # Rule matching tests
    resolver.test.ts          # Resolution priority tests
    hook.test.ts              # Hook protocol tests
  session/
    start.test.ts             # Session start + auto-index tests
```

---

### Task 1: Intent Classification

**Files:**
- Create: `src/router/intent.ts`
- Create: `tests/router/intent.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/intent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyIntent, IntentType } from '../../src/router/intent.js';

describe('classifyIntent', () => {
  describe('bash command classification', () => {
    it('classifies grep as text_search', () => {
      expect(classifyIntent('Bash', { command: 'grep -r "pattern" src/' })).toBe('text_search');
    });

    it('classifies rg as text_search', () => {
      expect(classifyIntent('Bash', { command: 'rg "export.*function" .' })).toBe('text_search');
    });

    it('classifies grep -x as text_search', () => {
      expect(classifyIntent('Bash', { command: 'grepx something' })).toBe('text_search');
    });

    it('classifies find as file_discovery', () => {
      expect(classifyIntent('Bash', { command: 'find . -name "*.ts"' })).toBe('file_discovery');
    });

    it('classifies fd as file_discovery', () => {
      expect(classifyIntent('Bash', { command: 'fd "\\.ts$"' })).toBe('file_discovery');
    });

    it('classifies cat as file_read', () => {
      expect(classifyIntent('Bash', { command: 'cat src/config.ts' })).toBe('file_read');
    });

    it('classifies head as file_read', () => {
      expect(classifyIntent('Bash', { command: 'head -20 src/config.ts' })).toBe('file_read');
    });

    it('classifies sed -i as file_modify', () => {
      expect(classifyIntent('Bash', { command: "sed -i 's/old/new/g' file.ts" })).toBe('file_modify');
    });

    it('classifies sed --in-place as file_modify', () => {
      expect(classifyIntent('Bash', { command: "sed --in-place 's/old/new/g' file.ts" })).toBe('file_modify');
    });

    it('classifies awk with redirect as file_modify', () => {
      expect(classifyIntent('Bash', { command: "awk '{print $1}' file > out" })).toBe('file_modify');
    });

    it('classifies plain sed (no -i) as text_search', () => {
      expect(classifyIntent('Bash', { command: "sed -n 's/pattern/&/p' file" })).toBe('text_search');
    });

    it('classifies git status as pass_through', () => {
      expect(classifyIntent('Bash', { command: 'git status' })).toBe('pass_through');
    });

    it('classifies ls as pass_through', () => {
      expect(classifyIntent('Bash', { command: 'ls -la' })).toBe('pass_through');
    });

    it('classifies compound commands by most restrictive intent', () => {
      // grep && sed -i: sed -i (file_modify) is more restrictive than grep (text_search)
      expect(classifyIntent('Bash', { command: "grep pattern file && sed -i 's/a/b/g' file" })).toBe('file_modify');
    });

    it('classifies piped commands by most restrictive intent', () => {
      // cat | grep: file_read (cat) + text_search (grep) → text_search
      expect(classifyIntent('Bash', { command: 'cat file | grep pattern' })).toBe('text_search');
    });
  });

  describe('Claude tool classification', () => {
    it('classifies Grep tool as text_search', () => {
      expect(classifyIntent('Grep', { pattern: 'export.*function' })).toBe('text_search');
    });

    it('classifies Glob tool as file_discovery', () => {
      expect(classifyIntent('Glob', { pattern: '**/*.ts' })).toBe('file_discovery');
    });

    it('classifies Read tool as file_read', () => {
      expect(classifyIntent('Read', { file_path: '/home/user/project/src/file.ts' })).toBe('file_read');
    });

    it('classifies Agent with Explore as file_discovery', () => {
      expect(classifyIntent('Agent', { subagent_type: 'Explore', prompt: 'find auth files' })).toBe('file_discovery');
    });

    it('classifies Edit tool as file_modify', () => {
      expect(classifyIntent('Edit', { file_path: '/home/user/project/src/file.ts' })).toBe('file_modify');
    });

    it('classifies Write tool as file_modify', () => {
      expect(classifyIntent('Write', { file_path: '/home/user/project/src/file.ts' })).toBe('file_modify');
    });

    it('classifies unknown tool as pass_through', () => {
      expect(classifyIntent('UnknownTool', {})).toBe('pass_through');
    });
  });

  describe('precedence', () => {
    it('file_modify wins over text_search in compound command', () => {
      expect(classifyIntent('Bash', { command: "rg pattern . ; sed -i 's/a/b/g' f" })).toBe('file_modify');
    });

    it('file_modify wins over file_read in compound command', () => {
      expect(classifyIntent('Bash', { command: "cat file ; sed -i 's/a/b/g' file" })).toBe('file_modify');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/router/intent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the intent classifier**

Create `src/router/intent.ts`:

```typescript
export type IntentType =
  | 'file_read'
  | 'text_search'
  | 'file_discovery'
  | 'file_modify'
  | 'symbol_search'
  | 'pass_through';

const INTENT_PRECEDENCE: Record<IntentType, number> = {
  file_modify: 5,
  symbol_search: 4,
  text_search: 3,
  file_discovery: 3,
  file_read: 2,
  pass_through: 0,
};

const BASH_INTENT_PATTERNS: Array<{ pattern: RegExp; intent: IntentType }> = [
  // Destructive patterns first (highest precedence)
  { pattern: /^\s*sed\s+(-i|--in-place)\b/, intent: 'file_modify' },
  { pattern: /^\s*awk\b.*>\s*\S+/, intent: 'file_modify' },
  // Search patterns
  { pattern: /^\s*(grep[rx]?|rg)\b/, intent: 'text_search' },
  { pattern: /^\s*sed\b/, intent: 'text_search' },
  // Discovery patterns
  { pattern: /^\s*find\s+/, intent: 'file_discovery' },
  { pattern: /^\s*fd\b/, intent: 'file_discovery' },
  // Read patterns
  { pattern: /^\s*cat\s+\S+/, intent: 'file_read' },
  { pattern: /^\s*head\s+/, intent: 'file_read' },
  { pattern: /^\s*tail\s+/, intent: 'file_read' },
];

const TOOL_INTENT_MAP: Record<string, IntentType> = {
  Grep: 'text_search',
  Glob: 'file_discovery',
  Read: 'file_read',
  Edit: 'file_modify',
  Write: 'file_modify',
  Bash: 'pass_through', // resolved by bash command analysis
};

function classifyBashCommand(command: string): IntentType {
  const segments = command.split(/&&|\|\||;|\|/);
  let highest: IntentType = 'pass_through';

  for (const segment of segments) {
    const trimmed = segment.trim();
    for (const { pattern, intent } of BASH_INTENT_PATTERNS) {
      if (pattern.test(trimmed)) {
        if (INTENT_PRECEDENCE[intent] > INTENT_PRECEDENCE[highest]) {
          highest = intent;
        }
        break;
      }
    }
  }

  return highest;
}

export function classifyIntent(tool: string, args: Record<string, unknown>): IntentType {
  // Direct tool mapping
  if (tool === 'Bash' && typeof args.command === 'string') {
    return classifyBashCommand(args.command);
  }

  if (tool === 'Agent' && typeof args.subagent_type === 'string') {
    if (args.subagent_type === 'Explore') return 'file_discovery';
    return 'pass_through';
  }

  return TOOL_INTENT_MAP[tool] ?? 'pass_through';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/router/intent.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/router/intent.ts tests/router/intent.test.ts
git commit -m "feat: add intent classification for bash commands and Claude tools"
```

---

### Task 2: Default Routing Rules

**Files:**
- Create: `src/router/rules.ts`
- Create: `tests/router/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/rules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getDefaultRules, findMatchingRule } from '../../src/router/rules.js';
import type { ToolRule } from '../../src/types.js';

describe('getDefaultRules', () => {
  it('returns rules for all intents', () => {
    const rules = getDefaultRules();
    const intents = rules.map(r => r.intent);
    expect(intents).toContain('text_search');
    expect(intents).toContain('file_discovery');
    expect(intents).toContain('file_read');
    expect(intents).toContain('file_modify');
  });

  it('file_modify rules always block sed -i', () => {
    const rules = getDefaultRules();
    const sedRule = rules.find(r =>
      r.intent === 'file_modify' && r.enforcement === 'block'
    );
    expect(sedRule).toBeDefined();
  });

  it('text_search rules have jcodemunch resolution', () => {
    const rules = getDefaultRules();
    const grepRule = rules.find(r => r.intent === 'text_search');
    expect(grepRule?.resolutions.jcodemunch).toBeDefined();
  });

  it('file_discovery rules have jcodemunch resolution', () => {
    const rules = getDefaultRules();
    const findRule = rules.find(r => r.intent === 'file_discovery');
    expect(findRule?.resolutions.jcodemunch).toBeDefined();
  });

  it('file_read rules have rtk resolution', () => {
    const rules = getDefaultRules();
    const catRule = rules.find(r => r.intent === 'file_read');
    expect(catRule?.resolutions.rtk).toBeDefined();
  });
});

describe('findMatchingRule', () => {
  const rules = getDefaultRules();

  it('matches grep bash command to text_search rule', () => {
    const match = findMatchingRule('Bash', { command: 'grep -r pattern .' }, rules);
    expect(match).toBeDefined();
    expect(match!.intent).toBe('text_search');
  });

  it('matches Grep tool to text_search rule', () => {
    const match = findMatchingRule('Grep', { pattern: 'function' }, rules);
    expect(match).toBeDefined();
    expect(match!.intent).toBe('text_search');
  });

  it('matches Glob tool to file_discovery rule', () => {
    const match = findMatchingRule('Glob', { pattern: '**/*.ts' }, rules);
    expect(match).toBeDefined();
    expect(match!.intent).toBe('file_discovery');
  });

  it('matches sed -i to file_modify block rule', () => {
    const match = findMatchingRule('Bash', { command: "sed -i 's/a/b/g' f" }, rules);
    expect(match).toBeDefined();
    expect(match!.intent).toBe('file_modify');
    expect(match!.enforcement).toBe('block');
  });

  it('returns undefined for Read tool (no rule — pass through)', () => {
    const match = findMatchingRule('Read', { file_path: '/some/file.ts' }, rules);
    expect(match).toBeUndefined();
  });

  it('returns undefined for unknown tools', () => {
    const match = findMatchingRule('SomeOtherTool', {}, rules);
    expect(match).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/router/rules.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the routing rules**

Create `src/router/rules.ts`:

```typescript
import type { ToolRule } from '../types.js';
import { classifyIntent } from './intent.js';

/**
 * Default routing rules — ported and evolved from damage-control-guardrails.
 *
 * Priority resolution for each rule: rtk > jcodemunch > claudeTool > fallback
 * Enforcement: block | advise | silent (configurable per-rule in .harness.yaml)
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

    // ── File Read ──
    {
      match: (tool: string, args: Record<string, unknown>) => {
        return classifyIntent(tool, args) === 'file_read';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/router/rules.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/router/rules.ts tests/router/rules.test.ts
git commit -m "feat: add default routing rules ported from damage-control-guardrails"
```

---

### Task 3: Environment-Aware Resolver

**Files:**
- Create: `src/router/resolver.ts`
- Create: `tests/router/resolver.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/resolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolve } from '../../src/router/resolver.js';
import type { ToolRule, Environment, Resolution } from '../../src/types.js';

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

const textSearchRule: ToolRule = {
  match: /grep/,
  intent: 'text_search',
  resolutions: {
    rtk: { action: 'advise', tool: 'rtk grep', reason: 'token optimized' },
    jcodemunch: { action: 'advise', tool: 'jcodemunch search_text', reason: 'indexed search' },
    claudeTool: { action: 'advise', tool: 'Grep', reason: 'structured output' },
    fallback: { action: 'allow' },
  },
  enforcement: 'advise',
};

const fileModifyRule: ToolRule = {
  match: /sed -i/,
  intent: 'file_modify',
  resolutions: {
    _: { action: 'block', reason: 'Use Edit tool' },
  },
  enforcement: 'block',
};

describe('resolve', () => {
  it('picks rtk resolution when rtk is available', () => {
    const env = makeEnv({ rtkAvailable: true, rtkPath: '/usr/bin/rtk' });
    const result = resolve(textSearchRule, env);
    expect(result.action).toBe('advise');
    if (result.action === 'advise') {
      expect(result.tool).toBe('rtk grep');
    }
  });

  it('picks jcodemunch resolution when rtk unavailable but jcodemunch indexed', () => {
    const env = makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true });
    const result = resolve(textSearchRule, env);
    expect(result.action).toBe('advise');
    if (result.action === 'advise') {
      expect(result.tool).toBe('jcodemunch search_text');
    }
  });

  it('picks claudeTool resolution when neither rtk nor jcodemunch available', () => {
    const env = makeEnv();
    const result = resolve(textSearchRule, env);
    expect(result.action).toBe('advise');
    if (result.action === 'advise') {
      expect(result.tool).toBe('Grep');
    }
  });

  it('picks fallback when no specialized tools available and no claudeTool', () => {
    const ruleWithoutClaude: ToolRule = {
      match: /test/,
      intent: 'text_search',
      resolutions: {
        rtk: { action: 'advise', tool: 'rtk', reason: 'test' },
        fallback: { action: 'allow' },
      },
      enforcement: 'advise',
    };
    const env = makeEnv();
    const result = resolve(ruleWithoutClaude, env);
    expect(result.action).toBe('allow');
  });

  it('picks wildcard resolution when present', () => {
    const env = makeEnv();
    const result = resolve(fileModifyRule, env);
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.reason).toBe('Use Edit tool');
    }
  });

  it('wildcard resolution ignores environment state', () => {
    const env = makeEnv({ rtkAvailable: true, jcodemunchAvailable: true, jcodemunchCwdIndexed: true });
    const result = resolve(fileModifyRule, env);
    // Wildcard always wins regardless of environment
    expect(result.action).toBe('block');
  });

  it('picks jcodemunch over rtk when rtk resolution not defined in rule', () => {
    const ruleNoRtk: ToolRule = {
      match: /test/,
      intent: 'file_discovery',
      resolutions: {
        jcodemunch: { action: 'advise', tool: 'jcodemunch get_file_tree', reason: 'cached' },
        fallback: { action: 'allow' },
      },
      enforcement: 'advise',
    };
    const env = makeEnv({ rtkAvailable: true, jcodemunchAvailable: true, jcodemunchCwdIndexed: true });
    const result = resolve(ruleNoRtk, env);
    expect(result.action).toBe('advise');
    if (result.action === 'advise') {
      expect(result.tool).toBe('jcodemunch get_file_tree');
    }
  });

  it('allows when no matching resolution found', () => {
    const rule: ToolRule = {
      match: /test/,
      intent: 'file_read',
      resolutions: {
        rtk: { action: 'allow' },
      },
      enforcement: 'advise',
    };
    const env = makeEnv(); // rtk not available
    const result = resolve(rule, env);
    expect(result.action).toBe('allow');
  });

  it('handles string "allow" shorthand in resolutions', () => {
    const rule: ToolRule = {
      match: /cat/,
      intent: 'file_read',
      resolutions: {
        rtk: 'allow' as any,
        fallback: { action: 'advise', tool: 'Read', reason: 'structured' },
      },
      enforcement: 'advise',
    };
    const env = makeEnv({ rtkAvailable: true, rtkPath: '/usr/bin/rtk' });
    const result = resolve(rule, env);
    expect(result.action).toBe('allow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/router/resolver.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the resolver**

Create `src/router/resolver.ts`:

```typescript
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
 * Priority: wildcard (_) > rtk > jcodemunch > claudeTool > fallback > allow
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

  // Claude built-in tools
  const claude = normalizeResolution(resolutions.claudeTool);
  if (claude) return claude;

  // Fallback
  const fallback = normalizeResolution(resolutions.fallback);
  if (fallback) return fallback;

  // Default: allow
  return ALLOW;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/router/resolver.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/router/resolver.ts tests/router/resolver.test.ts
git commit -m "feat: add environment-aware resolver with rtk > jcodemunch > claude priority"
```

---

### Task 4: PreToolUse Hook Entry Point

**Files:**
- Create: `src/router/hook.ts`
- Create: `tests/router/hook.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/hook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePreToolUse } from '../../src/router/hook.js';
import { SessionCache } from '../../src/session/cache.js';
import type { Environment, HarnessConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

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

describe('handlePreToolUse', () => {
  let cache: SessionCache;
  let config: HarnessConfig;

  beforeEach(() => {
    cache = new SessionCache();
    config = structuredClone(DEFAULT_CONFIG);
  });

  it('allows Read tool without interception', () => {
    cache.setEnvironment(makeEnv());
    const result = handlePreToolUse('Read', { file_path: '/some/file.ts' }, cache, config);
    expect(result).toBeNull(); // null = allow, no output
  });

  it('advises jcodemunch for Grep when indexed', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Grep', { pattern: 'function' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('jcodemunch');
    expect(result).toContain('advise');
  });

  it('blocks sed -i regardless of environment', () => {
    cache.setEnvironment(makeEnv({ rtkAvailable: true, jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Bash', { command: "sed -i 's/old/new/g' file.ts" }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('block');
    expect(result).toContain('Edit');
  });

  it('advises rtk for grep when rtk available', () => {
    cache.setEnvironment(makeEnv({ rtkAvailable: true, rtkPath: '/usr/bin/rtk' }));
    const result = handlePreToolUse('Bash', { command: 'grep -r pattern .' }, cache, config);
    expect(result).not.toBeNull();
    expect(result).toContain('rtk');
  });

  it('returns null for pass-through tools', () => {
    cache.setEnvironment(makeEnv());
    const result = handlePreToolUse('Bash', { command: 'ls -la' }, cache, config);
    expect(result).toBeNull();
  });

  it('returns null for Edit tool (allowed)', () => {
    cache.setEnvironment(makeEnv());
    const result = handlePreToolUse('Edit', { file_path: '/some/file.ts' }, cache, config);
    expect(result).toBeNull();
  });

  it('uses default advise level when environment not set', () => {
    // No environment set (session start hook hasn't run)
    const result = handlePreToolUse('Grep', { pattern: 'test' }, cache, config);
    // Should still work — uses fallback resolution
    expect(result).not.toBeNull();
    expect(result).toContain('Grep');
  });

  it('includes enforcement level in output', () => {
    cache.setEnvironment(makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true }));
    const result = handlePreToolUse('Bash', { command: 'grep -r pattern .' }, cache, config);
    expect(result).not.toBeNull();
    // grep default enforcement is 'block'
    expect(result).toContain('block');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/router/hook.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook entry point**

Create `src/router/hook.ts`:

```typescript
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
      `Recommended: use ${resolution.tool} — ${resolution.reason}`,
      enforcementLevel === 'block'
        ? `This operation is blocked by .harness.yaml. Use the recommended tool instead.`
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/router/hook.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/router/hook.ts tests/router/hook.test.ts
git commit -m "feat: add PreToolUse hook with environment-aware routing"
```

---

### Task 5: SessionStart Hook (Auto-Index + Environment Detection)

**Files:**
- Create: `src/session/start.ts`
- Create: `tests/session/start.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/session/start.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSessionStart } from '../../src/session/start.js';
import { SessionCache } from '../../src/session/cache.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

describe('handleSessionStart', () => {
  let cache: SessionCache;

  beforeEach(() => {
    cache = new SessionCache();
    vi.resetAllMocks();
  });

  it('detects environment and caches it', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') return '/usr/bin/rtk';
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":["local/test-project"]}';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);

    const env = cache.getEnvironment();
    expect(env).toBeDefined();
    expect(env!.rtkAvailable).toBe(true);
    expect(env!.jcodemunchAvailable).toBe(true);
  });

  it('auto-indexes CWD with jcodemunch when available but not indexed', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":[]}';
      if (cmd.includes('index_folder')) return JSON.stringify({ success: true, repo: 'local/test-project' });
      return '';
    });

    await handleSessionStart('/home/user/test-project', cache);

    // Should have called index_folder for the CWD
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('index_folder'),
      expect.anything(),
    );
  });

  it('skips indexing when already indexed', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return JSON.stringify({ repos: ['local/test-project'] });
      return '';
    });

    await handleSessionStart('/home/user/test-project', cache);

    // Should NOT have called index_folder — already indexed
    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    expect(calls.find(c => c.includes('index_folder'))).toBeUndefined();
  });

  it('skips indexing when jcodemunch not available', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') throw new Error('not found');
      if (cmd === 'which jcodemunch') throw new Error('not found');
      return '';
    });

    await handleSessionStart('/home/user/test-project', cache);

    const calls = vi.mocked(execSync).mock.calls.map(c => c[0] as string);
    expect(calls.find(c => c.includes('index_folder'))).toBeUndefined();
  });

  it('returns diagnostic output for session start', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which rtk') return '/usr/bin/rtk';
      if (cmd === 'which jcodemunch') return '/usr/bin/jcodemunch';
      if (cmd.includes('list_repos')) return '{"repos":["local/test-project"]}';
      return '';
    });

    const output = await handleSessionStart('/home/user/test-project', cache);
    expect(output).toContain('rtk');
    expect(output).toContain('jcodemunch');
    expect(output).toContain('indexed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/start.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the session start handler**

Create `src/session/start.ts`:

```typescript
import { execSync } from 'node:child_process';
import { basename } from 'node:path';
import { SessionCache } from './cache.js';
import type { Environment } from '../types.js';

/**
 * SessionStart hook handler. Detects environment and auto-indexes CWD
 * with jcodemunch if available but not yet indexed.
 */
export async function handleSessionStart(cwd: string, cache: SessionCache): Promise<string> {
  const env = await detectAndIndex(cwd);
  cache.setEnvironment(env);

  const lines = [
    '[claude-stack-utils] Session initialized',
    `  rtk: ${env.rtkAvailable ? `available (${env.rtkPath})` : 'not found'}`,
    `  jcodemunch: ${env.jcodemunchAvailable ? 'available' : 'not found'}`,
  ];

  if (env.jcodemunchAvailable) {
    if (env.jcodemunchCwdIndexed) {
      lines.push(`  CWD indexed: ${env.jcodemunchCwdRepo}`);
    } else {
      lines.push(`  CWD: not indexed (auto-indexing skipped)`);
    }
  }

  lines.push(`  Detected at: ${new Date(env.detectedAt).toISOString()}`);

  return lines.join('\n');
}

async function detectAndIndex(cwd: string): Promise<Environment> {
  // Detect rtk
  let rtkAvailable = false;
  let rtkPath: string | null = null;
  try {
    rtkPath = execSync('which rtk', { encoding: 'utf-8' }).trim();
    rtkAvailable = true;
  } catch {
    // rtk not found
  }

  // Detect jcodemunch
  let jcodemunchAvailable = false;
  let jcodemunchCwdIndexed = false;
  let jcodemunchCwdRepo: string | null = null;
  let jcodemunchKnownRepos: string[] = [];

  try {
    execSync('which jcodemunch', { encoding: 'utf-8' });
    jcodemunchAvailable = true;

    // Check existing indexes
    const raw = execSync('jcodemunch list_repos', { encoding: 'utf-8' }).trim();
    const parsed = JSON.parse(raw);
    jcodemunchKnownRepos = parsed.repos ?? [];

    const folderName = basename(cwd);
    const match = jcodemunchKnownRepos.find(r => r.endsWith(folderName)) ?? null;

    if (match) {
      jcodemunchCwdIndexed = true;
      jcodemunchCwdRepo = match;
    } else {
      // Auto-index CWD
      try {
        const indexResult = execSync(
          `jcodemunch index_folder --path "${cwd}"`,
          { encoding: 'utf-8', timeout: 60_000 },
        ).trim();
        const parsedResult = JSON.parse(indexResult);
        if (parsedResult.success) {
          jcodemunchCwdIndexed = true;
          jcodemunchCwdRepo = parsedResult.repo ?? null;
          if (jcodemunchCwdRepo && !jcodemunchKnownRepos.includes(jcodemunchCwdRepo)) {
            jcodemunchKnownRepos.push(jcodemunchCwdRepo);
          }
        }
      } catch {
        // Auto-index failed — continue without indexing
      }
    }
  } catch {
    // jcodemunch not found
  }

  return {
    rtkAvailable,
    rtkPath,
    jcodemunchAvailable,
    jcodemunchCwdIndexed,
    jcodemunchCwdRepo,
    jcodemunchKnownRepos,
    detectedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session/start.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/start.ts tests/session/start.test.ts
git commit -m "feat: add SessionStart hook with auto-indexing and environment detection"
```

---

### Task 6: Verify All Phase 2 Tests Pass Together

- [ ] **Step 1: Run full test suite (Phase 1 + Phase 2)**

Run: `npx vitest run`
Expected: all tests pass — types, config, environment, cache, intent, rules, resolver, hook, session start

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: phase 2 complete - tool router with intent, rules, resolver, hooks"
```

---

### Task 7: Phase Retrospective — GStack Comparison

Use `superpowers:debugging` to analyze Phase 2 design and code quality against the gstack reference implementation (indexed as `local/gstack`).

- [ ] **Step 1: Research gstack routing/resolver patterns**

Use jcodemunch to find gstack's routing, resolver, and command graph:
```
search_symbols(repo="local/gstack", query="resolve")
search_symbols(repo="local/gstack", query="route")
search_symbols(repo="local/gstack", query="command")
search_symbols(repo="local/gstack", query="intent")
search_symbols(repo="local/gstack", query="hook")
get_file_tree(repo="local/gstack", path_prefix="src")
```

- [ ] **Step 2: Write comparative analysis**

Create `docs/retrospectives/phase-2-retrospective.md`:

```markdown
# Phase 2 Retrospective — Tool Router vs GStack

## Shared Patterns
- [What patterns did both projects use?]

## Differences
- [Where do the designs diverge? Why?]

## GStack Pros (patterns worth adopting)
- [Proven patterns from gstack that improve our router]

## Our Pros Over GStack
- [Design decisions where our approach is better]

## Cons / Improvements Needed
- [Areas where gstack's approach is demonstrably better]

## Action Items
- [Concrete improvements to make before Phase 3]
```

- [ ] **Step 3: Commit retrospective**

```bash
git add docs/retrospectives/phase-2-retrospective.md
git commit -m "docs: phase 2 retrospective — gstack router comparison"
```
