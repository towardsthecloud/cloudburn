import { describe, expect, it } from 'vitest';

import {
  collectTouchedPackageScopes,
  requiredScopeForPaths,
  validateCommitMessage,
} from '../scripts/validate-commit-msg.mjs';

describe('validateCommitMessage', () => {
  it('requires a matching scope for single-package changes', () => {
    const result = validateCommitMessage('feat: add command', ['packages/cli/src/cli.ts']);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/scope must be `cli`/u);
  });

  it('accepts the matching scope for single-package changes', () => {
    const result = validateCommitMessage('feat(cli): add command', ['packages/cli/src/cli.ts']);

    expect(result).toEqual({ ok: true });
  });

  it('rejects the wrong scope for single-package changes', () => {
    const result = validateCommitMessage('fix(sdk): adjust output', ['packages/rules/src/aws/index.ts']);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/scope must be `rules`/u);
  });

  it('does not require a scope for root-only changes', () => {
    const result = validateCommitMessage('ci: add workflow', ['.github/workflows/release.yml']);

    expect(result).toEqual({ ok: true });
  });

  it('does not require a scope for multi-package changes', () => {
    const result = validateCommitMessage('refactor: align packages', [
      'packages/cli/src/cli.ts',
      'packages/sdk/src/index.ts',
    ]);

    expect(result).toEqual({ ok: true });
  });

  it('still requires a package scope when root files and one package are changed together', () => {
    const result = validateCommitMessage('test: add rule coverage', [
      'packages/rules/test/exports.test.ts',
      'README.md',
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/scope must be `rules`/u);
  });

  it('fails unsupported commit types', () => {
    const result = validateCommitMessage('feature(cli): add command', ['packages/cli/src/cli.ts']);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must match <type>\(<scope>\): <subject>/u);
  });

  it('allows git-generated special commit messages', () => {
    expect(validateCommitMessage('Revert "feat(cli): add command"', ['packages/cli/src/cli.ts'])).toEqual({
      ok: true,
    });
    expect(validateCommitMessage('fixup! feat(cli): add command', ['packages/cli/src/cli.ts'])).toEqual({
      ok: true,
    });
    expect(validateCommitMessage('squash! feat(cli): add command', ['packages/cli/src/cli.ts'])).toEqual({
      ok: true,
    });
    expect(validateCommitMessage("Merge branch 'main' into feature", ['packages/cli/src/cli.ts'])).toEqual({
      ok: true,
    });
  });
});

describe('package scope detection', () => {
  it('returns only the touched package scopes', () => {
    expect(
      collectTouchedPackageScopes([
        'packages/sdk/src/index.ts',
        'README.md',
        'packages/sdk/test/config.test.ts',
      ]),
    ).toEqual(['sdk']);
  });

  it('returns the required scope only when exactly one package is touched', () => {
    expect(requiredScopeForPaths(['README.md'])).toBeNull();
    expect(requiredScopeForPaths(['packages/cli/src/cli.ts', 'docs/architecture.md'])).toBe('cli');
    expect(requiredScopeForPaths(['packages/cli/src/cli.ts', 'packages/sdk/src/index.ts'])).toBeNull();
  });
});
