import {
  type ComputeSavingsPlansConfiguration,
  type DynamoDbReservedCapacityConfiguration,
  type Ec2InstanceSavingsPlansConfiguration,
  type Ec2ReservedInstancesConfiguration,
  type ElastiCacheReservedInstancesConfiguration,
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
  type MemoryDbReservedInstancesConfiguration,
  type OpenSearchReservedInstancesConfiguration,
  type RdsReservedInstancesConfiguration,
  type Recommendation,
  type RedshiftReservedInstancesConfiguration,
  type ResourceDetails,
  type ResourceType,
  type SageMakerSavingsPlansConfiguration,
} from '@aws-sdk/client-cost-optimization-hub';
import type {
  AwsCostOptimizationHubDynamoDbReservationConfiguration,
  AwsCostOptimizationHubEc2ReservationConfiguration,
  AwsCostOptimizationHubElastiCacheReservationConfiguration,
  AwsCostOptimizationHubMemoryDbReservationConfiguration,
  AwsCostOptimizationHubOpenSearchReservationConfiguration,
  AwsCostOptimizationHubRdsReservationConfiguration,
  AwsCostOptimizationHubRecommendation,
  AwsCostOptimizationHubRedshiftReservationConfiguration,
  AwsCostOptimizationHubReservationConfiguration,
  AwsCostOptimizationHubReservationRecommendation,
  AwsCostOptimizationHubSavingsPlansRecommendation,
  AwsDiscoveredResource,
} from '@cloudburn/rules';
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
const RESERVATION_RESOURCE_TYPES = [
  'Ec2ReservedInstances',
  'RdsReservedInstances',
  'OpenSearchReservedInstances',
  'RedshiftReservedInstances',
  'ElastiCacheReservedInstances',
  'MemoryDbReservedInstances',
  'DynamoDbReservedCapacity',
] as const;

type NormalizedRecommendationCommon = AwsCostOptimizationHubRecommendation & {
  currentResourceType: string;
};

type RecommendationCategory<T> = {
  actionType: AwsCostOptimizationHubRecommendation['actionType'];
  incompleteDetails: (count: number) => string;
  messageSubject: string;
  normalizeConfiguration: (common: NormalizedRecommendationCommon, details: ResourceDetails | undefined) => T | null;
  resourceTypes: readonly ResourceType[];
};

type SavingsPlansConfiguration =
  | ComputeSavingsPlansConfiguration
  | Ec2InstanceSavingsPlansConfiguration
  | SageMakerSavingsPlansConfiguration;

type CostOptimizationHubLoadResult<T> =
  | T[]
  | {
      diagnostics: NonNullable<
        AwsDiscoveryDatasetLoadResult<'aws-cost-optimization-hub-savings-plans-recommendations'>['diagnostics']
      >;
      resources: T[];
      unavailable: true;
    };

const optionalFiniteNumber = (value: string | undefined): number | null | undefined =>
  value === undefined ? undefined : parseFiniteNumber(value);

const withOptionalString = (key: string, value: string | undefined): Record<string, string> =>
  value ? { [key]: value } : {};

const withOptionalNumber = (key: string, value: number | undefined): Record<string, number> =>
  value === undefined ? {} : { [key]: value };

const withOptionalBoolean = (key: string, value: boolean | undefined): Record<string, boolean> =>
  value === undefined ? {} : { [key]: value };

const normalizeRecommendationCommon = (
  recommendation: Recommendation,
  category: RecommendationCategory<unknown>,
): NormalizedRecommendationCommon | null => {
  if (
    !recommendation.recommendationId ||
    recommendation.actionType !== category.actionType ||
    !recommendation.currentResourceType ||
    !category.resourceTypes.some((resourceType) => resourceType === recommendation.currentResourceType) ||
    !recommendation.accountId ||
    !recommendation.currencyCode ||
    recommendation.estimatedMonthlyCost === undefined ||
    !Number.isFinite(recommendation.estimatedMonthlyCost) ||
    recommendation.estimatedMonthlySavings === undefined ||
    !Number.isFinite(recommendation.estimatedMonthlySavings) ||
    recommendation.estimatedSavingsPercentage === undefined ||
    !Number.isFinite(recommendation.estimatedSavingsPercentage) ||
    !recommendation.lastRefreshTimestamp ||
    Number.isNaN(recommendation.lastRefreshTimestamp.getTime()) ||
    !recommendation.source
  ) {
    return null;
  }

  return {
    accountId: recommendation.accountId,
    actionType: category.actionType,
    currencyCode: recommendation.currencyCode,
    currentResourceType: recommendation.currentResourceType,
    estimatedMonthlyCost: recommendation.estimatedMonthlyCost,
    estimatedMonthlySavings: recommendation.estimatedMonthlySavings,
    estimatedSavingsPercentage: recommendation.estimatedSavingsPercentage,
    ...(recommendation.implementationEffort ? { implementationEffort: recommendation.implementationEffort } : {}),
    lastRefreshTimestamp: recommendation.lastRefreshTimestamp.toISOString(),
    recommendationId: recommendation.recommendationId,
    recommendationSource: recommendation.source,
    ...(recommendation.region ? { region: recommendation.region } : {}),
    ...(recommendation.resourceArn ? { resourceArn: recommendation.resourceArn } : {}),
    ...(recommendation.resourceId ? { resourceId: recommendation.resourceId } : {}),
    ...(recommendation.restartNeeded !== undefined ? { restartNeeded: recommendation.restartNeeded } : {}),
    ...(recommendation.rollbackPossible !== undefined ? { rollbackPossible: recommendation.rollbackPossible } : {}),
  };
};

type AwsReservationConfiguration =
  | DynamoDbReservedCapacityConfiguration
  | Ec2ReservedInstancesConfiguration
  | ElastiCacheReservedInstancesConfiguration
  | MemoryDbReservedInstancesConfiguration
  | OpenSearchReservedInstancesConfiguration
  | RdsReservedInstancesConfiguration
  | RedshiftReservedInstancesConfiguration;

const normalizeReservationConfigurationCommon = (
  configuration: AwsReservationConfiguration | undefined,
): AwsCostOptimizationHubReservationConfiguration | null => {
  if (!configuration?.accountScope || !configuration.paymentOption || !configuration.term) {
    return null;
  }

  const monthlyRecurringCost = optionalFiniteNumber(configuration.monthlyRecurringCost);
  const upfrontCost = optionalFiniteNumber(configuration.upfrontCost);
  if (monthlyRecurringCost === null || upfrontCost === null) {
    return null;
  }

  return {
    accountScope: configuration.accountScope,
    ...withOptionalNumber('monthlyRecurringCost', monthlyRecurringCost),
    paymentOption: configuration.paymentOption,
    ...withOptionalString('reservedInstancesRegion', configuration.reservedInstancesRegion),
    ...withOptionalString('service', configuration.service),
    term: configuration.term,
    ...withOptionalNumber('upfrontCost', upfrontCost),
  };
};

const normalizeEc2ReservationConfiguration = (
  configuration: Ec2ReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubEc2ReservationConfiguration | null => {
  const common = normalizeReservationConfigurationCommon(configuration);
  const normalizedUnitsToPurchase = optionalFiniteNumber(configuration?.normalizedUnitsToPurchase);
  const numberOfInstancesToPurchase = optionalFiniteNumber(configuration?.numberOfInstancesToPurchase);
  if (!common || normalizedUnitsToPurchase === null || numberOfInstancesToPurchase === null) {
    return null;
  }

  return {
    ...common,
    ...withOptionalString('currentGeneration', configuration?.currentGeneration),
    ...withOptionalString('instanceFamily', configuration?.instanceFamily),
    ...withOptionalString('instanceType', configuration?.instanceType),
    ...withOptionalNumber('normalizedUnitsToPurchase', normalizedUnitsToPurchase),
    ...withOptionalNumber('numberOfInstancesToPurchase', numberOfInstancesToPurchase),
    ...withOptionalString('offeringClass', configuration?.offeringClass),
    ...withOptionalString('platform', configuration?.platform),
    ...withOptionalBoolean('sizeFlexEligible', configuration?.sizeFlexEligible),
    ...withOptionalString('tenancy', configuration?.tenancy),
  };
};

const normalizeRdsReservationConfiguration = (
  configuration: RdsReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubRdsReservationConfiguration | null => {
  const common = normalizeReservationConfigurationCommon(configuration);
  const normalizedUnitsToPurchase = optionalFiniteNumber(configuration?.normalizedUnitsToPurchase);
  const numberOfInstancesToPurchase = optionalFiniteNumber(configuration?.numberOfInstancesToPurchase);
  if (!common || normalizedUnitsToPurchase === null || numberOfInstancesToPurchase === null) {
    return null;
  }

  return {
    ...common,
    ...withOptionalString('currentGeneration', configuration?.currentGeneration),
    ...withOptionalString('databaseEdition', configuration?.databaseEdition),
    ...withOptionalString('databaseEngine', configuration?.databaseEngine),
    ...withOptionalString('deploymentOption', configuration?.deploymentOption),
    ...withOptionalString('instanceFamily', configuration?.instanceFamily),
    ...withOptionalString('instanceType', configuration?.instanceType),
    ...withOptionalString('licenseModel', configuration?.licenseModel),
    ...withOptionalNumber('normalizedUnitsToPurchase', normalizedUnitsToPurchase),
    ...withOptionalNumber('numberOfInstancesToPurchase', numberOfInstancesToPurchase),
    ...withOptionalBoolean('sizeFlexEligible', configuration?.sizeFlexEligible),
  };
};

const normalizeOpenSearchReservationConfiguration = (
  configuration: OpenSearchReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubOpenSearchReservationConfiguration | null => {
  const common = normalizeReservationConfigurationCommon(configuration);
  const normalizedUnitsToPurchase = optionalFiniteNumber(configuration?.normalizedUnitsToPurchase);
  const numberOfInstancesToPurchase = optionalFiniteNumber(configuration?.numberOfInstancesToPurchase);
  if (!common || normalizedUnitsToPurchase === null || numberOfInstancesToPurchase === null) {
    return null;
  }

  return {
    ...common,
    ...withOptionalString('currentGeneration', configuration?.currentGeneration),
    ...withOptionalString('instanceType', configuration?.instanceType),
    ...withOptionalNumber('normalizedUnitsToPurchase', normalizedUnitsToPurchase),
    ...withOptionalNumber('numberOfInstancesToPurchase', numberOfInstancesToPurchase),
    ...withOptionalBoolean('sizeFlexEligible', configuration?.sizeFlexEligible),
  };
};

const normalizeRedshiftReservationConfiguration = (
  configuration: RedshiftReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubRedshiftReservationConfiguration | null => {
  const common = normalizeReservationConfigurationCommon(configuration);
  const normalizedUnitsToPurchase = optionalFiniteNumber(configuration?.normalizedUnitsToPurchase);
  const numberOfInstancesToPurchase = optionalFiniteNumber(configuration?.numberOfInstancesToPurchase);
  if (!common || normalizedUnitsToPurchase === null || numberOfInstancesToPurchase === null) {
    return null;
  }

  return {
    ...common,
    ...withOptionalString('currentGeneration', configuration?.currentGeneration),
    ...withOptionalString('instanceFamily', configuration?.instanceFamily),
    ...withOptionalString('instanceType', configuration?.instanceType),
    ...withOptionalNumber('normalizedUnitsToPurchase', normalizedUnitsToPurchase),
    ...withOptionalNumber('numberOfInstancesToPurchase', numberOfInstancesToPurchase),
    ...withOptionalBoolean('sizeFlexEligible', configuration?.sizeFlexEligible),
  };
};

const normalizeElastiCacheReservationConfiguration = (
  configuration: ElastiCacheReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubElastiCacheReservationConfiguration | null => {
  const common = normalizeReservationConfigurationCommon(configuration);
  const normalizedUnitsToPurchase = optionalFiniteNumber(configuration?.normalizedUnitsToPurchase);
  const numberOfInstancesToPurchase = optionalFiniteNumber(configuration?.numberOfInstancesToPurchase);
  if (!common || normalizedUnitsToPurchase === null || numberOfInstancesToPurchase === null) {
    return null;
  }

  return {
    ...common,
    ...withOptionalString('currentGeneration', configuration?.currentGeneration),
    ...withOptionalString('instanceFamily', configuration?.instanceFamily),
    ...withOptionalString('instanceType', configuration?.instanceType),
    ...withOptionalNumber('normalizedUnitsToPurchase', normalizedUnitsToPurchase),
    ...withOptionalNumber('numberOfInstancesToPurchase', numberOfInstancesToPurchase),
    ...withOptionalBoolean('sizeFlexEligible', configuration?.sizeFlexEligible),
  };
};

const normalizeMemoryDbReservationConfiguration = (
  configuration: MemoryDbReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubMemoryDbReservationConfiguration | null => {
  const common = normalizeReservationConfigurationCommon(configuration);
  const normalizedUnitsToPurchase = optionalFiniteNumber(configuration?.normalizedUnitsToPurchase);
  const numberOfInstancesToPurchase = optionalFiniteNumber(configuration?.numberOfInstancesToPurchase);
  if (!common || normalizedUnitsToPurchase === null || numberOfInstancesToPurchase === null) {
    return null;
  }

  return {
    ...common,
    ...withOptionalString('currentGeneration', configuration?.currentGeneration),
    ...withOptionalString('instanceFamily', configuration?.instanceFamily),
    ...withOptionalString('instanceType', configuration?.instanceType),
    ...withOptionalNumber('normalizedUnitsToPurchase', normalizedUnitsToPurchase),
    ...withOptionalNumber('numberOfInstancesToPurchase', numberOfInstancesToPurchase),
    ...withOptionalBoolean('sizeFlexEligible', configuration?.sizeFlexEligible),
  };
};

const normalizeDynamoDbReservationConfiguration = (
  configuration: DynamoDbReservedCapacityConfiguration | undefined,
): AwsCostOptimizationHubDynamoDbReservationConfiguration | null => {
  const common = normalizeReservationConfigurationCommon(configuration);
  const numberOfCapacityUnitsToPurchase = optionalFiniteNumber(configuration?.numberOfCapacityUnitsToPurchase);
  if (!common || numberOfCapacityUnitsToPurchase === null) {
    return null;
  }

  return {
    ...common,
    ...withOptionalString('capacityUnits', configuration?.capacityUnits),
    ...withOptionalNumber('numberOfCapacityUnitsToPurchase', numberOfCapacityUnitsToPurchase),
  };
};

const normalizeSavingsPlansConfiguration = (
  common: NormalizedRecommendationCommon,
  details: ResourceDetails | undefined,
): AwsCostOptimizationHubSavingsPlansRecommendation | null => {
  const configuration: SavingsPlansConfiguration | undefined = (() => {
    switch (common.currentResourceType) {
      case 'ComputeSavingsPlans':
        return details?.computeSavingsPlans?.configuration;
      case 'Ec2InstanceSavingsPlans':
        return details?.ec2InstanceSavingsPlans?.configuration;
      case 'SageMakerSavingsPlans':
        return details?.sageMakerSavingsPlans?.configuration;
      default:
        return undefined;
    }
  })();
  const hourlyCommitment = parseFiniteNumber(configuration?.hourlyCommitment);

  if (
    !configuration?.accountScope ||
    hourlyCommitment === null ||
    !configuration.term ||
    !configuration.paymentOption
  ) {
    return null;
  }

  const { currentResourceType, resourceArn: _resourceArn, resourceId: _resourceId, ...recommendation } = common;
  return {
    ...recommendation,
    accountScope: configuration.accountScope,
    actionType: 'PurchaseSavingsPlans',
    hourlyCommitment,
    ...('instanceFamily' in configuration && configuration.instanceFamily
      ? { instanceFamily: configuration.instanceFamily }
      : {}),
    paymentOption: configuration.paymentOption,
    ...('savingsPlansRegion' in configuration && configuration.savingsPlansRegion
      ? { savingsPlansRegion: configuration.savingsPlansRegion }
      : {}),
    savingsPlansType: currentResourceType as AwsCostOptimizationHubSavingsPlansRecommendation['savingsPlansType'],
    term: configuration.term,
  };
};

const normalizeReservationConfiguration = (
  common: NormalizedRecommendationCommon,
  details: ResourceDetails | undefined,
): AwsCostOptimizationHubReservationRecommendation | null => {
  const { currentResourceType, ...recommendation } = common;

  switch (currentResourceType) {
    case 'Ec2ReservedInstances': {
      const configuration = normalizeEc2ReservationConfiguration(details?.ec2ReservedInstances?.configuration);
      return configuration
        ? {
            ...recommendation,
            actionType: 'PurchaseReservedInstances',
            configuration,
            reservationType: currentResourceType,
          }
        : null;
    }
    case 'RdsReservedInstances': {
      const configuration = normalizeRdsReservationConfiguration(details?.rdsReservedInstances?.configuration);
      return configuration
        ? {
            ...recommendation,
            actionType: 'PurchaseReservedInstances',
            configuration,
            reservationType: currentResourceType,
          }
        : null;
    }
    case 'OpenSearchReservedInstances': {
      const configuration = normalizeOpenSearchReservationConfiguration(
        details?.openSearchReservedInstances?.configuration,
      );
      return configuration
        ? {
            ...recommendation,
            actionType: 'PurchaseReservedInstances',
            configuration,
            reservationType: currentResourceType,
          }
        : null;
    }
    case 'RedshiftReservedInstances': {
      const configuration = normalizeRedshiftReservationConfiguration(
        details?.redshiftReservedInstances?.configuration,
      );
      return configuration
        ? {
            ...recommendation,
            actionType: 'PurchaseReservedInstances',
            configuration,
            reservationType: currentResourceType,
          }
        : null;
    }
    case 'ElastiCacheReservedInstances': {
      const configuration = normalizeElastiCacheReservationConfiguration(
        details?.elastiCacheReservedInstances?.configuration,
      );
      return configuration
        ? {
            ...recommendation,
            actionType: 'PurchaseReservedInstances',
            configuration,
            reservationType: currentResourceType,
          }
        : null;
    }
    case 'MemoryDbReservedInstances': {
      const configuration = normalizeMemoryDbReservationConfiguration(
        details?.memoryDbReservedInstances?.configuration,
      );
      return configuration
        ? {
            ...recommendation,
            actionType: 'PurchaseReservedInstances',
            configuration,
            reservationType: currentResourceType,
          }
        : null;
    }
    case 'DynamoDbReservedCapacity': {
      const configuration = normalizeDynamoDbReservationConfiguration(details?.dynamoDbReservedCapacity?.configuration);
      return configuration
        ? {
            ...recommendation,
            actionType: 'PurchaseReservedInstances',
            configuration,
            reservationType: currentResourceType,
          }
        : null;
    }
    default:
      return null;
  }
};

const savingsPlansCategory: RecommendationCategory<AwsCostOptimizationHubSavingsPlansRecommendation> = {
  actionType: 'PurchaseSavingsPlans',
  incompleteDetails: (count) =>
    `${count} Savings Plans recommendation${count === 1 ? '' : 's'} lacked required cost, refresh, source, scope, commitment, term, or payment data.`,
  messageSubject: 'Savings Plans recommendations',
  normalizeConfiguration: normalizeSavingsPlansConfiguration,
  resourceTypes: SAVINGS_PLANS_RESOURCE_TYPES,
};

const reservationCategory: RecommendationCategory<AwsCostOptimizationHubReservationRecommendation> = {
  actionType: 'PurchaseReservedInstances',
  incompleteDetails: (count) =>
    `${count} reservation purchase recommendation${count === 1 ? '' : 's'} lacked required cost, refresh, source, or typed purchase configuration data.`,
  messageSubject: 'reservation purchase recommendations',
  normalizeConfiguration: normalizeReservationConfiguration,
  resourceTypes: RESERVATION_RESOURCE_TYPES,
};

const loadCostOptimizationHubRecommendations = async <T>(
  category: RecommendationCategory<T>,
  context?: AwsAccountIdResolver,
): Promise<CostOptimizationHubLoadResult<T>> => {
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
            message: `Skipped ${category.messageSubject} because this account is not enrolled in AWS Cost Optimization Hub.`,
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
                actionTypes: [category.actionType],
                resourceTypes: [...category.resourceTypes],
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
      async (recommendation) => {
        const common = normalizeRecommendationCommon(recommendation, category);
        if (!common) {
          return null;
        }

        const detail = await withAwsServiceErrorContext(
          'AWS Cost Optimization Hub',
          'GetRecommendation',
          COST_OPTIMIZATION_HUB_REGION,
          () => client.send(new GetRecommendationCommand({ recommendationId: recommendation.recommendationId })),
        );
        return category.normalizeConfiguration(common, detail.recommendedResourceDetails);
      },
    );
    const recommendations = normalized.filter((recommendation): recommendation is T => recommendation !== null);
    const incompleteRecommendationCount = normalized.length - recommendations.length;

    if (incompleteRecommendationCount > 0) {
      return {
        diagnostics: [
          {
            code: 'CostOptimizationHubRecommendationIncomplete',
            details: category.incompleteDetails(incompleteRecommendationCount),
            message: `Skipped ${category.messageSubject} because AWS Cost Optimization Hub returned incomplete recommendation evidence.`,
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

    return recommendations.sort((left, right) =>
      (left as { recommendationId: string }).recommendationId.localeCompare(
        (right as { recommendationId: string }).recommendationId,
      ),
    );
  } catch (err) {
    if (!isAwsAccessDeniedError(err)) {
      throw err;
    }

    return {
      diagnostics: [
        {
          code: getAwsErrorCode(err),
          details: err instanceof Error ? err.message : String(err),
          message: `Skipped ${category.messageSubject} because access to AWS Cost Optimization Hub is denied by ${formatAwsAccessDeniedReason(err)}.`,
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
> => loadCostOptimizationHubRecommendations(savingsPlansCategory, context);

/**
 * Loads account-scoped reservation purchase recommendations from AWS Cost Optimization Hub.
 *
 * @param _resources - Unused because Cost Optimization Hub recommendations are account-scoped.
 * @param context - Optional discovery-run context for shared account identity resolution.
 * @returns Normalized reservation recommendations or an unavailable dataset result.
 */
export const hydrateAwsCostOptimizationHubReservationRecommendations = async (
  _resources: AwsDiscoveredResource[],
  context?: AwsAccountIdResolver,
): Promise<
  | AwsCostOptimizationHubReservationRecommendation[]
  | AwsDiscoveryDatasetLoadResult<'aws-cost-optimization-hub-reservation-recommendations'>
> => loadCostOptimizationHubRecommendations(reservationCategory, context);
