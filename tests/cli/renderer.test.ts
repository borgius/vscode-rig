import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../src/cli/renderer.js';

describe('renderTemplate', () => {
  it('replaces {{VARIABLE}} placeholders', () => {
    const template = 'Hello {{NAME}}, your project is {{PROJECT}}.';
    const result = renderTemplate(template, { NAME: 'World', PROJECT: 'my-app' });
    expect(result).toBe('Hello World, your project is my-app.');
  });

  it('leaves unknown placeholders unchanged', () => {
    const template = 'Hello {{NAME}}, {{UNKNOWN}}.';
    const result = renderTemplate(template, { NAME: 'World' });
    expect(result).toBe('Hello World, {{UNKNOWN}}.');
  });

  it('handles missing variables gracefully', () => {
    const template = 'No vars here.';
    const result = renderTemplate(template, {});
    expect(result).toBe('No vars here.');
  });

  it('handles empty template', () => {
    const result = renderTemplate('', { NAME: 'test' });
    expect(result).toBe('');
  });

  it('replaces multiple occurrences of same variable', () => {
    const template = '{{PATH}} and {{PATH}} again';
    const result = renderTemplate(template, { PATH: '/usr/bin' });
    expect(result).toBe('/usr/bin and /usr/bin again');
  });

  it('handles multiline templates', () => {
    const template = `#!/usr/bin/env node
// Harness hook for {{PROJECT}}
// Generated at {{DATE}}
import { handlePreToolUse } from 'claude-stack-utils';
`;
    const result = renderTemplate(template, { PROJECT: 'my-app', DATE: '2026-03-31' });
    expect(result).toContain('// Harness hook for my-app');
    expect(result).toContain('// Generated at 2026-03-31');
  });
});
