import { describe, expect, it } from 'vitest';
import { awsRules } from '../src/index.js';

describe('rule metadata', () => {
  it('ensures every aws rule has mandatory metadata fields', () => {
    for (const rule of awsRules) {
      expect(rule.id.length).toBeGreaterThan(0);
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.message.length).toBeGreaterThan(0);
      expect(rule.supports.length).toBeGreaterThan(0);

      if (rule.supports.includes('discovery') && rule.evaluateLive) {
        expect(rule.discoveryDependencies).toBeDefined();
        expect(rule.discoveryDependencies?.length).toBeGreaterThan(0);
      }

      if (rule.supports.includes('iac') && rule.evaluateStatic) {
        expect(rule.staticDependencies).toBeDefined();
        expect(rule.staticDependencies?.length).toBeGreaterThan(0);
      }
    }
  });

  it('defines the expected EC2 preferred-instance rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-1',
      name: 'EC2 Instance Type Not Preferred',
      description: 'Flag direct EC2 instances that do not use curated preferred instance types.',
      message: 'EC2 instances should use preferred instance types.',
      provider: 'aws',
      service: 'ec2',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-ec2-instances'],
      staticDependencies: ['aws-ec2-instances'],
    });
  });

  it('defines the expected S3 lifecycle rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-S3-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-S3-1',
      name: 'S3 Bucket Missing Lifecycle Configuration',
      description: 'Ensure S3 buckets define lifecycle management policies.',
      message: 'S3 buckets should define lifecycle management policies.',
      provider: 'aws',
      service: 's3',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-s3-bucket-analyses'],
      staticDependencies: ['aws-s3-bucket-analyses'],
    });
  });

  it('defines the expected RDS preferred-instance-class rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-1',
      name: 'RDS Instance Class Not Preferred',
      description: 'Flag RDS DB instances that do not use curated preferred instance classes.',
      message: 'RDS DB instances should use preferred instance classes.',
      provider: 'aws',
      service: 'rds',
      supports: ['iac'],
      staticDependencies: ['aws-rds-instances'],
    });
  });

  it('defines the expected S3 storage-class rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-S3-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-S3-2',
      name: 'S3 Bucket Storage Class Not Optimized',
      description:
        'Recommend Intelligent-Tiering or another explicit storage-class transition for lifecycle-managed buckets.',
      message: 'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
      provider: 'aws',
      service: 's3',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-s3-bucket-analyses'],
      staticDependencies: ['aws-s3-bucket-analyses'],
    });
  });

  it('defines the expected EC2 S3 endpoint rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-2',
      name: 'S3 Interface VPC Endpoint Used',
      description: 'Flag S3 interface endpoints when a gateway endpoint is the cheaper in-VPC option.',
      message: 'S3 access inside a VPC should prefer gateway endpoints over interface endpoints when possible.',
      provider: 'aws',
      service: 'ec2',
      supports: ['iac'],
      staticDependencies: ['aws-ec2-vpc-endpoints'],
    });
  });
});
