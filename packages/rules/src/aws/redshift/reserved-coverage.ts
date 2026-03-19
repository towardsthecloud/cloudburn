import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-REDSHIFT-2';
const RULE_SERVICE = 'redshift';
const RULE_MESSAGE = 'Long-running Redshift clusters should have reserved node coverage.';
const DAY_MS = 24 * 60 * 60 * 1000;
// Review steady-state warehouses twice a year for reserved-node fit.
const LONG_RUNNING_CLUSTER_DAYS = 180;

const createCoverageKey = (region: string, nodeType: string): string => `${region}:${nodeType}`;

/** Flag long-running Redshift clusters that lack reserved-node coverage. */
export const redshiftReservedCoverageRule = createRule({
  id: RULE_ID,
  name: 'Redshift Cluster Missing Reserved Coverage',
  description: 'Flag long-running Redshift clusters that do not have matching active reserved-node coverage.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-redshift-clusters', 'aws-redshift-reserved-nodes'],
  evaluateLive: ({ resources }) => {
    const now = Date.now();
    const cutoff = now - LONG_RUNNING_CLUSTER_DAYS * DAY_MS;
    const remainingCoverage = new Map<string, number>();

    for (const reservedNode of resources.get('aws-redshift-reserved-nodes')) {
      if (reservedNode.state !== 'active') {
        continue;
      }

      const coverageKey = createCoverageKey(reservedNode.region, reservedNode.nodeType);
      remainingCoverage.set(coverageKey, (remainingCoverage.get(coverageKey) ?? 0) + reservedNode.nodeCount);
    }

    const findings = resources
      .get('aws-redshift-clusters')
      .filter((cluster) => {
        const createTime = cluster.clusterCreateTime ? Date.parse(cluster.clusterCreateTime) : Number.NaN;

        if (
          cluster.clusterStatus !== 'available' ||
          Number.isNaN(createTime) ||
          createTime > cutoff ||
          cluster.numberOfNodes <= 0
        ) {
          return false;
        }

        const coverageKey = createCoverageKey(cluster.region, cluster.nodeType);
        const remainingNodeCount = remainingCoverage.get(coverageKey) ?? 0;

        if (remainingNodeCount < cluster.numberOfNodes) {
          return true;
        }

        remainingCoverage.set(coverageKey, remainingNodeCount - cluster.numberOfNodes);
        return false;
      })
      .map((cluster) => createFindingMatch(cluster.clusterIdentifier, cluster.region, cluster.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
