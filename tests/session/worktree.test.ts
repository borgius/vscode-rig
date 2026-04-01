import { describe, it, expect } from 'vitest';
import { checkWorktreeSuggestion } from '../../src/session/worktree.js';

function makeExec(results: Record<string, string | Error>) {
  return (cmd: string): string => {
    const result = results[cmd];
    if (result instanceof Error) throw result;
    return result;
  };
}

describe('checkWorktreeSuggestion', () => {
  it('returns suggestion when on master', () => {
    const exec = makeExec({ 'git branch --show-current': 'master' });
    const result = checkWorktreeSuggestion('/some/project', exec);
    expect(result).toContain('master');
    expect(result).toContain('using-git-worktrees');
  });

  it('returns suggestion when on main', () => {
    const exec = makeExec({ 'git branch --show-current': 'main' });
    const result = checkWorktreeSuggestion('/some/project', exec);
    expect(result).toContain('main');
    expect(result).toContain('using-git-worktrees');
  });

  it('returns empty string for feature branch', () => {
    const exec = makeExec({ 'git branch --show-current': 'feat/my-feature' });
    const result = checkWorktreeSuggestion('/some/project', exec);
    expect(result).toBe('');
  });

  it('returns empty string when not a git repo', () => {
    const exec = makeExec({ 'git branch --show-current': new Error('not a git repo') });
    const result = checkWorktreeSuggestion('/some/project', exec);
    expect(result).toBe('');
  });
});
