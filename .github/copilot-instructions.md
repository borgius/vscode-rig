# vscode-rig Copilot instructions

This repository builds `rig`, a GitHub Copilot/VS Code agent harness written in
TypeScript with Vitest tests and a Commander CLI.

- Run `npm test`, `npm run lint`, and `npm run build` before completing code changes.
- Generated project files target `.github/hooks`, `.github/skills`, `.github/agents`,
  and `.github/copilot-instructions.md`.
- Copilot hooks read JSON from stdin and write Copilot hook JSON to stdout:
  `permissionDecision`/`modifiedArgs` for `PreToolUse`, and `additionalContext`
  for `SessionStart` and `PostToolUse`.
- Keep `.harness.yaml` as the source of truth for enforcement levels.
- Use injectable `ExecFn` functions for environment-detection tests.
- Do not add mock-based shortcuts to environment detection.
