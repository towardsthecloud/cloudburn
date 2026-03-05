import { describe, expect, it } from 'vitest';
import { awsRules } from '../src/index.js';

describe('rule metadata', () => {
  it('ensures every aws rule has mandatory metadata fields', () => {
    for (const rule of awsRules) {
      expect(rule.id.length).toBeGreaterThan(0);
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.supports.length).toBeGreaterThan(0);
    }
  });
});
