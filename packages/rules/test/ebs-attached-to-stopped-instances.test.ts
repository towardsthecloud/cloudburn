import { describe, expect, it } from 'vitest';
import { ebsAttachedToStoppedInstancesRule } from '../src/aws/ebs/attached-to-stopped-instances.js';
import type { AwsDiscoveredResource, AwsEbsVolume, AwsEc2Instance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  region: 'eu-west-1',
  accountId: '123456789012',
  attachments: [{ instanceId: 'i-123' }],
  iops: 3000,
  sizeGiB: 128,
  volumeId: 'vol-123',
  volumeType: 'gp3',
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

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-3',
      service: 'ebs',
      severity: 'high',
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

  it('reports volumes with unresolved attachment state as unknown coverage', () => {
    const coverage = ebsAttachedToStoppedInstancesRule.getLiveEvaluationCoverage?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [
          createVolume({ volumeId: 'vol-stopped' }),
          createVolume({ attachments: [], volumeId: 'vol-unattached' }),
          createVolume({ attachments: [{ instanceId: 'i-missing' }], volumeId: 'vol-missing-instance' }),
          createVolume({ attachments: [{ instanceId: 'i-stateless' }], volumeId: 'vol-stateless-instance' }),
          createVolume({ attachments: [{ instanceId: 'i-123' }, { instanceId: 'i-missing' }], volumeId: 'vol-mixed' }),
          createVolume({ attachments: [{}], volumeId: 'vol-attachment-without-id' }),
          createVolume({ attachments: [{ instanceId: 'i-123' }, {}], volumeId: 'vol-stopped-plus-unknown' }),
          createVolume({
            attachments: [{ instanceId: 'i-running' }, { instanceId: 'i-missing' }],
            volumeId: 'vol-running-settles',
          }),
        ],
        'aws-ec2-instances': [
          createInstance(),
          createInstance({ instanceId: 'i-stateless', state: undefined }),
          createInstance({ instanceId: 'i-running', state: 'running' }),
        ],
      }),
    });

    const match = (resourceId: string) => ({ accountId: '123456789012', region: 'eu-west-1', resourceId });
    expect(coverage).toEqual({
      assessed: [match('vol-stopped'), match('vol-unattached'), match('vol-running-settles')],
      unknown: [
        match('vol-missing-instance'),
        match('vol-stateless-instance'),
        match('vol-mixed'),
        match('vol-attachment-without-id'),
        match('vol-stopped-plus-unknown'),
      ],
    });
  });

  it('does not treat an attachment without an instance ID as stopped', () => {
    const finding = ebsAttachedToStoppedInstancesRule.evaluateLive?.({
      catalog: { resources: [createDiscoveredResource()], searchRegion: 'eu-west-1', indexType: 'LOCAL' },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ attachments: [{ instanceId: 'i-123' }, {}] })],
        'aws-ec2-instances': [createInstance()],
      }),
    });

    expect(finding).toBeNull();
  });
});
