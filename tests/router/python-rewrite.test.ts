import { describe, it, expect } from 'vitest';
import { hasPythonSignal, tryPythonRewrite } from '../../src/router/python-rewrite.js';
import type { PythonEnv } from '../../src/types.js';

function makePythonEnv(overrides: Partial<PythonEnv> = {}): PythonEnv {
  return {
    venvPath: null,
    uvAvailable: false,
    uvPath: null,
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe('hasPythonSignal', () => {
  it('detects .py file in command args', () => {
    expect(hasPythonSignal('pytest tests/test_foo.py -v')).toBe(true);
  });

  it('detects .py file with path prefix', () => {
    expect(hasPythonSignal('python src/main.py')).toBe(true);
  });

  it('returns false when no .py file in args', () => {
    expect(hasPythonSignal('pytest --version')).toBe(false);
  });

  it('returns false for .pyc files', () => {
    expect(hasPythonSignal('cat module.pyc')).toBe(false);
  });

  it('returns false for .py in directory names', () => {
    expect(hasPythonSignal('ls src.python/')).toBe(false);
  });

  it('detects .py at end of quoted path', () => {
    expect(hasPythonSignal('pytest "tests/test bar.py"')).toBe(true);
  });
});

describe('tryPythonRewrite', () => {
  const cwd = '/project';

  it('rewrites to .venv/bin/<cmd> when binary exists in venv', () => {
    const pyEnv = makePythonEnv({ venvPath: '/project/.venv' });
    const result = tryPythonRewrite(
      'pytest tests/test_foo.py -v',
      cwd,
      pyEnv,
      (p) => p === '/project/.venv/bin/pytest',
    );
    expect(result).toBe('.venv/bin/pytest tests/test_foo.py -v');
  });

  it('rewrites to uv run when venv missing but uv available', () => {
    const pyEnv = makePythonEnv({ venvPath: null, uvAvailable: true, uvPath: '/usr/bin/uv' });
    const result = tryPythonRewrite(
      'pytest tests/test_foo.py -v',
      cwd,
      pyEnv,
      () => false,
    );
    expect(result).toBe('uv run pytest tests/test_foo.py -v');
  });

  it('prefers venv over uv when both available', () => {
    const pyEnv = makePythonEnv({ venvPath: '/project/.venv', uvAvailable: true, uvPath: '/usr/bin/uv' });
    const result = tryPythonRewrite(
      'pytest tests/test_foo.py -v',
      cwd,
      pyEnv,
      (p) => p === '/project/.venv/bin/pytest',
    );
    expect(result).toBe('.venv/bin/pytest tests/test_foo.py -v');
  });

  it('returns null when no .py signal', () => {
    const pyEnv = makePythonEnv({ venvPath: '/project/.venv' });
    const result = tryPythonRewrite(
      'pytest --version',
      cwd,
      pyEnv,
      () => true,
    );
    expect(result).toBeNull();
  });

  it('returns null when binary not in venv and no uv', () => {
    const pyEnv = makePythonEnv({ venvPath: '/project/.venv' });
    const result = tryPythonRewrite(
      'mytool tests/test_foo.py -v',
      cwd,
      pyEnv,
      () => false,
    );
    expect(result).toBeNull();
  });

  it('returns null when no python env at all', () => {
    const pyEnv = makePythonEnv();
    const result = tryPythonRewrite(
      'pytest tests/test_foo.py -v',
      cwd,
      pyEnv,
      () => false,
    );
    expect(result).toBeNull();
  });

  it('handles python -m subcommand', () => {
    const pyEnv = makePythonEnv({ venvPath: '/project/.venv' });
    const result = tryPythonRewrite(
      'python -m pytest tests/test_foo.py',
      cwd,
      pyEnv,
      (p) => p === '/project/.venv/bin/python',
    );
    expect(result).toBe('.venv/bin/python -m pytest tests/test_foo.py');
  });

  it('handles uv fallback when binary not in venv', () => {
    const pyEnv = makePythonEnv({ venvPath: '/project/.venv', uvAvailable: true, uvPath: '/usr/bin/uv' });
    const result = tryPythonRewrite(
      'black tests/test_foo.py',
      cwd,
      pyEnv,
      (p) => p === '/project/.venv/bin/black' ? false : false,
    );
    expect(result).toBe('uv run black tests/test_foo.py');
  });
});
