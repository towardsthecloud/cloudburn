import type { AwsDiscoveredResource, AwsEc2InstanceUtilization } from '@cloudburn/rules';
import type { AwsDiscoveryDatasetResolver } from '../discovery-registry.js';
import { type CloudWatchMetricPoint, fetchCloudWatchSignals } from './cloudwatch.js';
import { hydrateAwsEc2Instances } from './ec2.js';

const FOURTEEN_DAYS_IN_SECONDS = 14 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const LOW_CPU_THRESHOLD = 10;
const LOW_NETWORK_THRESHOLD = 5 * 1024 * 1024;

const dailyValues = (points: CloudWatchMetricPoint[]): Map<string, number> => {
  const values = new Map<string, number>();
  for (const point of points) {
    if (!Number.isFinite(point.value) || point.value < 0 || !Number.isFinite(Date.parse(point.timestamp))) continue;
    const day = point.timestamp.slice(0, 10);
    // Repeated points must not create extra idle days. Use the higher value
    // conservatively if the service returns conflicting values for one day.
    values.set(day, Math.max(values.get(day) ?? 0, point.value));
  }
  return values;
};

/**
 * Hydrates discovered EC2 instances with a 14-day low-utilization summary.
 *
 * @param resources - Catalog resources filtered to EC2 instance resource types.
 * @returns Hydrated EC2 utilization models for rule evaluation.
 */
export const hydrateAwsEc2InstanceUtilization = async (
  resources: AwsDiscoveredResource[],
  context?: AwsDiscoveryDatasetResolver,
): Promise<AwsEc2InstanceUtilization[]> => {
  const instances = context ? await context.loadDataset('aws-ec2-instances') : await hydrateAwsEc2Instances(resources);
  const instancesByRegion = new Map<string, typeof instances>();

  for (const instance of instances) {
    const regionInstances = instancesByRegion.get(instance.region) ?? [];
    regionInstances.push(instance);
    instancesByRegion.set(instance.region, regionInstances);
  }

  const endTime = new Date();
  endTime.setUTCHours(0, 0, 0, 0);
  const startTime = new Date(endTime.getTime() - FOURTEEN_DAYS_IN_SECONDS * 1000);
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
        endTime,
        queries,
        region,
        startTime,
      });

      return regionInstances.flatMap((instance, index) => {
        const cpuByDay = dailyValues(metricData.get(`cpu${index}`) ?? []);
        const inByDay = dailyValues(metricData.get(`in${index}`) ?? []);
        const outByDay = dailyValues(metricData.get(`out${index}`) ?? []);
        const completeDays = [...cpuByDay].flatMap(([day, cpu]) => {
          const incoming = inByDay.get(day);
          const outgoing = outByDay.get(day);
          return incoming === undefined || outgoing === undefined ? [] : [{ cpu, network: incoming + outgoing }];
        });
        if (completeDays.length === 0) return [];
        const lowUtilizationDays = completeDays.filter(
          ({ cpu, network }) => cpu <= LOW_CPU_THRESHOLD && network <= LOW_NETWORK_THRESHOLD,
        ).length;
        const averageCpuUtilizationLast14Days =
          completeDays.reduce((sum, day) => sum + day.cpu, 0) / completeDays.length;
        const averageDailyNetworkBytesLast14Days =
          completeDays.reduce((sum, day) => sum + day.network, 0) / completeDays.length;

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
