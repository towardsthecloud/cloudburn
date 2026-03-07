import { describe, expect, it } from 'vitest';
import { ebsVolumeTypeCurrentGenRule } from '../src/aws/ebs/volume-type-current-gen.js';
import type { AwsEbsVolume, StaticEvaluationContext } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  volumeId: 'vol-123',
  volumeType: 'gp2',
  region: 'eu-west-1',
  ...overrides,
});

describe('ebsVolumeTypeCurrentGenRule', () => {
  it('evaluates gp2 volumes in discovery mode only', () => {
    const findings = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      ebsVolumes: [createVolume()],
    });

    expect(ebsVolumeTypeCurrentGenRule.supports).toEqual(['discovery', 'iac']);
    expect(findings).toEqual([
      {
        id: 'CLDBRN-AWS-EBS-1:vol-123',
        ruleId: 'CLDBRN-AWS-EBS-1',
        message: 'EBS volume vol-123 uses gp2; migrate to gp3.',
        resource: {
          provider: 'aws',
          accountId: '',
          region: 'eu-west-1',
          service: 'ebs',
          resourceId: 'vol-123',
        },
        source: 'discovery',
      },
    ]);
  });

  it('evaluates gp2 volumes in iac mode', () => {
    const staticContext: StaticEvaluationContext = {
      awsEbsVolumes: [
        {
          resourceId: 'aws_ebs_volume.gp2_data',
          volumeType: 'gp2',
        },
      ],
    };
    const findings = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      ...staticContext,
    });

    expect(findings).toEqual([
      {
        id: 'CLDBRN-AWS-EBS-1:aws_ebs_volume.gp2_data',
        ruleId: 'CLDBRN-AWS-EBS-1',
        message: 'EBS volume aws_ebs_volume.gp2_data uses gp2; migrate to gp3.',
        resource: {
          provider: 'aws',
          accountId: '',
          region: '',
          service: 'ebs',
          resourceId: 'aws_ebs_volume.gp2_data',
        },
        source: 'iac',
      },
    ]);
  });

  it('ignores non-gp2 volumes', () => {
    const findings = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      ebsVolumes: [createVolume({ volumeType: 'gp3' })],
    });

    expect(findings).toEqual([]);
  });
});
