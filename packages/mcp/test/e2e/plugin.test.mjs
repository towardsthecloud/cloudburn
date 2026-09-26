import assert from 'node:assert/strict';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const pluginPath = fileURLToPath(new URL('../../dist/plugin/', import.meta.url));
const packageVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const readJson = (path) => JSON.parse(readFileSync(join(pluginPath, path), 'utf8'));
const launcher = ['-y', `@cloudburn/mcp@${packageVersion}`];

const listFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [relative(pluginPath, path).split(sep).join('/')];
  });

test('the plugin ships the same versioned manifests for Claude and Agent Plugins clients', () => {
  const claude = readJson('.claude-plugin/plugin.json');
  const portable = readJson('plugin.json');
  assert.equal(claude.name, 'cloudburn');
  assert.equal(portable.name, 'cloudburn');
  assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  for (const manifest of [claude, portable]) {
    assert.equal(manifest.version, packageVersion);
    assert.equal(manifest.license, 'Apache-2.0');
    assert.ok(manifest.description.length > 0);
    assert.ok(manifest.author.name.length > 0);
  }
});

test('both MCP configurations launch the exact published server version without plugin paths', () => {
  const claude = readJson('.mcp.json').mcpServers;
  const portable = readJson('mcp.json');
  assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  assert.deepEqual(claude, { cloudburn: { command: 'npx', args: launcher } });
  assert.deepEqual(portable.mcpServers, { cloudburn: { type: 'stdio', command: 'npx', args: launcher } });
});

test('the marketplaces list the plugin from the repository root under its manifest name', () => {
  const claude = readJson('.claude-plugin/marketplace.json');
  assert.deepEqual(
    claude.plugins.map((plugin) => [plugin.name, plugin.source]),
    [['cloudburn', './']],
  );
  const codex = readJson('.agents/plugins/marketplace.json');
  assert.deepEqual(
    codex.plugins.map((plugin) => [plugin.name, plugin.source]),
    [['cloudburn', { source: 'local', path: './' }]],
  );
  assert.equal(claude.name, codex.name);
});

test('the plugin folder contains only reviewable regular files the directories accept', () => {
  const files = listFiles(pluginPath).sort();
  assert.deepEqual(files, [
    '.agents/plugins/marketplace.json',
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    '.mcp.json',
    'LICENSE',
    'README.md',
    'mcp.json',
    'plugin.json',
    'skills/cloudburn/SKILL.md',
  ]);
  for (const file of files) {
    const stats = lstatSync(join(pluginPath, file));
    assert.ok(stats.isFile(), `${file} must be a regular file`);
    assert.ok(stats.size < 256 * 1024, `${file} must stay under the directory's 256 KiB review limit`);
  }
  assert.equal(
    readFileSync(join(pluginPath, 'LICENSE'), 'utf8'),
    readFileSync(new URL('../../../../LICENSE', import.meta.url), 'utf8'),
  );
});

test('the README and skill meet directory listing requirements', () => {
  const readme = readFileSync(join(pluginPath, 'README.md'), 'utf8').replace(/```[\s\S]*?```/g, '');
  assert.ok(readme.split(/\s+/).filter(Boolean).length >= 40, 'README needs at least 40 words outside code blocks');
  const skill = readFileSync(join(pluginPath, 'skills/cloudburn/SKILL.md'), 'utf8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter, 'SKILL.md needs YAML frontmatter');
  assert.match(frontmatter[1], /^name: cloudburn$/m);
  assert.match(frontmatter[1], /^description: \S.+$/m);
});
