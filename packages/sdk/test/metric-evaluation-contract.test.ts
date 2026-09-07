import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import type { AwsConfigRecordingFrequencyReview, LiveEvaluationCoverage, RuleEvaluation } from '../src/index.js';

it('exports compiler-checked unknown evaluation coverage and nullable Config evidence', () => {
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
}, 15_000);
