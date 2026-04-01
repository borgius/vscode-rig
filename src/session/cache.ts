import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment, MetricsBaseline, SessionCacheFile } from '../types.js';

const ENV_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function sessionCachePath(cwd: string): string {
  const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 12);
  return join('/tmp', `rig-session-${hash}.json`);
}

export class SessionCache {
  private cwd: string | undefined;
  private environment: Environment | undefined;
  private editedFiles: Map<string, Set<string>> = new Map();
  private currentPhase: string | null = null;
  private metricsBaseline: MetricsBaseline | undefined;
  private metricCounters = { rtkCalls: 0, jmCalls: 0 };
  private toolsWarned = false;

  constructor(cwd?: string) {
    this.cwd = cwd;
    if (cwd) {
      this.load();
    }
  }

  getEnvironment(): Environment | undefined {
    return this.environment;
  }

  setEnvironment(env: Environment): void {
    this.environment = env;
    this.save();
  }

  isEnvironmentStale(): boolean {
    if (!this.environment) return true;
    return Date.now() - this.environment.detectedAt > ENV_TTL_MS;
  }

  addEditedFile(filePath: string, category: 'source' | 'test'): void {
    let set = this.editedFiles.get(category);
    if (!set) {
      set = new Set<string>();
      this.editedFiles.set(category, set);
    }
    set.add(filePath);
    this.save();
  }

  getEditedFiles(category: 'source' | 'test'): string[] {
    return Array.from(this.editedFiles.get(category) ?? []);
  }

  setPhase(phase: string): void {
    this.currentPhase = phase;
    this.save();
  }

  getCurrentPhase(): string | null {
    return this.currentPhase;
  }

  getMetricsBaseline(): MetricsBaseline | undefined {
    return this.metricsBaseline;
  }

  setMetricsBaseline(baseline: MetricsBaseline): void {
    this.metricsBaseline = baseline;
    this.save();
  }

  getMetricCounters(): { rtkCalls: number; jmCalls: number } {
    return { ...this.metricCounters };
  }

  incrementMetricCounter(counter: 'rtkCalls' | 'jmCalls'): void {
    this.metricCounters[counter]++;
    this.save();
  }

  getToolsWarned(): boolean {
    return this.toolsWarned;
  }

  setToolsWarned(value: boolean): void {
    this.toolsWarned = value;
    this.save();
  }

  reset(): void {
    this.environment = undefined;
    this.editedFiles.clear();
    this.currentPhase = null;
    this.metricsBaseline = undefined;
    this.metricCounters = { rtkCalls: 0, jmCalls: 0 };
    this.toolsWarned = false;
    this.save();
  }

  private serialize(): SessionCacheFile {
    const editedFilesObj: Record<string, string[]> = {};
    for (const [key, set] of this.editedFiles) {
      editedFilesObj[key] = Array.from(set);
    }
    return {
      updatedAt: Date.now(),
      environment: this.environment ?? null,
      editedFiles: editedFilesObj,
      currentPhase: this.currentPhase,
      metricsBaseline: this.metricsBaseline ?? null,
      metricCounters: { ...this.metricCounters },
      toolsWarned: this.toolsWarned,
    };
  }

  private load(): void {
    if (!this.cwd) return;
    const path = sessionCachePath(this.cwd);
    try {
      if (!existsSync(path)) return;
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw) as SessionCacheFile;

      // Restore environment, checking TTL
      if (data.environment) {
        if (Date.now() - data.environment.detectedAt > ENV_TTL_MS) {
          // Stale — clear environment but keep other fields
          this.environment = undefined;
        } else {
          this.environment = data.environment;
        }
      }

      // Restore edited files
      if (data.editedFiles) {
        for (const [key, files] of Object.entries(data.editedFiles)) {
          this.editedFiles.set(key, new Set(files));
        }
      }

      this.currentPhase = data.currentPhase ?? null;
      this.metricsBaseline = data.metricsBaseline ?? undefined;
      this.metricCounters = data.metricCounters ?? { rtkCalls: 0, jmCalls: 0 };
      this.toolsWarned = data.toolsWarned ?? false;
    } catch {
      // Corrupt or unreadable file — start fresh
    }
  }

  private save(): void {
    if (!this.cwd) return;
    const path = sessionCachePath(this.cwd);
    try {
      writeFileSync(path, JSON.stringify(this.serialize(), null, 2) + '\n', 'utf-8');
    } catch {
      // Best-effort — don't fail hooks if /tmp is unwritable
    }
  }
}
