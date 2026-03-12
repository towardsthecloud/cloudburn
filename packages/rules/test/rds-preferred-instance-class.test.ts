import { describe, expect, it } from 'vitest';
import { rdsPreferredInstanceClassRule } from '../src/aws/rds/preferred-instance-classes.js';
import type { AwsStaticRdsInstance } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createStaticRdsInstance = (overrides: Partial<AwsStaticRdsInstance> = {}): AwsStaticRdsInstance => ({
  instanceClass: 'db.m6i.large',
  location: {
    path: 'main.tf',
    startLine: 6,
    startColumn: 3,
  },
  resourceId: 'aws_db_instance.legacy',
  ...overrides,
});

describe('rdsPreferredInstanceClassRule', () => {
  it('declares static IaC metadata for RDS DB instances', () => {
    expect(rdsPreferredInstanceClassRule.supports).toEqual(['iac']);
    expect(rdsPreferredInstanceClassRule.staticDependencies).toEqual(['aws-rds-instances']);
    expect(rdsPreferredInstanceClassRule.evaluateLive).toBeUndefined();
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
            startLine: 6,
            startColumn: 3,
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
              startLine: 8,
              startColumn: 7,
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
            startLine: 8,
            startColumn: 7,
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
