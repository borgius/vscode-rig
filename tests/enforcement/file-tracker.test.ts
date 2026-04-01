import { describe, it, expect, beforeEach } from 'vitest';
import { FileTracker } from '../../src/enforcement/file-tracker.js';

describe('FileTracker', () => {
  let tracker: FileTracker;

  beforeEach(() => {
    tracker = new FileTracker();
  });

  describe('classifyFile', () => {
    it('classifies .test.ts files as test', () => {
      expect(tracker.classifyFile('tests/router/resolver.test.ts')).toBe('test');
      expect(tracker.classifyFile('src/__tests__/hook.test.ts')).toBe('test');
      expect(tracker.classifyFile('foo.spec.ts')).toBe('test');
      expect(tracker.classifyFile('bar.test.js')).toBe('test');
    });

    it('classifies .test.py files as test', () => {
      expect(tracker.classifyFile('tests/test_resolver.py')).toBe('test');
      expect(tracker.classifyFile('tests/conftest.py')).toBe('test');
    });

    it('classifies source files as source', () => {
      expect(tracker.classifyFile('src/router/resolver.ts')).toBe('source');
      expect(tracker.classifyFile('src/config.py')).toBe('source');
      expect(tracker.classifyFile('lib/index.js')).toBe('source');
    });

    it('classifies fixture files as other', () => {
      expect(tracker.classifyFile('fixtures/test-data.yaml')).toBe('other');
      expect(tracker.classifyFile('docs/plans/phase-1.md')).toBe('other');
    });

    it('classifies test utility files as test', () => {
      expect(tracker.classifyFile('tests/helpers/mock-server.ts')).toBe('test');
      expect(tracker.classifyFile('test/utils/conftest.py')).toBe('test');
    });
  });

  describe('recordEdit', () => {
    it('records source file edits', () => {
      tracker.recordEdit('src/router/resolver.ts');
      expect(tracker.getSourceEdits()).toEqual([
        { file: 'src/router/resolver.ts', turn: 0 },
      ]);
    });

    it('records test file edits', () => {
      tracker.recordEdit('tests/router/resolver.test.ts');
      expect(tracker.getTestEdits()).toEqual([
        { file: 'tests/router/resolver.test.ts', turn: 0 },
      ]);
    });

    it('increments turn counter', () => {
      tracker.recordEdit('src/a.ts');
      tracker.nextTurn();
      tracker.recordEdit('src/b.ts');
      expect(tracker.getSourceEdits()).toEqual([
        { file: 'src/a.ts', turn: 0 },
        { file: 'src/b.ts', turn: 1 },
      ]);
    });
  });

  describe('getStaleSources', () => {
    it('returns source files edited without corresponding test edits', () => {
      tracker.recordEdit('src/router/resolver.ts');
      tracker.recordEdit('src/router/rules.ts');
      tracker.recordEdit('tests/router/resolver.test.ts');
      // resolver.ts has a test, rules.ts does not
      const stale = tracker.getStaleSources();
      expect(stale.map(s => s.file)).toContain('src/router/rules.ts');
      expect(stale.map(s => s.file)).not.toContain('src/router/resolver.ts');
    });

    it('matches source to test by name convention', () => {
      tracker.recordEdit('src/enforcement/zero-defect.ts');
      tracker.recordEdit('tests/enforcement/zero-defect.test.ts');
      const stale = tracker.getStaleSources();
      expect(stale.map(s => s.file)).not.toContain('src/enforcement/zero-defect.ts');
    });

    it('matches source to test by path component', () => {
      tracker.recordEdit('src/router/hook.ts');
      tracker.recordEdit('tests/router/hook.test.ts');
      const stale = tracker.getStaleSources();
      expect(stale).toEqual([]);
    });

    it('returns empty when no source edits', () => {
      tracker.recordEdit('tests/some.test.ts');
      const stale = tracker.getStaleSources();
      expect(stale).toEqual([]);
    });

    it('respects grace period', () => {
      tracker.recordEdit('src/router/resolver.ts');
      tracker.nextTurn();
      // Within grace period of 1 turn — not stale yet
      const staleGrace = tracker.getStaleSources(1);
      expect(staleGrace).toEqual([]);
      // With grace period 0 — immediately stale
      const staleNo = tracker.getStaleSources(0);
      expect(staleNo.map(s => s.file)).toContain('src/router/resolver.ts');
    });
  });

  describe('reset', () => {
    it('clears all tracked edits', () => {
      tracker.recordEdit('src/a.ts');
      tracker.recordEdit('tests/b.test.ts');
      tracker.reset();
      expect(tracker.getSourceEdits()).toEqual([]);
      expect(tracker.getTestEdits()).toEqual([]);
    });
  });
});
