import { createFinding, createFindingMatch, createLiveEvaluationCoverage, createRule } from '../../shared/helpers.js';
import { createFinancialEvidence } from '../../shared/impact.js';
import type { AwsConfigRecordingFrequencyReview, FindingImpact } from '../../shared/metadata.js';

const RULE_ID = 'CLDBRN-AWS-CONFIG-1';
const RULE_SERVICE = 'config';
const RULE_SEVERITY = 'medium' as const;
/** Minimum exclusive monthly saving required for the AWS Config recording-frequency finding. */
export const AWS_CONFIG_RECORDING_FREQUENCY_MINIMUM_SAVINGS_USD = 10;
const RULE_MESSAGE =
  'Cost-inefficient AWS Config resource types should use targeted daily recording when no continuous-recording dependency applies.';

/**
 * Projects one recording-frequency review into normalized financial impact.
 *
 * The dataset models only the potential monthly savings; current recording cost
 * is not provided, so it stays unknown rather than being derived from the
 * savings estimate. Savings stay unknown when a dependent service requires
 * continuous recording or when the recording or resource-turnover evidence is
 * incomplete. No timestamps are invented; the window only mirrors the
 * source-reported observation period.
 *
 * @param review - One AWS Config recording-frequency review from the dataset.
 * @returns Financial impact tagged with the `cloudburn` source provenance.
 */
export const createAwsConfigRecordingFrequencyImpact = (review: AwsConfigRecordingFrequencyReview): FindingImpact => ({
  source: 'cloudburn',
  sourceDetail: 'aws-config-recording-frequency',
  ...(Number.isFinite(review.observationWindowDays) && review.observationWindowDays > 0
    ? { window: { lookbackDays: review.observationWindowDays } }
    : {}),
  currentCost: {
    confidence: 'unknown',
    currency: 'USD',
    period: 'month',
    reason: { code: 'not_provided', message: 'The dataset does not provide normalized current recording cost.' },
  },
  potentialSavings:
    review.firewallManagerDependent || review.paidServiceLinkedRecorderDependent
      ? {
          confidence: 'unknown',
          currency: 'USD',
          period: 'month',
          reason: {
            code: 'action_not_applicable',
            message: 'Continuous recording is required by a dependent service.',
          },
        }
      : review.turnoverEstimateReliable === false ||
          review.configurationItemsRecorded === null ||
          review.estimatedMonthlyConfigurationItemReduction === null
        ? {
            confidence: 'unknown',
            currency: 'USD',
            period: 'month',
            reason: {
              code: 'incomplete_evidence',
              message: 'The recording or resource-turnover evidence is incomplete.',
            },
          }
        : createFinancialEvidence({
            amount: review.estimatedMonthlyRecordingCostReductionUsd,
            currency: 'USD',
            period: 'month',
            confidence: 'estimated',
          }),
});

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
  getLiveEvaluationCoverage: ({ resources }) =>
    createLiveEvaluationCoverage(
      resources.get('aws-config-recording-frequency-reviews'),
      (review) =>
        review.firewallManagerDependent ||
        review.paidServiceLinkedRecorderDependent ||
        (review.configurationItemsRecorded != null &&
          review.estimatedMonthlyConfigurationItemReduction != null &&
          review.estimatedMonthlyRecordingCostReductionUsd != null &&
          review.turnoverEstimateReliable !== false),
      (review) => createFindingMatch(`${review.recorderArn}#${review.resourceType}`, review.region, review.accountId),
    ),
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-config-recording-frequency-reviews')
      .filter(
        (review) =>
          review.turnoverEstimateReliable !== false &&
          review.estimatedMonthlyRecordingCostReductionUsd !== null &&
          review.estimatedMonthlyRecordingCostReductionUsd > AWS_CONFIG_RECORDING_FREQUENCY_MINIMUM_SAVINGS_USD &&
          !review.firewallManagerDependent &&
          !review.paidServiceLinkedRecorderDependent,
      )
      .map((review) => ({
        ...createFindingMatch(`${review.recorderArn}#${review.resourceType}`, review.region, review.accountId),
        impact: createAwsConfigRecordingFrequencyImpact(review),
      }));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
