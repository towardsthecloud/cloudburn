import {
  type ComputeSavingsPlansConfiguration,
  type DynamoDbReservedCapacityConfiguration,
  type Ec2AutoScalingGroupConfiguration,
  type Ec2InstanceSavingsPlansConfiguration,
  type Ec2ReservedInstancesConfiguration,
  type ElastiCacheReservedInstancesConfiguration,
  GetRecommendationCommand,
  type GetRecommendationResponse,
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
  AwsCostOptimizationHubAutoScalingUpgradeConfiguration,
  AwsCostOptimizationHubDynamoDbReservationConfiguration,
  AwsCostOptimizationHubEc2ReservationConfiguration,
  AwsCostOptimizationHubElastiCacheReservationConfiguration,
  AwsCostOptimizationHubIdleRecommendation,
  AwsCostOptimizationHubMemoryDbReservationConfiguration,
  AwsCostOptimizationHubOpenSearchReservationConfiguration,
  AwsCostOptimizationHubRdsReservationConfiguration,
  AwsCostOptimizationHubRecommendation,
  AwsCostOptimizationHubRedshiftReservationConfiguration,
  AwsCostOptimizationHubReservationConfiguration,
  AwsCostOptimizationHubReservationRecommendation,
  AwsCostOptimizationHubRightsizingRecommendation,
  AwsCostOptimizationHubSavingsPlansRecommendation,
  AwsCostOptimizationHubUpgradeRecommendation,
  AwsDiscoveredResource,
} from '@cloudburn/rules';
import type { ScanDiagnostic } from '../../../types.js';
import { createCostOptimizationHubClient } from '../client.js';
import type { AwsAccountIdResolver, AwsDiscoveryDatasetLoadResult } from '../discovery-registry.js';
import { formatAwsAccessDeniedReason, getAwsErrorCode, isAwsAccessDeniedError } from '../errors.js';
import { rightsizingConfigurationNormalizers } from './cost-optimization-hub-rightsizing.js';
import { getUnqualifiedLambdaFunctionArn } from './lambda-identity.js';
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

type HubRecommendation =
  | AwsCostOptimizationHubUpgradeRecommendation
  | AwsCostOptimizationHubRecommendation
  | AwsCostOptimizationHubIdleRecommendation
  | AwsCostOptimizationHubRightsizingRecommendation;

type NormalizedRecommendationCommon = Omit<AwsCostOptimizationHubRecommendation, 'actionType'> & {
  actionType: HubRecommendation['actionType'];
  currentResourceType: string;
};

type RecommendationCategory<T extends HubRecommendation> = {
  actionTypes: readonly HubRecommendation['actionType'][];
  incompleteDetails: (count: number) => string;
  messageSubject: string;
  normalizeConfiguration: (common: NormalizedRecommendationCommon, response: GetRecommendationResponse) => T | null;
  resourceTypes: readonly ResourceType[];
  regions?: string[];
};

type SavingsPlansConfiguration =
  | ComputeSavingsPlansConfiguration
  | Ec2InstanceSavingsPlansConfiguration
  | SageMakerSavingsPlansConfiguration;

type CostOptimizationHubLoadResult<T extends HubRecommendation> =
  | T[]
  | {
      diagnostics: ScanDiagnostic[];
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
  category: RecommendationCategory<HubRecommendation>,
): NormalizedRecommendationCommon | null => {
  if (
    !recommendation.recommendationId ||
    !recommendation.actionType ||
    !category.actionTypes.some((action) => action === recommendation.actionType) ||
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
    !(recommendation.lastRefreshTimestamp instanceof Date) ||
    Number.isNaN(recommendation.lastRefreshTimestamp.getTime()) ||
    (recommendation.source !== 'ComputeOptimizer' && recommendation.source !== 'CostExplorer')
  ) {
    return null;
  }

  return {
    accountId: recommendation.accountId,
    actionType: recommendation.actionType as HubRecommendation['actionType'],
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

type AwsInstanceReservationConfiguration =
  | ElastiCacheReservedInstancesConfiguration
  | MemoryDbReservedInstancesConfiguration
  | RedshiftReservedInstancesConfiguration;

const normalizeInstanceReservationConfiguration = (
  configuration: AwsInstanceReservationConfiguration | undefined,
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

const normalizeRedshiftReservationConfiguration = (
  configuration: RedshiftReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubRedshiftReservationConfiguration | null =>
  normalizeInstanceReservationConfiguration(configuration);

const normalizeElastiCacheReservationConfiguration = (
  configuration: ElastiCacheReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubElastiCacheReservationConfiguration | null =>
  normalizeInstanceReservationConfiguration(configuration);

const normalizeMemoryDbReservationConfiguration = (
  configuration: MemoryDbReservedInstancesConfiguration | undefined,
): AwsCostOptimizationHubMemoryDbReservationConfiguration | null =>
  normalizeInstanceReservationConfiguration(configuration);

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

const withReservationRegion = (
  recommendation: Omit<NormalizedRecommendationCommon, 'currentResourceType'>,
  configuration: AwsCostOptimizationHubReservationConfiguration,
): Omit<NormalizedRecommendationCommon, 'currentResourceType'> => ({
  ...recommendation,
  ...(!recommendation.region && configuration.reservedInstancesRegion
    ? { region: configuration.reservedInstancesRegion }
    : {}),
});

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
            ...withReservationRegion(recommendation, configuration),
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
            ...withReservationRegion(recommendation, configuration),
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
            ...withReservationRegion(recommendation, configuration),
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
            ...withReservationRegion(recommendation, configuration),
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
            ...withReservationRegion(recommendation, configuration),
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
            ...withReservationRegion(recommendation, configuration),
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
            ...withReservationRegion(recommendation, configuration),
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
  actionTypes: ['PurchaseSavingsPlans'],
  incompleteDetails: (count) =>
    `${count} Savings Plans recommendation${count === 1 ? '' : 's'} lacked required cost, refresh, source, scope, commitment, term, or payment data.`,
  messageSubject: 'Savings Plans recommendations',
  normalizeConfiguration: (common, response) =>
    normalizeSavingsPlansConfiguration(common, response.recommendedResourceDetails),
  resourceTypes: SAVINGS_PLANS_RESOURCE_TYPES,
};

const reservationCategory: RecommendationCategory<AwsCostOptimizationHubReservationRecommendation> = {
  actionTypes: ['PurchaseReservedInstances'],
  incompleteDetails: (count) =>
    `${count} reservation purchase recommendation${count === 1 ? '' : 's'} lacked required cost, refresh, source, or typed purchase configuration data.`,
  messageSubject: 'reservation purchase recommendations',
  normalizeConfiguration: (common, response) =>
    normalizeReservationConfiguration(common, response.recommendedResourceDetails),
  resourceTypes: RESERVATION_RESOURCE_TYPES,
};

const normalizeAutoScalingUpgrade = (
  configuration: Ec2AutoScalingGroupConfiguration | undefined,
): AwsCostOptimizationHubAutoScalingUpgradeConfiguration | null => {
  if (
    configuration?.allocationStrategy !== undefined &&
    configuration.allocationStrategy !== 'LowestPrice' &&
    configuration.allocationStrategy !== 'Prioritized'
  )
    return null;
  if (configuration?.type === 'SingleInstanceType' && validInstanceType(configuration.instance?.type)) {
    return {
      type: configuration.type,
      instance: { type: configuration.instance.type },
      ...(configuration.allocationStrategy ? { allocationStrategy: configuration.allocationStrategy } : {}),
    };
  }
  if (
    configuration?.type === 'MixedInstanceTypes' &&
    Array.isArray(configuration.mixedInstances) &&
    configuration.mixedInstances.length > 0 &&
    configuration.mixedInstances.every((instance) => validInstanceType(instance?.type))
  ) {
    return {
      type: configuration.type,
      mixedInstances: configuration.mixedInstances.map((instance) => ({ type: instance.type as string })),
      ...(configuration.allocationStrategy ? { allocationStrategy: configuration.allocationStrategy } : {}),
    };
  }
  return null;
};

const validInstanceType = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:db\.)?[a-z][a-z0-9-]*\.[a-z0-9-]+$/.test(value);
const autoScalingFamilies = (configuration: AwsCostOptimizationHubAutoScalingUpgradeConfiguration): Set<string> =>
  new Set(
    (configuration.type === 'SingleInstanceType' ? [configuration.instance] : configuration.mixedInstances).map(
      (instance) => instance.type.split('.')[0] ?? '',
    ),
  );

const validCapacity = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const validOptionalPerformance = (...values: (number | undefined)[]): boolean =>
  values.every((value) => value === undefined || (Number.isFinite(value) && value >= 0));

const upgradeCategory: RecommendationCategory<AwsCostOptimizationHubUpgradeRecommendation> = {
  actionTypes: ['Upgrade'],
  resourceTypes: ['Ec2Instance', 'Ec2AutoScalingGroup', 'EbsVolume', 'RdsDbInstance', 'RdsDbInstanceStorage'],
  messageSubject: 'product-generation upgrade recommendations',
  incompleteDetails: (count) =>
    `${count} upgrade recommendations lacked required identity, cost, refresh, source, or current and recommended configuration data.`,
  normalizeConfiguration: (common, response) => {
    const details = response.recommendedResourceDetails;
    const { currentResourceType, ...recommendation } = common;
    if (
      (!common.resourceId && !common.resourceArn) ||
      !common.region ||
      !common.implementationEffort ||
      typeof common.restartNeeded !== 'boolean' ||
      typeof common.rollbackPossible !== 'boolean' ||
      response.recommendationId !== common.recommendationId ||
      response.accountId !== common.accountId ||
      response.resourceId !== common.resourceId ||
      response.resourceArn !== common.resourceArn ||
      response.region !== common.region ||
      response.actionType !== 'Upgrade' ||
      response.currentResourceType !== currentResourceType ||
      response.recommendedResourceType !== currentResourceType
    )
      return null;
    if (currentResourceType === 'Ec2AutoScalingGroup') {
      const current = normalizeAutoScalingUpgrade(response.currentResourceDetails?.ec2AutoScalingGroup?.configuration);
      const recommended = normalizeAutoScalingUpgrade(details?.ec2AutoScalingGroup?.configuration);
      if (!current || !recommended) return null;
      const currentFamilies = autoScalingFamilies(current);
      const recommendedFamilies = autoScalingFamilies(recommended);
      if (
        currentFamilies.size === recommendedFamilies.size &&
        [...currentFamilies].every((family) => recommendedFamilies.has(family))
      )
        return null;

      return {
        ...recommendation,
        actionType: 'Upgrade',
        resourceType: currentResourceType,
        currentConfiguration: current,
        recommendedConfiguration: recommended,
      };
    }
    if (currentResourceType === 'RdsDbInstanceStorage') {
      const current = response.currentResourceDetails?.rdsDbInstanceStorage?.configuration;
      const recommended = details?.rdsDbInstanceStorage?.configuration;
      if (
        typeof current?.storageType !== 'string' ||
        !current.storageType.trim() ||
        !validCapacity(current.allocatedStorageInGb) ||
        !validOptionalPerformance(current.iops, current.storageThroughput) ||
        typeof recommended?.storageType !== 'string' ||
        !recommended.storageType.trim() ||
        !validCapacity(recommended.allocatedStorageInGb) ||
        !validOptionalPerformance(recommended.iops, recommended.storageThroughput) ||
        current.storageType === recommended.storageType
      )
        return null;

      return {
        ...recommendation,
        actionType: 'Upgrade',
        resourceType: currentResourceType,
        currentConfiguration: {
          ...current,
          storageType: current.storageType,
          allocatedStorageInGb: current.allocatedStorageInGb,
        },
        recommendedConfiguration: {
          ...recommended,
          storageType: recommended.storageType,
          allocatedStorageInGb: recommended.allocatedStorageInGb,
        },
      };
    }
    if (currentResourceType === 'RdsDbInstance') {
      const current = response.currentResourceDetails?.rdsDbInstance?.configuration?.instance?.dbInstanceClass;
      const recommended = details?.rdsDbInstance?.configuration?.instance?.dbInstanceClass;
      if (
        !validInstanceType(current) ||
        !validInstanceType(recommended) ||
        current.split('.').slice(0, -1).join('.') === recommended.split('.').slice(0, -1).join('.')
      )
        return null;

      return {
        ...recommendation,
        actionType: 'Upgrade',
        resourceType: currentResourceType,
        currentConfiguration: { instance: { dbInstanceClass: current } },
        recommendedConfiguration: { instance: { dbInstanceClass: recommended } },
      };
    }
    if (currentResourceType === 'EbsVolume') {
      const current = response.currentResourceDetails?.ebsVolume?.configuration;
      const recommended = details?.ebsVolume?.configuration;
      if (
        typeof current?.storage?.type !== 'string' ||
        !current.storage.type.trim() ||
        (current.attachmentState !== undefined && typeof current.attachmentState !== 'string') ||
        !validCapacity(current.storage.sizeInGb) ||
        !validOptionalPerformance(current.performance?.iops, current.performance?.throughput) ||
        typeof recommended?.storage?.type !== 'string' ||
        !recommended.storage.type.trim() ||
        (recommended.attachmentState !== undefined && typeof recommended.attachmentState !== 'string') ||
        !validCapacity(recommended.storage.sizeInGb) ||
        !validOptionalPerformance(recommended.performance?.iops, recommended.performance?.throughput) ||
        current.storage.type === recommended.storage.type
      )
        return null;

      return {
        ...recommendation,
        actionType: 'Upgrade',
        resourceType: currentResourceType,
        currentConfiguration: {
          ...current,
          storage: { type: current.storage.type, sizeInGb: current.storage.sizeInGb },
        },
        recommendedConfiguration: {
          ...recommended,
          storage: { type: recommended.storage.type, sizeInGb: recommended.storage.sizeInGb },
        },
      };
    }
    const current = response.currentResourceDetails?.ec2Instance?.configuration?.instance?.type;
    const recommended = details?.ec2Instance?.configuration?.instance?.type;
    if (
      currentResourceType !== 'Ec2Instance' ||
      !validInstanceType(current) ||
      !validInstanceType(recommended) ||
      current.split('.')[0] === recommended.split('.')[0]
    )
      return null;

    return {
      ...recommendation,
      actionType: 'Upgrade',
      resourceType: currentResourceType,
      currentConfiguration: { instance: { type: current } },
      recommendedConfiguration: { instance: { type: recommended } },
    };
  },
};

type CostOptimizationHubSession = {
  client: ReturnType<typeof createCostOptimizationHubClient>;
  enrolled: boolean;
};

const idleResourceKeys = {
  Ec2Instance: 'ec2Instance',
  RdsDbInstance: 'rdsDbInstance',
  EbsVolume: 'ebsVolume',
  EcsService: 'ecsService',
  Ec2AutoScalingGroup: 'ec2AutoScalingGroup',
} as const;

// Validate AWS's optional nested fields before preserving the typed configuration.
const validConfigurationValues = (value: unknown, key = ''): boolean => {
  if (value === undefined) return true;
  if (['sizeInGb', 'iops', 'throughput', 'vCpu', 'memorySizeInMB'].includes(key))
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (['type', 'dbInstanceClass', 'attachmentState', 'allocationStrategy', 'architecture', 'platform'].includes(key))
    return typeof value === 'string' && value.trim().length > 0;
  if (Array.isArray(value))
    return key === 'mixedInstances' && value.length > 0 && value.every((item) => validConfigurationValues(item));
  if (value && typeof value === 'object')
    return (
      Object.values(value).some((v) => v !== undefined) &&
      Object.entries(value).every(([field, item]) => validConfigurationValues(item, field))
    );
  return false;
};

const idleConfiguration = (type: keyof typeof idleResourceKeys, details: ResourceDetails | undefined) => {
  const configuration = details?.[idleResourceKeys[type]]?.configuration;
  if (!configuration || !validConfigurationValues(configuration)) return null;
  switch (type) {
    case 'Ec2Instance':
      return details?.ec2Instance?.configuration?.instance?.type ? configuration : null;
    case 'RdsDbInstance':
      return details?.rdsDbInstance?.configuration?.instance?.dbInstanceClass ? configuration : null;
    case 'EbsVolume':
      return details?.ebsVolume?.configuration?.storage?.type &&
        typeof details.ebsVolume.configuration.storage.sizeInGb === 'number'
        ? configuration
        : null;
    case 'EcsService': {
      const compute = details?.ecsService?.configuration?.compute;
      return typeof compute?.vCpu === 'number' && typeof compute.memorySizeInMB === 'number' ? configuration : null;
    }
    case 'Ec2AutoScalingGroup': {
      const group = details?.ec2AutoScalingGroup?.configuration;
      return group?.instance?.type ||
        (group?.mixedInstances?.length &&
          group.mixedInstances.every((instance) => typeof instance.type === 'string' && instance.type.length > 0))
        ? configuration
        : null;
    }
  }
};

const idleCategory: RecommendationCategory<AwsCostOptimizationHubIdleRecommendation> = {
  actionTypes: ['Stop', 'Delete', 'ScaleIn'],
  resourceTypes: ['Ec2Instance', 'RdsDbInstance', 'EbsVolume', 'EcsService', 'Ec2AutoScalingGroup'],
  messageSubject: 'idle capacity recommendations',
  incompleteDetails: (count) =>
    `${count} idle capacity recommendations lacked valid identity, action, operational flags, or current/recommended configuration.`,
  normalizeConfiguration: (common, response) => {
    const { currentResourceDetails: current, recommendedResourceDetails: recommended } = response;
    const type = common.currentResourceType as keyof typeof idleResourceKeys;
    const actions = {
      Ec2Instance: ['Stop'],
      RdsDbInstance: ['Stop', 'Delete'],
      EbsVolume: ['Delete'],
      EcsService: ['Delete'],
      Ec2AutoScalingGroup: ['ScaleIn'],
    };
    if (
      !actions[type]?.includes(common.actionType) ||
      !common.region ||
      !(common.resourceId || common.resourceArn) ||
      !common.implementationEffort ||
      typeof common.restartNeeded !== 'boolean' ||
      typeof common.rollbackPossible !== 'boolean'
    )
      return null;
    // A detail for another recommendation or action must never be combined with this summary.
    if (
      (['recommendationId', 'accountId', 'region', 'actionType', 'currentResourceType'] as const).some(
        (key) => response[key] !== undefined && response[key] !== common[key],
      )
    )
      return null;
    const currentConfiguration = idleConfiguration(type, current);
    const recommendedConfiguration = idleConfiguration(type, recommended);
    if (
      !currentConfiguration ||
      (recommended !== undefined && !recommendedConfiguration) ||
      (common.actionType === 'ScaleIn' && !recommendedConfiguration)
    )
      return null;
    return {
      ...common,
      resourceId: common.resourceId || common.resourceArn,
      currentResourceType: type,
      currentConfiguration,
      recommendedConfiguration,
    } as AwsCostOptimizationHubIdleRecommendation;
  },
};

const sessionsByLoadContext = new WeakMap<AwsAccountIdResolver, Promise<CostOptimizationHubSession>>();

const createCostOptimizationHubSession = async (accountId: string): Promise<CostOptimizationHubSession> => {
  const client = createCostOptimizationHubClient();
  const enrollment = await withAwsServiceErrorContext(
    'AWS Cost Optimization Hub',
    'ListEnrollmentStatuses',
    COST_OPTIMIZATION_HUB_REGION,
    () => client.send(new ListEnrollmentStatusesCommand({ accountId, maxResults: 100 })),
  );
  return {
    client,
    enrolled: enrollment.items?.some((item) => item.accountId === accountId && item.status === 'Active') ?? false,
  };
};

const getCostOptimizationHubSession = (
  accountId: string,
  context?: AwsAccountIdResolver,
): Promise<CostOptimizationHubSession> => {
  if (!context) {
    return createCostOptimizationHubSession(accountId);
  }

  const existing = sessionsByLoadContext.get(context);
  if (existing) {
    return existing;
  }

  const session = createCostOptimizationHubSession(accountId);
  sessionsByLoadContext.set(context, session);
  return session;
};

const loadCostOptimizationHubRecommendations = async <T extends HubRecommendation>(
  category: RecommendationCategory<T>,
  context?: AwsAccountIdResolver,
): Promise<CostOptimizationHubLoadResult<T>> => {
  const accountId = await resolveAwsAccountIdForLoad(context);
  try {
    const { client, enrolled } = await getCostOptimizationHubSession(accountId, context);

    if (!enrolled) {
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
    let incompleteRecommendationCount = 0;
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
                ...(category.regions ? { regions: category.regions } : {}),
                actionTypes: [...category.actionTypes],
                resourceTypes: [...category.resourceTypes],
              },
              includeAllRecommendations: false,
              maxResults: PAGE_SIZE,
              nextToken,
            }),
          ),
      );

      if (page.items !== undefined && !Array.isArray(page.items)) {
        incompleteRecommendationCount += 1;
      }
      for (const recommendation of Array.isArray(page.items) ? page.items : []) {
        if (recommendation?.recommendationId) {
          recommendationsById.set(recommendation.recommendationId, recommendation);
        } else {
          incompleteRecommendationCount += 1;
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
        return category.normalizeConfiguration(common, detail);
      },
    );
    const recommendations = normalized.filter((recommendation): recommendation is T => recommendation !== null);
    incompleteRecommendationCount += normalized.length - recommendations.length;

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

const rightsizingCategory: RecommendationCategory<AwsCostOptimizationHubRightsizingRecommendation> = {
  actionTypes: ['Rightsize'],
  resourceTypes: [
    'Ec2Instance',
    'Ec2AutoScalingGroup',
    'EbsVolume',
    'LambdaFunction',
    'EcsService',
    'RdsDbInstance',
    'RdsDbInstanceStorage',
    'AuroraDbClusterStorage',
  ],
  messageSubject: 'rightsizing recommendations',
  incompleteDetails: (count) =>
    `${count} rightsizing recommendations lacked required identity, cost, refresh, source, or typed current and recommended configuration data.`,
  normalizeConfiguration: (common, response) => {
    const { currentResourceType, ...recommendation } = common;
    const resourceType = currentResourceType as AwsCostOptimizationHubRightsizingRecommendation['resourceType'];
    const normalize = rightsizingConfigurationNormalizers[resourceType];
    const currentConfiguration = normalize(response.currentResourceDetails);
    const recommendedConfiguration = normalize(response.recommendedResourceDetails);
    const arn = /^arn:[^:]+:([^:]+):([a-z0-9-]+):(\d{12}):(.+)$/.exec(common.resourceArn ?? '');
    const region = common.region ?? (arn?.[3] === common.accountId ? arn[2] : undefined);
    const resourceId =
      resourceType === 'LambdaFunction' && arn?.[1] === 'lambda' && arn[4]?.startsWith('function:')
        ? getUnqualifiedLambdaFunctionArn(common.resourceArn ?? '')
        : (common.resourceId ?? common.resourceArn);
    if (!region || !resourceId || !currentConfiguration || !recommendedConfiguration) return null;
    return {
      ...recommendation,
      resourceId,
      region,
      actionType: 'Rightsize',
      resourceType,
      currentConfiguration,
      recommendedConfiguration,
    } as AwsCostOptimizationHubRightsizingRecommendation;
  },
};

/**
 * Loads both configurations for account-scoped Hub rightsizing recommendations.
 * @param _resources - Unused for account-scoped recommendations.
 * @param context - Discovery-run account and enrollment context.
 * @returns Typed recommendations or unavailable evidence diagnostics.
 */
export const hydrateAwsCostOptimizationHubRightsizingRecommendations = async (
  _resources: AwsDiscoveredResource[],
  context?: AwsAccountIdResolver,
): Promise<CostOptimizationHubLoadResult<AwsCostOptimizationHubRightsizingRecommendation>> =>
  loadCostOptimizationHubRecommendations(rightsizingCategory, context);

/**
 * Loads AWS-classified idle capacity through the shared enrollment and recommendation session.
 * @param _resources - Unused for account-scoped recommendations.
 * @param context - Discovery-run account resolver and shared session identity.
 * @returns Typed idle recommendations or an unavailable dataset with diagnostics.
 */
export const hydrateAwsCostOptimizationHubIdleRecommendations = async (
  _resources: AwsDiscoveredResource[],
  context?: AwsAccountIdResolver & { regions?: string[] },
): Promise<
  | AwsCostOptimizationHubIdleRecommendation[]
  | AwsDiscoveryDatasetLoadResult<'aws-cost-optimization-hub-idle-recommendations'>
> => loadCostOptimizationHubRecommendations({ ...idleCategory, regions: context?.regions }, context);

/**
 * Loads product-generation upgrades through the shared account-scoped Hub seam.
 * @param _resources - Unused because Hub recommendations are account-scoped.
 * @param context - Discovery-run context sharing account identity and enrollment.
 * @returns Typed upgrade evidence or an unavailable dataset result.
 */
export const hydrateAwsCostOptimizationHubUpgradeRecommendations = async (
  _resources: AwsDiscoveredResource[],
  context?: AwsAccountIdResolver,
): Promise<CostOptimizationHubLoadResult<AwsCostOptimizationHubUpgradeRecommendation>> =>
  loadCostOptimizationHubRecommendations(upgradeCategory, context);
