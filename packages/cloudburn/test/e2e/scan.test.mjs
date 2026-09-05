import assert from 'node:assert/strict';
import { copyFileSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { findingIdentities, setupCli } from './helpers.mjs';

const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const terraformFindings = cases.find((scenario) => scenario.fixture === 'ebs/terraform').expected;
for (const scenario of cases) {
  test(`built CLI: ${scenario.name}`, (t) => {
    const { run } = setupCli(t, scenario.fixture);
    const result = run('scan', '.', '--format', 'json', '--enabled-rules', scenario.ruleId, '--exit-code');
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stderr, '');
    const output = JSON.parse(result.stdout);
    assert.deepEqual(findingIdentities(output), scenario.expected);
    assert.equal(output.diagnostics, undefined);
  });
}

test('a clean fixture exits successfully with no findings', (t) => {
  const { run } = setupCli(t, 'healthy');
  const result = run('scan', '.', '--format', 'json', '--enabled-rules', 'CLDBRN-AWS-EBS-1', '--exit-code');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { providers: [] });
});

test('findings remain visible when the exit policy does not fail', (t) => {
  const { run } = setupCli(t, 'ebs/terraform');
  const result = run('scan', '.', '--format', 'json', '--enabled-rules', 'CLDBRN-AWS-EBS-1', '--fail-on', 'high');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(findingIdentities(JSON.parse(result.stdout)), terraformFindings);
});

test('explicit configuration selects rules and format, and flags override it', (t) => {
  const { directory, run } = setupCli(t, 'ebs/terraform');
  writeFileSync(
    join(directory, 'settings.yaml'),
    'iac:\n  enabled-rules:\n    - CLDBRN-AWS-EBS-1\n  format: json\n  fail-on: medium\n',
  );
  const configured = run('scan', 'main.tf', '--config', 'settings.yaml');
  assert.equal(configured.status, 1, configured.stderr);
  assert.equal(configured.stderr, '');
  assert.deepEqual(findingIdentities(JSON.parse(configured.stdout)), terraformFindings);
  const overridden = run('scan', 'main.tf', '--config', 'settings.yaml', '--enabled-rules', 'CLDBRN-AWS-S3-1');
  assert.equal(overridden.status, 0, overridden.stderr);
  assert.deepEqual(JSON.parse(overridden.stdout).providers, []);
});

test('suppressed Terraform and CloudFormation findings do not fail the command', (t) => {
  const { run } = setupCli(t, 'suppressed');
  const result = run('scan', '.', '--format', 'json', '--enabled-rules', 'CLDBRN-AWS-EBS-1', '--exit-code');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.providers, []);
  assert.deepEqual(output.suppressed.map((item) => item.finding.resourceId).sort(), [
    'Legacy',
    'aws_ebs_volume.legacy',
  ]);
});

test('malformed templates produce diagnostics while valid siblings still produce findings', (t) => {
  const { directory, run } = setupCli(t, 'malformed');
  copyFileSync(new URL('./fixtures/ebs/terraform/main.tf', import.meta.url), join(directory, 'main.tf'));
  const result = run('scan', '.', '--format', 'json', '--enabled-rules', 'CLDBRN-AWS-EBS-1', '--exit-code');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.deepEqual(findingIdentities(output), terraformFindings);
  assert.deepEqual(output.diagnostics.map((diagnostic) => diagnostic.code).sort(), [
    'CLOUDFORMATION_PARSE_ERROR',
    'TERRAFORM_PARSE_ERROR',
  ]);
  assert.ok(!result.stdout.includes(directory));
});

test('nested symlink cycles and duplicate links do not duplicate findings', (t) => {
  const { directory, run } = setupCli(t, 'ebs/terraform');
  symlinkSync(directory, join(directory, 'cycle'));
  symlinkSync('main.tf', join(directory, 'duplicate.tf'));
  symlinkSync('missing.tf', join(directory, 'dangling.tf'));
  const result = run('scan', '.', '--format', 'json', '--enabled-rules', 'CLDBRN-AWS-EBS-1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(findingIdentities(JSON.parse(result.stdout)), terraformFindings);
});

test('runtime failures exit with code 2 and use stderr for structured errors', (t) => {
  const { run } = setupCli(t, 'healthy');
  const result = run('scan', 'missing.tf', '--format', 'json');
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'PATH_NOT_FOUND');
});

test('the default table output contains findings from both template formats', (t) => {
  const { directory, run } = setupCli(t, 'ebs/terraform');
  copyFileSync(
    new URL('./fixtures/ebs/cloudformation/template.yaml', import.meta.url),
    join(directory, 'template.yaml'),
  );
  const result = run('scan', '.', '--enabled-rules', 'CLDBRN-AWS-EBS-1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /CLDBRN-AWS-EBS-1/);
  assert.match(result.stdout, /aws_ebs_volume\.legacy/);
  assert.match(result.stdout, /Legacy/);
  assert.doesNotMatch(result.stdout, /aws_ebs_volume\.current|Current/);
});
