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
    graphifyAvailable: false,
    graphifyGraphPath: null,
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
    copilotTool: { action: 'advise', tool: 'Grep', reason: 'structured output' },
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
    expect((result as { action: 'advise'; tool: string }).tool).toBe('rtk grep');
  });

  it('picks jcodemunch resolution when rtk unavailable but jcodemunch indexed', () => {
    const env = makeEnv({ jcodemunchAvailable: true, jcodemunchCwdIndexed: true });
    const result = resolve(textSearchRule, env);
    expect(result.action).toBe('advise');
    expect((result as { action: 'advise'; tool: string }).tool).toBe('jcodemunch search_text');
  });

  it('picks copilotTool resolution when neither rtk nor jcodemunch available', () => {
    const env = makeEnv();
    const result = resolve(textSearchRule, env);
    expect(result.action).toBe('advise');
    expect((result as { action: 'advise'; tool: string }).tool).toBe('Grep');
  });

  it('picks fallback when no specialized tools available and no copilotTool', () => {
    const ruleWithoutCopilot: ToolRule = {
      match: /test/,
      intent: 'text_search',
      resolutions: {
        rtk: { action: 'advise', tool: 'rtk', reason: 'test' },
        fallback: { action: 'allow' },
      },
      enforcement: 'advise',
    };
    const env = makeEnv();
    const result = resolve(ruleWithoutCopilot, env);
    expect(result.action).toBe('allow');
  });

  it('picks wildcard resolution when present', () => {
    const env = makeEnv();
    const result = resolve(fileModifyRule, env);
    expect(result.action).toBe('block');
    expect((result as { action: 'block'; reason: string }).reason).toBe('Use Edit tool');
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
    expect((result as { action: 'advise'; tool: string }).tool).toBe('jcodemunch get_file_tree');
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
