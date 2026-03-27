import { describe, expect, it } from 'vitest';
import { ec2DetailedMonitoringEnabledRule } from '../src/aws/ec2/detailed-monitoring-enabled.js';
import type { AwsStaticEc2Instance } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createInstance = (overrides: Partial<AwsStaticEc2Instance> = {}): AwsStaticEc2Instance => ({
  detailedMonitoringEnabled: true,
  instanceType: 'm7i.large',
  location: {
    path: 'main.tf',
    line: 2,
    column: 3,
  },
  resourceId: 'aws_instance.app',
  ...overrides,
});

describe('ec2DetailedMonitoringEnabledRule', () => {
  it('flags instances that explicitly enable detailed monitoring', () => {
    const finding = ec2DetailedMonitoringEnabledRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [createInstance()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-EC2-10',
      service: 'ec2',
      source: 'iac',
      message: 'EC2 instances should review detailed monitoring because it adds CloudWatch cost.',
      findings: [
        {
          location: {
            path: 'main.tf',
            line: 2,
            column: 3,
          },
          resourceId: 'aws_instance.app',
        },
      ],
    });
  });

  it('skips instances that do not enable detailed monitoring', () => {
    const finding = ec2DetailedMonitoringEnabledRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-ec2-instances': [createInstance({ detailedMonitoringEnabled: false })],
      }),
    });

    expect(finding).toBeNull();
  });
});
