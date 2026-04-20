import type { CodebaseMap, GraphContext, SymbolSummary } from '../types.js';

interface RawOutline {
  file_count: number;
  symbol_count: number;
  languages: Record<string, number>;
  directories: Record<string, number>;
  symbol_kinds: Record<string, number>;
}

interface RawTreeEntry {
  path: string;
  type: 'file' | 'dir';
  symbol_count?: number;
  children?: RawTreeEntry[];
}

interface RawSymbolResult {
  name: string;
  kind: string;
  file: string;
  line: number;
  summary: string;
  score?: number;
}

export function formatRepoOutline(outline: RawOutline): string {
  const lines: string[] = [];
  lines.push(`${outline.file_count} files, ${outline.symbol_count} symbols`);

  const langs = Object.entries(outline.languages);
  if (langs.length > 0) {
    lines.push('Languages: ' + langs.map(([l, c]) => `${l}: ${c}`).join(', '));
  }

  const kinds = Object.entries(outline.symbol_kinds);
  if (kinds.length > 0) {
    lines.push('Symbols: ' + kinds.map(([k, c]) => `${k}s: ${c}`).join(', '));
  }

  return lines.join('\n');
}

export function formatFileTree(tree: RawTreeEntry[]): CodebaseMap['structure'] {
  return tree.map(entry => ({
    path: entry.path,
    type: entry.type,
    ...(entry.symbol_count !== undefined ? { symbolCount: entry.symbol_count } : {}),
  }));
}

export function formatSymbolSearch(results: RawSymbolResult[]): SymbolSummary[] {
  return results
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map(({ name, kind, file, line, summary }) => ({
      name,
      kind,
      file,
      line,
      summary,
    }));
}

const ENTRY_POINT_PATTERNS = [
  /(?:^|\/)index\.[tj]sx?$/,
  /(?:^|\/)main\.[tj]sx?$/,
  /(?:^|\/)main\.py$/,
  /(?:^|\/)cli\.[tj]sx?$/,
  /(?:^|\/)app\.[tj]sx?$/,
  /(?:^|\/)server\.[tj]sx?$/,
];

export function buildCodebaseMap(
  outline: RawOutline,
  tree: RawTreeEntry[],
  symbols: SymbolSummary[],
  dependencies: string[],
): CodebaseMap {
  const structure = formatFileTree(tree);

  const entryPoints = tree
    .filter(e => e.type === 'file')
    .map(e => e.path)
    .filter(path => ENTRY_POINT_PATTERNS.some(p => p.test(path)));

  const symbolKinds = outline.symbol_kinds;

  return {
    structure,
    entryPoints,
    keyExports: symbols,
    dependencies,
    languages: outline.languages,
    symbols: {
      functions: symbolKinds.function ?? symbolKinds.method ?? 0,
      classes: symbolKinds.class ?? 0,
      types: symbolKinds.type ?? 0,
    },
  };
}

// ── Graphify Context Builder ──

interface RawGodNode {
  label: string;
  degree: number;
}

interface RawCommunity {
  id: number;
  label: string;
  nodeCount: number;
}

const GOD_NODE_PATTERN = /^\s*\d+\.\s+(.+?)\s+-\s+(\d+)\s+edges?$/;
const COMMUNITY_PATTERN = /^Community\s+(\d+):\s+(.+?)\s+\((\d+)\s+nodes?\)$/;

function parseStatsLine(text: string, key: string): number | null {
  const pattern = new RegExp(`^${key}:\\s*(\\d+)`, 'm');
  const match = text.match(pattern);
  return match ? parseInt(match[1], 10) : null;
}

function parseGodNodes(text: string | null): RawGodNode[] {
  if (!text) return [];
  const nodes: RawGodNode[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(GOD_NODE_PATTERN);
    if (match) {
      nodes.push({ label: match[1], degree: parseInt(match[2], 10) });
    }
  }
  return nodes;
}

function parseCommunities(text: string): RawCommunity[] {
  const communities: RawCommunity[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(COMMUNITY_PATTERN);
    if (match) {
      communities.push({
        id: parseInt(match[1], 10),
        label: match[2],
        nodeCount: parseInt(match[3], 10),
      });
    }
  }
  return communities;
}

export function buildGraphContext(
  statsResult: string | null,
  godNodesResult: string | null,
): GraphContext | null {
  if (!statsResult) return null;

  const nodes = parseStatsLine(statsResult, 'Nodes');
  const edges = parseStatsLine(statsResult, 'Edges');
  const communitiesCount = parseStatsLine(statsResult, 'Communities');

  if (nodes === null || edges === null || communitiesCount === null) return null;

  return {
    godNodes: parseGodNodes(godNodesResult),
    communities: parseCommunities(statsResult),
    stats: { nodes, edges, communities: communitiesCount },
  };
}
