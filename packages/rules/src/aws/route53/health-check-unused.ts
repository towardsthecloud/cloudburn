import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ROUTE53-2';
const RULE_SERVICE = 'route53';
const RULE_MESSAGE = 'Route 53 health checks not associated with any DNS record should be deleted.';

/** Flag Route 53 health checks that are not referenced by any record set. */
export const route53HealthCheckUnusedRule = createRule({
  id: RULE_ID,
  name: 'Route 53 Health Check Unused',
  description: 'Flag Route 53 health checks not associated with any DNS record.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-route53-health-checks', 'aws-route53-records'],
  evaluateLive: ({ resources }) => {
    const referencedHealthChecks = new Set(
      resources.get('aws-route53-records').flatMap((record) => (record.healthCheckId ? [record.healthCheckId] : [])),
    );
    const findings = resources
      .get('aws-route53-health-checks')
      .filter((healthCheck) => !referencedHealthChecks.has(healthCheck.healthCheckId))
      .map((healthCheck) =>
        createFindingMatch(
          healthCheck.healthCheckArn,
          healthCheck.region === 'global' ? undefined : healthCheck.region,
          healthCheck.accountId,
        ),
      );

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
