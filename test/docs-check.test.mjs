import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, test } from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '..');
const checkerPath = join(repositoryRoot, 'scripts/check-docs.mjs');
const fixturePath = join(import.meta.dirname, 'fixtures/docs-check/valid.json');
const temporaryRepositories = [];

const createFixtureRepository = async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloudburn-docs-check-'));
  temporaryRepositories.push(root);

  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  for (const [path, contents] of Object.entries(fixture.files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  for (const [path, target] of Object.entries(fixture.symlinks)) {
    await symlink(target, join(root, path));
  }

  return root;
};

const runChecker = async (root) => {
  try {
    const result = await execFileAsync(process.execPath, [checkerPath, root], { cwd: repositoryRoot });
    return { code: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    return { code: error.code, stderr: error.stderr, stdout: error.stdout };
  }
};

afterEach(async () => {
  await Promise.all(temporaryRepositories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('accepts a valid repository and its root and package aliases', async () => {
  const root = await createFixtureRepository();

  const result = await runChecker(root);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Documentation check passed/);
});

test('rejects a missing required documentation entry point', async () => {
  const root = await createFixtureRepository();
  await rm(join(root, 'docs/README.md'));

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /docs\/README\.md: required entry point is missing/);
});

test('rejects a copied or misdirected instruction alias', async () => {
  const root = await createFixtureRepository();
  await rm(join(root, 'packages/example/CLAUDE.md'));
  await writeFile(join(root, 'packages/example/CLAUDE.md'), '# copied instructions\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /packages\/example\/CLAUDE\.md: expected a relative symlink to AGENTS\.md/);
});

test('rejects a symlink used as an AGENTS.md instruction source', async () => {
  const root = await createFixtureRepository();
  const source = Array.from({ length: 151 }, (_, index) => `line ${index + 1}`).join('\n');
  await writeFile(join(root, 'INSTRUCTIONS.md'), source);
  await rm(join(root, 'AGENTS.md'));
  await symlink('INSTRUCTIONS.md', join(root, 'AGENTS.md'));
  const indexPath = join(root, 'docs/README.md');
  await writeFile(
    indexPath,
    `${await readFile(indexPath, 'utf8')}\n- [Package instructions](../packages/example/AGENTS.md)\n`,
  );

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /AGENTS\.md: instruction source must be a regular file, not a symlink/);
});

test('rejects a missing local Markdown link target', async () => {
  const root = await createFixtureRepository();
  await writeFile(join(root, 'README.md'), '# Example\n\n[Missing](docs/missing.md)\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3: local link target does not exist: docs\/missing\.md/);
});

test('rejects a local Markdown link that escapes the repository', async () => {
  const root = await createFixtureRepository();
  await writeFile(join(root, 'README.md'), '# Example\n\n[Outside](../outside.md)\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3: local link escapes repository: \.\.\/outside\.md/);
});

test('rejects a local Markdown symlink target that resolves outside the repository', async () => {
  const root = await createFixtureRepository();
  const externalRoot = await mkdtemp(join(tmpdir(), 'cloudburn-docs-external-'));
  temporaryRepositories.push(externalRoot);
  const externalTarget = join(externalRoot, 'external.md');
  await writeFile(externalTarget, '# External\n');
  await symlink(externalTarget, join(root, 'docs/external.md'));
  await writeFile(join(root, 'README.md'), '# Example\n\n[External](docs/external.md)\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3: local link escapes repository: docs\/external\.md/);
});

test('rejects a dangling local Markdown symlink target', async () => {
  const root = await createFixtureRepository();
  await symlink('missing-target.md', join(root, 'docs/dangling.md'));
  await writeFile(join(root, 'README.md'), '# Example\n\n[Dangling](docs/dangling.md)\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3: local link target does not exist: docs\/dangling\.md/);
});

test('rejects an undefined reference-style link label', async () => {
  const root = await createFixtureRepository();
  await writeFile(join(root, 'README.md'), '# Example\n\n[Missing guide][missing-guide]\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3: undefined reference label: missing-guide/);
});

test('rejects a reference definition with a missing local target', async () => {
  const root = await createFixtureRepository();
  await writeFile(join(root, 'README.md'), '# Example\n\n[Guide][guide]\n\n[guide]: docs/missing.md\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:5: local link target does not exist: docs\/missing\.md/);
});

test('rejects a link to a missing Markdown heading fragment', async () => {
  const root = await createFixtureRepository();
  await writeFile(join(root, 'README.md'), '# Example\n\n[Architecture](docs/ARCHITECTURE.md#missing-section)\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3: Markdown fragment does not exist: docs\/ARCHITECTURE\.md#missing-section/);
});

test('rejects a canonical documentation page that is unreachable from the entry points', async () => {
  const root = await createFixtureRepository();
  await writeFile(join(root, 'docs/orphan.md'), '# Orphan\n');

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /docs\/orphan\.md: canonical Markdown page is not reachable from AGENTS\.md or docs\/README\.md/);
});

test('does not treat an unused reference definition as a reachability edge', async () => {
  const root = await createFixtureRepository();
  await writeFile(join(root, 'docs/orphan.md'), '# Orphan\n');
  const indexPath = join(root, 'docs/README.md');
  await writeFile(indexPath, `${await readFile(indexPath, 'utf8')}\n[unused]: orphan.md\n`);

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /docs\/orphan\.md: canonical Markdown page is not reachable/);
});

test('rejects a root AGENTS.md over 150 lines', async () => {
  const root = await createFixtureRepository();
  await writeFile(join(root, 'AGENTS.md'), Array.from({ length: 151 }, (_, index) => `line ${index + 1}`).join('\n'));

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /AGENTS\.md: contains 151 lines; maximum is 150/);
});
