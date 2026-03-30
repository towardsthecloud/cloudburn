import { describe, expect, it } from 'vitest';
import { ebsGp3ExtraIopsRule } from '../src/aws/ebs/gp3-extra-iops.js';
import type { AwsStaticEbsVolume } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsStaticEbsVolume> = {}): AwsStaticEbsVolume => ({
  iops: 6000,
  location: {
    path: 'main.tf',
    line: 4,
    column: 3,
  },
  resourceId: 'aws_ebs_volume.data',
  sizeGiB: 100,
  volumeType: 'gp3',
  ...overrides,
});

describe('ebsGp3ExtraIopsRule', () => {
  it('flags gp3 volumes with paid iops above the baseline', () => {
    const finding = ebsGp3ExtraIopsRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [createVolume()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-9',
      service: 'ebs',
      source: 'iac',
      message: 'EBS gp3 volumes should avoid paid IOPS above the included baseline unless required.',
      findings: [
        {
          location: {
            path: 'main.tf',
            line: 4,
            column: 3,
          },
          resourceId: 'aws_ebs_volume.data',
        },
      ],
    });
  });

  it('skips gp3 volumes at the baseline or non-gp3 volumes', () => {
    const finding = ebsGp3ExtraIopsRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [
          createVolume({ iops: 3000 }),
          createVolume({ resourceId: 'DataVolume', iops: 6000, volumeType: 'io2' }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
