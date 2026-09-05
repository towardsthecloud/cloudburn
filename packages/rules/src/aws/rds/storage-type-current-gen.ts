import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-RDS-11';
const RULE_SERVICE = 'rds';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'RDS DB instances should use current-generation gp3 storage.';

// Provisioned IOPS types are excluded: gp3 caps below their attainable IOPS on
// several instance classes, so the substitution is not universally cheaper.
const PREVIOUS_GENERATION_RDS_STORAGE_TYPES = new Set(['gp2', 'standard']);

const isPreviousGenerationRdsStorageType = (storageType: string | null | undefined): boolean =>
  storageType !== null &&
  storageType !== undefined &&
  PREVIOUS_GENERATION_RDS_STORAGE_TYPES.has(storageType.toLowerCase());

/** Flag RDS DB instances that still use previous-generation general purpose or magnetic storage. */
export const rdsStorageTypeCurrentGenRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'RDS DB Instance Storage Type Not Current Generation',
  description:
    'Flag RDS DB instances on gp2 or magnetic storage, where gp3 costs less per GB and provisions IOPS independently.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery', 'iac'],
  supersedesRuleIds: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-5'],
  discoveryDependencies: ['aws-rds-instances'],
  staticDependencies: ['aws-rds-instances'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-rds-instances')
      .filter((instance) => isPreviousGenerationRdsStorageType(instance.storageType))
      .map((instance) => ({
        ...createFindingMatch(instance.dbInstanceIdentifier, instance.region, instance.accountId),
        resourceType: 'rds:db-storage',
      }));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-rds-instances')
      .filter((instance) => isPreviousGenerationRdsStorageType(instance.storageType))
      .map((instance) => createFindingMatch(instance.resourceId, undefined, undefined, instance.location));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'iac',
      findings,
    );
  },
});
