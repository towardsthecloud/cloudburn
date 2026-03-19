import { describe, expect, it } from 'vitest';
import { ebsHighIopsVolumeRule } from '../src/aws/ebs/high-iops-volume.js';
import type { AwsEbsVolume } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  accountId: '123456789012',
  attachments: [{ instanceId: 'i-123' }],
  iops: 40000,
  region: 'eu-west-1',
  sizeGiB: 200,
  volumeId: 'vol-123',
  volumeType: 'io2',
  ...overrides,
});

describe('ebsHighIopsVolumeRule', () => {
  it('flags io1 and io2 volumes above the high-IOPS review threshold', () => {
    const finding = ebsHighIopsVolumeRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
      }),
    });

    expect(ebsHighIopsVolumeRule.supports).toEqual(['discovery']);
    expect(ebsHighIopsVolumeRule.discoveryDependencies).toEqual(['aws-ebs-volumes']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-5',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS io1 and io2 volumes above 32000 IOPS should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceId: 'vol-123',
        },
      ],
    });
  });

  it('does not flag non-io1/io2 volumes or volumes at the threshold', () => {
    const finding = ebsHighIopsVolumeRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ iops: 32000 }), createVolume({ volumeId: 'vol-456', volumeType: 'gp3' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
