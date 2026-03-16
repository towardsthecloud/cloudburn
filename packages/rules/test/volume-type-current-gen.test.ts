import { describe, expect, it } from 'vitest';
import { ebsVolumeTypeCurrentGenRule } from '../src/aws/ebs/volume-type-current-gen.js';
import type { AwsDiscoveredResource, AwsEbsVolume, AwsStaticEbsVolume } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const PREVIOUS_GENERATION_EBS_VOLUME_TYPES = ['gp2', 'io1', 'standard'] as const;
const CURRENT_GENERATION_EBS_VOLUME_TYPES = ['gp3', 'io2', 'st1', 'sc1'] as const;

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
    line: 4,
    column: 3,
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
  it('exposes the expected discovery and iac metadata', () => {
    expect(ebsVolumeTypeCurrentGenRule.supports).toEqual(['discovery', 'iac']);
    expect(ebsVolumeTypeCurrentGenRule.discoveryDependencies).toEqual(['aws-ebs-volumes']);
    expect(ebsVolumeTypeCurrentGenRule.staticDependencies).toEqual(['aws-ebs-volumes']);
  });

  for (const volumeType of PREVIOUS_GENERATION_EBS_VOLUME_TYPES) {
    it(`flags ${volumeType} volumes in discovery mode`, () => {
      const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
        catalog: {
          resources: [createDiscoveredResource()],
          searchRegion: 'eu-west-1',
          indexType: 'LOCAL',
        },
        resources: new LiveResourceBag({
          'aws-ebs-volumes': [createVolume({ volumeType })],
        }),
      });

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

    it(`flags ${volumeType} volumes in terraform iac mode`, () => {
      const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
        resources: new StaticResourceBag({
          'aws-ebs-volumes': [createStaticVolume({ volumeType })],
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
              line: 4,
              column: 3,
            },
          },
        ],
      });
    });
  }

  it('flags cloudformation previous-generation volumes in iac mode', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [
          createStaticVolume({
            location: {
              path: 'template.yaml',
              line: 6,
              column: 7,
            },
            resourceId: 'MyVolume',
            volumeType: 'standard',
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
            line: 6,
            column: 7,
          },
        },
      ],
    });
  });

  for (const volumeType of CURRENT_GENERATION_EBS_VOLUME_TYPES) {
    it(`ignores ${volumeType} volumes in discovery mode`, () => {
      const finding = ebsVolumeTypeCurrentGenRule.evaluateLive?.({
        catalog: {
          resources: [createDiscoveredResource()],
          searchRegion: 'eu-west-1',
          indexType: 'LOCAL',
        },
        resources: new LiveResourceBag({
          'aws-ebs-volumes': [createVolume({ volumeType })],
        }),
      });

      expect(finding).toBeNull();
    });
  }

  it('ignores null static volume types in iac mode', () => {
    const finding = ebsVolumeTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ebs-volumes': [createStaticVolume({ volumeType: null })],
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
