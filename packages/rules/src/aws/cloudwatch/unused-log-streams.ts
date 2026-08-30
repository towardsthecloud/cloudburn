import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDWATCH-2';
const RULE_SERVICE = 'cloudwatch';
const RULE_SEVERITY = 'low' as const;
const RULE_MESSAGE =
  'CloudWatch log groups whose most recent stream event is older than 90 days should be reviewed or removed.';
const DAY_MS = 24 * 60 * 60 * 1000;
const UNUSED_LOG_STREAM_DAYS = 90;

const toLogGroupScopeKey = (region: string, accountId: string, logGroupName: string): string =>
  `${region}:${accountId}:${logGroupName}`;

/** Flag CloudWatch log groups whose latest observed stream event is stale outside delivery-managed log groups. */
export const cloudWatchUnusedLogStreamsRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'CloudWatch Log Group Inactive',
  description:
    'Flag CloudWatch log groups whose most recent stream has no observed event history or whose latest stream event is more than 90 days old outside delivery-managed log groups.',
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
        const latestEventTimestamp = recentActivity?.lastEventTimestamp;

        return (
          logGroupsByScopeKey.has(logGroupScopeKey) &&
          !deliveryManagedLogGroups.has(logGroupScopeKey) &&
          (latestEventTimestamp === undefined || latestEventTimestamp < cutoff)
        );
      })
      .map((logGroup) => createFindingMatch(logGroup.logGroupArn, logGroup.region, logGroup.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
