import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CONFIG-1';
const RULE_SERVICE = 'config';
const RULE_SEVERITY = 'medium' as const;
const MINIMUM_ESTIMATED_MONTHLY_COST_REDUCTION_USD = 10;
const RULE_MESSAGE =
  'Cost-inefficient AWS Config resource types should use targeted daily recording when no continuous-recording dependency applies.';

/** Recommend daily AWS Config overrides only for evidenced high-volume types without a continuous-recording dependency. */
export const configRecordingFrequencyRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'AWS Config Cost-Inefficient Continuous Recording',
  description:
    'Flag continuously recorded AWS Config resource types when a targeted daily override is estimated to save more than $10 per month.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-config-recording-frequency-reviews'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-config-recording-frequency-reviews')
      .filter(
        (review) =>
          review.turnoverEstimateReliable !== false &&
          review.estimatedMonthlyRecordingCostReductionUsd > MINIMUM_ESTIMATED_MONTHLY_COST_REDUCTION_USD &&
          !review.firewallManagerDependent &&
          !review.paidServiceLinkedRecorderDependent,
      )
      .map((review) =>
        createFindingMatch(`${review.recorderArn}#${review.resourceType}`, review.region, review.accountId),
      );

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
