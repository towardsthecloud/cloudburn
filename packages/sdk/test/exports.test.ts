import { fileURLToPath } from 'node:url';
import { awsRules } from '@cloudburn/rules';
import { describe, expect, it } from 'vitest';
import { listBuiltInRuleMetadata } from '../src/built-in-rules.js';
import { builtInRuleMetadata, parseIaC, type Rule, withAwsClientCredentials } from '../src/index.js';

const createRuleFixture = (id: string): Rule => ({
  description: id,
  id,
  message: id,
  name: id,
  provider: 'aws',
  service: 'ec2',
  supports: ['iac'],
});

const RULE_ID_PATTERN = /^CLDBRN-([A-Z0-9]+)-([A-Z0-9]+)-(\d+)$/;

const toComparableRuleMetadata = (rule: Pick<Rule, 'description' | 'id' | 'provider' | 'service' | 'supports'>) => ({
  description: rule.description,
  id: rule.id,
  provider: rule.provider,
  service: rule.service,
  supports: rule.supports,
});

const sortRulesForMetadata = <TRule extends Pick<Rule, 'id' | 'provider' | 'service'>>(rules: TRule[]): TRule[] =>
  [...rules].sort((left, right) => {
    const leftMatch = RULE_ID_PATTERN.exec(left.id);
    const rightMatch = RULE_ID_PATTERN.exec(right.id);

    if (!leftMatch || !rightMatch) {
      return left.id.localeCompare(right.id);
    }

    const [, leftProvider, leftService, leftSuffix] = leftMatch;
    const [, rightProvider, rightService, rightSuffix] = rightMatch;

    return (
      leftProvider.localeCompare(rightProvider) ||
      leftService.localeCompare(rightService) ||
      Number.parseInt(leftSuffix, 10) - Number.parseInt(rightSuffix, 10)
    );
  });

describe('sdk exports', () => {
  it('preserves the array-returning autodetect parser contract at the package root', async () => {
    const resourcePath = fileURLToPath(new URL('./fixtures/terraform/ebs-gp2.tf', import.meta.url));
    const resources = await parseIaC(resourcePath);

    expect(parseIaC).toBeTypeOf('function');
    expect(Array.isArray(resources)).toBe(true);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.name).toBe('gp2_data');
  });

  it('exports the aws credential scoping helper from the package root', () => {
    expect(withAwsClientCredentials).toBeTypeOf('function');
  });

  it('exports built-in rule metadata in stable provider/service/id order', () => {
    const expected = sortRulesForMetadata(awsRules).map((rule) => toComparableRuleMetadata(rule));

    expect(builtInRuleMetadata.map((rule) => toComparableRuleMetadata(rule))).toEqual(expected);
  });

  it('sorts numeric rule suffixes in numeric order within the same service', () => {
    expect(
      listBuiltInRuleMetadata([
        createRuleFixture('CLDBRN-AWS-EC2-9'),
        createRuleFixture('CLDBRN-AWS-EC2-2'),
        createRuleFixture('CLDBRN-AWS-EC2-1'),
      ]).map((rule) => rule.id),
    ).toEqual(['CLDBRN-AWS-EC2-1', 'CLDBRN-AWS-EC2-2', 'CLDBRN-AWS-EC2-9']);
  });

  it('clones supports arrays so metadata consumers cannot mutate source rule definitions', () => {
    const sourceRule = awsRules.find((rule) => rule.id === 'CLDBRN-AWS-EBS-1');
    const metadataRule = builtInRuleMetadata.find((rule) => rule.id === 'CLDBRN-AWS-EBS-1');

    expect(sourceRule).toBeDefined();
    expect(metadataRule).toBeDefined();
    expect(metadataRule?.supports).toEqual(sourceRule?.supports);
    expect(metadataRule?.supports).not.toBe(sourceRule?.supports);
  });

  it('projects and clones rule precedence metadata', () => {
    const sourceRule = awsRules.find((rule) => rule.id === 'CLDBRN-AWS-RDS-3');
    const metadataRule = builtInRuleMetadata.find((rule) => rule.id === 'CLDBRN-AWS-RDS-3');

    expect(sourceRule?.supersedesRuleIds).toEqual(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-2']);
    expect(metadataRule?.supersedesRuleIds).toEqual(sourceRule?.supersedesRuleIds);
    expect(metadataRule?.supersedesRuleIds).not.toBe(sourceRule?.supersedesRuleIds);
  });
});
