import { describe, expect, it } from 'vitest';
import type { AwsEc2Instance } from '../src/index.js';
import {
  awsCorePreset,
  awsRules,
  azureRules,
  createFindingMatch,
  createStaticFindingMatch,
  gcpRules,
  isRecord,
} from '../src/index.js';

describe('rule exports', () => {
  it('exports non-empty AWS rules and preset IDs', () => {
    expect(awsRules.length).toBeGreaterThan(0);
    expect(awsCorePreset.ruleIds.length).toBe(awsRules.length);
  });

  it('exports shared helpers and EC2 discovery types used by the preferred-instance rule', () => {
    expect(createFindingMatch).toBeTypeOf('function');
    expect(createStaticFindingMatch).toBeTypeOf('function');
    expect(isRecord).toBeTypeOf('function');

    const instance: AwsEc2Instance = {
      accountId: '123456789012',
      instanceId: 'i-1234567890abcdef0',
      instanceType: 'm8azn.large',
      region: 'us-east-1',
    };

    expect(instance.instanceType).toBe('m8azn.large');
  });

  it('exports placeholder multi-cloud arrays', () => {
    expect(azureRules).toEqual([]);
    expect(gcpRules).toEqual([]);
  });
});
