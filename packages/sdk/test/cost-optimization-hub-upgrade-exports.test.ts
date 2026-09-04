import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type {
  AwsCostOptimizationHubAutoScalingUpgradeConfiguration,
  AwsCostOptimizationHubEbsUpgradeConfiguration,
  AwsCostOptimizationHubEc2UpgradeConfiguration,
  AwsCostOptimizationHubRdsStorageUpgradeConfiguration,
  AwsCostOptimizationHubRdsUpgradeConfiguration,
  AwsCostOptimizationHubUpgradeRecommendation,
} from '../src/index.js';

describe('public upgrade configuration contracts', () => {
  it('exports typed configurations from the SDK entry point and type module', () => {
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
  }, 15_000);
});
