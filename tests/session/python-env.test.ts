import { describe, it, expect } from 'vitest';
import { detectPythonEnv } from '../../src/session/python-env.js';
import type { ExecFn } from '../../src/session/environment.js';

describe('detectPythonEnv', () => {
  const noUv: ExecFn = () => {
    throw new Error('not found');
  };
  const hasUv: ExecFn = (cmd) => {
    if (cmd.includes('which uv')) return '/usr/bin/uv\n';
    throw new Error('not found');
  };

  it('detects .venv when directory exists', async () => {
    const cwd = '/tmp';
    const existsCheck = (p: string) => p === '/tmp/.venv';
    const env = await detectPythonEnv(cwd, noUv, existsCheck);
    expect(env.venvPath).toBe('/tmp/.venv');
    expect(env.uvAvailable).toBe(false);
  });

  it('returns null venvPath when no .venv exists', async () => {
    const cwd = '/tmp';
    const existsCheck = () => false;
    const env = await detectPythonEnv(cwd, noUv, existsCheck);
    expect(env.venvPath).toBeNull();
    expect(env.uvAvailable).toBe(false);
  });

  it('detects uv when available', async () => {
    const cwd = '/tmp';
    const existsCheck = () => false;
    const env = await detectPythonEnv(cwd, hasUv, existsCheck);
    expect(env.uvAvailable).toBe(true);
    expect(env.uvPath).toBe('/usr/bin/uv');
    expect(env.venvPath).toBeNull();
  });

  it('detects both .venv and uv', async () => {
    const cwd = '/project';
    const existsCheck = (p: string) => p === '/project/.venv';
    const env = await detectPythonEnv(cwd, hasUv, existsCheck);
    expect(env.venvPath).toBe('/project/.venv');
    expect(env.uvAvailable).toBe(true);
    expect(env.uvPath).toBe('/usr/bin/uv');
  });

  it('sets detectedAt to current time', async () => {
    const before = Date.now();
    const env = await detectPythonEnv('/tmp', noUv, () => false);
    const after = Date.now();
    expect(env.detectedAt).toBeGreaterThanOrEqual(before);
    expect(env.detectedAt).toBeLessThanOrEqual(after);
  });

  it('checks .venv/bin directory existence', async () => {
    const cwd = '/project';
    const existsCheck = (p: string) => p === '/project/.venv/bin';
    const env = await detectPythonEnv(cwd, noUv, existsCheck);
    expect(env.venvPath).toBe('/project/.venv');
  });
});
