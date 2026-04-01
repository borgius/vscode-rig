# Phase 7: CI Guardrails

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI guardrails for documentation quality, link integrity, and coverage gates. Inspired by bjcoombs' agentic-patterns PR #2.

**Architecture:** GitHub Actions workflows for markdown linting, link checking, and coverage enforcement. Configuration files committed to repo. Coverage gates enforce per-PR patch coverage minimums.

**Tech Stack:** markdownlint-cli2, GitHub Actions, vitest coverage

**Depends on:** Phase 1-6 (all source modules)

---

## File Structure

```
.github/
  workflows/
    docs.yml                 # Markdown lint + link integrity CI
    coverage.yml             # Coverage gate CI
.markdownlint-cli2.jsonc     # Markdown lint configuration
tests/
  ci/
    markdown-lint.test.ts    # Test that config is valid
    coverage-config.test.ts  # Test coverage thresholds
```

---

### Task 1: Markdown Lint Configuration

**Files:**

- Create: `.markdownlint-cli2.jsonc`
- Create: `.github/workflows/docs.yml`

- [ ] **Step 1: Create markdownlint config**

Create `.markdownlint-cli2.jsonc`:

```jsonc
{
  "config": {
    "default": true,
    "MD001": true,   // heading-increment
    "MD003": { "style": "atx" },  // heading style
    "MD009": { "br_spaces": 2 },  // trailing spaces
    "MD010": true,   // hard tabs
    "MD012": true,   // multiple-consecutive-blank-lines
    "MD013": { "line_length": 200, "code_blocks": false, "tables": false },
    "MD014": true,   // commands-show-output
    "MD018": true,   // no-missing-space-atx
    "MD022": true,   // blanks-around-headings
    "MD023": true,   // heading-start-left
    "MD024": { "siblings_only": true },  // no-duplicate-heading
    "MD025": true,   // single-title
    "MD026": true,   // no-trailing-punctuation-in-heading
    "MD027": true,   // no-multiple-space-blockquote
    "MD028": true,   // no-blanks-blockquote
    "MD029": { "style": "ordered" },  // ol-prefix
    "MD030": true,   // list-marker-space
    "MD031": true,   // blanks-around-fences
    "MD032": true,   // blanks-around-lists
    "MD033": false,  // no-inline-html (allow in skill templates)
    "MD034": false,  // no-bare-urls (allow in skill templates)
    "MD035": true,   // hr-style
    "MD036": true,   // no-emphasis-as-heading
    "MD037": true,   // no-space-in-emphasis
    "MD038": false,  // no-space-in-code (allow in templates)
    "MD039": true,   // no-space-in-links
    "MD040": false,  // no-language-code (allow in templates)
    "MD041": { "line_number": 1 },  // first-line-heading (YAML frontmatter ok)
    "MD042": true,   // no-empty-links
    "MD045": true,   // no-alt-text (images need alt)
    "MD046": { "style": "fenced" },  // code style
    "MD047": true,   // single-trailing-newline
    "MD048": { "style": "backtick" },  // code-fence-style
    "MD049": true,   // emphasis-style
    "MD050": true,   // strong-style
    "MD051": true,   // link-fragments
    "MD052": true,   // reference-links-images
    "MD053": true,   // link-image-reference-definitions
    "MD054": true,   // link-image-style
    "MD055": true,   // table-pipe-style
    "MD056": true    // table-column-count
  },
  "ignores": [
    "node_modules/",
    "dist/",
    "coverage/"
  ]
}
```

- [ ] **Step 2: Create docs CI workflow**

Create `.github/workflows/docs.yml`:

```yaml
name: Docs Quality

on:
  pull_request:
    paths:
      - '**.md'
      - '.markdownlint-cli2.jsonc'
  push:
    branches: [main]
    paths:
      - '**.md'

jobs:
  markdown-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint markdown
        uses: DavidAnson/markdownlint-cli2-action@v19
        with:
          globs: '**/*.md'

  link-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check links
        uses: lycheeverse/lychee-action@v2
        with:
          args: '--no-progress **/*.md'
          fail: true
```

- [ ] **Step 3: Commit**

```bash
git add .markdownlint-cli2.jsonc .github/workflows/docs.yml
git commit -m "ci: add markdown lint and link integrity CI guardrails"
```

---

### Task 2: Coverage Gate

**Files:**

- Create: `.github/workflows/coverage.yml`

- [ ] **Step 1: Create coverage workflow**

Create `.github/workflows/coverage.yml`:

```yaml
name: Coverage Gate

on:
  pull_request:
    paths:
      - 'src/**'
      - 'tests/**'

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - name: Run tests with coverage
        run: npx vitest run --coverage
      - name: Check coverage thresholds
        run: |
          echo "Checking coverage thresholds..."
          # vitest coverage config enforces thresholds; this step confirms the run passed
          echo "Coverage gate passed"
```

- [ ] **Step 2: Add coverage config to vitest**

Update `vitest.config.ts` to include coverage thresholds:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  thresholds: {
    statements: 80,
    branches: 75,
    functions: 80,
    lines: 80,
  },
  include: ['src/**/*.ts'],
  exclude: ['src/cli/index.ts'], // CLI entry point
},
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/coverage.yml vitest.config.ts
git commit -m "ci: add coverage gate with 80% threshold"
```

---

### Task 3: Verify All Phase 7 Files Exist

- [ ] **Step 1: Verify CI configs**

```bash
test -f .markdownlint-cli2.jsonc && echo "OK" || echo "MISSING"
test -f .github/workflows/docs.yml && echo "OK" || echo "MISSING"
test -f .github/workflows/coverage.yml && echo "OK" || echo "MISSING"
```

- [ ] **Step 2: Run markdown lint locally (if markdownlint-cli2 available)**

```bash
npx markdownlint-cli2 '**/*.md' 2>/dev/null || echo "Install with: npm install -D markdownlint-cli2"
```

- [ ] **Step 3: Commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: phase 7 complete - CI guardrails for docs and coverage"
```

---

### Task 4: Phase Retrospective — GStack Comparison

Use `superpowers:debugging` to analyze Phase 7 CI guardrails against gstack's CI/testing patterns (indexed as `local/gstack`).

- [ ] **Step 1: Research gstack CI/testing patterns**

```
search_symbols(repo="local/gstack", query="test")
search_symbols(repo="local/gstack", query="coverage")
search_symbols(repo="local/gstack", query="lint")
search_symbols(repo="local/gstack", query="ci")
get_file_tree(repo="local/gstack", path_prefix=".github")
```

- [ ] **Step 2: Write comparative analysis**

Create `docs/retrospectives/phase-7-retrospective.md` with sections: Shared Patterns, Differences, GStack Pros, Our Pros, Cons/Improvements, Action Items.

- [ ] **Step 3: Commit retrospective**

```bash
git add docs/retrospectives/phase-7-retrospective.md
git commit -m "docs: phase 7 retrospective — gstack CI guardrails comparison"
```
