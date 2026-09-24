import { describe, expect, it, vi } from 'vitest';
import {
  canonicalizeAwsResourceId,
  compareRecommendationMatches,
  createRecommendationComparator,
  createRecommendationMatch,
  deduplicateRecommendationMatches,
  getRecommendationIdentity,
} from '../src/index.js';
import { createFindingMatch } from '../src/shared/helpers.js';
import type { FindingMatch } from '../src/shared/metadata.js';

const scopeMatch = {
  resourceId: 'vol-1',
  resourceType: 'ec2:volume',
  accountId: '111111111111',
  region: 'eu-west-1',
  actionType: 'Delete',
};

it.each([
  'not-a-group:autoScalingGroupName/my-asg',
  'autoScalingGroup::autoScalingGroupName/my-asg',
  'autoScalingGroup:uuid:autoScalingGroupName/my-asg:extra',
])('does not collapse malformed Auto Scaling resource shape %s', (resource) => {
  const arn = `arn:aws:autoscaling:eu-west-1:111111111111:${resource}`;
  const scope = { ...scopeMatch, resourceType: 'autoscaling:autoScalingGroup', actionType: 'ScaleIn' };
  expect(canonicalizeAwsResourceId(scope.resourceType, arn)).toBe(arn);
  expect(getRecommendationIdentity('aws', { ...scope, resourceId: arn })).not.toEqual(
    getRecommendationIdentity('aws', { ...scope, resourceId: 'my-asg' }),
  );
});
it('preserves valid Auto Scaling names containing slashes', () => {
  expect(
    canonicalizeAwsResourceId(
      'autoscaling:autoScalingGroup',
      'arn:aws:autoscaling:eu-west-1:111111111111:autoScalingGroup:uuid:autoScalingGroupName/team/my-asg',
    ),
  ).toBe('team/my-asg');
});
it.each(['refreshedAt', 'observedAt'] as const)('ignores timezone-less %s independently of host timezone', (field) => {
  const local = createRecommendationMatch('aws', scopeMatch, {
    source: 'custom',
    sourceId: 'a-local',
    [field]: '2026-03-08T01:30:00',
  });
  const utc = createRecommendationMatch('aws', scopeMatch, {
    source: 'custom',
    sourceId: 'z-utc',
    [field]: '2026-03-08T06:00:00Z',
  });
  try {
    for (const timezone of ['UTC', 'America/New_York']) {
      vi.stubEnv('TZ', timezone);
      expect(compareRecommendationMatches(local, utc)).toBeGreaterThan(0);
      expect(deduplicateRecommendationMatches([local, utc])).toEqual([utc]);
      expect(deduplicateRecommendationMatches([utc, local])).toEqual([utc]);
    }
  } finally {
    vi.unstubAllEnvs();
  }
});
it.each(['2026-03-08T01:30:00-05:00', '2026-03-08T07:30:00+01:00', '2026-03-08T01:30:00-0500'])(
  'retains explicit timestamp offset %s',
  (refreshedAt) => {
    const later = createRecommendationMatch('aws', scopeMatch, { source: 'custom', sourceId: 'z-offset', refreshedAt });
    const earlier = createRecommendationMatch('aws', scopeMatch, {
      source: 'custom',
      sourceId: 'a-utc',
      refreshedAt: '2026-03-08T06:00:00Z',
    });
    expect(deduplicateRecommendationMatches([earlier, later])).toEqual([later]);
  },
);

describe('getRecommendationIdentity', () => {
  it.each([
    ['aws', 'eu-west-1'],
    ['aws-cn', 'cn-north-1'],
    ['aws-us-gov', 'us-gov-west-1'],
    ['aws-iso', 'us-iso-east-1'],
    ['aws-iso-b', 'us-isob-east-1'],
    ['aws-iso-e', 'eu-isoe-west-1'],
    ['aws-iso-f', 'us-isof-south-1'],
    ['aws-eusc', 'eusc-de-east-1'],
  ])('preserves regional and global ARNs in %s', (partition, region) => {
    const scope = { ...scopeMatch, region };
    const arn = `arn:${partition}:ec2:${region}:111111111111:volume/vol-1`;
    expect(canonicalizeAwsResourceId('ec2:volume', arn)).toBe('vol-1');
    expect(getRecommendationIdentity('aws', { ...scope, resourceId: arn })).toEqual(
      getRecommendationIdentity('aws', scope),
    );
    const globalArn = `arn:${partition}:s3:::bucket`;
    expect(
      getRecommendationIdentity('aws', { ...scope, resourceType: 's3:bucket', resourceId: globalArn })?.resourceKey,
    ).toContain(globalArn);
  });

  it.each([
    ['aws-fake', 'eu-west-1'],
    ['aws-iso-x', 'eu-west-1'],
    ['aws-cn-extra', 'cn-north-1'],
    ['aws-cn', 'eu-west-1'],
    ['aws', 'cn-north-1'],
    ['aws-us-gov', 'eu-west-1'],
    ['aws', 'us-gov-west-1'],
    ['aws-iso', 'us-isob-east-1'],
    ['aws-eusc', 'eu-central-1'],
  ])('rejects unknown or mismatched partition scope %s/%s', (partition, region) => {
    const arn = `arn:${partition}:ec2:${region}:111111111111:volume/vol-1`;
    expect(canonicalizeAwsResourceId('ec2:volume', arn)).toBe(arn);
    expect(getRecommendationIdentity('aws', { ...scopeMatch, region, resourceId: arn })).toBeUndefined();
  });
  it('returns literal versioned JSON identity for a complete scope', () => {
    expect(getRecommendationIdentity('aws', scopeMatch)).toEqual({
      resourceKey: '["resource",1,"aws","111111111111","eu-west-1","ec2:volume","vol-1"]',
      opportunityId: '["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","vol-1","Delete"]',
    });
  });

  it('returns undefined when any scope field is missing', () => {
    for (const key of ['resourceId', 'resourceType', 'accountId', 'region', 'actionType'] as const) {
      expect(getRecommendationIdentity('aws', { ...scopeMatch, [key]: undefined })).toBeUndefined();
      expect(getRecommendationIdentity('aws', { ...scopeMatch, [key]: '' })).toBeUndefined();
    }
  });

  it('keeps identity distinct across namespace, provider, account, region, and action', () => {
    const base = getRecommendationIdentity('aws', scopeMatch);
    const variants = [
      getRecommendationIdentity('aws', { ...scopeMatch, resourceType: 'ec2:instance' }),
      getRecommendationIdentity('azure', scopeMatch),
      getRecommendationIdentity('aws', { ...scopeMatch, accountId: '222222222222' }),
      getRecommendationIdentity('aws', { ...scopeMatch, region: 'us-east-1' }),
      getRecommendationIdentity('aws', { ...scopeMatch, actionType: 'Upgrade' }),
    ];
    for (const variant of variants.slice(0, -1)) {
      expect(variant?.resourceKey).not.toBe(base?.resourceKey);
      expect(variant?.opportunityId).not.toBe(base?.opportunityId);
    }
    const actionVariant = variants[4];
    expect(actionVariant?.resourceKey).toBe(base?.resourceKey);
    expect(actionVariant?.opportunityId).not.toBe(base?.opportunityId);
  });

  it('does not use the ARN scope to override an explicit mismatched scope', () => {
    const arn = 'arn:aws:ec2:us-east-1:111111111111:volume/vol-1';
    expect(getRecommendationIdentity('aws', { ...scopeMatch, region: 'eu-west-1', resourceId: arn })).toBeUndefined();
  });

  it('rejects malformed ARNs and keeps mismatched-service identifiers distinct', () => {
    expect(getRecommendationIdentity('aws', { ...scopeMatch, resourceId: 'arn:garbage' })).toBeUndefined();
    const mismatched = getRecommendationIdentity('aws', {
      ...scopeMatch,
      resourceId: 'arn:aws:rds:eu-west-1:111111111111:db:vol-1',
    });
    expect(mismatched?.resourceKey).toContain('arn:aws:rds');
  });

  it.each([
    'arn:aws:ec2:::volume/vol-1',
    'arn::ec2:eu-west-1:111111111111:volume/vol-1',
    'arn:aws:ec2::111111111111:volume/vol-1',
    'arn:aws:ec2:eu-west-1::volume/vol-1',
    'arn:aws:ec2:eu-west-1:123:volume/vol-1',
    'arn:aws:ec2:eu-west-1:111111111111:',
  ])('rejects malformed ARN %s without canonicalizing it', (arn) => {
    expect(canonicalizeAwsResourceId('ec2:volume', arn)).toBe(arn);
    expect(getRecommendationIdentity('aws', { ...scopeMatch, resourceId: arn })).toBeUndefined();
  });

  it('keeps identity for valid global ARNs with empty scope components', () => {
    const bucket = getRecommendationIdentity('aws', {
      ...scopeMatch,
      resourceType: 's3:bucket',
      resourceId: 'arn:aws:s3:::bucket',
    });
    expect(bucket?.resourceKey).toContain('arn:aws:s3:::bucket');
    const role = getRecommendationIdentity('aws', {
      ...scopeMatch,
      resourceType: 'iam:role',
      resourceId: 'arn:aws:iam::111111111111:role/test',
    });
    expect(role?.resourceKey).toContain('arn:aws:iam::111111111111:role/test');
  });

  it.each(['3', 'prod', '$LATEST'])('uses function-level identity for a Lambda qualifier %s', (qualifier) => {
    const resourceId = 'arn:aws:lambda:eu-west-1:111111111111:function:worker';
    const scope = { ...scopeMatch, resourceId, resourceType: 'lambda:function', actionType: 'Rightsize' };
    expect(getRecommendationIdentity('aws', { ...scope, resourceId: `${resourceId}:${qualifier}` })).toEqual(
      getRecommendationIdentity('aws', scope),
    );
    expect(canonicalizeAwsResourceId('lambda:function', `${resourceId}:${qualifier}`)).toBe(resourceId);
  });
});

describe('createRecommendationMatch', () => {
  it('copies only provenance fields and recomputes identity for the new match', () => {
    const provenance = {
      source: 'custom',
      sourceDetail: 'provider',
      sourceId: 'shared',
      observedAt: '2026-09-01T00:00:00Z',
      refreshedAt: '2026-09-02T00:00:00Z',
      resourceKey: 'stale-resource',
      opportunityId: 'stale-opportunity',
    };
    const first = createRecommendationMatch('aws', { resourceId: 'new-a' }, provenance);
    const second = createRecommendationMatch('aws', { resourceId: 'new-b' }, provenance);
    expect(first.recommendation).toEqual({
      source: 'custom',
      sourceDetail: 'provider',
      sourceId: 'shared',
      observedAt: '2026-09-01T00:00:00Z',
      refreshedAt: '2026-09-02T00:00:00Z',
    });
    expect(second.recommendation).not.toHaveProperty('resourceKey');
    expect(second.recommendation).not.toHaveProperty('opportunityId');
    expect(deduplicateRecommendationMatches([first, second])).toHaveLength(2);
    const complete = createRecommendationMatch('aws', { ...scopeMatch, resourceId: 'vol-new' }, provenance);
    expect(complete.recommendation?.opportunityId).toContain('vol-new');
    expect(complete.recommendation?.opportunityId).not.toBe(provenance.opportunityId);
    expect(provenance.opportunityId).toBe('stale-opportunity');
  });
  it('merges provenance and identity without mutating the input', () => {
    const match = createFindingMatch('vol-1', 'eu-west-1', '111111111111');
    const withScope = { ...match, resourceType: 'ec2:volume', actionType: 'Delete' };
    const result = createRecommendationMatch('aws', withScope, {
      source: 'cloudburn',
      sourceDetail: 'ComputeOptimizer',
      sourceId: 'rec-1',
      refreshedAt: '2026-04-20T00:00:00.000Z',
    });
    expect(result.recommendation).toEqual({
      source: 'cloudburn',
      sourceDetail: 'ComputeOptimizer',
      sourceId: 'rec-1',
      refreshedAt: '2026-04-20T00:00:00.000Z',
      resourceKey: '["resource",1,"aws","111111111111","eu-west-1","ec2:volume","vol-1"]',
      opportunityId: '["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","vol-1","Delete"]',
    });
    expect(withScope.recommendation).toBeUndefined();
  });
});

describe('canonicalizeAwsResourceId', () => {
  it.each([
    ['dynamodb:table', 'dynamodb', 'table', '/'],
    ['ec2:instance', 'ec2', 'instance', '/'],
    ['ec2:volume', 'ec2', 'volume', '/'],
    ['ecs:service', 'ecs', 'service', '/'],
    ['elasticache:cluster', 'elasticache', 'cluster', ':'],
    ['memorydb:cluster', 'memorydb', 'cluster', '/'],
    ['opensearch:domain', 'es', 'domain', '/'],
    ['rds:cluster-storage', 'rds', 'cluster', ':'],
    ['rds:db', 'rds', 'db', ':'],
    ['rds:db-storage', 'rds', 'db', ':'],
    ['redshift:cluster', 'redshift', 'cluster', ':'],
  ])('requires the documented resource separator for %s', (resourceType, service, kind, separator) => {
    const resourceId = resourceType === 'ecs:service' ? 'cluster/example' : 'example';
    const prefix = `arn:aws:${service}:eu-west-1:111111111111:${kind}`;
    const valid = `${prefix}${separator}${resourceId}`;
    const malformed = `${prefix}${separator === '/' ? ':' : '/'}${resourceId}`;
    expect(canonicalizeAwsResourceId(resourceType, valid)).toBe(resourceId);
    expect(canonicalizeAwsResourceId(resourceType, malformed)).toBe(malformed);
    expect(getRecommendationIdentity('aws', { ...scopeMatch, resourceType, resourceId: malformed })).not.toEqual(
      getRecommendationIdentity('aws', { ...scopeMatch, resourceType, resourceId }),
    );
  });
  it.each([
    [
      'eks:nodegroup',
      'arn:aws:eks:us-east-1:111111111111:nodegroup/cluster/name/id',
      'arn:aws:eks:us-east-1:111111111111:nodegroup/cluster/name/id',
    ],
    [
      'lambda:function',
      'arn:aws:lambda:us-east-1:111111111111:function:my-function',
      'arn:aws:lambda:us-east-1:111111111111:function:my-function',
    ],
  ])('canonicalizes %s ARN %s to %s', (resourceType, arn, expected) => {
    expect(canonicalizeAwsResourceId(resourceType, arn)).toBe(expected);
  });

  it('leaves a non-ARN identifier unchanged', () => {
    expect(canonicalizeAwsResourceId('ec2:volume', 'vol-1')).toBe('vol-1');
  });

  it('leaves a mismatched-service ARN unchanged', () => {
    const arn = 'arn:aws:s3:::bucket-name';
    expect(canonicalizeAwsResourceId('ec2:volume', arn)).toBe(arn);
  });
});

describe('cluster-scoped identities', () => {
  it('keeps EKS nodegroups with the same name in different clusters distinct', () => {
    const clusterA = createRecommendationMatch(
      'aws',
      {
        accountId: '111111111111',
        actionType: 'MigrateToGraviton',
        region: 'us-east-1',
        resourceId: 'arn:aws:eks:us-east-1:111111111111:nodegroup/cluster-a/workers/id-a',
        resourceType: 'eks:nodegroup',
      },
      { source: 'cloudburn' },
    );
    const clusterB = createRecommendationMatch(
      'aws',
      {
        accountId: '111111111111',
        actionType: 'MigrateToGraviton',
        region: 'us-east-1',
        resourceId: 'arn:aws:eks:us-east-1:111111111111:nodegroup/cluster-b/workers/id-b',
        resourceType: 'eks:nodegroup',
      },
      { source: 'cloudburn' },
    );
    expect(clusterA.recommendation?.resourceKey).not.toBe(clusterB.recommendation?.resourceKey);
    expect(clusterA.recommendation?.opportunityId).not.toBe(clusterB.recommendation?.opportunityId);
    expect(clusterA.recommendation?.resourceKey).toContain('cluster-a/workers/id-a');
    expect(deduplicateRecommendationMatches([clusterA, clusterB])).toHaveLength(2);
  });

  it('requires cluster scope for ECS service opportunities', () => {
    const match = {
      accountId: '111111111111',
      region: 'us-east-1',
      resourceType: 'ecs:service',
      actionType: 'Stop',
    };
    expect(getRecommendationIdentity('aws', { ...match, resourceId: 'api' })).toBeUndefined();
    expect(
      getRecommendationIdentity('aws', {
        ...match,
        resourceId: 'arn:aws:ecs:us-east-1:111111111111:service/api',
      }),
    ).toBeUndefined();
    expect(getRecommendationIdentity('aws', { ...match, resourceId: 'blue/api' })?.resourceKey).toContain('blue/api');
  });

  it('retains the ECS container-instance cluster path in identity', () => {
    const identity = getRecommendationIdentity('aws', {
      accountId: '111111111111',
      actionType: 'MigrateToGraviton',
      region: 'us-east-1',
      resourceId: 'arn:aws:ecs:us-east-1:111111111111:container-instance/cluster-a/name',
      resourceType: 'ecs:container-instance',
    });
    expect(identity?.resourceKey).toBe(
      '["resource",1,"aws","111111111111","us-east-1","ecs:container-instance","arn:aws:ecs:us-east-1:111111111111:container-instance/cluster-a/name"]',
    );
  });
});

describe('deduplicateRecommendationMatches', () => {
  const hubMatch = (overrides: Partial<FindingMatch> & { sourceId?: string; refreshedAt?: string }): FindingMatch => {
    const { sourceId, refreshedAt, ...rest } = overrides;
    const action = rest.actionType ?? 'Delete';
    const resourceId = rest.resourceId ?? 'vol-1';
    return {
      ...createFindingMatch('vol-1', 'eu-west-1', '111111111111'),
      resourceType: 'ec2:volume',
      ...rest,
      actionType: action,
      recommendation: {
        source: 'aws-cost-optimization-hub',
        sourceDetail: 'CostExplorer',
        ...(sourceId ? { sourceId } : {}),
        ...(refreshedAt ? { refreshedAt } : {}),
        resourceKey: `["resource",1,"aws","111111111111","eu-west-1","ec2:volume","${resourceId}"]`,
        opportunityId: `["opportunity",1,"aws","111111111111","eu-west-1","ec2:volume","${resourceId}","${action}"]`,
      },
    };
  };

  it('selects the freshest duplicate deterministically regardless of input order', () => {
    const older = hubMatch({ sourceId: 'rec-a', refreshedAt: '2026-04-01T00:00:00.000Z' });
    const newer = hubMatch({ sourceId: 'rec-b', refreshedAt: '2026-04-20T00:00:00.000Z' });
    expect(deduplicateRecommendationMatches([older, newer])).toEqual([newer]);
    expect(deduplicateRecommendationMatches([newer, older])).toEqual([newer]);
  });

  it('keeps matches with different actions on the same resource', () => {
    const deleteMatch = hubMatch({ sourceId: 'rec-a' });
    const upgradeMatch = hubMatch({ sourceId: 'rec-a', actionType: 'Upgrade' });
    expect(deduplicateRecommendationMatches([deleteMatch, upgradeMatch])).toHaveLength(2);
  });

  it('keeps matches without identity even when source IDs are missing', () => {
    const a: FindingMatch = {
      ...createFindingMatch('vol-1', 'eu-west-1', '111111111111'),
      resourceType: 'ec2:volume',
      actionType: 'Delete',
      recommendation: { source: 'aws-cost-optimization-hub', sourceDetail: 'CostExplorer' },
    };
    const b: FindingMatch = {
      ...a,
      resourceId: 'vol-2',
    };
    expect(deduplicateRecommendationMatches([a, b])).toHaveLength(2);
  });

  it.each(['sourceId', 'sourceDetail'] as const)(
    'breaks Unicode collation ties in %s independently of input order',
    (field) => {
      const composed = createRecommendationMatch('aws', scopeMatch, { source: 'custom', [field]: '\u00e9' });
      const decomposed = createRecommendationMatch('aws', scopeMatch, { source: 'custom', [field]: 'e\u0301' });
      expect(compareRecommendationMatches(composed, decomposed)).toBeGreaterThan(0);
      expect(deduplicateRecommendationMatches([composed, decomposed])).toEqual([decomposed]);
      expect(deduplicateRecommendationMatches([decomposed, composed])).toEqual([decomposed]);
    },
  );

  it('breaks canonical-content Unicode collation ties independently of input order', () => {
    const scope = { ...scopeMatch, resourceType: 'test:resource' };
    const composed = createRecommendationMatch('aws', { ...scope, resourceId: '\u00e9' }, { source: 'custom' });
    const decomposed = createRecommendationMatch('aws', { ...scope, resourceId: 'e\u0301' }, { source: 'custom' });
    expect(compareRecommendationMatches(composed, decomposed)).toBeGreaterThan(0);
    expect(deduplicateRecommendationMatches([composed, decomposed])).toEqual([decomposed, composed]);
    expect(deduplicateRecommendationMatches([decomposed, composed])).toEqual([decomposed, composed]);
  });

  it.each([false, true])('serializes each retained match once per deduplication with identity=%s', (withIdentity) => {
    const matches = Array.from({ length: 16 }, (_, index): FindingMatch => {
      const item = { ...scopeMatch, resourceId: `vol-${(index * 7) % 16}` };
      return withIdentity ? createRecommendationMatch('aws', item, { source: 'cloudburn' }) : item;
    });
    const roots = new Set(matches);
    const originalKeys = Object.keys;
    let serializations = 0;
    const spy = vi.spyOn(Object, 'keys').mockImplementation((value) => {
      if (roots.has(value as FindingMatch)) serializations += 1;
      return originalKeys(value);
    });
    let result: FindingMatch[];
    try {
      result = deduplicateRecommendationMatches(matches);
    } finally {
      spy.mockRestore();
    }
    expect(result).toHaveLength(16);
    expect(serializations).toBe(16);
    expect(deduplicateRecommendationMatches([...matches].reverse())).toEqual(result);
  });

  it('creates fresh ordering after match evidence changes', () => {
    const left: FindingMatch = { ...scopeMatch, location: { path: 'main.tf', line: 1, column: 1 } };
    const right: FindingMatch = { ...scopeMatch, location: { path: 'main.tf', line: 2, column: 1 } };
    expect(createRecommendationComparator()(left, right)).toBeLessThan(0);
    expect(deduplicateRecommendationMatches([right, left])[0]).toBe(left);
    left.location = { path: 'main.tf', line: 3, column: 1 };
    expect(compareRecommendationMatches(left, right)).toBeGreaterThan(0);
    expect(createRecommendationComparator()(left, right)).toBeGreaterThan(0);
    expect(deduplicateRecommendationMatches([left, right])[0]).toBe(right);
  });
});
