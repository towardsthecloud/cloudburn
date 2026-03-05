import { describe, expect, it } from 'vitest';
import { awsCorePreset, awsRules, azureRules, gcpRules } from '../src/index.js';

describe('rule exports', () => {
  it('exports non-empty AWS rules and preset IDs', () => {
    expect(awsRules.length).toBeGreaterThan(0);
    expect(awsCorePreset.ruleIds.length).toBe(awsRules.length);
  });

  it('exports placeholder multi-cloud arrays', () => {
    expect(azureRules).toEqual([]);
    expect(gcpRules).toEqual([]);
  });
});
