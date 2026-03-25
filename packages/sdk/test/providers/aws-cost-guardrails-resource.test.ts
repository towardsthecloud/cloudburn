import type { DescribeBudgetsCommand } from '@aws-sdk/client-budgets';
import type { GetAnomalyMonitorsCommand } from '@aws-sdk/client-cost-explorer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBudgetsClient, createCostExplorerClient, resolveAwsAccountId } from '../../src/providers/aws/client.js';
import {
  hydrateAwsCostAnomalyMonitors,
  hydrateAwsCostGuardrailBudgets,
} from '../../src/providers/aws/resources/cost-guardrails.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createBudgetsClient: vi.fn(),
  createCostExplorerClient: vi.fn(),
  resolveAwsAccountId: vi.fn(),
}));

const mockedCreateBudgetsClient = vi.mocked(createBudgetsClient);
const mockedCreateCostExplorerClient = vi.mocked(createCostExplorerClient);
const mockedResolveAwsAccountId = vi.mocked(resolveAwsAccountId);

describe('Cost guardrail discovery resources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates AWS Budgets for the current account', async () => {
    mockedResolveAwsAccountId.mockResolvedValue('123456789012');
    mockedCreateBudgetsClient.mockReturnValue({
      send: vi.fn(async (command: DescribeBudgetsCommand) => {
        expect(command.input).toEqual({
          AccountId: '123456789012',
          MaxResults: 100,
          NextToken: undefined,
        });

        return {
          Budgets: [
            {
              BudgetName: 'monthly-spend',
            },
          ],
        };
      }),
    } as never);

    await expect(hydrateAwsCostGuardrailBudgets([])).resolves.toEqual([
      {
        accountId: '123456789012',
        budgetCount: 1,
      },
    ]);
  });

  it('hydrates Cost Anomaly Detection monitors for the current account', async () => {
    mockedResolveAwsAccountId.mockResolvedValue('123456789012');
    mockedCreateCostExplorerClient.mockReturnValue({
      send: vi.fn(async (command: GetAnomalyMonitorsCommand) => {
        expect(command.input).toEqual({
          MaxResults: 100,
          NextPageToken: undefined,
        });

        return {
          AnomalyMonitors: [
            {
              MonitorArn: 'arn:aws:ce::123456789012:anomalymonitor/1234abcd',
              MonitorName: 'account-monitor',
            },
          ],
        };
      }),
    } as never);

    await expect(hydrateAwsCostAnomalyMonitors([])).resolves.toEqual([
      {
        accountId: '123456789012',
        monitorCount: 1,
      },
    ]);
  });
});
