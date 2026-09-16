import type { DiscoveryDatasetKey, Rule } from './metadata.js';

/**
 * Closed catalog of AWS evidence capabilities required by live datasets.
 *
 * Entries cover both enrollment- or setup-gated capabilities, such as Cost
 * Optimization Hub enrollment or an accessible Resource Explorer aggregator, and
 * access-only capabilities, such as Cost Explorer or Budgets access, that keep
 * their rules enabled without opt-in.
 */
export const AWS_CAPABILITIES = [
  'cost-optimization-hub-enrollment',
  'compute-optimizer-enrollment',
  'resource-explorer-aggregator',
  'cost-explorer-access',
  'budgets-access',
] as const;

/**
 * AWS account capability that a live rule may require.
 */
export type AwsCapability = (typeof AWS_CAPABILITIES)[number];

const datasetCapabilities: Partial<Record<DiscoveryDatasetKey, AwsCapability>> = {
  'aws-cost-optimization-hub-savings-plans-recommendations': 'cost-optimization-hub-enrollment',
  'aws-cost-optimization-hub-reservation-recommendations': 'cost-optimization-hub-enrollment',
  'aws-cost-optimization-hub-rightsizing-recommendations': 'cost-optimization-hub-enrollment',
  'aws-cost-optimization-hub-idle-recommendations': 'cost-optimization-hub-enrollment',
  'aws-cost-optimization-hub-upgrade-recommendations': 'cost-optimization-hub-enrollment',
  'aws-cost-optimization-hub-graviton-recommendations': 'cost-optimization-hub-enrollment',
  'aws-lambda-memory-recommendations': 'compute-optimizer-enrollment',
  'aws-resource-explorer-untagged-resources': 'resource-explorer-aggregator',
  'aws-cost-usage': 'cost-explorer-access',
  'aws-cost-anomaly-monitors': 'cost-explorer-access',
  'aws-sagemaker-savings-plans-coverage': 'cost-explorer-access',
  'aws-cost-guardrail-budgets': 'budgets-access',
};

/**
 * Maps a discovery dataset to the AWS capability it requires.
 *
 * Access-only capabilities are included: mapping a dataset to `cost-explorer-access`
 * or `budgets-access` records its dependency without making the rule opt-in.
 * Datasets with no capability requirement, such as ordinary Resource Explorer
 * inventory, return `undefined`.
 *
 * @param datasetKey - Discovery dataset key to classify.
 * @returns The required AWS capability, or `undefined` when the dataset needs none.
 */
export const getAwsDatasetCapability = (datasetKey: DiscoveryDatasetKey): AwsCapability | undefined =>
  datasetCapabilities[datasetKey];

/**
 * Derives the AWS capabilities a rule directly requires for live discovery.
 *
 * Only `discoveryDependencies` contribute; `optionalDiscoveryDependencies` are
 * supporting evidence and never appear in the result. Access-only capabilities
 * still appear here — opting rules out is a separate preset decision. Rules that
 * do not support discovery return an empty list. Each call returns a fresh,
 * deduplicated, alphabetically sorted array.
 *
 * @param rule - Rule (or the capability-relevant subset of one) to inspect.
 * @returns Sorted unique AWS capabilities required by the rule's direct discovery dependencies.
 */
export const getAwsRuleCapabilities = (rule: Pick<Rule, 'supports' | 'discoveryDependencies'>): AwsCapability[] =>
  rule.supports.includes('discovery')
    ? [
        ...new Set(
          (rule.discoveryDependencies ?? []).flatMap((key) => {
            const capability = getAwsDatasetCapability(key);
            return capability ? [capability] : [];
          }),
        ),
      ].sort()
    : [];
