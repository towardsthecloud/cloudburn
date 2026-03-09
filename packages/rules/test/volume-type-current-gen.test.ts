import { describe, expect, it } from 'vitest';
import { ebsVolumeTypeCurrentGenRule } from '../src/aws/ebs/volume-type-current-gen.js';
import type { AwsEbsVolume, IaCResource, StaticEvaluationContext } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  volumeId: 'vol-123',
  volumeType: 'gp2',
  region: 'eu-west-1',
  ...overrides,
});

const createTerraformResource = (overrides: Partial<IaCResource> = {}): IaCResource => ({
  provider: 'aws',
  type: 'aws_ebs_volume',
  name: 'gp2_data',
  location: {
    path: 'main.tf',
    startLine: 1,
    startColumn: 1,
  },
  attributeLocations: {
    type: {
      path: 'main.tf',
      startLine: 4,
      startColumn: 3,
    },
  },
  attributes: {
    type: 'gp2',
  },
  ...overrides,
});

describe('ebsVolumeTypeCurrentGenRule', () => {
  it('evaluates gp2 volumes in discovery mode only', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      ebsVolumes: [createVolume()],
    });

    expect(ebsVolumeTypeCurrentGenRule.supports).toEqual(['discovery', 'iac']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-1',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS volumes should use current-generation storage.',
      findings: [
        {
          resourceId: 'vol-123',
          region: 'eu-west-1',
        },
      ],
    });
  });

  it('evaluates gp2 volumes in iac mode', () => {
    const staticContext = {
      terraformResources: [createTerraformResource()],
    } satisfies StaticEvaluationContext;
    const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      ...staticContext,
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-1',
      service: 'ebs',
      source: 'iac',
      message: 'EBS volumes should use current-generation storage.',
      findings: [
        {
          resourceId: 'aws_ebs_volume.gp2_data',
          location: {
            path: 'main.tf',
            startLine: 4,
            startColumn: 3,
          },
        },
      ],
    });
  });

  it('ignores non-gp2 volumes', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      ebsVolumes: [createVolume({ volumeType: 'gp3' })],
    });

    expect(finding).toBeNull();
  });

  it('ignores non-ebs terraform resources in iac mode', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      terraformResources: [
        createTerraformResource({
          type: 'aws_instance',
          name: 'web',
          attributes: {
            instance_type: 't3.micro',
          },
          attributeLocations: {
            instance_type: {
              path: 'main.tf',
              startLine: 8,
              startColumn: 3,
            },
          },
        }),
      ],
    });

    expect(finding).toBeNull();
  });
});
