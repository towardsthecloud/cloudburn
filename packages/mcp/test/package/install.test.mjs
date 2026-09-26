import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const rootPackage = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'));
const mcpPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const fixturesPath = join(repository, 'packages/cloudburn/test/e2e/fixtures');
let directory;

const isolatedEnv = () => ({
  ...Object.fromEntries(
    ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  ),
  PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
  CI: 'true',
  AWS_EC2_METADATA_DISABLED: 'true',
  AWS_CONFIG_FILE: join(directory, 'absent-aws-config'),
  AWS_SHARED_CREDENTIALS_FILE: join(directory, 'absent-aws-credentials'),
  npm_config_userconfig: join(directory, 'empty-npmrc'),
  XDG_CONFIG_HOME: join(directory, 'config'),
});

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    env: isolatedEnv(),
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
};

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'cloudburn-mcp-package-test-'));
  const archives = join(directory, 'archives');
  mkdirSync(archives);
  run('pnpm', ['--filter', '@cloudburn/mcp...', 'pack', '--pack-destination', archives], repository);
  const tarballs = readdirSync(archives).filter((name) => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 3, 'Pack the MCP server, SDK, and rules from this checkout.');
  const archive = (name) => {
    const prefix = name.replace('@', '').replace('/', '-');
    const tarball = tarballs.find((file) => new RegExp(`^${prefix}-\\d`).test(file));
    assert.ok(tarball, `Missing local archive for ${name}`);
    return `file:./archives/${tarball}`;
  };
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'cloudburn-mcp-package-consumer',
      private: true,
      packageManager: rootPackage.packageManager,
      dependencies: { '@cloudburn/mcp': archive('@cloudburn/mcp') },
    }),
  );
  writeFileSync(
    join(directory, 'pnpm-workspace.yaml'),
    `overrides:\n  '@cloudburn/sdk': ${archive('@cloudburn/sdk')}\n  '@cloudburn/rules': ${archive('@cloudburn/rules')}\n`,
  );
  run(
    'pnpm',
    ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry=https://registry.npmjs.org'],
    directory,
  );
  copyFileSync(join(fixturesPath, 'ebs/terraform/main.tf'), join(directory, 'main.tf'));
});

after(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test('the packed manifest ships only the server with published dependencies', () => {
  const installed = join(directory, 'node_modules/@cloudburn/mcp');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  for (const version of Object.values(manifest.dependencies ?? {})) {
    assert.doesNotMatch(version, /^(workspace:|catalog:|file:|link:)/, 'Packed manifest has an unpublished dependency');
  }
  assert.deepEqual(readdirSync(join(installed, 'dist')), ['cli.js']);
});

test('the installed executable serves scans over stdio', async (t) => {
  const transport = new StdioClientTransport({
    command: join(directory, 'node_modules/.bin/cloudburn-mcp'),
    cwd: directory,
    stderr: 'pipe',
    env: isolatedEnv(),
  });
  const client = new Client({ name: 'cloudburn-mcp-package-test', version: '0.0.0' });
  await client.connect(transport);
  t.after(() => client.close());

  assert.deepEqual(client.getServerVersion(), { name: 'cloudburn', version: mcpPackage.version });
  const result = await client.callTool({
    name: 'scan_iac',
    arguments: { path: join(directory, 'main.tf'), enabledRules: ['CLDBRN-AWS-EBS-1'] },
  });
  assert.notEqual(result.isError, true, result.content[0].text);
  const scan = JSON.parse(result.content[0].text);
  assert.deepEqual(
    scan.providers.flatMap((provider) => provider.rules.flatMap((rule) => rule.findings.map((f) => f.resourceId))),
    ['aws_ebs_volume.legacy'],
  );
});
