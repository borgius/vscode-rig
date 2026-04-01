import { describe, it, expect, beforeEach } from 'vitest';
import { ScoutCache } from '../../src/scout/scout-cache.js';
import type { CodebaseMap } from '../../src/types.js';

function makeMap(overrides: Partial<CodebaseMap> = {}): CodebaseMap {
  return {
    structure: [],
    entryPoints: [],
    keyExports: [],
    dependencies: [],
    languages: { typescript: 10 },
    symbols: { functions: 50, classes: 10, types: 5 },
    ...overrides,
  };
}

describe('ScoutCache', () => {
  let cache: ScoutCache;

  beforeEach(() => {
    cache = new ScoutCache();
  });

  it('returns undefined when no map cached', () => {
    expect(cache.getMap('/home/user/project')).toBeUndefined();
  });

  it('stores and retrieves map by directory', () => {
    const map = makeMap();
    cache.setMap('/home/user/project', map);
    expect(cache.getMap('/home/user/project')).toEqual(map);
  });

  it('stores maps for multiple directories', () => {
    const map1 = makeMap({ languages: { typescript: 10 } });
    const map2 = makeMap({ languages: { python: 5 } });
    cache.setMap('/home/user/project-a', map1);
    cache.setMap('/home/user/project-b', map2);
    expect(cache.getMap('/home/user/project-a')?.languages).toEqual({ typescript: 10 });
    expect(cache.getMap('/home/user/project-b')?.languages).toEqual({ python: 5 });
  });

  it('overwrites map for same directory', () => {
    cache.setMap('/home/user/project', makeMap({ languages: { typescript: 5 } }));
    cache.setMap('/home/user/project', makeMap({ languages: { typescript: 10 } }));
    expect(cache.getMap('/home/user/project')?.languages.typescript).toBe(10);
  });

  it('reports stale maps after TTL', () => {
    const map = makeMap();
    cache.setMap('/home/user/project', map, Date.now() - 31 * 60 * 1000);
    expect(cache.isStale('/home/user/project')).toBe(true);
  });

  it('reports fresh maps within TTL', () => {
    const map = makeMap();
    cache.setMap('/home/user/project', map, Date.now());
    expect(cache.isStale('/home/user/project')).toBe(false);
  });

  it('returns all cached directories', () => {
    cache.setMap('/a', makeMap());
    cache.setMap('/b', makeMap());
    cache.setMap('/c', makeMap());
    expect(cache.getCachedDirectories()).toEqual(['/a', '/b', '/c']);
  });

  it('clears all maps on reset', () => {
    cache.setMap('/a', makeMap());
    cache.setMap('/b', makeMap());
    cache.reset();
    expect(cache.getCachedDirectories()).toEqual([]);
  });
});
