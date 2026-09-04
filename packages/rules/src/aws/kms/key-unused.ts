import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-KMS-2';
const RULE_SERVICE = 'kms';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE =
  'Customer-managed KMS keys with no recorded cryptographic use for at least 90 days should be disabled and monitored before deletion.';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Minimum complete no-usage history before a KMS key becomes a review candidate. */
export const AWS_KMS_UNUSED_KEY_MINIMUM_AGE_DAYS = 90;

/** Flag mature customer-managed KMS keys with no recorded KMS use during a complete 90-day tracking window. */
export const kmsKeyUnusedRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'KMS Key Without Recent Recorded Usage',
  description:
    'Flag enabled customer-managed KMS keys that are at least 90 days old and have no recorded KMS cryptographic use during a complete 90-day tracking window.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-kms-key-usage'],
  evaluateLive: ({ resources }) => {
    const cutoff = Date.now() - AWS_KMS_UNUSED_KEY_MINIMUM_AGE_DAYS * DAY_IN_MS;
    const findings = resources
      .get('aws-kms-key-usage')
      .filter((key) => {
        const creationTime = new Date(key.creationDate).getTime();
        const trackingStartTime = key.trackingStartDate ? new Date(key.trackingStartDate).getTime() : Number.NaN;
        const lastUsageTime = key.lastUsageAt ? new Date(key.lastUsageAt).getTime() : undefined;

        return (
          key.usageEvidence !== 'unavailable' &&
          Number.isFinite(creationTime) &&
          creationTime <= cutoff &&
          Number.isFinite(trackingStartTime) &&
          trackingStartTime <= cutoff &&
          (lastUsageTime === undefined
            ? key.usageEvidence !== 'used'
            : Number.isFinite(lastUsageTime) && lastUsageTime <= cutoff)
        );
      })
      .map((key) => createFindingMatch(key.keyArn, key.region, key.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
