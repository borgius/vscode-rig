import type { HarnessConfig } from '../types.js';

const FAILURE_PATTERNS = [
  /\bFAIL(?:ED)?\b/,
  /\bERROR\b/,
  /\berror TS\d{4}\b/,
  /\b\d+ failed\b/,
];

const FAILURE_LINE_PATTERNS = [
  /^\s*(FAIL|FAILED)\s+/,
  /^\s*ERROR\s+/,
  /\berror TS\d{4}\b/,
];

/**
 * Check test output for failures and errors.
 * Returns null if clean, or a zero-defect violation message.
 */
export function checkZeroDefect(testOutput: string, config: HarnessConfig): string | null {
  const tolerance = config.rules.zero_defect?.tolerance ?? 'strict';

  const hasFailure = FAILURE_PATTERNS.some(p => p.test(testOutput));
  if (!hasFailure) return null;

  // Extract failure summary lines (individual failures, not summary counts)
  const lines = testOutput.split('\n');
  const failureLines: string[] = [];
  for (const line of lines) {
    if (FAILURE_LINE_PATTERNS.some(p => p.test(line))) {
      failureLines.push(line.trim());
    }
  }

  const isStrict = tolerance === 'strict';
  const prefix = isStrict ? '[BLOCK]' : '[ADVISE]';

  const output = [
    `${prefix} ZERO-DEFECT VIOLATION`,
    '',
    `${failureLines.length} failure(s) found:`,
    ...failureLines.slice(0, 10).map(l => `  ${l}`),
    '',
    'Zero-defect tolerance: every error, warning, and failure must be addressed.',
    '"This failure is unrelated" is never acceptable.',
    'Fix ALL errors before proceeding.',
  ];

  return output.join('\n');
}
