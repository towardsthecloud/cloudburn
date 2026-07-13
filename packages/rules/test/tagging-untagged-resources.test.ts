import { describe, expect, it } from 'vitest';
import { taggingUntaggedResourcesRule } from '../src/aws/tagging/untagged-resources.js';
import type { AwsUntaggedResource } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createResource = (overrides: Partial<AwsUntaggedResource> = {}): AwsUntaggedResource => ({
  accountId: '123456789012',
  arn: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-0123456789abcdef0',
  region: 'eu-west-1',
  resourceType: 'ec2:instance',
  service: 'ec2',
  ...overrides,
});

describe('taggingUntaggedResourcesRule', () => {
  it('groups globally untagged resources under one tagging finding', () => {
    const resources = [
      createResource(),
      createResource({
        arn: 'arn:aws:s3:::untagged-bucket',
        region: 'global',
        resourceType: 's3:bucket',
        service: 's3',
      }),
    ];
    const finding = taggingUntaggedResourcesRule.evaluateLive?.({
      catalog: {
        indexType: 'AGGREGATOR',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-resource-explorer-untagged-resources': resources,
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-TAGGING-1',
      service: 'tagging',
      source: 'discovery',
      message: 'Taggable AWS resources should have at least one user-created tag.',
      findings: [
        {
          accountId: '123456789012',
          region: 'eu-west-1',
          resourceId: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-0123456789abcdef0',
        },
        {
          accountId: '123456789012',
          region: 'global',
          resourceId: 'arn:aws:s3:::untagged-bucket',
        },
      ],
    });
  });

  it('returns null when Resource Explorer finds no untagged resources', () => {
    const finding = taggingUntaggedResourcesRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-resource-explorer-untagged-resources': [],
      }),
    });

    expect(finding).toBeNull();
  });
});
