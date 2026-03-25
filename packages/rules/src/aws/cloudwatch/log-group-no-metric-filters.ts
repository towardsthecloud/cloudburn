import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDWATCH-3';
const RULE_SERVICE = 'cloudwatch';
const RULE_MESSAGE =
  'CloudWatch log groups storing at least 1 GB should define metric filters or reduce retention aggressively.';
const MIN_STORED_BYTES = 1_073_741_824;
const getCoverageKey = (accountId: string, region: string, logGroupName: string): string =>
  `${accountId}:${region}:${logGroupName}`;

/** Flag large CloudWatch log groups that have no metric filters configured. */
export const cloudWatchLogGroupNoMetricFiltersRule = createRule({
  id: RULE_ID,
  name: 'CloudWatch Log Group No Metric Filters',
  description: 'Flag CloudWatch log groups storing at least 1 GB when they define no metric filters.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cloudwatch-log-groups', 'aws-cloudwatch-log-metric-filter-coverage'],
  evaluateLive: ({ resources }) => {
    const coverageByLogGroupKey = new Map(
      resources
        .get('aws-cloudwatch-log-metric-filter-coverage')
        .map(
          (coverage) => [getCoverageKey(coverage.accountId, coverage.region, coverage.logGroupName), coverage] as const,
        ),
    );

    const findings = resources
      .get('aws-cloudwatch-log-groups')
      .filter((logGroup) => (logGroup.storedBytes ?? 0) >= MIN_STORED_BYTES)
      .filter((logGroup) => {
        const coverage = coverageByLogGroupKey.get(
          getCoverageKey(logGroup.accountId, logGroup.region, logGroup.logGroupName),
        );

        return coverage?.metricFilterCount === 0;
      })
      .map((logGroup) => createFindingMatch(logGroup.logGroupName, logGroup.region, logGroup.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
