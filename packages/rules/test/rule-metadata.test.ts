import { describe, expect, it } from 'vitest';
import { awsRules } from '../src/index.js';

describe('rule metadata', () => {
  it('ensures every aws rule has mandatory metadata fields', () => {
    for (const rule of awsRules) {
      expect(rule.id.length).toBeGreaterThan(0);
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.message.length).toBeGreaterThan(0);
      expect(rule.supports.length).toBeGreaterThan(0);

      if (rule.supports.includes('discovery') && rule.evaluateLive) {
        expect(rule.liveDiscovery).toBeDefined();
        expect(rule.liveDiscovery?.resourceTypes.length).toBeGreaterThan(0);
      }
    }
  });

  it('defines the expected EC2 preferred-instance rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-1',
      name: 'EC2 Instance Type Not Preferred',
      description: 'Flag direct EC2 instances that do not use curated preferred instance types.',
      message: 'EC2 instances should use preferred instance types.',
      provider: 'aws',
      service: 'ec2',
      supports: ['iac', 'discovery'],
      liveDiscovery: {
        hydrator: 'aws-ec2-instance',
        resourceTypes: ['ec2:instance'],
      },
    });
  });
});
