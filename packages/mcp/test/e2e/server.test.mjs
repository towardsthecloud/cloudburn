import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { connectServer, findingIdentities } from './helpers.mjs';

const packageVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const cases = JSON.parse(readFileSync(new URL('../../../cloudburn/test/e2e/cases.json', import.meta.url), 'utf8'));

test('the server identifies itself and exposes only read-only tools', async (t) => {
  const { client } = await connectServer(t, 'healthy');
  assert.deepEqual(client.getServerVersion(), { name: 'cloudburn', version: packageVersion });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['discover', 'discovery_status', 'list_rules', 'scan_iac']);
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be read-only`);
    assert.ok(tool.description.length > 0, `${tool.name} needs a description`);
  }
});

for (const scenario of cases) {
  test(`scan_iac: ${scenario.name}`, async (t) => {
    const { call, directory, stderr } = await connectServer(t, scenario.fixture);
    const { isError, body } = await call('scan_iac', { path: directory, enabledRules: [scenario.ruleId] });
    assert.equal(isError, false, JSON.stringify(body));
    assert.deepEqual(findingIdentities(body), scenario.expected);
    assert.equal(body.diagnostics, undefined);
    assert.equal(stderr(), '');
  });
}

test('scan_iac reports a clean scan without findings', async (t) => {
  const { call, directory } = await connectServer(t, 'healthy');
  const { isError, body } = await call('scan_iac', { path: directory, enabledRules: ['CLDBRN-AWS-EBS-1'] });
  assert.equal(isError, false);
  assert.deepEqual(body, { providers: [] });
});

test('scan_iac applies an explicit config file and lets arguments override its rule selection', async (t) => {
  const terraformFindings = cases.find((scenario) => scenario.fixture === 'ebs/terraform').expected;
  const { call, directory } = await connectServer(t, 'ebs/terraform');
  writeFileSync(join(directory, 'settings.yaml'), 'iac:\n  enabled-rules:\n    - CLDBRN-AWS-S3-1\n');
  const target = { path: join(directory, 'main.tf'), configPath: join(directory, 'settings.yaml') };
  const configured = await call('scan_iac', target);
  assert.deepEqual(configured.body.providers, []);
  const overridden = await call('scan_iac', {
    ...target,
    enabledRules: ['CLDBRN-AWS-EBS-1'],
  });
  assert.deepEqual(findingIdentities(overridden.body), terraformFindings);
});

test('scan_iac keeps suppressed findings visible under suppressed', async (t) => {
  const { call, directory } = await connectServer(t, 'suppressed');
  const { isError, body } = await call('scan_iac', { path: directory, enabledRules: ['CLDBRN-AWS-EBS-1'] });
  assert.equal(isError, false);
  assert.deepEqual(body.providers, []);
  assert.deepEqual(body.suppressed.map((item) => item.finding.resourceId).sort(), ['Legacy', 'aws_ebs_volume.legacy']);
});

test('scan_iac returns a structured tool error for a missing path', async (t) => {
  const { call, directory } = await connectServer(t, 'healthy');
  const { isError, body } = await call('scan_iac', { path: join(directory, 'does-not-exist.tf') });
  assert.equal(isError, true);
  assert.equal(body.error.code, 'PATH_NOT_FOUND');
});

test('scan_iac rejects relative paths because agent hosts start the server in different directories', async (t) => {
  const { call } = await connectServer(t, 'ebs/terraform');
  for (const args of [{ path: 'main.tf' }, { path: '/tmp', configPath: '.cloudburn.yml' }]) {
    const { isError, body } = await call('scan_iac', args);
    assert.equal(isError, true);
    assert.equal(body.error.code, 'INVALID_ARGUMENT');
    assert.match(body.error.message, /must be an absolute path/);
  }
});

test('scan_iac rejects services that have no IaC rules before scanning', async (t) => {
  const { call, directory } = await connectServer(t, 'healthy');
  const { isError, body } = await call('scan_iac', { path: directory, services: ['not-a-service'] });
  assert.equal(isError, true);
  assert.equal(body.error.code, 'INVALID_ARGUMENT');
  assert.match(body.error.message, /Unknown service "not-a-service" for iac/);
});

test('list_rules filters built-in rules by service, source, and severity', async (t) => {
  const { call } = await connectServer(t, 'healthy');
  const { isError, body } = await call('list_rules', { services: ['ebs'], sources: ['iac'] });
  assert.equal(isError, false);
  assert.ok(body.some((rule) => rule.id === 'CLDBRN-AWS-EBS-1'));
  for (const rule of body) {
    assert.equal(rule.service, 'ebs');
    assert.ok(rule.supports.includes('iac'));
  }
  const high = await call('list_rules', { severity: 'high' });
  assert.ok(high.body.length > 0);
  assert.ok(high.body.every((rule) => rule.severity === 'high'));
});

test('list_rules rejects unknown services instead of returning an empty catalog', async (t) => {
  const { call } = await connectServer(t, 'healthy');
  const { isError, body } = await call('list_rules', { services: ['ebss'] });
  assert.equal(isError, true);
  assert.equal(body.error.code, 'INVALID_ARGUMENT');
  assert.match(body.error.message, /Unknown service "ebss"\. Allowed services: .*\bebs\b/);
});
