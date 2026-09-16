const stripKind = (kind: string) => (resource: string) =>
  resource.startsWith(`${kind}:`)
    ? resource.slice(kind.length + 1)
    : resource.startsWith(`${kind}/`)
      ? resource.slice(kind.length + 1)
      : undefined;

const ARN_RESOURCE_BY_NAMESPACE: Record<
  string,
  { service: string; extract: (resource: string) => string | undefined }
> = {
  'autoscaling:autoScalingGroup': {
    service: 'autoscaling',
    extract: (resource) => resource.split(':autoScalingGroupName/')[1],
  },
  'dynamodb:table': { service: 'dynamodb', extract: stripKind('table') },
  'ec2:instance': { service: 'ec2', extract: stripKind('instance') },
  'ec2:volume': { service: 'ec2', extract: stripKind('volume') },
  'ecs:service': { service: 'ecs', extract: stripKind('service') },
  'elasticache:cluster': { service: 'elasticache', extract: stripKind('cluster') },
  'memorydb:cluster': { service: 'memorydb', extract: stripKind('cluster') },
  'opensearch:domain': { service: 'es', extract: stripKind('domain') },
  'rds:cluster-storage': { service: 'rds', extract: stripKind('cluster') },
  'rds:db': { service: 'rds', extract: stripKind('db') },
  'rds:db-storage': { service: 'rds', extract: stripKind('db') },
  'redshift:cluster': { service: 'redshift', extract: stripKind('cluster') },
};

/**
 * Reduces a recognized AWS ARN to its service-local identifier for one resource namespace.
 *
 * Namespaces not listed here keep the supplied identity verbatim; Lambda function ARNs in
 * particular keep the full unqualified ARN because that is the identity native findings use.
 * ARNs whose service does not match the namespace, and identities that are not ARNs, are
 * returned unchanged so a mismatched identifier can never collapse into another resource.
 *
 * @param resourceType - Provider resource namespace such as `ec2:volume` or `rds:db`.
 * @param resourceId - Service-local identifier or ARN supplied with the match.
 * @returns The canonical service-local identifier, or the original value unchanged.
 */
export const canonicalizeAwsResourceId = (resourceType: string, resourceId: string): string => {
  if (!resourceId.startsWith('arn:')) {
    return resourceId;
  }

  if (
    resourceType === 'lambda:function' &&
    /^arn:[^:]+:lambda:[^:]+:[^:]+:function:[^:]+(?::[^:]+)?$/.test(resourceId)
  ) {
    return resourceId.split(':').slice(0, 7).join(':');
  }

  const parts = resourceId.split(':');
  const namespace = ARN_RESOURCE_BY_NAMESPACE[resourceType];
  if (parts.length < 6 || !namespace || parts[2] !== namespace.service) {
    return resourceId;
  }

  return namespace.extract(parts.slice(5).join(':')) || resourceId;
};

/**
 * Reads the account and Region scope embedded in an AWS ARN.
 *
 * @param resourceId - Candidate ARN identifier.
 * @returns The ARN scope, or `undefined` when the value is not a well-formed ARN.
 */
export const getAwsArnScope = (resourceId: string): { accountId: string; region: string } | undefined => {
  if (!resourceId.startsWith('arn:')) {
    return undefined;
  }

  const parts = resourceId.split(':');
  if (parts.length < 6) {
    return undefined;
  }

  return { region: parts[3] ?? '', accountId: parts[4] ?? '' };
};
