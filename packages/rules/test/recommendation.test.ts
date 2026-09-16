import { describe, expect, it } from 'vitest';
import {
  canonicalizeAwsResourceId,
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

describe('getRecommendationIdentity', () => {
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

  it('canonicalizes ARN resource IDs within a recognized namespace', () => {
    const arn = 'arn:aws:ec2:eu-west-1:111111111111:volume/vol-1';
    const local = getRecommendationIdentity('aws', scopeMatch);
    const fromArn = getRecommendationIdentity('aws', { ...scopeMatch, resourceId: arn });
    expect(fromArn).toEqual(local);
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

  it('keeps the raw identifier when the ARN is malformed or mismatched', () => {
    const malformed = getRecommendationIdentity('aws', { ...scopeMatch, resourceId: 'arn:garbage' });
    expect(malformed?.resourceKey).toBe('["resource",1,"aws","111111111111","eu-west-1","ec2:volume","arn:garbage"]');
    const mismatched = getRecommendationIdentity('aws', {
      ...scopeMatch,
      resourceId: 'arn:aws:rds:eu-west-1:111111111111:db:vol-1',
    });
    expect(mismatched?.resourceKey).toContain('arn:aws:rds');
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

  it('keeps provenance without identity when scope is incomplete', () => {
    const match = createFindingMatch('vol-1', 'eu-west-1', '111111111111');
    const result = createRecommendationMatch('aws', match, { source: 'cloudburn' });
    expect(result.recommendation).toEqual({ source: 'cloudburn' });
    expect(result.recommendation?.resourceKey).toBeUndefined();
  });
});

describe('canonicalizeAwsResourceId', () => {
  it.each([
    ['ec2:instance', 'arn:aws:ec2:us-east-1:111111111111:instance/i-abc', 'i-abc'],
    ['ec2:volume', 'arn:aws:ec2:us-east-1:111111111111:volume/vol-abc', 'vol-abc'],
    ['rds:db', 'arn:aws:rds:us-east-1:111111111111:db:my-db', 'my-db'],
    ['rds:db-storage', 'arn:aws:rds:us-east-1:111111111111:db:my-db', 'my-db'],
    ['rds:cluster-storage', 'arn:aws:rds:us-east-1:111111111111:cluster:my-cluster', 'my-cluster'],
    [
      'autoscaling:autoScalingGroup',
      'arn:aws:autoscaling:us-east-1:111111111111:autoScalingGroup:uuid:autoScalingGroupName/my-asg',
      'my-asg',
    ],
    ['ecs:service', 'arn:aws:ecs:us-east-1:111111111111:service/cluster/name', 'cluster/name'],
    [
      'ecs:container-instance',
      'arn:aws:ecs:us-east-1:111111111111:container-instance/cluster/name',
      'arn:aws:ecs:us-east-1:111111111111:container-instance/cluster/name',
    ],
    [
      'eks:nodegroup',
      'arn:aws:eks:us-east-1:111111111111:nodegroup/cluster/name/id',
      'arn:aws:eks:us-east-1:111111111111:nodegroup/cluster/name/id',
    ],
    ['elasticache:cluster', 'arn:aws:elasticache:us-east-1:111111111111:cluster:my-cache', 'my-cache'],
    ['memorydb:cluster', 'arn:aws:memorydb:us-east-1:111111111111:cluster/my-cache', 'my-cache'],
    ['opensearch:domain', 'arn:aws:es:us-east-1:111111111111:domain/my-domain', 'my-domain'],
    ['dynamodb:table', 'arn:aws:dynamodb:us-east-1:111111111111:table/my-table', 'my-table'],
    ['redshift:cluster', 'arn:aws:redshift:us-east-1:111111111111:cluster:my-cluster', 'my-cluster'],
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
});
