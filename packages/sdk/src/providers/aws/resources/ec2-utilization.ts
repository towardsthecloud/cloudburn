import type { AwsDiscoveredResource, AwsEc2InstanceUtilization } from '@cloudburn/rules';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { hydrateAwsEc2Instances } from './ec2.js';

const FOURTEEN_DAYS_IN_SECONDS = 14 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const LOW_CPU_THRESHOLD = 10;
const LOW_NETWORK_THRESHOLD = 5 * 1024 * 1024;

const toIsoDate = (timestamp: string): string => timestamp.slice(0, 10);

/**
 * Hydrates discovered EC2 instances with a 14-day low-utilization summary.
 *
 * @param resources - Catalog resources filtered to EC2 instance resource types.
 * @returns Hydrated EC2 utilization models for rule evaluation.
 */
export const hydrateAwsEc2InstanceUtilization = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEc2InstanceUtilization[]> => {
  const instances = await hydrateAwsEc2Instances(resources);
  const instancesByRegion = new Map<string, typeof instances>();

  for (const instance of instances) {
    const regionInstances = instancesByRegion.get(instance.region) ?? [];
    regionInstances.push(instance);
    instancesByRegion.set(instance.region, regionInstances);
  }

  const hydratedPages = await Promise.all(
    [...instancesByRegion.entries()].map(async ([region, regionInstances]) => {
      const queries = regionInstances.flatMap((instance, index) => [
        {
          dimensions: [{ Name: 'InstanceId', Value: instance.instanceId }],
          id: `cpu${index}`,
          metricName: 'CPUUtilization',
          namespace: 'AWS/EC2',
          period: DAILY_PERIOD_IN_SECONDS,
          stat: 'Average' as const,
        },
        {
          dimensions: [{ Name: 'InstanceId', Value: instance.instanceId }],
          id: `in${index}`,
          metricName: 'NetworkIn',
          namespace: 'AWS/EC2',
          period: DAILY_PERIOD_IN_SECONDS,
          stat: 'Sum' as const,
        },
        {
          dimensions: [{ Name: 'InstanceId', Value: instance.instanceId }],
          id: `out${index}`,
          metricName: 'NetworkOut',
          namespace: 'AWS/EC2',
          period: DAILY_PERIOD_IN_SECONDS,
          stat: 'Sum' as const,
        },
      ]);

      const metricData = await fetchCloudWatchSignals({
        endTime: new Date(),
        queries,
        region,
        startTime: new Date(Date.now() - FOURTEEN_DAYS_IN_SECONDS * 1000),
      });

      return regionInstances.map((instance, index) => {
        const cpuPoints = metricData.get(`cpu${index}`) ?? [];
        const inPoints = metricData.get(`in${index}`) ?? [];
        const outPoints = metricData.get(`out${index}`) ?? [];
        const networkByDay = new Map<string, number>();

        for (const point of inPoints) {
          const day = toIsoDate(point.timestamp);
          networkByDay.set(day, (networkByDay.get(day) ?? 0) + point.value);
        }

        for (const point of outPoints) {
          const day = toIsoDate(point.timestamp);
          networkByDay.set(day, (networkByDay.get(day) ?? 0) + point.value);
        }

        const lowUtilizationDays = cpuPoints.reduce((count, point) => {
          const day = toIsoDate(point.timestamp);
          const networkBytes = networkByDay.get(day) ?? 0;

          return point.value <= LOW_CPU_THRESHOLD && networkBytes <= LOW_NETWORK_THRESHOLD ? count + 1 : count;
        }, 0);

        const averageCpuUtilizationLast14Days =
          cpuPoints.length > 0 ? cpuPoints.reduce((sum, point) => sum + point.value, 0) / cpuPoints.length : 0;
        const averageDailyNetworkBytesLast14Days =
          networkByDay.size > 0
            ? [...networkByDay.values()].reduce((sum, value) => sum + value, 0) / networkByDay.size
            : 0;

        return {
          accountId: instance.accountId,
          averageCpuUtilizationLast14Days,
          averageDailyNetworkBytesLast14Days,
          instanceId: instance.instanceId,
          instanceType: instance.instanceType,
          lowUtilizationDays,
          region,
        };
      });
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.instanceId.localeCompare(right.instanceId));
};
