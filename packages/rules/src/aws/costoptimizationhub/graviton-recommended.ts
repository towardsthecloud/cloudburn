import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

/** Resource namespaces for the supported Hub architecture migrations. */
export const gravitonResourceTypes = {
  Ec2Instance: 'ec2:instance',
  Ec2AutoScalingGroup: 'autoscaling:autoScalingGroup',
  RdsDbInstance: 'rds:db',
} as const;

const metadata = {
  id: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-6',
  service: 'costoptimizationhub',
  severity: 'medium' as const,
  message: 'Review AWS-recommended Graviton migrations, workload compatibility, and rollback requirements.',
};

/** Reports architecture migration candidates without asserting workload compatibility. */
export const costOptimizationHubGravitonRecommendedRule = createRule({
  ...metadata,
  name: 'AWS-Identified Resources Without Graviton',
  description:
    'Flag EC2 instances, Auto Scaling groups, and RDS DB instances with AWS Graviton migration recommendations.',
  provider: 'aws',
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-optimization-hub-graviton-recommendations'],
  evaluateLive: ({ resources }) =>
    createFinding(
      metadata,
      'discovery',
      [
        ...new Map(
          resources
            .get('aws-cost-optimization-hub-graviton-recommendations')
            .map((item) => [item.recommendationId, item]),
        ).values(),
      ].map((item) => ({
        ...createFindingMatch(
          item.resourceId ?? item.resourceArn ?? item.recommendationId,
          item.region,
          item.accountId,
        ),
        resourceType: gravitonResourceTypes[item.currentResourceType],
      })),
    ),
});
