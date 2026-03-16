import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-CLOUDTRAIL-1';
const RULE_SERVICE = 'cloudtrail';
const RULE_MESSAGE =
  'AWS accounts should keep only one multi-region CloudTrail trail unless redundancy is intentional.';

/** Flag redundant multi-region CloudTrail trails after keeping one canonical trail per account. */
export const cloudTrailRedundantGlobalTrailsRule = createRule({
  id: RULE_ID,
  name: 'CloudTrail Redundant Global Trails',
  description: 'Flag redundant multi-region CloudTrail trails when more than one trail covers the same account.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cloudtrail-trails'],
  evaluateLive: ({ resources }) => {
    const trailsByAccount = new Map<string, string[]>();

    for (const trail of resources.get('aws-cloudtrail-trails')) {
      if (!trail.isMultiRegionTrail) {
        continue;
      }

      const trailArns = trailsByAccount.get(trail.accountId) ?? [];
      trailArns.push(trail.trailArn);
      trailsByAccount.set(trail.accountId, trailArns);
    }

    const survivorByAccount = new Map(
      [...trailsByAccount.entries()]
        .filter(([, trailArns]) => trailArns.length > 0)
        .map(([accountId, trailArns]) => [
          accountId,
          [...trailArns].sort((left, right) => left.localeCompare(right))[0],
        ]),
    );

    const findings = resources
      .get('aws-cloudtrail-trails')
      .filter((trail) => trail.isMultiRegionTrail && survivorByAccount.get(trail.accountId) !== trail.trailArn)
      .map((trail) => createFindingMatch(trail.trailArn, trail.region, trail.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
