import { describe, expect, it } from 'vitest';
import type {
  AwsEc2Instance,
  AwsRdsInstance,
  AwsStaticRdsInstance,
  DiscoveryDatasetKey,
  StaticDatasetKey,
} from '../src/index.js';
import {
  awsCorePreset,
  awsRules,
  azureRules,
  createFindingMatch,
  createStaticFindingMatch,
  gcpRules,
  isRecord,
  LiveResourceBag,
  StaticResourceBag,
} from '../src/index.js';

describe('rule exports', () => {
  it('exports non-empty AWS rules and preset IDs', () => {
    expect(awsRules.length).toBeGreaterThan(0);
    expect(awsCorePreset.ruleIds.length).toBe(awsRules.length);
    expect(awsRules.map((rule) => rule.id)).toEqual(
      expect.arrayContaining(['CLDBRN-AWS-EC2-2', 'CLDBRN-AWS-S3-1', 'CLDBRN-AWS-S3-2']),
    );
  });

  it('exports shared helpers and dataset types used by built-in AWS rules', () => {
    expect(createFindingMatch).toBeTypeOf('function');
    expect(createStaticFindingMatch).toBeTypeOf('function');
    expect(isRecord).toBeTypeOf('function');
    expect(LiveResourceBag).toBeTypeOf('function');
    expect(StaticResourceBag).toBeTypeOf('function');

    const instance: AwsEc2Instance = {
      accountId: '123456789012',
      instanceId: 'i-1234567890abcdef0',
      instanceType: 'm8azn.large',
      region: 'us-east-1',
    };

    expect(instance.instanceType).toBe('m8azn.large');

    const rdsInstance: AwsStaticRdsInstance = {
      instanceClass: 'db.m8g.large',
      resourceId: 'aws_db_instance.current',
    };

    const liveRdsInstance: AwsRdsInstance = {
      accountId: '123456789012',
      dbInstanceIdentifier: 'legacy-db',
      instanceClass: 'db.m6i.large',
      region: 'us-east-1',
    };

    const datasetKey: DiscoveryDatasetKey = 'aws-rds-instances';
    const staticDatasetKey: StaticDatasetKey = 'aws-rds-instances';

    expect(datasetKey).toBe('aws-rds-instances');
    expect(liveRdsInstance.dbInstanceIdentifier).toBe('legacy-db');
    expect(rdsInstance.instanceClass).toBe('db.m8g.large');
    expect(staticDatasetKey).toBe('aws-rds-instances');
  });

  it('exports placeholder multi-cloud arrays', () => {
    expect(azureRules).toEqual([]);
    expect(gcpRules).toEqual([]);
  });
});
