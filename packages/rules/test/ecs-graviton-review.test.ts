import { describe, expect, it } from 'vitest';
import { ecsGravitonReviewRule } from '../src/aws/ecs/graviton-review.js';
import type { AwsEcsContainerInstance } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createContainerInstance = (overrides: Partial<AwsEcsContainerInstance> = {}): AwsEcsContainerInstance => ({
  accountId: '123456789012',
  architecture: 'x86_64',
  clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
  containerInstanceArn: 'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
  ec2InstanceId: 'i-1234567890abcdef0',
  instanceType: 'm7i.large',
  region: 'us-east-1',
  ...overrides,
});

describe('ecsGravitonReviewRule', () => {
  it('flags reviewable non-Graviton ECS container instances', () => {
    const finding = ecsGravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecs-container-instances': [createContainerInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ECS-1',
      service: 'ecs',
      source: 'discovery',
      message: 'ECS container instances without a Graviton equivalent in use should be reviewed.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
        },
      ],
    });
  });

  it('skips container instances already running on Arm', () => {
    const finding = ecsGravitonReviewRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecs-container-instances': [createContainerInstance({ architecture: 'arm64', instanceType: 'm7g.large' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
