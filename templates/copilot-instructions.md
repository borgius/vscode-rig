<!-- rig-generated -->
# Copilot instructions for {{PROJECT_NAME}}

Rig is a GitHub Copilot/VS Code agent harness. Follow these repository rules when working here:

- Use the configured Copilot hooks in `.github/hooks/rig-hooks.json` for routing and enforcement.
- Treat `.harness.yaml` as the source of truth for enforcement levels.
- Prefer scoped tests for changed code during implementation, then run the full validation suite before finishing.
- Use the skill chain when the task matches a repeatable workflow: `brain+`, `plan+`, `tdd+`, `verify+`, `review+`, `debug+`, `savings`, and `investigate`.
- Use the `scout` agent for non-trivial codebase exploration before implementation.
- Never commit secrets or credentials; hooks deny or advise on sensitive operations where possible.
