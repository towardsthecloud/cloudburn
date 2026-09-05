import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { runStaticScan } from '../src/engine/run-static.js';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cloudburn-scope-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const write = async (path: string, content: string) => {
  const destination = join(directory, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content);
  return path;
};

it('joins Terraform files in one directory without borrowing another module’s bucket lifecycle', async () => {
  const bucket = 'resource "aws_s3_bucket" "logs" {}';
  await write('a/main.tf', bucket);
  const missingPath = await write('b/main.tf', bucket);
  await write(
    'a/lifecycle.tf',
    `resource "aws_s3_bucket_lifecycle_configuration" "logs" {
    bucket = aws_s3_bucket.logs.id
    rule {
      id = "expire"
      status = "Enabled"
      expiration { days = 30 }
    }
  }`,
  );
  const result = await runStaticScan(directory, { iac: { enabledRules: ['CLDBRN-AWS-S3-1'] } });
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    expect.objectContaining({
      resourceId: 'aws_s3_bucket.logs',
      location: expect.objectContaining({ path: missingPath }),
    }),
  ]);
});

it.each([
  'terraform',
  'cloudformation',
] as const)('keeps %s autoscaling evidence inside its source scope during rule evaluation', async (kind) => {
  const terraformTable = `resource "aws_dynamodb_table" "shared" {
    name = "shared"
    billing_mode = "PROVISIONED"
  }`;
  const terraformTarget = `resource "aws_appautoscaling_target" "shared" {
    resource_id = "table/shared"
    service_namespace = "dynamodb"
    scalable_dimension = "dynamodb:table:ReadCapacityUnits"
  }`;
  const cloudFormationTable = {
    Type: 'AWS::DynamoDB::Table',
    Properties: { TableName: 'shared', BillingMode: 'PROVISIONED' },
  };
  let missingPath: string;
  if (kind === 'terraform') {
    await write('a/main.tf', terraformTable);
    await write('a/scaling.tf', terraformTarget);
    missingPath = await write('b/main.tf', terraformTable);
  } else {
    await write(
      'a.json',
      JSON.stringify({
        Resources: {
          Shared: cloudFormationTable,
          Target: {
            Type: 'AWS::ApplicationAutoScaling::ScalableTarget',
            Properties: {
              ResourceId: 'table/shared',
              ServiceNamespace: 'dynamodb',
              ScalableDimension: 'dynamodb:table:ReadCapacityUnits',
            },
          },
        },
      }),
    );
    missingPath = await write('b.json', JSON.stringify({ Resources: { Shared: cloudFormationTable } }));
  }
  const result = await runStaticScan(directory, { iac: { enabledRules: ['CLDBRN-AWS-DYNAMODB-2'] } });
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    expect.objectContaining({ location: expect.objectContaining({ path: missingPath }) }),
  ]);
});
