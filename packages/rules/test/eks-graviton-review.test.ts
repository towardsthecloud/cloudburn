import { describe, expect, it } from 'vitest';
import { eksGravitonReviewRule } from '../src/aws/eks/graviton-review.js';
import type { AwsEksNodegroup } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createNodegroup = (overrides: Partial<AwsEksNodegroup> = {}): AwsEksNodegroup => ({
  accountId: '123456789012',
  amiType: 'AL2023_x86_64_STANDARD',
  clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/production',
  clusterName: 'production',
  instanceTypes: ['m7i.large'],
  nodegroupArn: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/workers/abc123',
  nodegroupName: 'workers',
  region: 'us-east-1',
  ...overrides,
});

describe('eksGravitonReviewRule', () => {
  it('flags reviewable non-Graviton EKS node groups', () => {
    const finding = eksGravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-eks-nodegroups': [createNodegroup()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EKS-1',
      service: 'eks',
      source: 'discovery',
      message: 'EKS node groups without a Graviton equivalent in use should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/workers/abc123',
        },
      ],
    });
  });

  it('skips Arm node groups and unclassified shapes conservatively', () => {
    const finding = eksGravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-eks-nodegroups': [
          createNodegroup({
            amiType: 'AL2023_ARM_64_STANDARD',
            instanceTypes: ['m7g.large'],
            nodegroupArn: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/arm-workers/abc123',
            nodegroupName: 'arm-workers',
          }),
          createNodegroup({
            instanceTypes: ['u-12tb1.metal'],
            nodegroupArn: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/special/abc123',
            nodegroupName: 'special',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
