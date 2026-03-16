/**
 * Curated EC2 family policy for the built-in preferred-instance rule.
 *
 * This list is intentionally maintained in-repo rather than generated from AWS.
 * It reflects CloudBurn's opinionated default for common compute, general-purpose,
 * memory, and burstable families. Review this list against the AWS instance-types
 * documentation when new families are launched. Unknown families are treated as
 * `unclassified` and skipped so the built-in rule can stay conservative until
 * the policy is updated.
 */
const awsEc2PreferredInstanceFamilies = new Set([
  // Compute optimized
  'c8a',
  'c8g',
  'c8gb',
  'c8gd',
  'c8gn',
  'c8i',
  'c8id',
  'c8i-flex',
  // General purpose
  'm8a',
  'm8azn',
  'm8g',
  'm8gb',
  'm8gd',
  'm8gn',
  'm8i',
  'm8id',
  'm8i-flex',
  // Memory optimized
  'r8a',
  'r8g',
  'r8gb',
  'r8gd',
  'r8gn',
  'r8i',
  'r8id',
  'r8i-flex',
  // Burstable
  't4g',
]);

const awsEc2NonPreferredInstanceFamilies = new Set([
  // Previous-generation and older compute optimized
  'c1',
  'c3',
  'c4',
  'c5',
  'c5a',
  'c5ad',
  'c5d',
  'c5n',
  'c6a',
  'c6g',
  'c6gd',
  'c6gn',
  'c6i',
  'c6id',
  'c6in',
  'c7a',
  'c7g',
  'c7gd',
  'c7gn',
  'c7i',
  'c7i-flex',
  'c7in',
  // Previous-generation and older general purpose
  'm1',
  'm2',
  'm3',
  'm4',
  'm5',
  'm5a',
  'm5ad',
  'm5d',
  'm5dn',
  'm5n',
  'm5zn',
  'm6a',
  'm6g',
  'm6gd',
  'm6i',
  'm6id',
  'm6idn',
  'm6in',
  'm7a',
  'm7d',
  'm7g',
  'm7gd',
  'm7i',
  'm7i-flex',
  'm7in',
  // Previous-generation and older memory optimized
  'r3',
  'r4',
  'r5',
  'r5a',
  'r5ad',
  'r5b',
  'r5d',
  'r5dn',
  'r5n',
  'r6a',
  'r6g',
  'r6gd',
  'r6i',
  'r6id',
  'r6idn',
  'r6in',
  'r7a',
  'r7g',
  'r7gd',
  'r7i',
  'r7iz',
  // Burstable
  't1',
  't2',
  't3',
  't3a',
]);

const awsEc2EquivalentGravitonReviewFamilies = new Set([
  'c5',
  'c5a',
  'c5ad',
  'c5d',
  'c5n',
  'c6a',
  'c6i',
  'c6id',
  'c6in',
  'c7a',
  'c7i',
  'c7i-flex',
  'c7in',
  'c8a',
  'c8i',
  'c8id',
  'c8i-flex',
  'm5',
  'm5a',
  'm5ad',
  'm5d',
  'm5dn',
  'm5n',
  'm5zn',
  'm6a',
  'm6i',
  'm6id',
  'm6idn',
  'm6in',
  'm7a',
  'm7d',
  'm7i',
  'm7i-flex',
  'm7in',
  'm8a',
  'm8azn',
  'm8i',
  'm8id',
  'm8i-flex',
  'r5',
  'r5a',
  'r5ad',
  'r5b',
  'r5d',
  'r5dn',
  'r5n',
  'r6a',
  'r6i',
  'r6id',
  'r6idn',
  'r6in',
  'r7a',
  'r7i',
  'r7iz',
  'r8a',
  'r8i',
  'r8id',
  'r8i-flex',
  't1',
  't2',
  't3',
  't3a',
]);

/** Preferred-family policy states used by the EC2 preferred-instance rule. */
export type AwsEc2PreferredInstanceFamilyState = 'preferred' | 'non-preferred' | 'unclassified';

/**
 * Returns the family portion of a literal EC2 instance type.
 *
 * @param instanceType - Literal EC2 instance type such as `m8i.large`.
 * @returns The normalized family name, or `null` when the type is malformed.
 */
export const getAwsEc2InstanceFamily = (instanceType: string): string | null => {
  const family = instanceType.split('.', 1)[0]?.toLowerCase();

  return family ? family : null;
};

/**
 * Returns the curated preferred-family state for a literal EC2 instance type.
 *
 * @param instanceType - Literal EC2 instance type such as `m8i.large`.
 * @returns The preferred-family classification for the instance type.
 */
export const getAwsEc2PreferredInstanceFamilyState = (instanceType: string): AwsEc2PreferredInstanceFamilyState => {
  const family = getAwsEc2InstanceFamily(instanceType);

  if (!family) {
    return 'unclassified';
  }

  if (awsEc2PreferredInstanceFamilies.has(family)) {
    return 'preferred';
  }

  if (awsEc2NonPreferredInstanceFamilies.has(family)) {
    return 'non-preferred';
  }

  return 'unclassified';
};

/**
 * Returns whether a literal EC2 instance type should be reviewed for a
 * Graviton migration when the running instance is not Arm-based already.
 *
 * @param instanceType - Literal EC2 instance type such as `m7i.large`.
 * @param architecture - Normalized instance architecture reported by EC2.
 * @returns Whether CloudBurn should recommend a Graviton review.
 */
export const shouldReviewAwsEc2InstanceForGraviton = (instanceType: string, architecture?: string): boolean => {
  const family = getAwsEc2InstanceFamily(instanceType);

  if (!family || !architecture || architecture.toLowerCase() === 'arm64') {
    return false;
  }

  return awsEc2EquivalentGravitonReviewFamilies.has(family);
};
