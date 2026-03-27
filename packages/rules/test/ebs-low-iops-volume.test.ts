import { describe, expect, it } from 'vitest';
import { ebsLowIopsVolumeRule } from '../src/aws/ebs/low-iops-volume.js';
import type { AwsEbsVolume, AwsStaticEbsVolume } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

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

const createStaticVolume = (overrides: Partial<AwsStaticEbsVolume> = {}): AwsStaticEbsVolume => ({
  resourceId: 'aws_ebs_volume.logs',
  volumeType: 'io1',
  sizeGiB: 200,
  iops: 16000,
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

    expect(ebsLowIopsVolumeRule.supports).toEqual(['discovery', 'iac']);
    expect(ebsLowIopsVolumeRule.discoveryDependencies).toEqual(['aws-ebs-volumes']);
    expect(ebsLowIopsVolumeRule.staticDependencies).toEqual(['aws-ebs-volumes']);
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

  it('flags static io1 and io2 volumes that stay within the gp3 IOPS heuristic', () => {
    const finding = ebsLowIopsVolumeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [createStaticVolume()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-6',
      service: 'ebs',
      source: 'iac',
      message: 'EBS io1 and io2 volumes at 16000 IOPS or below should be reviewed for gp3.',
      findings: [
        {
          resourceId: 'aws_ebs_volume.logs',
        },
      ],
    });
  });

  it('skips static volumes above the gp3 IOPS heuristic or other volume types', () => {
    const finding = ebsLowIopsVolumeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [
          createStaticVolume({ iops: 16001 }),
          createStaticVolume({ resourceId: 'aws_ebs_volume.data', volumeType: 'gp3' }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
