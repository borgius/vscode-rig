// ── Intent Types ──

export type IntentType =
  | 'file_read'
  | 'text_search'
  | 'file_discovery'
  | 'file_modify'
  | 'symbol_search'
  | 'pass_through'
  | 'native_read'
  | 'native_grep'
  | 'native_glob'
  | 'rtk_cat_code';

// ── Resolution Types ──

export type EnforcementLevel = 'block' | 'advise' | 'silent';

export interface ResolutionAllow {
  action: 'allow';
}

export interface ResolutionAdvise {
  action: 'advise';
  tool: string;
  reason: string;
}

export interface ResolutionBlock {
  action: 'block';
  reason: string;
}

export type Resolution = ResolutionAllow | ResolutionAdvise | ResolutionBlock;
export type EnvResolution = Resolution | 'allow';

// ── Tool Rule Types ──

export interface ToolRule {
  match: RegExp | ((tool: string, args: Record<string, unknown>) => boolean);
  intent: IntentType;
  resolutions: {
    _?: EnvResolution;
    rtk?: EnvResolution;
    jcodemunch?: EnvResolution;
    claudeTool?: EnvResolution;
    fallback?: EnvResolution;
  };
  enforcement: EnforcementLevel;
}

// ── Environment Types ──

export interface Environment {
  rtkAvailable: boolean;
  rtkPath: string | null;
  jcodemunchAvailable: boolean;
  jcodemunchCwdIndexed: boolean;
  jcodemunchCwdRepo: string | null;
  jcodemunchKnownRepos: string[];
  detectedAt: number;
}

export interface MetricsBaseline {
  totalSaved: number;
  capturedAt: number;
}

export interface SessionCacheFile {
  updatedAt: number;
  environment: Environment | null;
  editedFiles: Record<string, string[]>;
  currentPhase: string | null;
  metricsBaseline: MetricsBaseline | null;
  metricCounters: { rtkCalls: number; jmCalls: number; efficientCalls: number };
  toolsWarned: boolean;
  changedFiles: string[];
}

// ── Config Types ──

export interface ToolRoutingRules {
  grep?: EnforcementLevel;
  find?: EnforcementLevel;
  glob?: EnforcementLevel;
  sed_i?: EnforcementLevel;
  cat?: EnforcementLevel;
  broad_scan?: EnforcementLevel;
  native_read?: EnforcementLevel;
  native_grep?: EnforcementLevel;
  native_glob?: EnforcementLevel;
  rtk_cat_code?: EnforcementLevel;
  read_line_threshold?: number;
}

export interface ConstitutionalRules {
  no_mocks?: EnforcementLevel;
  evidence_only?: EnforcementLevel;
  full_accounting?: EnforcementLevel;
}

export interface TestIntegrityRules {
  conditional_assert?: EnforcementLevel;
  skip_without_reason?: EnforcementLevel;
  empty_test?: EnforcementLevel;
}

export interface StaleTestRules {
  enforcement: EnforcementLevel;
  grace_period: number;
}

export interface TestScopeRules {
  enforcement: EnforcementLevel;
  allowed_unscoped: string[];
}

export interface ZeroDefectRules {
  tolerance: 'strict' | 'permissive';
  unrelated_errors?: EnforcementLevel;
}

export interface HarnessConfig {
  rules: {
    tool_routing?: ToolRoutingRules;
    constitutional?: ConstitutionalRules;
    test_integrity?: TestIntegrityRules;
    stale_tests?: StaleTestRules;
    test_scope?: TestScopeRules;
    zero_defect?: ZeroDefectRules;
    enforcement?: {
      default_level: EnforcementLevel;
    };
  };
}

// ── Codebase Map (Scout Output) ──

export interface SymbolSummary {
  name: string;
  kind: string;
  file: string;
  line: number;
  summary: string;
}

export interface CodebaseMap {
  structure: { path: string; type: 'file' | 'dir'; symbolCount?: number }[];
  entryPoints: string[];
  keyExports: SymbolSummary[];
  dependencies: string[];
  languages: Record<string, number>;
  symbols: { functions: number; classes: number; types: number };
}

// ── Type Guards ──

export function isResolutionAllow(val: unknown): val is ResolutionAllow {
  return typeof val === 'object' && val !== null && (val as ResolutionAllow).action === 'allow';
}

export function isResolutionAdvise(val: unknown): val is ResolutionAdvise {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as ResolutionAdvise).action === 'advise' &&
    typeof (val as ResolutionAdvise).tool === 'string' &&
    typeof (val as ResolutionAdvise).reason === 'string'
  );
}

export function isResolutionBlock(val: unknown): val is ResolutionBlock {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as ResolutionBlock).action === 'block' &&
    typeof (val as ResolutionBlock).reason === 'string'
  );
}

export function isToolRule(val: unknown): val is ToolRule {
  if (typeof val !== 'object' || val === null) return false;
  const rule = val as ToolRule;
  return (
    (rule.match instanceof RegExp || typeof rule.match === 'function') &&
    typeof rule.intent === 'string' &&
    typeof rule.resolutions === 'object' &&
    typeof rule.enforcement === 'string'
  );
}

export function isEnvironment(val: unknown): val is Environment {
  if (typeof val !== 'object' || val === null) return false;
  const env = val as Environment;
  return (
    typeof env.rtkAvailable === 'boolean' &&
    typeof env.jcodemunchAvailable === 'boolean' &&
    typeof env.jcodemunchCwdIndexed === 'boolean' &&
    typeof env.detectedAt === 'number'
  );
}
