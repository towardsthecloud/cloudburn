import { DescribeBudgetsCommand } from '@aws-sdk/client-budgets';
import { GetAnomalyMonitorsCommand } from '@aws-sdk/client-cost-explorer';
import type { AwsCostAnomalyMonitor, AwsCostGuardrailBudget, AwsDiscoveredResource } from '@cloudburn/rules';
import { createBudgetsClient, createCostExplorerClient, resolveAwsAccountId } from '../client.js';
import { withAwsServiceErrorContext } from './utils.js';

const COST_CONTROL_REGION = 'us-east-1';
const PAGE_SIZE = 100;

/**
 * Hydrates account-scoped AWS Budgets summaries.
 *
 * @param _resources - Unused because budgets are account-scoped.
 * @returns Budget summaries for the current account.
 */
export const hydrateAwsCostGuardrailBudgets = async (
  _resources: AwsDiscoveredResource[],
): Promise<AwsCostGuardrailBudget[]> => {
  const accountId = await resolveAwsAccountId();
  const client = createBudgetsClient();
  let budgetCount = 0;
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

    budgetCount += (response.Budgets ?? []).filter((budget) => budget.BudgetName).length;
    nextToken = response.NextToken;
  } while (nextToken);

  return [
    {
      accountId,
      budgetCount,
    } satisfies AwsCostGuardrailBudget,
  ];
};

/**
 * Hydrates account-scoped Cost Anomaly Detection monitors.
 *
 * @param _resources - Unused because anomaly monitors are account-scoped.
 * @returns Cost anomaly monitor summaries for the current account.
 */
export const hydrateAwsCostAnomalyMonitors = async (
  _resources: AwsDiscoveredResource[],
): Promise<AwsCostAnomalyMonitor[]> => {
  const accountId = await resolveAwsAccountId();
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
