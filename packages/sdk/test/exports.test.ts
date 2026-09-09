import { fileURLToPath } from 'node:url';
import { awsRules } from '@cloudburn/rules';
import { describe, expect, it } from 'vitest';
import { listBuiltInRuleMetadata } from '../src/built-in-rules.js';
import { builtInRuleMetadata, parseIaC, type Rule, withAwsClientCredentials } from '../src/index.js';
import { getAwsDiscoveryDatasetDefinition } from '../src/providers/aws/discovery-registry.js';
import { getAwsStaticDatasetDefinition } from '../src/providers/aws/static-registry.js';

const createRuleFixture = (id: string, overrides: Partial<Rule> = {}): Rule => ({
  description: id,
  id,
  message: id,
  name: id,
  provider: 'aws',
  service: 'ec2',
  severity: 'medium',
  supports: ['iac'],
  ...overrides,
});

describe('sdk exports', () => {
  it('preserves the array-returning autodetect parser contract at the package root', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/ebs-gp2.tf', import.meta.url));
    const resources = await parseIaC(resourcePath);

    expect(parseIaC).toBeTypeOf('function');
    expect(Array.isArray(resources)).toBe(true);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.name).toBe('gp2_data');
  });

  it('exports the aws credential scoping helper from the package root', () => {
    expect(withAwsClientCredentials).toBeTypeOf('function');
  });

  it('exports the complete projected catalog without sharing mutable arrays', () => {
    expect(builtInRuleMetadata).toEqual(listBuiltInRuleMetadata(awsRules));
    for (const rule of awsRules) {
      const metadata = builtInRuleMetadata.find((candidate) => candidate.id === rule.id);
      expect(metadata?.supports, rule.id).not.toBe(rule.supports);
      if (rule.supersedesRuleIds) {
        expect(metadata?.supersedesRuleIds, rule.id).not.toBe(rule.supersedesRuleIds);
      }
    }
  });

  it('resolves every built-in dependency to an SDK dataset loader', () => {
    for (const rule of awsRules) {
      for (const key of [...(rule.discoveryDependencies ?? []), ...(rule.optionalDiscoveryDependencies ?? [])]) {
        expect(getAwsDiscoveryDatasetDefinition(key), `${rule.id} discovery dependency ${key}`).toMatchObject({
          datasetKey: key,
          load: expect.any(Function),
        });
      }
      for (const key of rule.staticDependencies ?? []) {
        expect(getAwsStaticDatasetDefinition(key), `${rule.id} static dependency ${key}`).toMatchObject({
          datasetKey: key,
          load: expect.any(Function),
        });
      }
    }
  });

  it('orders metadata by provider, service, then numeric rule ID', () => {
    const metadata = listBuiltInRuleMetadata([
      createRuleFixture('CLDBRN-AWS-EC2-10'),
      createRuleFixture('CLDBRN-GCP-COMPUTE-1', { provider: 'gcp', service: 'compute' }),
      createRuleFixture('CLDBRN-AWS-S3-1', { service: 's3' }),
      createRuleFixture('CLDBRN-AWS-EC2-2'),
      createRuleFixture('CLDBRN-AZURE-COMPUTE-1', { provider: 'azure', service: 'compute' }),
      createRuleFixture('CLDBRN-AWS-EBS-1', { service: 'ebs' }),
    ]);

    expect(metadata.map((rule) => rule.id)).toEqual([
      'CLDBRN-AWS-EBS-1',
      'CLDBRN-AWS-EC2-2',
      'CLDBRN-AWS-EC2-10',
      'CLDBRN-AWS-S3-1',
      'CLDBRN-AZURE-COMPUTE-1',
      'CLDBRN-GCP-COMPUTE-1',
    ]);
    expect(metadata[0]).not.toHaveProperty('supersedesRuleIds');
  });

  it('projects serializable metadata without exposing evaluators or sharing mutable arrays', () => {
    const rule = createRuleFixture('CLDBRN-AWS-EC2-1', {
      description: 'Find older instance types.',
      message: 'Review this instance type.',
      name: 'Preferred instance type',
      staticDependencies: ['aws-ec2-instances'],
      supersedesRuleIds: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-5'],
      evaluateStatic: () => null,
    });
    const [metadata] = listBuiltInRuleMetadata([rule]);
    if (!metadata) {
      throw new Error('expected rule metadata to be present');
    }

    expect(metadata).toEqual({
      description: 'Find older instance types.',
      id: 'CLDBRN-AWS-EC2-1',
      message: 'Review this instance type.',
      name: 'Preferred instance type',
      provider: 'aws',
      service: 'ec2',
      severity: 'medium',
      supports: ['iac'],
      supersedesRuleIds: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-5'],
    });
    expect(metadata.supports).not.toBe(rule.supports);
    expect(metadata.supersedesRuleIds).not.toBe(rule.supersedesRuleIds);
  });
});
