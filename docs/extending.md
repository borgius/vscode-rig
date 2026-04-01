# Extending Rig

Rig ships with a core set of enforcement checks and skills, but every project has
different non-negotiables. This doc covers how to add your own.

## Custom enforcement checks

Enforcement checks are composable functions added to the PostToolUse pipeline.
Each check follows the same signature:

```typescript
function checkFoo(
  filePath: string,
  content: string,
  config: HarnessConfig,
): string | null
```

Return `null` if the check passes, or a violation message if it fails. The
pipeline collects all violations and reports them together.

### Example: secrets scanning

Add a check that flags committed secrets, API keys, and tokens:

```typescript
// .claude/hooks/scripts/check-secrets.ts
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,                        // AWS access key
  /ghp_[0-9a-zA-Z]{36}/,                     // GitHub token
  /sk-[a-zA-Z0-9]{48}/,                      // OpenAI API key
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY/, // PEM private key
];

export function checkSecrets(
  filePath: string,
  content: string,
): string | null {
  // Skip non-source files
  if (/\.lock$|\.map$|package-lock\.json/.test(filePath)) return null;

  const match = SECRET_PATTERNS.find(p => p.test(content));
  if (!match) return null;

  return [
    '[BLOCK] Secrets detected',
    '',
    `Pattern matched: ${match.source}`,
    `File: ${filePath}`,
    '',
    'Revoke this credential immediately and use environment variables or',
    'a secrets manager instead of committing secrets to source.',
  ].join('\n');
}
```

Wire it into the post-tool-use hook by calling your check alongside the
built-in ones:

```typescript
import { checkSecrets } from './check-secrets.js';

// Inside the Edit/Write handler in post-tool-use.ts:
const secretsViolation = checkSecrets(filePath, content);
if (secretsViolation) violations.push(secretsViolation);
```

### Example: version pinning

Enforce that `package.json` dependencies use exact versions:

```typescript
const PINNING_PATTERN = /"dependencies"|"devDependencies"/;
const LOOSE_VERSION = /"[^"]+":\s*"\^|~|>=|\*|latest|x\./;

export function checkVersionPinning(
  filePath: string,
  content: string,
): string | null {
  if (filePath !== 'package.json') return null;
  if (!LOOSE_VERSION.test(content)) return null;

  return [
    '[ADVISE] Unpinned dependency version detected',
    '',
    'Use exact versions (e.g., "1.2.3") instead of ranges (^, ~, >=).',
    'Unpinned versions introduce non-deterministic builds.',
  ].join('\n');
}
```

## Custom config rules

Add new rule categories to `.harness.yaml` and read them from your check
function:

```yaml
rules:
  secrets:
    enforcement: block
    patterns:
      - "AKIA[0-9A-Z]{16}"
      - "ghp_[0-9a-zA-Z]{36}"
  version_pinning:
    enforcement: advise
```

Access custom rules in your check via `config.rules`:

```typescript
const level = (config.rules as any).secrets?.enforcement ?? 'block';
```

## Custom skills

Add a new skill by creating a SKILL.md file in `.claude/skills/<name>/`:

```markdown
---
name: security-review
description: Run security-focused checks before merging
user-invocable: true
---

# Security Review

Run these checks before any merge or deployment:

1. Check for secrets in staged files
2. Verify no new dependencies with known CVEs
3. Confirm environment variables are used for all credentials
4. Review any new network calls for proper authentication
```

The skill appears as `/security-review` in Claude Code. If you want it to wrap
a superpowers skill (like the built-in chain skills do), add `invokes:
superpowers:code-review` to the frontmatter.

## Custom agents

Add agent definitions in `.claude/agents/`. Each agent is a markdown file with
YAML frontmatter specifying tool restrictions and turn limits:

```markdown
---
name: dependency-auditor
description: Audit dependencies for CVEs and licensing issues
tools:
  - Bash
  - Read
maxTurns: 15
---

# Dependency Auditor

Check all dependencies in package.json against known CVEs...
```
