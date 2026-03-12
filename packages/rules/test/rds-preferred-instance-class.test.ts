import { describe, expect, it } from 'vitest';
import { rdsPreferredInstanceClassRule } from '../src/aws/rds/preferred-instance-classes.js';
import type { AwsDiscoveredResource, AwsStaticRdsInstance } from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

const createDiscoveredResource = (overrides: Partial<AwsDiscoveredResource> = {}): AwsDiscoveredResource => ({
  arn: 'arn:aws:rds:us-east-1:123456789012:db:legacy-db',
  accountId: '123456789012',
  region: 'us-east-1',
  service: 'rds',
  resourceType: 'rds:db',
  properties: [],
  ...overrides,
});

const createLiveRdsInstance = (
  overrides: Partial<{
    accountId: string;
    dbInstanceIdentifier: string;
    instanceClass: string;
    region: string;
  }> = {},
) => ({
  accountId: '123456789012',
  dbInstanceIdentifier: 'legacy-db',
  instanceClass: 'db.m6i.large',
  region: 'us-east-1',
  ...overrides,
});

const createStaticRdsInstance = (overrides: Partial<AwsStaticRdsInstance> = {}): AwsStaticRdsInstance => ({
  instanceClass: 'db.m6i.large',
  location: {
    path: 'main.tf',
    line: 6,
    column: 3,
  },
  resourceId: 'aws_db_instance.legacy',
  ...overrides,
});

describe('rdsPreferredInstanceClassRule', () => {
  it('flags non-preferred RDS DB instances in discovery mode', () => {
    const finding = rdsPreferredInstanceClassRule.evaluateLive?.({
      catalog: {
        resources: [createDiscoveredResource()],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
      resources: new LiveResourceBag({
        'aws-rds-instances': [createLiveRdsInstance()],
      } as never),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-1',
      service: 'rds',
      source: 'discovery',
      message: 'RDS DB instances should use preferred instance classes.',
      findings: [
        {
          resourceId: 'legacy-db',
          region: 'us-east-1',
          accountId: '123456789012',
        },
      ],
    });
  });

  it('declares static and live metadata for RDS DB instances', () => {
    expect(rdsPreferredInstanceClassRule.supports).toEqual(['iac', 'discovery']);
    expect(rdsPreferredInstanceClassRule.discoveryDependencies).toEqual(['aws-rds-instances']);
    expect(rdsPreferredInstanceClassRule.staticDependencies).toEqual(['aws-rds-instances']);
    expect(rdsPreferredInstanceClassRule.evaluateLive).toBeTypeOf('function');
  });

  it('flags non-preferred Terraform aws_db_instance resources', () => {
    const finding = rdsPreferredInstanceClassRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [createStaticRdsInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-1',
      service: 'rds',
      source: 'iac',
      message: 'RDS DB instances should use preferred instance classes.',
      findings: [
        {
          resourceId: 'aws_db_instance.legacy',
          location: {
            path: 'main.tf',
            line: 6,
            column: 3,
          },
        },
      ],
    });
  });

  it('flags non-preferred CloudFormation AWS::RDS::DBInstance resources', () => {
    const finding = rdsPreferredInstanceClassRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [
          createStaticRdsInstance({
            instanceClass: 'db.r6g.large',
            location: {
              path: 'template.yaml',
              line: 8,
              column: 7,
            },
            resourceId: 'LegacyDatabase',
          }),
        ],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-RDS-1',
      service: 'rds',
      source: 'iac',
      message: 'RDS DB instances should use preferred instance classes.',
      findings: [
        {
          resourceId: 'LegacyDatabase',
          location: {
            path: 'template.yaml',
            line: 8,
            column: 7,
          },
        },
      ],
    });
  });

  it('skips preferred RDS classes, including Oracle-style suffix variants', () => {
    const finding = rdsPreferredInstanceClassRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [
          createStaticRdsInstance({
            instanceClass: 'db.m8g.large',
            resourceId: 'aws_db_instance.current_general',
          }),
          createStaticRdsInstance({
            instanceClass: 'db.r8gd.2xlarge',
            resourceId: 'aws_db_instance.current_memory',
          }),
          createStaticRdsInstance({
            instanceClass: 'db.t4g.medium',
            resourceId: 'aws_db_instance.current_burstable',
          }),
          createStaticRdsInstance({
            instanceClass: 'db.r7i.4xlarge.tpc2.mem4x',
            resourceId: 'aws_db_instance.oracle',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips computed and intrinsic RDS instance classes', () => {
    const finding = rdsPreferredInstanceClassRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [
          createStaticRdsInstance({
            instanceClass: null,
          }),
          createStaticRdsInstance({
            instanceClass: null,
            resourceId: 'LegacyDatabase',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips unclassified RDS instance families', () => {
    const finding = rdsPreferredInstanceClassRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-rds-instances': [
          createStaticRdsInstance({
            instanceClass: 'db.x2g.4xlarge',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
