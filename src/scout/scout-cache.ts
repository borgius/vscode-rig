import type { CodebaseMap } from '../types.js';

const SCOUT_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CachedMap {
  map: CodebaseMap;
  cachedAt: number;
}

export class ScoutCache {
  private maps: Map<string, CachedMap> = new Map();

  getMap(directory: string): CodebaseMap | undefined {
    return this.maps.get(directory)?.map;
  }

  setMap(directory: string, map: CodebaseMap, cachedAt: number = Date.now()): void {
    this.maps.set(directory, { map, cachedAt });
  }

  isStale(directory: string): boolean {
    const cached = this.maps.get(directory);
    if (!cached) return true;
    return Date.now() - cached.cachedAt > SCOUT_TTL_MS;
  }

  getCachedDirectories(): string[] {
    return Array.from(this.maps.keys());
  }

  reset(): void {
    this.maps.clear();
  }
}
