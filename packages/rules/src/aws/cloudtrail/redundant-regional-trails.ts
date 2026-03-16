import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDTRAIL-2';
const RULE_SERVICE = 'cloudtrail';
const RULE_MESSAGE =
  'AWS regions should keep only one single-region CloudTrail trail unless redundancy is intentional.';

/** Flag redundant single-region CloudTrail trails after keeping one canonical trail per account and region. */
export const cloudTrailRedundantRegionalTrailsRule = createRule({
  id: RULE_ID,
  name: 'CloudTrail Redundant Regional Trails',
  description: 'Flag redundant single-region CloudTrail trails when more than one trail covers the same region.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cloudtrail-trails'],
  evaluateLive: ({ resources }) => {
    const trailsByScope = new Map<string, string[]>();

    for (const trail of resources.get('aws-cloudtrail-trails')) {
      if (trail.isMultiRegionTrail) {
        continue;
      }

      const scopeKey = `${trail.accountId}:${trail.homeRegion}`;
      const trailArns = trailsByScope.get(scopeKey) ?? [];
      trailArns.push(trail.trailArn);
      trailsByScope.set(scopeKey, trailArns);
    }

    const survivorByScope = new Map(
      [...trailsByScope.entries()]
        .filter(([, trailArns]) => trailArns.length > 0)
        .map(([scopeKey, trailArns]) => [scopeKey, [...trailArns].sort((left, right) => left.localeCompare(right))[0]]),
    );

    const findings = resources
      .get('aws-cloudtrail-trails')
      .filter((trail) => {
        if (trail.isMultiRegionTrail) {
          return false;
        }

        return survivorByScope.get(`${trail.accountId}:${trail.homeRegion}`) !== trail.trailArn;
      })
      .map((trail) => createFindingMatch(trail.trailArn, trail.region, trail.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
