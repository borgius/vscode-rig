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
