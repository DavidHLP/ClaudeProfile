import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  renderShellHook,
  renderBinDiscovery,
  renderSafeEvalBridge,
  renderJsonEvalBridge,
  renderDispatch,
  renderDefaultEnvBlock,
} from '../src/engine/shellHook.js';

/**
 * Snapshot tests for the shell-hook template.
 *
 * These pin both:
 *   1. The exact rendered output of each named renderer (regression guard
 *      for unintended changes to the bash the user's shell will eval)
 *   2. The syntactic validity of the full composition (run `bash -n` over
 *      the rendered output to catch a quoting error before users do)
 *
 * If a future change intentionally modifies the bash, regenerate the
 * hashes by running `vitest -u` and inspect the diff in the same commit.
 */

function hash(s: string): string {
  return createHash('sha256').update(s, 'utf-8').digest('hex').slice(0, 16);
}

describe('shellHook renderers', () => {
  it('renderBinDiscovery produces a function that respects CLAUDE_PROFILE_BIN', () => {
    const out = renderBinDiscovery('claude-profile');
    expect(out).toContain('_claude_profile_bin()');
    expect(out).toContain('$CLAUDE_PROFILE_BIN');
    expect(out).toContain('type -p claude-profile');
    expect(out).toContain('command -v claude-profile');
  });

  it('renderBinDiscovery substitutes the bin name parameter', () => {
    const out = renderBinDiscovery('my-fork');
    expect(out).toContain('type -p my-fork');
    expect(out).toContain('command -v my-fork');
    expect(out).not.toContain('claude-profile');
  });

  it('renderSafeEvalBridge gates both export and unset patterns and warns on others', () => {
    const out = renderSafeEvalBridge();
    expect(out).toContain('_claude_profile_safe_eval()');
    // Security-critical: only quoted-export and unset patterns allowed
    expect(out).toContain('"export "[A-Za-z_]*"="*"\'"*"\'"*)');
    expect(out).toContain('"unset "[A-Za-z_]*)');
    expect(out).toContain('warning: skipping unsafe line:');
  });

  it('renderJsonEvalBridge falls back through jq → node → fail', () => {
    const out = renderJsonEvalBridge();
    expect(out).toContain('_claude_profile_eval_json()');
    expect(out).toContain('command -v jq');
    expect(out).toContain('command -v node');
    expect(out).toContain('return 1');
  });

  it('renderDispatch wires the switch path through safe-eval', () => {
    const out = renderDispatch('claude-profile');
    expect(out).toContain('claude-profile()');
    expect(out).toContain('switch');
    expect(out).toContain('_claude_profile_safe_eval <<< "$export_output"');
    expect(out).toContain('error: interactive switch requires a terminal');
  });

  it('renderDefaultEnvBlock injects baseEnvTemplate under the master switch', () => {
    const out = renderDefaultEnvBlock();
    expect(out).toContain('CLAUDE_PROFILE_DEFAULT_ENV');
    // All baseEnvTemplate keys must appear
    expect(out).toContain('API_TIMEOUT_MS');
    expect(out).toContain('CLAUDE_CODE_EFFORT_LEVEL');
    expect(out).toContain('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE');
    // Guard semantics: only set if unset
    expect(out).toContain('[ -z "${API_TIMEOUT_MS+set}" ]');
  });

  it('full composition is syntactically valid bash', () => {
    const out = renderShellHook();

    // Write to a temp file and run bash -n. bash -n parses without executing.
    const dir = mkdtempSync(join(tmpdir(), 'shellHook-test-'));
    const scriptPath = join(dir, 'hook.sh');
    try {
      writeFileSync(scriptPath, out, 'utf-8');
      execSync(`bash -n ${scriptPath}`, { stdio: 'pipe' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('full composition contains all required function definitions and the default-env block', () => {
    const out = renderShellHook();
    expect(out).toContain('_claude_profile_bin()');
    expect(out).toContain('_claude_profile_safe_eval()');
    expect(out).toContain('_claude_profile_eval_json()');
    expect(out).toContain('claude-profile()');
    expect(out).toContain('CLAUDE_PROFILE_DEFAULT_ENV');
  });

  it('full composition accepts a custom bin name', () => {
    const out = renderShellHook({ binName: 'cp-test' });
    expect(out).toContain('type -p cp-test');
    expect(out).toContain('cp-test()');
    expect(out).not.toContain('claude-profile()');
  });

  it('default-env block always appears at the end of the full composition', () => {
    const out = renderShellHook();
    const dispatchEnd = out.indexOf('}');
    const defaultEnvStart = out.indexOf('CLAUDE_PROFILE_DEFAULT_ENV');
    expect(defaultEnvStart).toBeGreaterThan(dispatchEnd);
  });

  it('snapshot: full default composition (regression guard)', () => {
    // If you change the bash intentionally, update this hash and inspect the
    // full diff in the same commit. The hash is a sha256 prefix, not a
    // 1:1 string match, so reviewers must read the diff manually.
    const out = renderShellHook();
    expect(hash(out)).toMatchInlineSnapshot(
      '"decef8beda704f49"'
    );
  });
});
