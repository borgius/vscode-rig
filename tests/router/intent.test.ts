import { describe, it, expect } from 'vitest';
import { classifyIntent, IntentType } from '../../src/router/intent.js';

describe('classifyIntent', () => {
  describe('bash command classification', () => {
    it('classifies grep as text_search', () => {
      expect(classifyIntent('Bash', { command: 'grep -r "pattern" src/' })).toBe('text_search');
    });

    it('classifies rg as text_search', () => {
      expect(classifyIntent('Bash', { command: 'rg "export.*function" .' })).toBe('text_search');
    });

    it('classifies grep -x as text_search', () => {
      expect(classifyIntent('Bash', { command: 'grepx something' })).toBe('text_search');
    });

    it('classifies find as file_discovery', () => {
      expect(classifyIntent('Bash', { command: 'find . -name "*.ts"' })).toBe('file_discovery');
    });

    it('classifies fd as file_discovery', () => {
      expect(classifyIntent('Bash', { command: 'fd "\\.ts$"' })).toBe('file_discovery');
    });

    it('classifies cat as file_read', () => {
      expect(classifyIntent('Bash', { command: 'cat src/config.ts' })).toBe('file_read');
    });

    it('classifies head as file_read', () => {
      expect(classifyIntent('Bash', { command: 'head -20 src/config.ts' })).toBe('file_read');
    });

    it('classifies sed -i as file_modify', () => {
      expect(classifyIntent('Bash', { command: "sed -i 's/old/new/g' file.ts" })).toBe('file_modify');
    });

    it('classifies sed --in-place as file_modify', () => {
      expect(classifyIntent('Bash', { command: "sed --in-place 's/old/new/g' file.ts" })).toBe('file_modify');
    });

    it('classifies awk with redirect as file_modify', () => {
      expect(classifyIntent('Bash', { command: "awk '{print $1}' file > out" })).toBe('file_modify');
    });

    it('classifies plain sed (no -i) as text_search', () => {
      expect(classifyIntent('Bash', { command: "sed -n 's/pattern/&/p' file" })).toBe('text_search');
    });

    it('classifies git status as pass_through', () => {
      expect(classifyIntent('Bash', { command: 'git status' })).toBe('pass_through');
    });

    it('classifies ls as pass_through', () => {
      expect(classifyIntent('Bash', { command: 'ls -la' })).toBe('pass_through');
    });

    it('classifies compound commands by most restrictive intent', () => {
      // grep && sed -i: sed -i (file_modify) is more restrictive than grep (text_search)
      expect(classifyIntent('Bash', { command: "grep pattern file && sed -i 's/a/b/g' file" })).toBe('file_modify');
    });

    it('classifies piped commands by most restrictive intent', () => {
      // cat | grep: file_read (cat) + text_search (grep) -> text_search
      expect(classifyIntent('Bash', { command: 'cat file | grep pattern' })).toBe('text_search');
    });
  });

  describe('Claude tool classification', () => {
    it('classifies Grep tool as text_search', () => {
      expect(classifyIntent('Grep', { pattern: 'export.*function' })).toBe('text_search');
    });

    it('classifies Glob tool as file_discovery', () => {
      expect(classifyIntent('Glob', { pattern: '**/*.ts' })).toBe('file_discovery');
    });

    it('classifies Read tool as file_read', () => {
      expect(classifyIntent('Read', { file_path: '/home/user/project/src/file.ts' })).toBe('file_read');
    });

    it('classifies Agent with Explore as file_discovery', () => {
      expect(classifyIntent('Agent', { subagent_type: 'Explore', prompt: 'find auth files' })).toBe('file_discovery');
    });

    it('classifies Edit tool as file_modify', () => {
      expect(classifyIntent('Edit', { file_path: '/home/user/project/src/file.ts' })).toBe('file_modify');
    });

    it('classifies Write tool as file_modify', () => {
      expect(classifyIntent('Write', { file_path: '/home/user/project/src/file.ts' })).toBe('file_modify');
    });

    it('classifies unknown tool as pass_through', () => {
      expect(classifyIntent('UnknownTool', {})).toBe('pass_through');
    });
  });

  describe('precedence', () => {
    it('file_modify wins over text_search in compound command', () => {
      expect(classifyIntent('Bash', { command: "rg pattern . ; sed -i 's/a/b/g' f" })).toBe('file_modify');
    });

    it('file_modify wins over file_read in compound command', () => {
      expect(classifyIntent('Bash', { command: "cat file ; sed -i 's/a/b/g' file" })).toBe('file_modify');
    });
  });
});
