import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const script = join(import.meta.dirname, '..', 'scripts', 'check-owning-pages.mjs');

const ownership = `# Documentation

## Editing sources and ownership

| Change | Owning guidance | Source to inspect or edit |
| --- | --- | --- |
| Handlers | [Behavior](architecture/lib.md#behavior), [Testing](TESTING.md) | [Handlers](../packages/lib/src/handlers/) |
| Knowledge | [This page](#editing-sources-and-ownership) | [Checker](../scripts/check.mjs) |

## Package entry points

| Package | Instructions |
| --- | --- |
| \`lib\` | [Lib](../packages/lib/AGENTS.md) |
`;

/** A pull request branch that changes `files` and moves each `[from, to]` in `moves`, checked with an optional description. */
function check(t, files, body, { moves = [], index = ownership } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cloudburn-owning-pages-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (path, content) => {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.test');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  write('docs/README.md', index);
  for (const [from] of moves) write(from, 'moved unchanged\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature');
  for (const path of files) write(path, 'changed\n');
  for (const [from, to] of moves) {
    mkdirSync(join(root, dirname(to)), { recursive: true });
    git('mv', from, to);
  }
  git('add', '.');
  git('commit', '-q', '--allow-empty', '-m', 'change');
  const args = [script, '--since', 'main'];
  if (body !== undefined) {
    write('.body.md', body);
    args.push('--body', join(root, '.body.md'));
  }
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}

test('a changed source makes each owning page due until the branch updates it', (t) => {
  const handler = 'packages/lib/src/handlers/scan.ts';
  for (const [files, due] of [
    [[handler], ['docs/architecture/lib.md', 'docs/TESTING.md']],
    [[handler, 'docs/architecture/lib.md'], ['docs/TESTING.md']],
    [[handler, 'docs/architecture/lib.md', 'docs/TESTING.md'], []],
    // A link to a heading on the table's own page names that page.
    [['scripts/check.mjs'], ['docs/README.md']],
    // A directory source covers only paths inside it, not siblings that share its prefix.
    [['packages/lib/src/handlers-legacy/scan.ts'], []],
    // Only the ownership table makes pages due, not other tables that link sources.
    [['packages/lib/AGENTS.md'], []],
  ]) {
    const result = check(t, files);
    assert.equal(result.status, due.length ? 1 : 0, `${files}: ${result.stderr}`);
    for (const page of [...due, ...(due.length ? [files[0]] : [])]) assert.ok(result.stderr.includes(page), `${files}`);
  }
});

test('moving a source out of an owned directory makes its pages due', (t) => {
  const result = check(t, [], undefined, { moves: [['packages/lib/src/handlers/scan.ts', 'packages/other/scan.ts']] });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes('docs/architecture/lib.md'));
});

test('the description records a due page as reviewed only by its exact path under the Documentation heading', (t) => {
  const files = ['packages/lib/src/handlers/scan.ts', 'docs/architecture/lib.md'];
  for (const [body, status] of [
    ['Fixes #1\n\n## Release\n\n- n/a\n\n## Documentation\n\n- `docs/TESTING.md`: still true, no change needed.\n', 0],
    ['## Documentation\n\nUpdated the architecture page; docs/TESTING.md.\n', 0],
    ['## Release\n\n- `docs/TESTING.md` covers the handler suite.\n\n## Documentation\n\n- n/a\n', 1],
    ['## Documentation\n\n<!-- Each page, such as docs/TESTING.md, that owns a fact. -->\n\n- n/a\n', 1],
    ['## Documentation\n\n- `TESTING.md` still holds.\n', 1],
  ]) {
    const result = check(t, files, body);
    assert.equal(result.status, status, `${body}: ${result.stderr}`);
    if (status) assert.ok(result.stderr.includes('docs/TESTING.md'));
  }
});

test('an ownership row without a linked page or source fails instead of making nothing due', (t) => {
  for (const row of [
    '| Rules | Rule guidance | [Rules](../packages/rules/src/) |',
    '| Rules | [Rule guide](guides/rules.md) | `packages/rules/src/` |',
  ]) {
    const index = ownership.replace(/(\| Knowledge .*\n)/, `$1${row}\n`);
    const result = check(t, ['packages/rules/src/index.ts'], undefined, { index });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /docs\/README\.md: .*row "Rules"/);
  }
});
