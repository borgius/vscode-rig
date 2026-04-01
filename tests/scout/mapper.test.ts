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
