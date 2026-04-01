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
    expect(grepRule).toBeDefined();
    expect(grepRule!.resolutions.jcodemunch).toBeDefined();
  });

  it('file_discovery rules have jcodemunch resolution', () => {
    const rules = getDefaultRules();
    const findRule = rules.find(r => r.intent === 'file_discovery');
    expect(findRule).toBeDefined();
    expect(findRule!.resolutions.jcodemunch).toBeDefined();
  });

  it('file_read rules have rtk resolution', () => {
    const rules = getDefaultRules();
    const catRule = rules.find(r => r.intent === 'file_read');
    expect(catRule).toBeDefined();
    expect(catRule!.resolutions.rtk).toBeDefined();
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
