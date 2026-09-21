import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { readOutputs, setupAction } from './helpers.mjs';

test('a finding emits an annotation, outputs, and fails with exit-code', (t) => {
  const { outputFile, summaryFile, run } = setupAction(t, 'ebs/terraform');
  const result = run({ 'ENABLED-RULES': 'CLDBRN-AWS-EBS-1', 'EXIT-CODE': 'true' });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /::warning title=CLDBRN-AWS-EBS-1 aws_ebs_volume\.legacy,file=main\.tf,line=4,col=3::/);
  assert.match(result.stdout, /::error::CloudBurn scan failed: 1 finding\(s\) detected\./);

  const outputs = readOutputs(outputFile);
  assert.equal(outputs['findings-count'], '1');
  assert.equal(outputs['suppressed-count'], '0');
  assert.equal(outputs.failed, 'true');
  assert.ok(outputs['result-file']);
  const scanResult = JSON.parse(readFileSync(outputs['result-file'], 'utf8'));
  assert.equal(scanResult.providers[0].rules[0].findings[0].resourceId, 'aws_ebs_volume.legacy');
  assert.match(outputs.markdown, /\*\*1 finding\*\*/);

  assert.match(readFileSync(summaryFile, 'utf8'), /## CloudBurn scan\n\n\*\*1 finding\*\*/);
});

test('a clean fixture exits successfully with no annotations', (t) => {
  const { outputFile, run } = setupAction(t, 'healthy');
  const result = run({ 'ENABLED-RULES': 'CLDBRN-AWS-EBS-1', 'EXIT-CODE': 'true' });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /::(error|warning) title=/);
  assert.equal(readOutputs(outputFile)['findings-count'], '0');
});

test('fail-on honors the severity threshold', (t) => {
  const { run } = setupAction(t, 'ebs/terraform');
  const passing = run({ 'ENABLED-RULES': 'CLDBRN-AWS-EBS-1', 'FAIL-ON': 'high' });
  assert.equal(passing.status, 0, passing.stderr);

  const failing = run({ 'ENABLED-RULES': 'CLDBRN-AWS-EBS-1', 'FAIL-ON': 'medium' });
  assert.equal(failing.status, 1, failing.stderr);
  assert.match(failing.stdout, /::error::CloudBurn scan failed: 1 finding\(s\) at or above medium severity\./);
});

test('suppressed findings are reported but never fail the job', (t) => {
  const { outputFile, summaryFile, run } = setupAction(t, 'suppressed');
  const result = run({ 'ENABLED-RULES': 'CLDBRN-AWS-EBS-1', 'EXIT-CODE': 'true' });

  assert.equal(result.status, 0, result.stderr);
  const outputs = readOutputs(outputFile);
  assert.equal(outputs['findings-count'], '0');
  assert.equal(outputs['suppressed-count'], '2');
  assert.match(readFileSync(summaryFile, 'utf8'), /Suppressed findings \(2\)/);
});

test('a missing scan path fails with a structured error', (t) => {
  const { run } = setupAction(t, 'healthy');
  const result = run({ PATH: 'missing.tf' });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /::error::\{[\s\S]*"code": "PATH_NOT_FOUND"/);
});

test('a subdirectory scan annotates files relative to the workspace', (t) => {
  const { run } = setupAction(t, 'ebs');
  const result = run({ 'ENABLED-RULES': 'CLDBRN-AWS-EBS-1', PATH: 'terraform' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /file=terraform\/main\.tf,/);
});

test('a file scan annotates the file itself', (t) => {
  const { run } = setupAction(t, 'ebs/terraform');
  const result = run({ 'ENABLED-RULES': 'CLDBRN-AWS-EBS-1', PATH: 'main.tf' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /file=main\.tf,/);
  assert.doesNotMatch(result.stdout, /file=main\.tf\/main\.tf/);
});

test('annotations can be disabled while outputs still report findings', (t) => {
  const { outputFile, run } = setupAction(t, 'ebs/terraform');
  const result = run({ 'ENABLED-RULES': 'CLDBRN-AWS-EBS-1', ANNOTATIONS: 'false' });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /::(error|warning) title=/);
  assert.equal(readOutputs(outputFile)['findings-count'], '1');
});

test('the findings comment is skipped outside pull request events', (t) => {
  const { run } = setupAction(t, 'healthy');
  const result = run({ COMMENT: 'true' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skipping the findings comment/);
});

test('an explicit config file selects rules', (t) => {
  const { directory, run } = setupAction(t, 'ebs/terraform');
  writeFileSync(join(directory, 'settings.yaml'), 'iac:\n  enabled-rules:\n    - CLDBRN-AWS-S3-1\n');

  const result = run({ CONFIG: 'settings.yaml' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 finding/);
});
