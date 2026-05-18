import { describe, it, expect } from 'vitest';
import { completionCommand } from '../src/commands/completion.js';

describe('completion command', () => {
  describe('bash completion', () => {
    it('should generate bash completion script', async () => {
      const result = await completionCommand({ shell: 'bash' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('_claude_profile_completion');
        expect(result.output).toContain('complete -F');
        expect(result.output).toContain('claude-profile');
      }
    });

    it('should include all commands in bash completion', async () => {
      const result = await completionCommand({ shell: 'bash' });

      expect(result.success).toBe(true);
      if (result.success) {
        // Verify all commands present
        expect(result.output).toContain('create');
        expect(result.output).toContain('switch');
        expect(result.output).toContain('list');
        expect(result.output).toContain('edit');
        expect(result.output).toContain('delete');
        expect(result.output).toContain('rename');
        expect(result.output).toContain('duplicate');
        expect(result.output).toContain('export');
        expect(result.output).toContain('import');
        expect(result.output).toContain('backup');
        expect(result.output).toContain('restore');
        expect(result.output).toContain('init');
        expect(result.output).toContain('validate');
        expect(result.output).toContain('completion');
      }
    });
  });

  describe('zsh completion', () => {
    it('should generate zsh completion script', async () => {
      const result = await completionCommand({ shell: 'zsh' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('#compdef claude-profile');
        expect(result.output).toContain('_claude_profile');
      }
    });

    it('should include zsh-specific features', async () => {
      const result = await completionCommand({ shell: 'zsh' });

      expect(result.success).toBe(true);
      if (result.success) {
        // zsh uses _describe or _arguments
        expect(result.output).toMatch(/_describe|_arguments/);
      }
    });

    it('should include all commands in zsh completion', async () => {
      const result = await completionCommand({ shell: 'zsh' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('create');
        expect(result.output).toContain('switch');
        expect(result.output).toContain('validate');
        expect(result.output).toContain('completion');
      }
    });
  });

  describe('fish completion', () => {
    it('should generate fish completion script', async () => {
      const result = await completionCommand({ shell: 'fish' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('complete -c claude-profile');
      }
    });

    it('should include all commands in fish completion', async () => {
      const result = await completionCommand({ shell: 'fish' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('create');
        expect(result.output).toContain('switch');
        expect(result.output).toContain('validate');
      }
    });
  });

  describe('error handling', () => {
    it('should return error for unsupported shell', async () => {
      const result = await completionCommand({ shell: 'powershell' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('powershell');
      }
    });

    it('should return error when shell is not specified', async () => {
      const result = await completionCommand({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/shell|bash|zsh|fish/i);
      }
    });

    it('should accept uppercase shell name', async () => {
      const result = await completionCommand({ shell: 'BASH' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('_claude_profile_completion');
      }
    });
  });
});
