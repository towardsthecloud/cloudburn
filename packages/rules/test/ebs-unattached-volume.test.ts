import { describe, expect, it } from 'vitest';
import { ebsUnattachedVolumeRule } from '../src/aws/ebs/unattached-volume.js';
import type { AwsDiscoveredResource, AwsEbsVolume } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  region: 'eu-west-1',
  accountId: '123456789012',
  attachments: [],
  iops: 3000,
  sizeGiB: 128,
  volumeId: 'vol-123',
  volumeType: 'gp3',
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

describe('ebsUnattachedVolumeRule', () => {
  it('flags unattached volumes in discovery mode', () => {
    const finding = ebsUnattachedVolumeRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
      }),
    });

    expect(ebsUnattachedVolumeRule.supports).toEqual(['discovery']);
    expect(ebsUnattachedVolumeRule.discoveryDependencies).toEqual(['aws-ebs-volumes']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-2',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS volumes should not remain unattached.',
      findings: [
        {
          resourceId: 'vol-123',
          region: 'eu-west-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('does not flag attached volumes', () => {
    const finding = ebsUnattachedVolumeRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ attachments: [{ instanceId: 'i-123' }] })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('does not flag volumes when attachment data is unavailable', () => {
    const finding = ebsUnattachedVolumeRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ attachments: undefined })],
      }),
    });

    expect(finding).toBeNull();
  });
});
