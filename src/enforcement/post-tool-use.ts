import { FileTracker } from './file-tracker.js';
import { SessionCache } from '../session/cache.js';
import type { HarnessConfig } from '../types.js';
import { checkStaleTests } from './stale-test.js';
import { checkConstitutional } from './constitutional.js';
import { checkZeroDefect } from './zero-defect.js';
import { incrementMetric, captureExternalGraphifyStats } from '../session/metrics.js';
import type { ExecFn } from '../session/metrics.js';

/**
 * PostToolUse hook handler. Composes all enforcement checks.
 * Returns null if all clean, or a combined violation message.
 */
export function handlePostToolUse(
  tool: string,
  args: Record<string, unknown>,
  tracker: FileTracker,
  cache: SessionCache,
  config: HarnessConfig,
  execFn?: ExecFn,
): string | null {
  const metric = incrementMetric(tool, args);
  if (metric) {
    cache.incrementMetricCounter(metric);
  }

  const violations: string[] = [];

  // Track file edits
  if (tool === 'Edit' || tool === 'Write') {
    const filePath = args.file_path as string;
    if (filePath) {
      tracker.recordEdit(filePath);

      // Constitutional check on edited test files
      const content = (args.new_string as string) ?? '';
      const constitutional = checkConstitutional(filePath, content, config);
      if (constitutional) violations.push(constitutional);
    }

    // Stale test check
    const stale = checkStaleTests(tracker, config);
    if (stale) violations.push(stale);
  }

  // Zero-defect check on test command output
  if (tool === 'Bash') {
    const command = args.command as string;
    const output = args.output as string;

    if (command && output) {
      // Check if this was a test run
      const isTestCommand = /vitest|jest|pytest|mocha/.test(command);
      if (isTestCommand) {
        const changedFiles = cache.getChangedFiles();
        const zeroDefect = checkZeroDefect(output, config, changedFiles.length > 0 ? changedFiles : undefined);
        if (zeroDefect) violations.push(zeroDefect);
      }
    }
  }

  // Capture graphify stats for external directories accessed via jcodemunch
  const externalDir = extractExternalDirectory(tool, args);
  if (externalDir && execFn) {
    try {
      const stats = captureExternalGraphifyStats(externalDir, execFn);
      if (stats) {
        cache.setGraphifyStats(externalDir, stats);
      }
    } catch {
      // graphify not available — skip silently
    }
  }

  if (violations.length === 0) return null;

  // Return combined violations separated by separator
  return violations.join('\n\n---\n\n');
}

/**
 * Extract an external (non-CWD) directory path from jcodemunch tool calls.
 * Returns null for CWD paths or unrecognized tools.
 */
function extractExternalDirectory(
  tool: string,
  args: Record<string, unknown>,
): string | null {
  let directory: string | undefined;

  if (tool === 'mcp__jcodemunch__index_folder') {
    directory = (args.path as string) ?? (args.folder_path as string);
  } else if (tool === 'mcp__jcodemunch__resolve_repo') {
    directory = args.path as string;
  }

  if (!directory) return null;
  const cwd = process.cwd();
  if (directory.startsWith(cwd)) return null;
  return directory;
}
