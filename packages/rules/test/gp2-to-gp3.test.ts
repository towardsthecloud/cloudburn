import { describe, expect, it } from 'vitest';
import { ebsGp2ToGp3Rule } from '../src/aws/ebs/gp2-to-gp3.js';
import type { AwsEbsVolume } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  volumeId: 'vol-123',
  volumeType: 'gp2',
  region: 'eu-west-1',
  ...overrides,
});

describe('ebsGp2ToGp3Rule', () => {
  it('evaluates gp2 volumes in live mode only', () => {
    const findings = ebsGp2ToGp3Rule.evaluateLive?.({
      ebsVolumes: [createVolume()],
    });

    expect(ebsGp2ToGp3Rule.supports).toEqual(['live']);
    expect(findings).toEqual([
      {
        id: 'ebs-gp2-to-gp3:vol-123',
        ruleId: 'ebs-gp2-to-gp3',
        severity: 'warning',
        message: 'EBS volume vol-123 uses gp2; migrate to gp3.',
        location: 'aws://ebs/eu-west-1/vol-123',
        mode: 'live',
      },
    ]);
  });

  it('ignores non-gp2 volumes', () => {
    const findings = ebsGp2ToGp3Rule.evaluateLive?.({
      ebsVolumes: [createVolume({ volumeType: 'gp3' })],
    });

    expect(findings).toEqual([]);
  });
});
