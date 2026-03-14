import { describe, expect, it } from 'vitest';
import { buildRuleRegistry } from '../src/engine/registry.js';

describe('rule registry', () => {
  it('returns only iac-capable rules for static scans by default', () => {
    const registry = buildRuleRegistry({ discovery: {}, iac: {} }, 'iac');

    expect(registry.activeRules.map((rule) => rule.id)).toContain('CLDBRN-AWS-EC2-2');
  });

  it('excludes iac-only rules from discovery scans', () => {
    const registry = buildRuleRegistry({ discovery: {}, iac: {} }, 'discovery');

    expect(registry.activeRules.map((rule) => rule.id)).not.toContain('CLDBRN-AWS-EC2-2');
  });

  it('applies enabled and disabled rule filters for the requested mode', () => {
    const registry = buildRuleRegistry(
      {
        discovery: {},
        iac: {
          disabledRules: ['CLDBRN-AWS-EBS-1'],
          enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-EC2-1'],
        },
      },
      'iac',
    );

    expect(registry.activeRules.map((rule) => rule.id)).toEqual(['CLDBRN-AWS-EC2-1']);
  });

  it('filters active rules by configured services before applying enabled and disabled rule lists', () => {
    const registry = buildRuleRegistry(
      {
        discovery: {},
        iac: {
          disabledRules: ['CLDBRN-AWS-EBS-1'],
          enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-EC2-1', 'CLDBRN-AWS-S3-1'],
          services: ['ec2', 'ebs'],
        },
      },
      'iac',
    );

    expect(registry.activeRules.map((rule) => rule.id)).toEqual(['CLDBRN-AWS-EC2-1']);
  });
});
