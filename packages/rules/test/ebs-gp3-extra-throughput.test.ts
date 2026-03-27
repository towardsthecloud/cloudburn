import { describe, expect, it } from 'vitest';
import { ebsGp3ExtraThroughputRule } from '../src/aws/ebs/gp3-extra-throughput.js';
import type { AwsStaticEbsVolume } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsStaticEbsVolume> = {}): AwsStaticEbsVolume => ({
  iops: 3000,
  location: {
    path: 'main.tf',
    line: 4,
    column: 3,
  },
  resourceId: 'aws_ebs_volume.data',
  sizeGiB: 100,
  throughputMiBps: 250,
  volumeType: 'gp3',
  ...overrides,
});

describe('ebsGp3ExtraThroughputRule', () => {
  it('flags gp3 volumes with paid throughput above the baseline', () => {
    const finding = ebsGp3ExtraThroughputRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [createVolume()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-8',
      service: 'ebs',
      source: 'iac',
      message: 'EBS gp3 volumes should avoid paid throughput above the included baseline unless required.',
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
    const finding = ebsGp3ExtraThroughputRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [
          createVolume({ throughputMiBps: 125 }),
          createVolume({ resourceId: 'DataVolume', throughputMiBps: 300, volumeType: 'io2' }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
