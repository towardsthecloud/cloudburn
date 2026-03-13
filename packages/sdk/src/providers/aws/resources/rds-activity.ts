import type { AwsDiscoveredResource, AwsRdsInstanceActivity } from '@cloudburn/rules';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { hydrateAwsRdsInstances } from './rds.js';

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REQUIRED_RDS_DAILY_POINTS = SEVEN_DAYS_IN_SECONDS / DAILY_PERIOD_IN_SECONDS;

/**
 * Hydrates discovered RDS DB instances with 7-day connection activity.
 *
 * @param resources - Catalog resources filtered to RDS DB instance resource types.
 * @returns Hydrated RDS activity models for rule evaluation. Instances with no
 * or partial CloudWatch datapoints preserve `maxDatabaseConnectionsLast7Days`
 * as `null`.
 */
export const hydrateAwsRdsInstanceActivity = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsRdsInstanceActivity[]> => {
  const instances = await hydrateAwsRdsInstances(resources);
  const instancesByRegion = new Map<string, typeof instances>();

  for (const instance of instances) {
    const regionInstances = instancesByRegion.get(instance.region) ?? [];
    regionInstances.push(instance);
    instancesByRegion.set(instance.region, regionInstances);
  }

  const hydratedPages = await Promise.all(
    [...instancesByRegion.entries()].map(async ([region, regionInstances]) => {
      const metricData = await fetchCloudWatchSignals({
        endTime: new Date(),
        queries: regionInstances.map((instance, index) => ({
          dimensions: [{ Name: 'DBInstanceIdentifier', Value: instance.dbInstanceIdentifier }],
          id: `rds${index}`,
          metricName: 'DatabaseConnections',
          namespace: 'AWS/RDS',
          period: DAILY_PERIOD_IN_SECONDS,
          stat: 'Maximum',
        })),
        region,
        startTime: new Date(Date.now() - SEVEN_DAYS_IN_SECONDS * 1000),
      });

      return regionInstances.map((instance, index) => {
        const points = metricData.get(`rds${index}`) ?? [];

        return {
          accountId: instance.accountId,
          dbInstanceIdentifier: instance.dbInstanceIdentifier,
          instanceClass: instance.instanceClass,
          maxDatabaseConnectionsLast7Days:
            points.length >= REQUIRED_RDS_DAILY_POINTS ? Math.max(...points.map((point) => point.value)) : null,
          region,
        };
      });
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.dbInstanceIdentifier.localeCompare(right.dbInstanceIdentifier));
};
