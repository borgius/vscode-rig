export type ExecFn = (cmd: string) => string;

const MAIN_BRANCHES = new Set(['master', 'main']);

export function checkWorktreeSuggestion(cwd: string, exec: ExecFn): string {
  try {
    const branch = exec('git branch --show-current').trim();
    if (MAIN_BRANCHES.has(branch)) {
      return `[rig] On ${branch} — consider /using-git-worktrees for isolated feature work.`;
    }
  } catch {
    // Not a git repo or git not available
  }
  return '';
}
