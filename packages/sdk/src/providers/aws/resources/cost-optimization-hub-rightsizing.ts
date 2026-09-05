import type { ResourceDetails } from '@aws-sdk/client-cost-optimization-hub';
import type { AwsCostOptimizationHubRightsizingConfigurationMap as Configurations } from '@cloudburn/rules';

type Normalizers = { [K in keyof Configurations]: (details: ResourceDetails | undefined) => Configurations[K] | null };
const validNumber = (value: number | undefined): boolean =>
  value === undefined || (Number.isFinite(value) && value >= 0);

/** Typed adapters for the eight AWS configuration detail shapes. */
export const rightsizingConfigurationNormalizers: Normalizers = {
  Ec2Instance: (details) => {
    const type = details?.ec2Instance?.configuration?.instance?.type;
    return type ? { instance: { type } } : null;
  },
  Ec2AutoScalingGroup: (details) => {
    const config = details?.ec2AutoScalingGroup?.configuration;
    if (!config || (!config.instance?.type && !config.mixedInstances?.length)) return null;
    if (config.mixedInstances?.some((instance) => !instance.type)) return null;
    return {
      ...(config.instance?.type ? { instance: { type: config.instance.type } } : {}),
      ...(config.mixedInstances
        ? {
            mixedInstances: config.mixedInstances.flatMap((instance) =>
              instance.type ? [{ type: instance.type }] : [],
            ),
          }
        : {}),
      ...(config.type ? { type: config.type } : {}),
      ...(config.allocationStrategy ? { allocationStrategy: config.allocationStrategy } : {}),
    };
  },
  EbsVolume: (details) => {
    const config = details?.ebsVolume?.configuration;
    if (
      !config?.storage?.type ||
      config.storage.sizeInGb === undefined ||
      !validNumber(config.storage.sizeInGb) ||
      !validNumber(config.performance?.iops) ||
      !validNumber(config.performance?.throughput)
    )
      return null;
    return { ...config, storage: { type: config.storage.type, sizeInGb: config.storage.sizeInGb } };
  },
  LambdaFunction: (details) => {
    const compute = details?.lambdaFunction?.configuration?.compute;
    return compute?.memorySizeInMB === undefined || !validNumber(compute.memorySizeInMB) || !validNumber(compute.vCpu)
      ? null
      : { compute: { ...compute, memorySizeInMB: compute.memorySizeInMB } };
  },
  EcsService: (details) => {
    const compute = details?.ecsService?.configuration?.compute;
    return compute?.memorySizeInMB === undefined ||
      compute.vCpu === undefined ||
      !validNumber(compute.memorySizeInMB) ||
      !validNumber(compute.vCpu)
      ? null
      : { compute: { ...compute, memorySizeInMB: compute.memorySizeInMB, vCpu: compute.vCpu } };
  },
  RdsDbInstance: (details) => {
    const dbInstanceClass = details?.rdsDbInstance?.configuration?.instance?.dbInstanceClass;
    return dbInstanceClass ? { instance: { dbInstanceClass } } : null;
  },
  RdsDbInstanceStorage: (details) => {
    const config = details?.rdsDbInstanceStorage?.configuration;
    return !config?.storageType ||
      config.allocatedStorageInGb === undefined ||
      !validNumber(config.allocatedStorageInGb) ||
      !validNumber(config.iops) ||
      !validNumber(config.storageThroughput)
      ? null
      : { ...config, storageType: config.storageType, allocatedStorageInGb: config.allocatedStorageInGb };
  },
  AuroraDbClusterStorage: (details) => {
    const storageType = details?.auroraDbClusterStorage?.configuration?.storageType;
    return storageType ? { storageType } : null;
  },
};
