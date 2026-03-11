import { describe, expect, it } from 'vitest';
import { ebsVolumeTypeCurrentGenRule } from '../src/aws/ebs/volume-type-current-gen.js';
import type { AwsDiscoveredResource, AwsEbsVolume, AwsStaticEbsVolume } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createVolume = (overrides: Partial<AwsEbsVolume> = {}): AwsEbsVolume => ({
  volumeId: 'vol-123',
  volumeType: 'gp2',
  region: 'eu-west-1',
  accountId: '123456789012',
  ...overrides,
});

const createStaticVolume = (overrides: Partial<AwsStaticEbsVolume> = {}): AwsStaticEbsVolume => ({
  location: {
    path: 'main.tf',
    startLine: 4,
    startColumn: 3,
  },
  resourceId: 'aws_ebs_volume.gp2_data',
  volumeType: 'gp2',
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

describe('ebsVolumeTypeCurrentGenRule', () => {
  it('evaluates gp2 volumes in discovery mode only', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume()],
      }),
    });

    expect(ebsVolumeTypeCurrentGenRule.supports).toEqual(['discovery', 'iac']);
    expect(ebsVolumeTypeCurrentGenRule.discoveryDependencies).toEqual(['aws-ebs-volumes']);
    expect(ebsVolumeTypeCurrentGenRule.staticDependencies).toEqual(['aws-ebs-volumes']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-1',
      service: 'ebs',
      source: 'discovery',
      message: 'EBS volumes should use current-generation storage.',
      findings: [
        {
          resourceId: 'vol-123',
          region: 'eu-west-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('evaluates gp2 volumes in iac mode', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [createStaticVolume()],
      }),
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

  it('evaluates cloudformation gp2 volumes in iac mode', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [
          createStaticVolume({
            location: {
              path: 'template.yaml',
              startLine: 6,
              startColumn: 7,
            },
            resourceId: 'MyVolume',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EBS-1',
      service: 'ebs',
      source: 'iac',
      message: 'EBS volumes should use current-generation storage.',
      findings: [
        {
          resourceId: 'MyVolume',
          location: {
            path: 'template.yaml',
            startLine: 6,
            startColumn: 7,
          },
        },
      ],
    });
  });

  it('ignores non-gp2 volumes', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [createVolume({ volumeType: 'gp3' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('ignores non-ebs terraform resources in iac mode', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [],
      }),
    });

    expect(finding).toBeNull();
  });
});
