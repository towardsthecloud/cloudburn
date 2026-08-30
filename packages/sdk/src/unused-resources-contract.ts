import type {
  EvaluatedResource,
  UnusedResourceFinding,
  UnusedResourcesCheckResult,
  UnusedResourcesScanResult,
} from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isOptionalTimestamp = (value: unknown): value is string | undefined =>
  value === undefined || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

const isEvaluatedResource = (value: unknown): value is EvaluatedResource =>
  isRecord(value) &&
  typeof value.resourceId === 'string' &&
  typeof value.resourceType === 'string' &&
  typeof value.region === 'string' &&
  isOptionalString(value.accountId) &&
  isOptionalString(value.arn) &&
  isOptionalString(value.name) &&
  isOptionalTimestamp(value.createdAt) &&
  isOptionalTimestamp(value.lastActivityAt) &&
  (value.tags === undefined ||
    (isRecord(value.tags) && Object.values(value.tags).every((tagValue) => typeof tagValue === 'string')));

const isRemediationCommand = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.program === 'string' &&
  Array.isArray(value.args) &&
  value.args.every((argument) => typeof argument === 'string');

const hasUnusedResourceFindingFields = (value: EvaluatedResource & Record<string, unknown>): boolean =>
  typeof value.ruleId === 'string' &&
  typeof value.ruleName === 'string' &&
  typeof value.ruleDescription === 'string' &&
  typeof value.service === 'string' &&
  typeof value.serviceName === 'string' &&
  ['low', 'medium', 'high'].includes(value.remediationEffort as string) &&
  (value.remediation === undefined ||
    (isRecord(value.remediation) &&
      (value.remediation.command === undefined || isRemediationCommand(value.remediation.command))));

/** Narrows persisted JSON to one SDK unused-resource finding. */
export const isUnusedResourceFinding = (value: unknown): value is UnusedResourceFinding =>
  isEvaluatedResource(value) && hasUnusedResourceFindingFields(value as EvaluatedResource & Record<string, unknown>);

const isUnusedResourcesCheckResult = (value: unknown): value is UnusedResourcesCheckResult =>
  isRecord(value) &&
  typeof value.ruleId === 'string' &&
  typeof value.ruleName === 'string' &&
  typeof value.ruleDescription === 'string' &&
  typeof value.service === 'string' &&
  typeof value.serviceName === 'string' &&
  ['triggered', 'passed', 'not_applicable'].includes(value.status as string) &&
  Number.isInteger(value.findingCount) &&
  (value.findingCount as number) >= 0 &&
  (value.evaluatedResourceCount === undefined ||
    (Number.isInteger(value.evaluatedResourceCount) && (value.evaluatedResourceCount as number) >= 0)) &&
  (value.resources === undefined || (Array.isArray(value.resources) && value.resources.every(isEvaluatedResource))) &&
  isOptionalString(value.reason);

const isFindingSummary = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.ruleId === 'string' &&
  typeof value.ruleName === 'string' &&
  typeof value.service === 'string' &&
  Number.isInteger(value.resourceCount) &&
  (value.resourceCount as number) >= 0;

const isServiceSummary = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.service === 'string' &&
  typeof value.serviceName === 'string' &&
  Number.isInteger(value.ruleCount) &&
  (value.ruleCount as number) >= 0 &&
  Number.isInteger(value.resourceCount) &&
  (value.resourceCount as number) >= 0;

/** Narrows persisted JSON to the SDK unused-resources summary contract. */
export const isUnusedResourcesScanSummary = (value: unknown): value is UnusedResourcesScanResult['summary'] =>
  isRecord(value) &&
  Number.isInteger(value.findingCount) &&
  (value.findingCount as number) >= 0 &&
  Number.isInteger(value.resourceCount) &&
  (value.resourceCount as number) >= 0 &&
  Number.isInteger(value.ruleCount) &&
  (value.ruleCount as number) >= 0 &&
  Array.isArray(value.checks) &&
  value.checks.every(isUnusedResourcesCheckResult) &&
  Array.isArray(value.findingsByRule) &&
  value.findingsByRule.every(isFindingSummary) &&
  Array.isArray(value.findingsByService) &&
  value.findingsByService.every(isServiceSummary);
