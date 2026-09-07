import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type {
  AwsConfigRecordingFrequencyReview,
  AwsCostOptimizationHubAutoScalingUpgradeConfiguration,
  AwsCostOptimizationHubEbsUpgradeConfiguration,
  AwsCostOptimizationHubEc2UpgradeConfiguration,
  AwsCostOptimizationHubRdsStorageUpgradeConfiguration,
  AwsCostOptimizationHubRdsUpgradeConfiguration,
  AwsCostOptimizationHubUpgradeRecommendation,
  LiveEvaluationCoverage,
  RuleEvaluation,
} from '../src/index.js';

describe('public SDK contracts', () => {
  it('exports compiler-checked upgrade configurations, evaluation coverage and Config evidence', () => {
    const configPath = fileURLToPath(new URL('../../../tsconfig.base.json', import.meta.url));
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      fileURLToPath(new URL('../../../', import.meta.url)),
    );
    const program = ts.createProgram([fileURLToPath(import.meta.url)], { ...parsed.options, noEmit: true });
    expect(
      ts
        .getPreEmitDiagnostics(program, program.getSourceFile(fileURLToPath(import.meta.url)))
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    ).toEqual([]);
    const shapes: [
      AwsCostOptimizationHubEc2UpgradeConfiguration,
      AwsCostOptimizationHubAutoScalingUpgradeConfiguration,
      AwsCostOptimizationHubEbsUpgradeConfiguration,
      AwsCostOptimizationHubRdsUpgradeConfiguration,
      AwsCostOptimizationHubRdsStorageUpgradeConfiguration,
    ] = [
      { instance: { type: 'm7i.large' } },
      { type: 'MixedInstanceTypes', mixedInstances: [{ type: 'm7i.large' }], allocationStrategy: 'Prioritized' },
      { storage: { type: 'gp3', sizeInGb: 100 } },
      { instance: { dbInstanceClass: 'db.m6i.large' } },
      { storageType: 'gp3', allocatedStorageInGb: 100 },
    ];
    const type: AwsCostOptimizationHubUpgradeRecommendation['actionType'] = 'Upgrade';
    expect(type).toBe('Upgrade');
    expect(shapes).toHaveLength(5);

    const coverage: LiveEvaluationCoverage = { assessed: [], unknown: [{ resourceId: 'function' }] };
    const evaluation: Pick<RuleEvaluation, 'status' | 'coverage'> = { coverage, status: 'unknown' };
    const evidence: Pick<
      AwsConfigRecordingFrequencyReview,
      | 'configurationItemsRecorded'
      | 'estimatedMonthlyConfigurationItemReduction'
      | 'estimatedMonthlyRecordingCostReductionUsd'
    > = {
      configurationItemsRecorded: null,
      estimatedMonthlyConfigurationItemReduction: null,
      estimatedMonthlyRecordingCostReductionUsd: null,
    };
    // @ts-expect-error Unknown metric evidence must be checked before arithmetic.
    const volume: number = evidence.configurationItemsRecorded;
    // @ts-expect-error Coverage identities require a resource ID.
    const invalidCoverage: LiveEvaluationCoverage = { assessed: [{}], unknown: [] };
    void [evaluation, volume, invalidCoverage];
  }, 30_000);
});
