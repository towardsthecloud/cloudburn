import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-KMS-1';
const RULE_SERVICE = 'kms';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE =
  'Regions with many enabled customer-managed KMS keys or rapid key creation should review key lifecycle and consolidation opportunities.';

/** Enabled customer-managed key count at which a regional proliferation review begins. */
export const AWS_KMS_KEY_PROLIFERATION_THRESHOLD = 50;

/** Previous-full-month key creation count at which a regional churn review begins. */
export const AWS_KMS_MONTHLY_KEY_CREATION_THRESHOLD = 10;

/** Flag regional customer-managed KMS key inventories with high total count or recent creation churn. */
export const kmsKeyChurnRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'KMS Customer-Managed Key Churn',
  description:
    'Flag Regions with at least 50 enabled customer-managed KMS keys or at least 10 such keys created during the previous full month.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-kms-key-churn-reviews'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-kms-key-churn-reviews')
      .filter(
        (review) =>
          review.enabledCustomerManagedKeyCount >= AWS_KMS_KEY_PROLIFERATION_THRESHOLD ||
          review.keysCreatedInWindow >= AWS_KMS_MONTHLY_KEY_CREATION_THRESHOLD,
      )
      .map((review) => createFindingMatch(review.reviewId, review.region, review.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
