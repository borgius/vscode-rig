import type { Environment, MetricsBaseline } from '../types.js';

const ENV_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class SessionCache {
  private environment: Environment | undefined;
  private editedFiles: Map<string, Set<string>> = new Map();
  private currentPhase: string | null = null;
  private metricsBaseline: MetricsBaseline | undefined;
  private metricCounters = { rtkCalls: 0, jmCalls: 0 };

  getEnvironment(): Environment | undefined {
    return this.environment;
  }

  setEnvironment(env: Environment): void {
    this.environment = env;
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
  }

  getEditedFiles(category: 'source' | 'test'): string[] {
    return Array.from(this.editedFiles.get(category) ?? []);
  }

  setPhase(phase: string): void {
    this.currentPhase = phase;
  }

  getCurrentPhase(): string | null {
    return this.currentPhase;
  }

  getMetricsBaseline(): MetricsBaseline | undefined {
    return this.metricsBaseline;
  }

  setMetricsBaseline(baseline: MetricsBaseline): void {
    this.metricsBaseline = baseline;
  }

  getMetricCounters(): { rtkCalls: number; jmCalls: number } {
    return { ...this.metricCounters };
  }

  incrementMetricCounter(counter: 'rtkCalls' | 'jmCalls'): void {
    this.metricCounters[counter]++;
  }

  reset(): void {
    this.environment = undefined;
    this.editedFiles.clear();
    this.currentPhase = null;
    this.metricsBaseline = undefined;
    this.metricCounters = { rtkCalls: 0, jmCalls: 0 };
  }
}
