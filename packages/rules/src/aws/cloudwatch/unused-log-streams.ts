import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDWATCH-2';
const RULE_SERVICE = 'cloudwatch';
const RULE_MESSAGE =
  'CloudWatch log streams that have never received events or have been inactive for more than 90 days should be removed.';
const DAY_MS = 24 * 60 * 60 * 1000;
const UNUSED_LOG_STREAM_DAYS = 90;

const toLogGroupScopeKey = (region: string, accountId: string, logGroupName: string): string =>
  `${region}:${accountId}:${logGroupName}`;

/** Flag CloudWatch log streams with no event history or stale ingestion outside delivery-managed log groups. */
export const cloudWatchUnusedLogStreamsRule = createRule({
  id: RULE_ID,
  name: 'CloudWatch Unused Log Streams',
  description:
    'Flag CloudWatch log streams that have never received events or whose last ingestion was more than 90 days ago outside delivery-managed log groups.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cloudwatch-log-groups', 'aws-cloudwatch-log-streams'],
  evaluateLive: ({ resources }) => {
    const cutoff = Date.now() - UNUSED_LOG_STREAM_DAYS * DAY_MS;
    const logGroups = resources.get('aws-cloudwatch-log-groups');
    const knownLogGroups = new Set(
      logGroups.map((logGroup) => toLogGroupScopeKey(logGroup.region, logGroup.accountId, logGroup.logGroupName)),
    );
    const deliveryManagedLogGroups = new Set(
      logGroups
        .filter((logGroup) => logGroup.logGroupClass === 'DELIVERY')
        .map((logGroup) => toLogGroupScopeKey(logGroup.region, logGroup.accountId, logGroup.logGroupName)),
    );

    const findings = resources
      .get('aws-cloudwatch-log-streams')
      .filter((logStream) => {
        const logGroupScopeKey = toLogGroupScopeKey(logStream.region, logStream.accountId, logStream.logGroupName);

        return (
          knownLogGroups.has(logGroupScopeKey) &&
          !deliveryManagedLogGroups.has(logGroupScopeKey) &&
          ((logStream.firstEventTimestamp === undefined &&
            logStream.lastEventTimestamp === undefined &&
            logStream.lastIngestionTime === undefined) ||
            (logStream.lastIngestionTime !== undefined && logStream.lastIngestionTime < cutoff))
        );
      })
      .map((logStream) => createFindingMatch(logStream.arn, logStream.region, logStream.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
