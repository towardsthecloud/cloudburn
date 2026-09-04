import { GetSavingsPlansCoverageCommand, type SavingsPlansCoverage } from '@aws-sdk/client-cost-explorer';
import type { AwsDiscoveredResource, AwsSageMakerSavingsPlansCoverage } from '@cloudburn/rules';
import { createCostExplorerClient } from '../client.js';
import type { AwsAccountIdResolver, AwsDiscoveryDatasetLoadResult } from '../discovery-registry.js';
import { formatAwsAccessDeniedReason, getAwsErrorCode, isAwsAccessDeniedError } from '../errors.js';
import { formatUtcDate, parseFiniteNumber, resolveAwsAccountIdForLoad, withAwsServiceErrorContext } from './utils.js';

const COST_EXPLORER_CONTROL_REGION = 'us-east-1';
const LOOKBACK_DAYS = 30;
const PAGE_SIZE = 100;
const SAGEMAKER_SERVICE_NAME = 'Amazon SageMaker';

const resolveCoveragePeriod = (now: Date): { end: string; start: string } => {
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - LOOKBACK_DAYS);

  return {
    end: formatUtcDate(endDate),
    start: formatUtcDate(startDate),
  };
};

const normalizeCoverage = (
  accountId: string,
  coverage: SavingsPlansCoverage,
): AwsSageMakerSavingsPlansCoverage | null => {
  const coveragePercentage = parseFiniteNumber(coverage.Coverage?.CoveragePercentage);
  const onDemandCost = parseFiniteNumber(coverage.Coverage?.OnDemandCost);
  const spendCoveredBySavingsPlans = parseFiniteNumber(coverage.Coverage?.SpendCoveredBySavingsPlans);
  const totalCost = parseFiniteNumber(coverage.Coverage?.TotalCost);

  if (
    coveragePercentage === null ||
    coveragePercentage < 0 ||
    coveragePercentage > 100 ||
    onDemandCost === null ||
    onDemandCost < 0 ||
    spendCoveredBySavingsPlans === null ||
    spendCoveredBySavingsPlans < 0 ||
    totalCost === null ||
    totalCost < 0 ||
    !coverage.TimePeriod?.Start ||
    !coverage.TimePeriod.End
  ) {
    return null;
  }

  return {
    accountId,
    coveragePercentage,
    onDemandCost,
    periodEnd: coverage.TimePeriod.End,
    periodStart: coverage.TimePeriod.Start,
    spendCoveredBySavingsPlans,
    totalCost,
  };
};

/**
 * Loads SageMaker Savings Plans coverage for the last 30 complete days.
 *
 * @param _resources - Unused because Cost Explorer coverage is account-scoped.
 * @param context - Optional discovery-run context for shared account identity resolution.
 * @returns Normalized SageMaker coverage or an unavailable dataset result.
 */
export const hydrateAwsSageMakerSavingsPlansCoverage = async (
  _resources: AwsDiscoveredResource[],
  context?: AwsAccountIdResolver,
): Promise<
  AwsSageMakerSavingsPlansCoverage[] | AwsDiscoveryDatasetLoadResult<'aws-sagemaker-savings-plans-coverage'>
> => {
  const client = createCostExplorerClient();
  const accountId = await resolveAwsAccountIdForLoad(context);
  const period = resolveCoveragePeriod(new Date());

  try {
    const coverageByPeriod = new Map<string, AwsSageMakerSavingsPlansCoverage>();
    let incompleteCoverageCount = 0;
    let nextToken: string | undefined;

    do {
      const response = await withAwsServiceErrorContext(
        'AWS Cost Explorer',
        'GetSavingsPlansCoverage',
        COST_EXPLORER_CONTROL_REGION,
        () =>
          client.send(
            new GetSavingsPlansCoverageCommand({
              Filter: {
                Dimensions: {
                  Key: 'SERVICE',
                  Values: [SAGEMAKER_SERVICE_NAME],
                },
              },
              MaxResults: PAGE_SIZE,
              Metrics: ['SpendCoveredBySavingsPlans'],
              NextToken: nextToken,
              TimePeriod: {
                End: period.end,
                Start: period.start,
              },
            }),
          ),
      );

      for (const coverage of response.SavingsPlansCoverages ?? []) {
        const normalized = normalizeCoverage(accountId, coverage);
        if (normalized) {
          coverageByPeriod.set(`${normalized.periodStart}:${normalized.periodEnd}`, normalized);
        } else {
          incompleteCoverageCount += 1;
        }
      }
      nextToken = response.NextToken;
    } while (nextToken);

    const coverage = [...coverageByPeriod.values()].sort((left, right) =>
      left.periodStart.localeCompare(right.periodStart),
    );
    if (incompleteCoverageCount > 0) {
      return {
        diagnostics: [
          {
            code: 'SavingsPlansCoverageIncomplete',
            details: `${incompleteCoverageCount} SageMaker Savings Plans coverage record${incompleteCoverageCount === 1 ? '' : 's'} lacked a complete time period or numeric coverage and cost values.`,
            message:
              'Skipped SageMaker Savings Plans coverage because AWS Cost Explorer returned incomplete coverage evidence.',
            provider: 'aws',
            service: 'sagemaker',
            source: 'discovery',
            status: 'skipped',
          },
        ],
        resources: coverage,
        unavailable: true,
      };
    }

    return coverage;
  } catch (err) {
    if (getAwsErrorCode(err) === 'DataUnavailableException') {
      return {
        diagnostics: [
          {
            code: 'DataUnavailableException',
            details: err instanceof Error ? err.message : String(err),
            message: 'Skipped SageMaker Savings Plans coverage because AWS Cost Explorer data is unavailable.',
            provider: 'aws',
            service: 'sagemaker',
            source: 'discovery',
            status: 'skipped',
          },
        ],
        resources: [],
        unavailable: true,
      };
    }

    if (!isAwsAccessDeniedError(err)) {
      throw err;
    }

    return {
      diagnostics: [
        {
          code: getAwsErrorCode(err),
          details: err instanceof Error ? err.message : String(err),
          message: `Skipped SageMaker Savings Plans coverage because access to AWS Cost Explorer is denied by ${formatAwsAccessDeniedReason(err)}.`,
          provider: 'aws',
          service: 'sagemaker',
          source: 'discovery',
          status: 'access_denied',
        },
      ],
      resources: [],
      unavailable: true,
    };
  }
};
