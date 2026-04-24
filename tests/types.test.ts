import { describe, it, expect } from 'vitest';
import {
  isResolutionAllow,
  isResolutionAdvise,
  isResolutionBlock,
  isToolRule,
  isEnvironment,
  isGraphContext,
  isGraphifyProjectStats,
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

    it('accepts environment with graphify fields', () => {
      expect(isEnvironment({
        rtkAvailable: true,
        rtkPath: '/usr/local/bin/rtk',
        jcodemunchAvailable: true,
        jcodemunchCwdIndexed: true,
        jcodemunchCwdRepo: 'local/my-project',
        jcodemunchKnownRepos: ['local/my-project'],
        detectedAt: Date.now(),
        graphifyAvailable: true,
        graphifyGraphPath: 'graphify-out/graph.json',
      })).toBe(true);
    });

    it('accepts environment without graphify fields (backward compat)', () => {
      expect(isEnvironment({
        rtkAvailable: false,
        rtkPath: null,
        jcodemunchAvailable: false,
        jcodemunchCwdIndexed: false,
        jcodemunchCwdRepo: null,
        jcodemunchKnownRepos: [],
        detectedAt: Date.now(),
      })).toBe(true);
    });
  });

  describe('isGraphContext', () => {
    it('returns true for valid GraphContext', () => {
      expect(isGraphContext({
        godNodes: [{ label: 'handleAuth', degree: 12 }],
        communities: [{ id: 0, label: 'auth', nodeCount: 8 }],
        stats: { nodes: 450, edges: 1200, communities: 8 },
      })).toBe(true);
    });

    it('returns false for empty object', () => {
      expect(isGraphContext({})).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isGraphContext(null)).toBe(false);
      expect(isGraphContext('graph')).toBe(false);
    });

    it('returns false when missing stats', () => {
      expect(isGraphContext({
        godNodes: [],
        communities: [],
      })).toBe(false);
    });
  });

  describe('isGraphifyProjectStats', () => {
    it('returns true for valid stats', () => {
      expect(isGraphifyProjectStats({
        nodes: 287, edges: 385, communities: 52,
        extractedPct: 84, inferredPct: 16, ambiguousPct: 0,
      })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isGraphifyProjectStats(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isGraphifyProjectStats('stats')).toBe(false);
    });

    it('returns false when missing required fields', () => {
      expect(isGraphifyProjectStats({ nodes: 100, edges: 200 })).toBe(false);
    });

    it('returns false when fields have wrong types', () => {
      expect(isGraphifyProjectStats({
        nodes: '100', edges: 200, communities: 5,
        extractedPct: 90, inferredPct: 10, ambiguousPct: 0,
      })).toBe(false);
    });
  });
});
