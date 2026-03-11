import { awsRules } from '@cloudburn/rules';
import { describe, expect, it } from 'vitest';
import { listBuiltInRuleMetadata } from '../src/built-in-rules.js';
import { builtInRuleMetadata, parseIaC, type Rule } from '../src/index.js';

const createRuleFixture = (id: string): Rule => ({
  description: id,
  id,
  message: id,
  name: id,
  provider: 'aws',
  service: 'ec2',
  supports: ['iac'],
});

describe('sdk exports', () => {
  it('exports the autodetect parser from the package root', () => {
    expect(parseIaC).toBeTypeOf('function');
  });

  it('exports built-in rule metadata in stable provider/service/id order', () => {
    expect(
      builtInRuleMetadata.map((rule) => ({
        description: rule.description,
        id: rule.id,
        provider: rule.provider,
        service: rule.service,
        supports: rule.supports,
      })),
    ).toEqual([
      {
        description: 'Flag EBS volumes using previous-generation gp2 type instead of gp3.',
        id: 'CLDBRN-AWS-EBS-1',
        provider: 'aws',
        service: 'ebs',
        supports: ['discovery', 'iac'],
      },
      {
        description: 'Flag direct EC2 instances that do not use curated preferred instance types.',
        id: 'CLDBRN-AWS-EC2-1',
        provider: 'aws',
        service: 'ec2',
        supports: ['iac', 'discovery'],
      },
      {
        description: 'Flag S3 interface endpoints when a gateway endpoint is the cheaper in-VPC option.',
        id: 'CLDBRN-AWS-EC2-2',
        provider: 'aws',
        service: 'ec2',
        supports: ['iac'],
      },
      {
        description: 'Recommend arm64 architecture when compatible.',
        id: 'CLDBRN-AWS-LAMBDA-1',
        provider: 'aws',
        service: 'lambda',
        supports: ['iac', 'discovery'],
      },
      {
        description: 'Ensure RDS instance classes match allowed profile policy.',
        id: 'CLDBRN-AWS-RDS-1',
        provider: 'aws',
        service: 'rds',
        supports: ['iac', 'discovery'],
      },
      {
        description: 'Ensure S3 buckets define lifecycle management policies.',
        id: 'CLDBRN-AWS-S3-1',
        provider: 'aws',
        service: 's3',
        supports: ['iac', 'discovery'],
      },
      {
        description:
          'Recommend Intelligent-Tiering or another explicit storage-class transition for lifecycle-managed buckets.',
        id: 'CLDBRN-AWS-S3-2',
        provider: 'aws',
        service: 's3',
        supports: ['iac', 'discovery'],
      },
    ]);
  });

  it('sorts numeric rule suffixes in numeric order within the same service', () => {
    expect(
      listBuiltInRuleMetadata([
        createRuleFixture('CLDBRN-AWS-EC2-10'),
        createRuleFixture('CLDBRN-AWS-EC2-2'),
        createRuleFixture('CLDBRN-AWS-EC2-1'),
      ]).map((rule) => rule.id),
    ).toEqual(['CLDBRN-AWS-EC2-1', 'CLDBRN-AWS-EC2-2', 'CLDBRN-AWS-EC2-10']);
  });

  it('clones supports arrays so metadata consumers cannot mutate source rule definitions', () => {
    const sourceRule = awsRules.find((rule) => rule.id === 'CLDBRN-AWS-EBS-1');
    const metadataRule = builtInRuleMetadata.find((rule) => rule.id === 'CLDBRN-AWS-EBS-1');

    expect(sourceRule).toBeDefined();
    expect(metadataRule).toBeDefined();
    expect(metadataRule?.supports).toEqual(sourceRule?.supports);
    expect(metadataRule?.supports).not.toBe(sourceRule?.supports);
  });
});
