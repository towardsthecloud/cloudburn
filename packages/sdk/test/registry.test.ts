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

  it('excludes Cost Optimization Hub rules from discovery scans by default', () => {
    const registry = buildRuleRegistry({ discovery: {}, iac: {} }, 'discovery');

    expect(registry.activeRules.map((rule) => rule.id)).not.toContain('CLDBRN-AWS-COSTOPTIMIZATIONHUB-1');
    expect(registry.activeRules.map((rule) => rule.id)).not.toContain('CLDBRN-AWS-COSTOPTIMIZATIONHUB-2');
    expect(registry.activeRules.map((rule) => rule.id)).not.toContain('CLDBRN-AWS-COSTOPTIMIZATIONHUB-3');
    expect(registry.activeRules.map((rule) => rule.id)).not.toContain('CLDBRN-AWS-COSTOPTIMIZATIONHUB-6');
  });

  it('includes Cost Optimization Hub rules when they are explicitly enabled', () => {
    const registry = buildRuleRegistry(
      {
        discovery: {
          enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1'],
        },
        iac: {},
      },
      'discovery',
    );

    expect(registry.activeRules.map((rule) => rule.id)).toEqual(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-1']);
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
