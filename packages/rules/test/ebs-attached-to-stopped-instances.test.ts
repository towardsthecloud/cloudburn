import { describe, expect, it } from 'vitest';
import { ebsAttachedToStoppedInstancesRule } from '../src/aws/ebs/attached-to-stopped-instances.js';
import type { AwsDiscoveredResource, AwsEbsVolume, AwsEc2Instance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  volumeId: 'vol-123',
  volumeType: 'gp3',
  attachments: [{ instanceId: 'i-123' }],
  region: 'eu-west-1',
  accountId: '123456789012',
  ...overrides,
});

const createInstance = (overrides: Partial<AwsEc2Instance> = {}): AwsEc2Instance => ({
  accountId: '123456789012',
  instanceId: 'i-123',
  instanceType: 'm8i.large',
  region: 'eu-west-1',
  state: 'stopped',
  ...overrides,
});

const createDiscoveredResource = (overrides: Partial<AwsDiscoveredResource> = {}): AwsDiscoveredResource => ({
  arn: 'arn:aws:ec2:eu-west-1:123456789012:volume/vol-123',
  accountId: '123456789012',
  region: 'eu-west-1',
  service: 'ec2',
  resourceType: 'ec2:volume',
  properties: [],
  ...overrides,
});

describe('ebsAttachedToStoppedInstancesRule', () => {
  it('flags volumes attached only to stopped instances', () => {
    const finding = ebsAttachedToStoppedInstancesRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
        'aws-ec2-instances': [createInstance()],
      }),
    });

    expect(ebsAttachedToStoppedInstancesRule.supports).toEqual(['discovery']);
    expect(ebsAttachedToStoppedInstancesRule.discoveryDependencies).toEqual(['aws-ebs-volumes', 'aws-ec2-instances']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-3',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS volumes attached only to stopped EC2 instances should be reviewed.',
      findings: [
        {
          resourceId: 'vol-123',
          region: 'eu-west-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('does not flag volumes attached to running instances', () => {
    const finding = ebsAttachedToStoppedInstancesRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
        'aws-ec2-instances': [createInstance({ state: 'running' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags multi-attach volumes only when every attached instance is stopped', () => {
    const finding = ebsAttachedToStoppedInstancesRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ attachments: [{ instanceId: 'i-123' }, { instanceId: 'i-456' }] })],
        'aws-ec2-instances': [createInstance(), createInstance({ instanceId: 'i-456' })],
      }),
    });

    expect(finding?.findings).toHaveLength(1);
  });

  it('does not flag multi-attach volumes when any attached instance is running', () => {
    const finding = ebsAttachedToStoppedInstancesRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ attachments: [{ instanceId: 'i-123' }, { instanceId: 'i-456' }] })],
        'aws-ec2-instances': [createInstance(), createInstance({ instanceId: 'i-456', state: 'running' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag volumes when attached instance state cannot be resolved', () => {
    const finding = ebsAttachedToStoppedInstancesRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
        'aws-ec2-instances': [],
      }),
    });

    expect(finding).toBeNull();
  });
});
