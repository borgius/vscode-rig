import type { HarnessConfig } from '../types.js';

const MOCK_PATTERNS = [
  /jest\.mock\(/,
  /vi\.mock\(/,
  /from\s+['"]unittest\.mock['"]/,
  /@patch\(/,
  /Mock\(/,
  /createMock\(/,
  /\.mock\(\{/,
];

const TEST_FILE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /(^|\/)tests?\//,
  /\/__tests__\//,
  /\/test_\w+\.py$/,
];

const EVIDENCELESS_PASS_PATTERNS = [
  /\btests? (all )?pass(ed)?\b/i,
  /\ball tests pass\b/i,
  /\btest suite passes\b/i,
];

function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some(p => p.test(filePath));
}

/**
 * Check a file's content against constitutional rules.
 * Returns null if all rules satisfied, or a warning/error message.
 */
export function checkConstitutional(
  filePath: string,
  content: string,
  config: HarnessConfig,
): string | null {
  // Rule: no_mocks — only applies to test files
  const mockLevel = config.rules.constitutional?.no_mocks ?? 'block';
  if (mockLevel !== 'silent' && isTestFile(filePath)) {
    const mockMatch = MOCK_PATTERNS.find(p => p.test(content));
    if (mockMatch) {
      const prefix = mockLevel === 'block' ? '[BLOCK]' : '[ADVISE]';
      return [
        `${prefix} Constitutional Rule: no_mocks`,
        '',
        `Test file contains a mock: ${mockMatch.source}`,
        '',
        'Constitutional rule: never mock core system components.',
        'Use real components in tests. If a dependency cannot be used directly,',
        'wrap it in a thin adapter and test the adapter separately.',
      ].join('\n');
    }
  }

  // Rule: evidence_only — check for unsupported claims of success
  const evidenceLevel = config.rules.constitutional?.evidence_only ?? 'block';
  if (evidenceLevel !== 'silent') {
    const hasEvidencelessClaim = EVIDENCELESS_PASS_PATTERNS.some(p => p.test(content));
    const hasEvidence = content.includes('```') || content.includes('✓') || content.includes('PASS');
    if (hasEvidencelessClaim && !hasEvidence) {
      const prefix = evidenceLevel === 'block' ? '[BLOCK]' : '[ADVISE]';
      return [
        `${prefix} Constitutional Rule: evidence_only`,
        '',
        'Claim of test success without evidence. "Tests pass" is not evidence.',
        'Show the test output — command run, actual output, then claim done.',
      ].join('\n');
    }
  }

  return null;
}
