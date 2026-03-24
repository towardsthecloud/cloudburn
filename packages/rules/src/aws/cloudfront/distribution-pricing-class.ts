import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDFRONT-1';
const RULE_SERVICE = 'cloudfront';
const RULE_MESSAGE = 'CloudFront distributions using PriceClass_All should be reviewed for cheaper edge coverage.';

/** Flag CloudFront distributions that use the most expensive global price class. */
export const cloudFrontDistributionPricingClassRule = createRule({
  id: RULE_ID,
  name: 'CloudFront Distribution Price Class All',
  description: 'Flag CloudFront distributions using PriceClass_All when a cheaper price class may suffice.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cloudfront-distributions'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-cloudfront-distributions')
      .filter((distribution) => distribution.priceClass === 'PriceClass_All')
      .map((distribution) =>
        createFindingMatch(distribution.distributionArn, distribution.region, distribution.accountId),
      );

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
