import { describe, expect, it, vi } from 'vitest';
import { awsRules, LiveResourceBag, StaticResourceBag } from '../src/index.js';

const RULE_ID_PATTERN = /^CLDBRN-([A-Z0-9]+)-([A-Z0-9]+)-(\d+)$/;

describe('rule metadata', () => {
  it('assigns a supported severity to every built-in rule', () => {
    for (const rule of awsRules) {
      expect(['high', 'medium', 'low'], rule.id).toContain(rule.severity);
    }
  });

  it('ensures every AWS rule has complete catalog metadata', () => {
    for (const rule of awsRules) {
      for (const field of ['id', 'name', 'description', 'message', 'service'] as const) {
        expect(rule[field].trim().length, `${rule.id}.${field}`).toBeGreaterThan(0);
      }
      expect(rule.provider, rule.id).toBe('aws');
      const match = RULE_ID_PATTERN.exec(rule.id);
      expect(match?.[1], rule.id).toBe(rule.provider.toUpperCase());
      expect(match?.[2], rule.id).toBe(rule.service.toUpperCase());
    }
  });

  it('uses unique contiguous rule numbers except issue-allocated Hub slots', () => {
    const seenRuleIds = new Set<string>();
    const numbersByScope = new Map<string, number[]>();

    for (const rule of awsRules) {
      expect(seenRuleIds.has(rule.id)).toBe(false);
      seenRuleIds.add(rule.id);

      const match = RULE_ID_PATTERN.exec(rule.id);

      expect(match).not.toBeNull();

      const [, provider, service, suffix] = match ?? [];
      const scopeKey = `${provider}-${service}`;
      const ruleNumbers = numbersByScope.get(scopeKey) ?? [];

      ruleNumbers.push(Number.parseInt(suffix ?? '', 10));
      numbersByScope.set(scopeKey, ruleNumbers);
    }

    for (const ruleNumbers of numbersByScope.values()) {
      const sortedRuleNumbers = [...ruleNumbers].sort((left, right) => left - right);
      expect(sortedRuleNumbers).toEqual(Array.from({ length: sortedRuleNumbers.length }, (_, index) => index + 1));
    }
  });

  it('advertises exactly the modes with implemented evaluators', () => {
    for (const rule of awsRules) {
      expect(rule.supports.length, rule.id).toBeGreaterThan(0);
      expect(new Set(rule.supports).size, rule.id).toBe(rule.supports.length);
      expect([...rule.supports].sort(), rule.id).toEqual(
        [
          ...(typeof rule.evaluateLive === 'function' ? ['discovery'] : []),
          ...(typeof rule.evaluateStatic === 'function' ? ['iac'] : []),
        ].sort(),
      );
      if (!rule.supports.includes('discovery')) {
        expect(rule.discoveryDependencies ?? [], rule.id).toEqual([]);
        expect(rule.optionalDiscoveryDependencies ?? [], rule.id).toEqual([]);
      }
      if (!rule.supports.includes('iac')) {
        expect(rule.staticDependencies ?? [], rule.id).toEqual([]);
      }
    }
  });

  it('reports live evaluation coverage whenever a verdict depends on more than one dataset', () => {
    // Presence in a single inventory dataset is the evidence. When a verdict joins a second dataset, absent or
    // incomplete rows must be reported as unknown coverage instead of silently passing. Exempt rules justify why
    // their secondary datasets are complete inventories whose absence is itself the evidence.
    const completeInventoryJoins: Record<string, string> = {
      'CLDBRN-AWS-CLOUDWATCH-2': 'A log group without recent stream activity has no observed event history by design.',
      'CLDBRN-AWS-DYNAMODB-2': 'Application Auto Scaling targets are a complete inventory; absence means no policy.',
      'CLDBRN-AWS-EBS-3': 'EC2 instances are a complete inventory joined by attachment identity.',
      'CLDBRN-AWS-ECS-3': 'Application Auto Scaling targets are a complete inventory; absence means no policy.',
      'CLDBRN-AWS-ELASTICACHE-1': 'Reserved nodes are a complete inventory; absence means no reservation.',
      'CLDBRN-AWS-ELB-1': 'Target groups are a complete inventory joined by load balancer ARN.',
      'CLDBRN-AWS-ELB-3': 'Target groups are a complete inventory joined by load balancer ARN.',
      'CLDBRN-AWS-ELB-4': 'Target groups are a complete inventory joined by load balancer ARN.',
      'CLDBRN-AWS-RDS-3': 'Reserved DB instances are a complete inventory; absence means no reservation.',
      'CLDBRN-AWS-RDS-7': 'DB instances are a complete inventory joined by snapshot source identity.',
      'CLDBRN-AWS-REDSHIFT-2': 'Reserved nodes are a complete inventory; absence means no reservation.',
      'CLDBRN-AWS-ROUTE53-1': 'Record sets are a complete inventory per hosted zone.',
      'CLDBRN-AWS-ROUTE53-2': 'Record sets are a complete inventory joined by health check ID.',
      'CLDBRN-AWS-SAGEMAKER-3':
        'Unavailable Cost Explorer coverage makes the rule not applicable; Hub recommendations only suppress findings.',
    };

    for (const rule of awsRules) {
      if (!rule.evaluateLive) continue;
      const joinsEvidence =
        (rule.discoveryDependencies?.length ?? 0) > 1 || (rule.optionalDiscoveryDependencies?.length ?? 0) > 0;
      const exemption = completeInventoryJoins[rule.id];
      if (exemption) {
        expect(joinsEvidence, `${rule.id} no longer joins datasets; remove its exemption`).toBe(true);
        expect(rule.getLiveEvaluationCoverage, `${rule.id} reports coverage; remove its exemption`).toBeUndefined();
        continue;
      }
      if (joinsEvidence) {
        expect(
          rule.getLiveEvaluationCoverage,
          `${rule.id} joins datasets without getLiveEvaluationCoverage; add the hook or document an exemption`,
        ).toBeTypeOf('function');
      }
    }
  });

  it('declares exactly the datasets used by evaluators or SDK coverage', () => {
    // Empty-input lookups consume all current evaluator dependencies; fixtures cover data-dependent behavior.
    for (const rule of awsRules) {
      if (rule.evaluateLive) {
        const required = rule.discoveryDependencies ?? [];
        const optional = rule.optionalDiscoveryDependencies ?? [];
        const declared = [...required, ...optional];
        expect(required.length, rule.id).toBeGreaterThan(0);
        expect(new Set(declared).size, rule.id).toBe(declared.length);
        const resources = new LiveResourceBag();
        const get = vi.spyOn(resources, 'get');

        rule.evaluateLive({
          catalog: { resources: [], searchRegion: 'us-east-1', indexType: 'LOCAL' },
          resources,
        });
        rule.getLiveEvaluationCoverage?.({
          catalog: { resources: [], searchRegion: 'us-east-1', indexType: 'LOCAL' },
          resources,
        });

        expect(get.mock.calls.length, rule.id).toBeGreaterThan(0);
        // The SDK uses Lambda inventory to report evaluation coverage, even though this evaluator reads only recommendations.
        const coverageOnly = rule.id === 'CLDBRN-AWS-LAMBDA-4' ? ['aws-lambda-functions'] : [];
        expect(new Set([...get.mock.calls.map(([key]) => key), ...coverageOnly]), rule.id).toEqual(new Set(declared));
      }
      if (rule.evaluateStatic) {
        const declared = rule.staticDependencies ?? [];
        expect(declared.length, rule.id).toBeGreaterThan(0);
        expect(new Set(declared).size, rule.id).toBe(declared.length);
        const resources = new StaticResourceBag();
        const get = vi.spyOn(resources, 'get');

        rule.evaluateStatic({ resources });

        expect(get.mock.calls.length, rule.id).toBeGreaterThan(0);
        expect(new Set(get.mock.calls.map(([key]) => key)), rule.id).toEqual(new Set(declared));
      }
    }
  });

  it('lets native reservation coverage supersede matching Hub purchase findings', () => {
    for (const ruleId of ['CLDBRN-AWS-ELASTICACHE-1', 'CLDBRN-AWS-RDS-3', 'CLDBRN-AWS-REDSHIFT-2']) {
      const rule = awsRules.find((candidate) => candidate.id === ruleId);
      expect(rule?.supersedesRuleIds, ruleId).toEqual(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-2']);
    }
    for (const rule of awsRules) {
      for (const target of rule.supersedesRuleIds ?? []) {
        expect(target, rule.id).not.toBe(rule.id);
        expect(
          awsRules.some((candidate) => candidate.id === target),
          `${rule.id} supersedes ${target}`,
        ).toBe(true);
      }
    }
  });

  it('uses SageMaker purchase recommendations opportunistically without requiring Hub setup', () => {
    expect(awsRules.filter((rule) => rule.optionalDiscoveryDependencies?.length).map((rule) => rule.id)).toEqual([
      'CLDBRN-AWS-SAGEMAKER-3',
    ]);
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-SAGEMAKER-3');
    expect(rule?.discoveryDependencies).toEqual(['aws-sagemaker-savings-plans-coverage']);
    expect(rule?.optionalDiscoveryDependencies).toEqual(['aws-cost-optimization-hub-savings-plans-recommendations']);
  });

  it('requires Lambda inventory alongside Compute Optimizer memory recommendations', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-LAMBDA-4');
    expect(rule?.discoveryDependencies).toEqual(['aws-lambda-functions', 'aws-lambda-memory-recommendations']);
  });
});
