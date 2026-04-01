import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const TEMPLATES = resolve(import.meta.dirname, '..', '..', 'templates', 'skills');

const EXPECTED_SKILLS = ['brain-plus', 'plan-plus', 'tdd-plus', 'verify-plus', 'review-plus', 'investigate'];

describe('skill template validation', () => {
  it('all expected skill directories exist', () => {
    const dirs = readdirSync(TEMPLATES, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const expected of EXPECTED_SKILLS) {
      expect(dirs).toContain(expected);
    }
  });

  describe.each(EXPECTED_SKILLS)('%s', (skillDir) => {
    let content: string;
    let frontmatter: string;
    let body: string;

    beforeAll(() => {
      const path = join(TEMPLATES, skillDir, 'SKILL.md');
      content = readFileSync(path, 'utf-8');
      const parts = content.split('---');
      frontmatter = parts[1] ?? '';
      body = parts.slice(2).join('---');
    });

    it('has valid YAML frontmatter', () => {
      expect(content).toMatch(/^---\n/);
      expect(frontmatter).toContain('name:');
      expect(frontmatter).toContain('description:');
    });

    it('has user-invocable flag', () => {
      expect(frontmatter).toContain('user-invocable: true');
    });

    it('references superpowers wrapping', () => {
      expect(body.toLowerCase()).toContain('superpowers');
    });

    it('references skill chain navigation', () => {
      expect(body).toContain('Skill Chain');
    });

    it('uses positive framing (no "don\'t" as primary instruction)', () => {
      const lines = body.split('\n');
      const proceduralLines = lines.filter(
        l => l.trim().startsWith('-') || l.trim().startsWith('1.') || l.trim().startsWith('2.') || l.trim().startsWith('3.'),
      );
      // Count negative imperatives vs positive imperatives
      const negativeCount = proceduralLines.filter(l => /\bdon'?t\b/i.test(l) && !l.includes('mock')).length;
      const positiveCount = proceduralLines.filter(
        l => /\b(use|write|invoke|run|check|verify|show|read|load|confirm|ensure|produce)\b/i.test(l),
      ).length;
      expect(positiveCount).toBeGreaterThan(negativeCount);
    });

    it('includes checklist items', () => {
      expect(body).toContain('- [ ]');
    });

    it('specifies argument hint', () => {
      expect(frontmatter).toContain('argument-hint:');
    });

    it('includes a Completion section', () => {
      expect(body).toContain('## Completion');
    });

    it('Completion section defines exit states', () => {
      expect(body).toContain('DONE');
      expect(body).toContain('BLOCKED');
      expect(body).toContain('NEEDS_CONTEXT');
    });

    it('does not hardcode constitutional enforcement language', () => {
      expect(body).not.toContain('never mock');
      expect(body).not.toContain('Constitutional no-mock rules are enforced');
      expect(body).not.toContain('no_mocks');
    });
  });
});
