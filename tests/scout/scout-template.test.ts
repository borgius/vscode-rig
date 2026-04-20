import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('scout agent template', () => {
  const templatePath = resolve(__dirname, '../../templates/agents/scout.md');
  const template = readFileSync(templatePath, 'utf-8');

  it('includes graphify build step for external directories', () => {
    expect(template).toContain('graphify update');
  });

  it('includes graphify-out/graph.json check for external directories', () => {
    expect(template).toContain('graphify-out/graph.json');
  });

  it('gates graphify build on graphify availability', () => {
    // Must mention checking for graphify before running the build
    expect(template).toMatch(/which graphify|graphify.*available/i);
  });
});
