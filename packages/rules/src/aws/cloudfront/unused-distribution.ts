import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDFRONT-2';
const RULE_SERVICE = 'cloudfront';
const RULE_MESSAGE = 'CloudFront distributions with almost no request traffic should be reviewed for cleanup.';

/** Flag CloudFront distributions with very low 30-day request volume. */
export const cloudFrontUnusedDistributionRule = createRule({
  id: RULE_ID,
  name: 'CloudFront Distribution Unused',
  description: 'Flag CloudFront distributions with fewer than 100 requests over the last 30 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cloudfront-distribution-request-activity'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-cloudfront-distribution-request-activity')
      .filter((distribution) => distribution.totalRequestsLast30Days !== null && distribution.totalRequestsLast30Days < 100)
      .map((distribution) =>
        createFindingMatch(distribution.distributionArn, distribution.region, distribution.accountId),
      );

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
