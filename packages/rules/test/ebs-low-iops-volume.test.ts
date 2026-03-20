import { describe, expect, it } from 'vitest';
import { ebsLowIopsVolumeRule } from '../src/aws/ebs/low-iops-volume.js';
import type { AwsEbsVolume } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  accountId: '123456789012',
  attachments: [{ instanceId: 'i-123' }],
  iops: 16000,
  region: 'eu-west-1',
  sizeGiB: 200,
  volumeId: 'vol-123',
  volumeType: 'io1',
  ...overrides,
});

describe('ebsLowIopsVolumeRule', () => {
  it('flags io1 and io2 volumes that stay within the gp3 IOPS heuristic', () => {
    const finding = ebsLowIopsVolumeRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
      }),
    });

    expect(ebsLowIopsVolumeRule.supports).toEqual(['discovery']);
    expect(ebsLowIopsVolumeRule.discoveryDependencies).toEqual(['aws-ebs-volumes']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-6',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS io1 and io2 volumes at 16000 IOPS or below should be reviewed for gp3.',
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceId: 'vol-123',
        },
      ],
    });
  });

  it('does not flag volumes above the gp3 IOPS heuristic or other volume types', () => {
    const finding = ebsLowIopsVolumeRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ iops: 16001 }), createVolume({ volumeId: 'vol-456', volumeType: 'gp3' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
