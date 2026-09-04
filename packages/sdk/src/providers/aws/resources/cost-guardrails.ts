import { DescribeBudgetsCommand } from '@aws-sdk/client-budgets';
import { GetAnomalyMonitorsCommand } from '@aws-sdk/client-cost-explorer';
import type {
  AwsCostAnomalyMonitor,
  AwsCostGuardrailBudget,
  AwsCostGuardrailBudgetSpend,
  AwsDiscoveredResource,
} from '@cloudburn/rules';
import { createBudgetsClient, createCostExplorerClient } from '../client.js';
import type { AwsAccountIdResolver } from '../discovery-registry.js';
import { parseFiniteNumber, resolveAwsAccountIdForLoad, withAwsServiceErrorContext } from './utils.js';

const COST_CONTROL_REGION = 'us-east-1';
const PAGE_SIZE = 100;

/**
 * Hydrates account-scoped AWS Budgets summaries.
 *
 * @param _resources - Unused because budgets are account-scoped.
 * @param context - Optional discovery-run context for shared account identity resolution.
 * @returns Budget summaries for the current account.
 */
export const hydrateAwsCostGuardrailBudgets = async (
  _resources: AwsDiscoveredResource[],
  context?: AwsAccountIdResolver,
): Promise<AwsCostGuardrailBudget[]> => {
  const accountId = await resolveAwsAccountIdForLoad(context);
  const client = createBudgetsClient();
  let budgetCount = 0;
  const budgets: AwsCostGuardrailBudgetSpend[] = [];
  let nextToken: string | undefined;

  do {
    const response = await withAwsServiceErrorContext('AWS Budgets', 'DescribeBudgets', COST_CONTROL_REGION, () =>
      client.send(
        new DescribeBudgetsCommand({
          AccountId: accountId,
          MaxResults: PAGE_SIZE,
          NextToken: nextToken,
        }),
      ),
    );

    for (const budget of response.Budgets ?? []) {
      if (!budget.BudgetName) {
        continue;
      }

      budgetCount += 1;
      const actualSpend = parseFiniteNumber(budget.CalculatedSpend?.ActualSpend?.Amount);
      const budgetLimit = parseFiniteNumber(budget.BudgetLimit?.Amount);
      const actualUnit = budget.CalculatedSpend?.ActualSpend?.Unit?.trim();
      const limitUnit = budget.BudgetLimit?.Unit?.trim();

      if (actualSpend === null || budgetLimit === null || !actualUnit || actualUnit !== limitUnit) {
        continue;
      }

      const forecastUnit = budget.CalculatedSpend?.ForecastedSpend?.Unit?.trim();
      const forecastedAmount = parseFiniteNumber(budget.CalculatedSpend?.ForecastedSpend?.Amount);
      budgets.push({
        actualSpend,
        budgetLimit,
        budgetName: budget.BudgetName,
        ...(forecastUnit === actualUnit && forecastedAmount !== null ? { forecastedSpend: forecastedAmount } : {}),
        spendUnit: actualUnit,
      });
    }
    nextToken = response.NextToken;
  } while (nextToken);

  return [
    {
      accountId,
      budgetCount,
      budgets,
    } satisfies AwsCostGuardrailBudget,
  ];
};

/**
 * Hydrates account-scoped Cost Anomaly Detection monitors.
 *
 * @param _resources - Unused because anomaly monitors are account-scoped.
 * @param context - Optional discovery-run context for shared account identity resolution.
 * @returns Cost anomaly monitor summaries for the current account.
 */
export const hydrateAwsCostAnomalyMonitors = async (
  _resources: AwsDiscoveredResource[],
  context?: AwsAccountIdResolver,
): Promise<AwsCostAnomalyMonitor[]> => {
  const accountId = await resolveAwsAccountIdForLoad(context);
  const client = createCostExplorerClient();
  let monitorCount = 0;
  let nextPageToken: string | undefined;

  do {
    const response = await withAwsServiceErrorContext(
      'AWS Cost Explorer',
      'GetAnomalyMonitors',
      COST_CONTROL_REGION,
      () =>
        client.send(
          new GetAnomalyMonitorsCommand({
            MaxResults: PAGE_SIZE,
            NextPageToken: nextPageToken,
          }),
        ),
    );

    monitorCount += (response.AnomalyMonitors ?? []).filter((monitor) => monitor.MonitorArn).length;
    nextPageToken = response.NextPageToken;
  } while (nextPageToken);

  return [
    {
      accountId,
      monitorCount,
    } satisfies AwsCostAnomalyMonitor,
  ];
};
