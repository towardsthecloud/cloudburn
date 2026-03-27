import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ROUTE53-1';
const RULE_SERVICE = 'route53';
const RULE_MESSAGE = 'Route 53 record sets should generally use TTL values of at least 3600 seconds.';
// Match the upstream Route 53 guidance that treats one hour as the low-TTL review floor.
const LOW_TTL_SECONDS = 3600;

const hasLowTtl = (ttl: number | null | undefined): ttl is number =>
  ttl !== undefined && ttl !== null && ttl < LOW_TTL_SECONDS;

/** Flag Route 53 record sets whose TTL is lower than the common one-hour baseline. */
export const route53RecordHigherTtlRule = createRule({
  id: RULE_ID,
  name: 'Route 53 Record Higher TTL',
  description: 'Flag Route 53 records with TTL below 3600 seconds.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  discoveryDependencies: ['aws-route53-zones', 'aws-route53-records'],
  staticDependencies: ['aws-route53-records'],
  evaluateLive: ({ resources }) => {
    const knownZones = new Set(resources.get('aws-route53-zones').map((zone) => zone.hostedZoneId));
    const findings = resources
      .get('aws-route53-records')
      // Alias records inherit TTL from their targets and are intentionally excluded from the review.
      .filter((record) => !record.isAlias && knownZones.has(record.hostedZoneId) && record.ttl !== undefined)
      .filter((record) => (record.ttl ?? LOW_TTL_SECONDS) < LOW_TTL_SECONDS)
      .map((record) =>
        createFindingMatch(record.recordId, record.region === 'global' ? undefined : record.region, record.accountId),
      );

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-route53-records')
      .filter((record) => !record.isAlias && hasLowTtl(record.ttl))
      .map((record) => createFindingMatch(record.resourceId, undefined, undefined, record.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
