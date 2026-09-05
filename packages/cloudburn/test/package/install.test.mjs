import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const rootPackage = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'));
const cliPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
let directory;

const run = (command, args, cwd, expectedStatus = 0) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...Object.fromEntries(
        ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS']
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]]),
      ),
      PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
      CI: 'true',
      NO_COLOR: '1',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_CONFIG_FILE: join(directory, 'absent-aws-config'),
      AWS_SHARED_CREDENTIALS_FILE: join(directory, 'absent-aws-credentials'),
      npm_config_userconfig: join(directory, 'empty-npmrc'),
    },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
  return result;
};

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'cloudburn-package-test-'));
  const archives = join(directory, 'archives');
  mkdirSync(archives);
  run('pnpm', ['--filter', 'cloudburn...', 'pack', '--pack-destination', archives], repository);
  const tarballs = readdirSync(archives).filter((name) => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 3, 'Pack the CLI, SDK and rules from this checkout.');
  const dependencies = Object.fromEntries(
    ['cloudburn', '@cloudburn/sdk', '@cloudburn/rules'].map((name) => {
      const prefix = name.replace('@', '').replace('/', '-');
      const tarball = tarballs.find((file) => new RegExp(`^${prefix}-\\d`).test(file));
      assert.ok(tarball, `Missing local archive for ${name}`);
      return [name, `file:./archives/${tarball}`];
    }),
  );
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'cloudburn-package-consumer',
      private: true,
      packageManager: rootPackage.packageManager,
      dependencies,
    }),
  );
  writeFileSync(
    join(directory, 'pnpm-workspace.yaml'),
    `overrides:\n  '@cloudburn/sdk': ${dependencies['@cloudburn/sdk']}\n  '@cloudburn/rules': ${dependencies['@cloudburn/rules']}\n`,
  );
  run(
    'pnpm',
    ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry=https://registry.npmjs.org'],
    directory,
  );
  const consumer = createRequire(join(directory, 'package.json'));
  const installedCli = createRequire(consumer.resolve('cloudburn/package.json'));
  const installedSdk = createRequire(consumer.resolve('@cloudburn/sdk'));
  assert.equal(installedCli.resolve('@cloudburn/sdk'), consumer.resolve('@cloudburn/sdk'));
  assert.equal(installedSdk.resolve('@cloudburn/rules'), consumer.resolve('@cloudburn/rules'));
  copyFileSync(new URL('../e2e/fixtures/ebs/terraform/main.tf', import.meta.url), join(directory, 'main.tf'));
  copyFileSync(
    new URL('../e2e/fixtures/ebs/cloudformation/template.yaml', import.meta.url),
    join(directory, 'template.yaml'),
  );
});

after(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test('the installed executable reports the packed package version', () => {
  const result = run(join(directory, 'node_modules/.bin/cloudburn'), ['--version'], directory);
  assert.equal(result.stdout.trim(), cliPackage.version);
});

test('the installed CLI scans Terraform through its installed dependencies', () => {
  const result = run(
    join(directory, 'node_modules/.bin/cloudburn'),
    ['scan', 'main.tf', '--format', 'json', '--enabled-rules', 'CLDBRN-AWS-EBS-1', '--exit-code'],
    directory,
    1,
  );
  assert.equal(result.stderr, '');
  const findings = JSON.parse(result.stdout).providers.flatMap((provider) =>
    provider.rules.flatMap((rule) => rule.findings),
  );
  assert.deepEqual(findings, [
    { resourceId: 'aws_ebs_volume.legacy', location: { path: 'main.tf', line: 4, column: 3 } },
  ]);
});

for (const format of ['module', 'commonjs']) {
  test(`the installed SDK ${format} export scans CloudFormation`, () => {
    const load = format === 'module' ? "await import('@cloudburn/sdk')" : "require('@cloudburn/sdk')";
    const source = `(async () => {
      const { CloudBurnClient } = ${load};
      const result = await new CloudBurnClient().scanStatic('template.yaml', { iac: { enabledRules: ['CLDBRN-AWS-EBS-1'] } });
      process.stdout.write(JSON.stringify(result.providers.flatMap(p => p.rules.flatMap(r => r.findings))));
    })().catch(error => { console.error(error); process.exitCode = 1; });`;
    const result = run(process.execPath, ['--input-type', format, '--eval', source], directory);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), [
      { resourceId: 'Legacy', location: { path: 'template.yaml', line: 6, column: 7 } },
    ]);
  });
}

test('package subprocesses retain registry connectivity without AWS credentials', (t) => {
  const caPath = join(directory, 'test-ca.pem');
  writeFileSync(caPath, '');
  const network = {
    HTTP_PROXY: 'http://proxy.example.test:8080',
    HTTPS_PROXY: 'http://proxy.example.test:8443',
    NO_PROXY: 'localhost,.example.test',
    http_proxy: 'http://lowercase-proxy.example.test:8080',
    https_proxy: 'http://lowercase-proxy.example.test:8443',
    no_proxy: '127.0.0.1,.example.test',
    NODE_EXTRA_CA_CERTS: caPath,
  };
  const ambient = { ...network, AWS_ACCESS_KEY_ID: 'SYNTHETIC', AWS_SECRET_ACCESS_KEY: 'synthetic-secret' };
  const previous = Object.fromEntries(Object.keys(ambient).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, ambient);
  const source = `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(ambient))}.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))));`;
  const result = run(process.execPath, ['--eval', source], directory);
  assert.deepEqual(JSON.parse(result.stdout), network);
});

test('the temporary consumer uses the repository-pinned pnpm version', () => {
  const expectedVersion = rootPackage.packageManager.split('@')[1].split('+')[0];
  const result = run('pnpm', ['--version'], directory);
  assert.equal(result.stdout.trim(), expectedVersion);
});
