/**
 * Curated RDS instance-class family policy for the built-in preferred-class rule.
 *
 * This list is intentionally maintained in-repo rather than generated from AWS.
 * It reflects CloudBurn's opinionated default for common general-purpose,
 * memory-optimized, and burstable RDS DB instance families. Unknown or
 * specialized families are treated as `unclassified` so the rule stays
 * conservative until the policy is updated.
 */
const awsRdsPreferredInstanceFamilies = new Set(['m8g', 'm8gd', 'm7i', 'm7g', 'r8g', 'r8gd', 'r7i', 'r7g', 't4g']);

const awsRdsNonPreferredInstanceFamilies = new Set([
  'm1',
  'm3',
  'm4',
  'm5',
  'm5d',
  'm6g',
  'm6gd',
  'm6i',
  'm6id',
  'm6idn',
  'm6in',
  'r3',
  'r4',
  'r5',
  'r5b',
  'r5d',
  'r6g',
  'r6gd',
  'r6i',
  'r6id',
  'r6idn',
  'r6in',
  't2',
  't3',
]);

/** Preferred-family policy states used by the RDS preferred-class rule. */
export type AwsRdsPreferredInstanceFamilyState = 'preferred' | 'non-preferred' | 'unclassified';

/**
 * Returns the curated preferred-family state for a literal RDS DB instance class.
 *
 * @param instanceClass - Literal RDS DB instance class such as `db.m8g.large`.
 * @returns The preferred-family classification for the DB instance class.
 */
export const getAwsRdsPreferredInstanceFamilyState = (instanceClass: string): AwsRdsPreferredInstanceFamilyState => {
  const family = /^db\.([a-z0-9-]+)/iu.exec(instanceClass)?.[1]?.toLowerCase();

  if (!family) {
    return 'unclassified';
  }

  if (awsRdsPreferredInstanceFamilies.has(family)) {
    return 'preferred';
  }

  if (awsRdsNonPreferredInstanceFamilies.has(family)) {
    return 'non-preferred';
  }

  return 'unclassified';
};
