export type IntentType =
  | 'file_read'
  | 'text_search'
  | 'file_discovery'
  | 'file_modify'
  | 'symbol_search'
  | 'pass_through';

const INTENT_PRECEDENCE: Record<IntentType, number> = {
  file_modify: 5,
  symbol_search: 4,
  text_search: 3,
  file_discovery: 3,
  file_read: 2,
  pass_through: 0,
};

const BASH_INTENT_PATTERNS: Array<{ pattern: RegExp; intent: IntentType }> = [
  // Destructive patterns first (highest precedence)
  { pattern: /^\s*sed\s+(-i|--in-place)\b/, intent: 'file_modify' },
  { pattern: /^\s*awk\b.*>\s*\S+/, intent: 'file_modify' },
  // Search patterns
  { pattern: /^\s*(grep[rx]?|rg)\b/, intent: 'text_search' },
  { pattern: /^\s*sed\b/, intent: 'text_search' },
  // Discovery patterns
  { pattern: /^\s*find\s+/, intent: 'file_discovery' },
  { pattern: /^\s*fd\b/, intent: 'file_discovery' },
  // Read patterns
  { pattern: /^\s*cat\s+\S+/, intent: 'file_read' },
  { pattern: /^\s*head\s+/, intent: 'file_read' },
  { pattern: /^\s*tail\s+/, intent: 'file_read' },
];

const TOOL_INTENT_MAP: Record<string, IntentType> = {
  Grep: 'text_search',
  Glob: 'file_discovery',
  Read: 'file_read',
  Edit: 'file_modify',
  Write: 'file_modify',
  Bash: 'pass_through', // resolved by bash command analysis
};

function classifyBashCommand(command: string): IntentType {
  const segments = command.split(/&&|\|\||;|\|/);
  let highest: IntentType = 'pass_through';

  for (const segment of segments) {
    const trimmed = segment.trim();
    for (const { pattern, intent } of BASH_INTENT_PATTERNS) {
      if (pattern.test(trimmed)) {
        if (INTENT_PRECEDENCE[intent] > INTENT_PRECEDENCE[highest]) {
          highest = intent;
        }
        break;
      }
    }
  }

  return highest;
}

export function classifyIntent(tool: string, args: Record<string, unknown>): IntentType {
  // Direct tool mapping
  if (tool === 'Bash' && typeof args.command === 'string') {
    return classifyBashCommand(args.command);
  }

  if (tool === 'Agent' && typeof args.subagent_type === 'string') {
    if (args.subagent_type === 'Explore') return 'file_discovery';
    return 'pass_through';
  }

  return TOOL_INTENT_MAP[tool] ?? 'pass_through';
}
