import { GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import type { AwsCostUsage, AwsDiscoveredResource } from '@cloudburn/rules';
import { createCostExplorerClient, resolveAwsAccountId } from '../client.js';
import { withAwsServiceErrorContext } from './utils.js';

const COST_EXPLORER_CONTROL_REGION = 'us-east-1';

const toMonthBoundary = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const slugifyServiceName = (serviceName: string): string =>
  serviceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

/**
 * Hydrates Cost Explorer service spend deltas for the last two full months.
 *
 * @param _resources - Unused because Cost Explorer spend is account-scoped.
 * @returns Aggregated service costs for the previous and current full months.
 */
export const hydrateAwsCostUsage = async (_resources: AwsDiscoveredResource[]): Promise<AwsCostUsage[]> => {
  const client = createCostExplorerClient();
  const accountId = await resolveAwsAccountId();
  const monthStart = toMonthBoundary(new Date());
  const latestFullMonthStart = addMonths(monthStart, -1);
  const previousFullMonthStart = addMonths(monthStart, -2);
  const response = await withAwsServiceErrorContext(
    'AWS Cost Explorer',
    'GetCostAndUsage',
    COST_EXPLORER_CONTROL_REGION,
    () =>
      client.send(
        new GetCostAndUsageCommand({
          TimePeriod: {
            End: formatDate(monthStart),
            Start: formatDate(previousFullMonthStart),
          },
          Granularity: 'MONTHLY',
          GroupBy: [{ Key: 'SERVICE', Type: 'DIMENSION' }],
          // NetUnblendedCost tracks what the account actually paid after discounts and credits.
          Metrics: ['NetUnblendedCost'],
        }),
      ),
  );

  const previousMonthCosts = new Map<string, { amount: number; unit: string }>();
  const latestMonthCosts = new Map<string, { amount: number; unit: string }>();

  for (const result of response.ResultsByTime ?? []) {
    const periodStart = result.TimePeriod?.Start;

    for (const group of result.Groups ?? []) {
      const serviceName = group.Keys?.[0];
      const metric = group.Metrics?.NetUnblendedCost;
      const amount = metric?.Amount;

      if (!serviceName || amount === undefined) {
        continue;
      }

      const parsedAmount = Number.parseFloat(amount);

      if (!Number.isFinite(parsedAmount)) {
        continue;
      }

      const entry = {
        amount: parsedAmount,
        unit: metric?.Unit ?? 'USD',
      };

      if (periodStart === formatDate(previousFullMonthStart)) {
        previousMonthCosts.set(serviceName, entry);
      } else if (periodStart === formatDate(latestFullMonthStart)) {
        latestMonthCosts.set(serviceName, entry);
      }
    }
  }

  const services = [...new Set([...previousMonthCosts.keys(), ...latestMonthCosts.keys()])];

  return services
    .map((serviceName) => {
      const previousMonth = previousMonthCosts.get(serviceName);
      const latestMonth = latestMonthCosts.get(serviceName);
      const previousMonthCost = previousMonth?.amount ?? 0;
      const currentMonthCost = latestMonth?.amount ?? 0;
      const costIncrease = currentMonthCost - previousMonthCost;

      return {
        accountId,
        costIncrease,
        costUnit: latestMonth?.unit ?? previousMonth?.unit ?? 'USD',
        currentMonthCost,
        previousMonthCost,
        serviceName,
        serviceSlug: slugifyServiceName(serviceName),
      } satisfies AwsCostUsage;
    })
    .filter((usage) => usage.costIncrease > 0)
    .sort((left, right) => right.costIncrease - left.costIncrease || left.serviceName.localeCompare(right.serviceName));
};
