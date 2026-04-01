import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDWATCH-2';
const RULE_SERVICE = 'cloudwatch';
const RULE_MESSAGE =
  'CloudWatch log groups whose most recent stream activity is older than 90 days should be reviewed or removed.';
const DAY_MS = 24 * 60 * 60 * 1000;
const UNUSED_LOG_STREAM_DAYS = 90;

const toLogGroupScopeKey = (region: string, accountId: string, logGroupName: string): string =>
  `${region}:${accountId}:${logGroupName}`;

/** Flag CloudWatch log groups whose latest observed stream activity is stale outside delivery-managed log groups. */
export const cloudWatchUnusedLogStreamsRule = createRule({
  id: RULE_ID,
  name: 'CloudWatch Log Group Inactive',
  description:
    'Flag CloudWatch log groups whose most recent stream has no observed event history or whose latest stream activity is more than 90 days old outside delivery-managed log groups.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cloudwatch-log-groups', 'aws-cloudwatch-log-group-recent-stream-activity'],
  evaluateLive: ({ resources }) => {
    const cutoff = Date.now() - UNUSED_LOG_STREAM_DAYS * DAY_MS;
    const logGroups = resources.get('aws-cloudwatch-log-groups');
    const logGroupsByScopeKey = new Map(
      logGroups.map((logGroup) => [
        toLogGroupScopeKey(logGroup.region, logGroup.accountId, logGroup.logGroupName),
        logGroup,
      ]),
    );
    const deliveryManagedLogGroups = new Set(
      logGroups
        .filter((logGroup) => logGroup.logGroupClass === 'DELIVERY')
        .map((logGroup) => toLogGroupScopeKey(logGroup.region, logGroup.accountId, logGroup.logGroupName)),
    );
    const recentActivityByScopeKey = new Map(
      resources
        .get('aws-cloudwatch-log-group-recent-stream-activity')
        .map((activity) => [toLogGroupScopeKey(activity.region, activity.accountId, activity.logGroupName), activity]),
    );

    const findings = logGroups
      .filter((logGroup) => {
        const logGroupScopeKey = toLogGroupScopeKey(logGroup.region, logGroup.accountId, logGroup.logGroupName);
        const recentActivity = recentActivityByScopeKey.get(logGroupScopeKey);
        const latestActivityTimestamp =
          recentActivity?.lastEventTimestamp !== undefined || recentActivity?.lastIngestionTime !== undefined
            ? Math.max(recentActivity?.lastEventTimestamp ?? 0, recentActivity?.lastIngestionTime ?? 0)
            : undefined;

        return (
          logGroupsByScopeKey.has(logGroupScopeKey) &&
          !deliveryManagedLogGroups.has(logGroupScopeKey) &&
          (latestActivityTimestamp === undefined || latestActivityTimestamp < cutoff)
        );
      })
      .map((logGroup) => createFindingMatch(logGroup.logGroupArn, logGroup.region, logGroup.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
