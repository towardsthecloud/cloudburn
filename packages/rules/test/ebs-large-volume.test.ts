import { describe, expect, it } from 'vitest';
import { ebsLargeVolumeRule } from '../src/aws/ebs/large-volume.js';
import type { AwsEbsVolume, AwsStaticEbsVolume } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  accountId: '123456789012',
  attachments: [{ instanceId: 'i-123' }],
  iops: 3000,
  region: 'eu-west-1',
  sizeGiB: 200,
  volumeId: 'vol-123',
  volumeType: 'gp3',
  ...overrides,
});

const createStaticVolume = (overrides: Partial<AwsStaticEbsVolume> = {}): AwsStaticEbsVolume => ({
  resourceId: 'aws_ebs_volume.logs',
  volumeType: 'gp3',
  sizeGiB: 200,
  iops: 3000,
  throughputMiBps: 125,
  ...overrides,
});

describe('ebsLargeVolumeRule', () => {
  it('flags volumes larger than the oversized-volume threshold', () => {
    const finding = ebsLargeVolumeRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
      }),
    });

    expect(ebsLargeVolumeRule.supports).toEqual(['discovery', 'iac']);
    expect(ebsLargeVolumeRule.discoveryDependencies).toEqual(['aws-ebs-volumes']);
    expect(ebsLargeVolumeRule.staticDependencies).toEqual(['aws-ebs-volumes']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-4',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS volumes larger than 100 GiB should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceId: 'vol-123',
        },
      ],
    });
  });

  it('does not flag volumes at or below the oversized-volume threshold', () => {
    const finding = ebsLargeVolumeRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ sizeGiB: 100 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags static volumes larger than the oversized-volume threshold', () => {
    const finding = ebsLargeVolumeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [createStaticVolume()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-4',
      service: 'ebs',
      source: 'iac',
      message: 'EBS volumes larger than 100 GiB should be reviewed.',
      findings: [
        {
          resourceId: 'aws_ebs_volume.logs',
        },
      ],
    });
  });

  it('skips static volumes at or below the oversized-volume threshold', () => {
    const finding = ebsLargeVolumeRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [createStaticVolume({ sizeGiB: 100 })],
      }),
    });

    expect(finding).toBeNull();
  });
});
