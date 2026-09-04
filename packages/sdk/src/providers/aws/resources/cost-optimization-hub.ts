import {
  type ComputeSavingsPlansConfiguration,
  type Ec2InstanceSavingsPlansConfiguration,
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
  type Recommendation,
  type ResourceDetails,
  type SageMakerSavingsPlansConfiguration,
} from '@aws-sdk/client-cost-optimization-hub';
import type { AwsCostOptimizationHubSavingsPlansRecommendation, AwsDiscoveredResource } from '@cloudburn/rules';
import { createCostOptimizationHubClient } from '../client.js';
import type { AwsAccountIdResolver, AwsDiscoveryDatasetLoadResult } from '../discovery-registry.js';
import { formatAwsAccessDeniedReason, getAwsErrorCode, isAwsAccessDeniedError } from '../errors.js';
import {
  mapWithConcurrency,
  parseFiniteNumber,
  resolveAwsAccountIdForLoad,
  withAwsServiceErrorContext,
} from './utils.js';

const COST_OPTIMIZATION_HUB_REGION = 'us-east-1';
const PAGE_SIZE = 1000;
const RECOMMENDATION_DETAIL_CONCURRENCY = 10;
const SAVINGS_PLANS_RESOURCE_TYPES = [
  'ComputeSavingsPlans',
  'Ec2InstanceSavingsPlans',
  'SageMakerSavingsPlans',
] as const;

type SavingsPlansConfiguration =
  | ComputeSavingsPlansConfiguration
  | Ec2InstanceSavingsPlansConfiguration
  | SageMakerSavingsPlansConfiguration;

const getSavingsPlansConfiguration = (
  resourceType: Recommendation['currentResourceType'],
  details: ResourceDetails | undefined,
): SavingsPlansConfiguration | undefined => {
  switch (resourceType) {
    case 'ComputeSavingsPlans':
      return details?.computeSavingsPlans?.configuration;
    case 'Ec2InstanceSavingsPlans':
      return details?.ec2InstanceSavingsPlans?.configuration;
    case 'SageMakerSavingsPlans':
      return details?.sageMakerSavingsPlans?.configuration;
    default:
      return undefined;
  }
};

const isSavingsPlansResourceType = (
  resourceType: Recommendation['currentResourceType'],
): resourceType is AwsCostOptimizationHubSavingsPlansRecommendation['savingsPlansType'] =>
  SAVINGS_PLANS_RESOURCE_TYPES.some((candidate) => candidate === resourceType);

const normalizeSavingsPlansRecommendation = async (
  client: ReturnType<typeof createCostOptimizationHubClient>,
  recommendation: Recommendation,
): Promise<AwsCostOptimizationHubSavingsPlansRecommendation | null> => {
  if (
    !recommendation.recommendationId ||
    recommendation.actionType !== 'PurchaseSavingsPlans' ||
    !isSavingsPlansResourceType(recommendation.currentResourceType) ||
    !recommendation.accountId ||
    !recommendation.currencyCode ||
    recommendation.estimatedMonthlyCost === undefined ||
    recommendation.estimatedMonthlySavings === undefined ||
    recommendation.estimatedSavingsPercentage === undefined ||
    !recommendation.lastRefreshTimestamp ||
    !recommendation.source
  ) {
    return null;
  }

  const detail = await withAwsServiceErrorContext(
    'AWS Cost Optimization Hub',
    'GetRecommendation',
    COST_OPTIMIZATION_HUB_REGION,
    () => client.send(new GetRecommendationCommand({ recommendationId: recommendation.recommendationId })),
  );
  const configuration = getSavingsPlansConfiguration(
    recommendation.currentResourceType,
    detail.recommendedResourceDetails,
  );
  const hourlyCommitment = parseFiniteNumber(configuration?.hourlyCommitment);

  if (
    !configuration?.accountScope ||
    hourlyCommitment === null ||
    !configuration.term ||
    !configuration.paymentOption
  ) {
    return null;
  }

  return {
    accountId: recommendation.accountId,
    accountScope: configuration.accountScope,
    actionType: 'PurchaseSavingsPlans',
    currencyCode: recommendation.currencyCode,
    estimatedMonthlyCost: recommendation.estimatedMonthlyCost,
    estimatedMonthlySavings: recommendation.estimatedMonthlySavings,
    estimatedSavingsPercentage: recommendation.estimatedSavingsPercentage,
    hourlyCommitment,
    ...(recommendation.implementationEffort ? { implementationEffort: recommendation.implementationEffort } : {}),
    ...('instanceFamily' in configuration && configuration.instanceFamily
      ? { instanceFamily: configuration.instanceFamily }
      : {}),
    lastRefreshTimestamp: recommendation.lastRefreshTimestamp.toISOString(),
    paymentOption: configuration.paymentOption,
    recommendationId: recommendation.recommendationId,
    recommendationSource: recommendation.source,
    ...(recommendation.region ? { region: recommendation.region } : {}),
    ...(recommendation.restartNeeded !== undefined ? { restartNeeded: recommendation.restartNeeded } : {}),
    ...(recommendation.rollbackPossible !== undefined ? { rollbackPossible: recommendation.rollbackPossible } : {}),
    ...('savingsPlansRegion' in configuration && configuration.savingsPlansRegion
      ? { savingsPlansRegion: configuration.savingsPlansRegion }
      : {}),
    savingsPlansType: recommendation.currentResourceType,
    term: configuration.term,
  };
};

/**
 * Loads account-scoped Savings Plans purchase recommendations from AWS Cost Optimization Hub.
 *
 * @param _resources - Unused because Cost Optimization Hub recommendations are account-scoped.
 * @param context - Optional discovery-run context for shared account identity resolution.
 * @returns Normalized Savings Plans recommendations or an unavailable dataset result.
 */
export const hydrateAwsCostOptimizationHubSavingsPlansRecommendations = async (
  _resources: AwsDiscoveredResource[],
  context?: AwsAccountIdResolver,
): Promise<
  | AwsCostOptimizationHubSavingsPlansRecommendation[]
  | AwsDiscoveryDatasetLoadResult<'aws-cost-optimization-hub-savings-plans-recommendations'>
> => {
  const accountId = await resolveAwsAccountIdForLoad(context);
  const client = createCostOptimizationHubClient();
  try {
    const enrollment = await withAwsServiceErrorContext(
      'AWS Cost Optimization Hub',
      'ListEnrollmentStatuses',
      COST_OPTIMIZATION_HUB_REGION,
      () => client.send(new ListEnrollmentStatusesCommand({ accountId, maxResults: 100 })),
    );

    if (!enrollment.items?.some((item) => item.accountId === accountId && item.status === 'Active')) {
      return {
        diagnostics: [
          {
            code: 'CostOptimizationHubNotEnrolled',
            message:
              'Skipped Savings Plans recommendations because this account is not enrolled in AWS Cost Optimization Hub.',
            provider: 'aws',
            service: 'costoptimizationhub',
            source: 'discovery',
            status: 'skipped',
          },
        ],
        resources: [],
        unavailable: true,
      };
    }

    const recommendationsById = new Map<string, Recommendation>();
    let nextToken: string | undefined;

    do {
      const page = await withAwsServiceErrorContext(
        'AWS Cost Optimization Hub',
        'ListRecommendations',
        COST_OPTIMIZATION_HUB_REGION,
        () =>
          client.send(
            new ListRecommendationsCommand({
              filter: {
                accountIds: [accountId],
                actionTypes: ['PurchaseSavingsPlans'],
                resourceTypes: [...SAVINGS_PLANS_RESOURCE_TYPES],
              },
              includeAllRecommendations: false,
              maxResults: PAGE_SIZE,
              nextToken,
            }),
          ),
      );

      for (const recommendation of page.items ?? []) {
        if (recommendation.recommendationId) {
          recommendationsById.set(recommendation.recommendationId, recommendation);
        }
      }
      nextToken = page.nextToken;
    } while (nextToken);

    const normalized = await mapWithConcurrency(
      [...recommendationsById.values()],
      RECOMMENDATION_DETAIL_CONCURRENCY,
      (recommendation) => normalizeSavingsPlansRecommendation(client, recommendation),
    );
    const recommendations = normalized.filter((recommendation) => recommendation !== null);
    const incompleteRecommendationCount = normalized.length - recommendations.length;

    if (incompleteRecommendationCount > 0) {
      return {
        diagnostics: [
          {
            code: 'CostOptimizationHubRecommendationIncomplete',
            details: `${incompleteRecommendationCount} Savings Plans recommendation${incompleteRecommendationCount === 1 ? '' : 's'} lacked required cost, refresh, source, scope, commitment, term, or payment data.`,
            message:
              'Skipped Savings Plans recommendations because AWS Cost Optimization Hub returned incomplete recommendation evidence.',
            provider: 'aws',
            service: 'costoptimizationhub',
            source: 'discovery',
            status: 'skipped',
          },
        ],
        resources: recommendations,
        unavailable: true,
      };
    }

    return recommendations.sort((left, right) => left.recommendationId.localeCompare(right.recommendationId));
  } catch (err) {
    if (!isAwsAccessDeniedError(err)) {
      throw err;
    }

    return {
      diagnostics: [
        {
          code: getAwsErrorCode(err),
          details: err instanceof Error ? err.message : String(err),
          message: `Skipped Savings Plans recommendations because access to AWS Cost Optimization Hub is denied by ${formatAwsAccessDeniedReason(err)}.`,
          provider: 'aws',
          service: 'costoptimizationhub',
          source: 'discovery',
          status: 'access_denied',
        },
      ],
      resources: [],
      unavailable: true,
    };
  }
};
