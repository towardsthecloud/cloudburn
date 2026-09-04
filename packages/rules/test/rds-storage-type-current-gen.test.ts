import { describe, expect, it } from 'vitest';
import { rdsStorageTypeCurrentGenRule } from '../src/aws/rds/storage-type-current-gen.js';
import type { AwsRdsInstance, AwsStaticRdsInstance } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const RULE_MESSAGE = 'RDS DB instances should use current-generation gp3 storage.';

const createInstance = (overrides: Partial<AwsRdsInstance> = {}): AwsRdsInstance => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'orders',
  dbInstanceStatus: 'available',
  engine: 'postgres',
  engineVersion: '16.3',
  instanceClass: 'db.m6g.large',
  region: 'us-east-1',
  storageType: 'gp2',
  ...overrides,
});

const createStaticInstance = (overrides: Partial<AwsStaticRdsInstance> = {}): AwsStaticRdsInstance => ({
  engine: 'postgres',
  engineVersion: '16.3',
  instanceClass: 'db.m6g.large',
  location: {
    path: 'main.tf',
    line: 1,
    column: 1,
  },
  resourceId: 'aws_db_instance.orders',
  storageType: 'gp2',
  ...overrides,
});

describe('rdsStorageTypeCurrentGenRule', () => {
  it('flags live DB instances on gp2 storage', () => {
    const finding = rdsStorageTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance()],
      }),
    });

    expect(rdsStorageTypeCurrentGenRule.discoveryDependencies).toEqual(['aws-rds-instances']);
    expect(rdsStorageTypeCurrentGenRule.staticDependencies).toEqual(['aws-rds-instances']);
    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-11',
      service: 'rds',
      severity: 'medium',
      source: 'discovery',
      message: RULE_MESSAGE,
      findings: [
        {
          resourceId: 'orders',
          region: 'us-east-1',
          accountId: '123456789012',
          resourceType: 'rds:db-storage',
        },
      ],
    });
  });

  it('flags live DB instances on magnetic storage', () => {
    const finding = rdsStorageTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ storageType: 'standard' })],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-11',
      service: 'rds',
      severity: 'medium',
      source: 'discovery',
      message: RULE_MESSAGE,
      findings: [
        {
          resourceId: 'orders',
          region: 'us-east-1',
          accountId: '123456789012',
          resourceType: 'rds:db-storage',
        },
      ],
    });
  });

  it('passes live DB instances already on gp3 storage', () => {
    const finding = rdsStorageTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ storageType: 'gp3' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('passes live DB instances on provisioned IOPS storage', () => {
    const finding = rdsStorageTypeCurrentGenRule.evaluateLive?.({
      catalog: {
        resources: [],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createInstance({ storageType: 'io1' })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('flags Terraform DB instances on gp2 storage', () => {
    const finding = rdsStorageTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-11',
      service: 'rds',
      severity: 'medium',
      source: 'iac',
      message: RULE_MESSAGE,
      findings: [
        {
          resourceId: 'aws_db_instance.orders',
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
        },
      ],
    });
  });

  it('flags CloudFormation DB instances on gp2 storage', () => {
    const finding = rdsStorageTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [
          createStaticInstance({
            location: {
              path: 'template.yaml',
              line: 4,
              column: 3,
            },
            resourceId: 'OrdersDatabase',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-11',
      service: 'rds',
      severity: 'medium',
      source: 'iac',
      message: RULE_MESSAGE,
      findings: [
        {
          resourceId: 'OrdersDatabase',
          location: {
            path: 'template.yaml',
            line: 4,
            column: 3,
          },
        },
      ],
    });
  });

  it('skips static DB instances built without a storage type so existing consumer fixtures stay valid', () => {
    const withoutStorageType: AwsStaticRdsInstance = {
      engine: 'postgres',
      engineVersion: '16.3',
      instanceClass: 'db.m6g.large',
      resourceId: 'aws_db_instance.legacy',
    };

    const finding = rdsStorageTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [withoutStorageType],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips static DB instances that leave the storage type unresolved', () => {
    const finding = rdsStorageTypeCurrentGenRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticInstance({ storageType: null })],
      }),
    });

    expect(finding).toBeNull();
  });
});
