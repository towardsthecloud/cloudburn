import { awsRules } from '@cloudburn/rules';
import type {
  EvaluatedResource,
  RemediationCommand,
  RemediationEffort,
  ScanResult,
  UnusedResourceFinding,
  UnusedResourcesCheckResult,
  UnusedResourcesScanResult,
} from './types.js';

type RemediationDefinition = {
  effort: RemediationEffort;
  command?: (resource: EvaluatedResource) => RemediationCommand;
};

const awsCommand = (...args: string[]): RemediationCommand => ({ program: 'aws', args });

const unusedResourceDefinitions: Record<string, RemediationDefinition> = {
  'CLDBRN-AWS-APIGATEWAY-1': { effort: 'medium' },
  'CLDBRN-AWS-CLOUDFRONT-1': { effort: 'medium' },
  'CLDBRN-AWS-EBS-2': {
    effort: 'low',
    command: ({ resourceId, region }) =>
      awsCommand('ec2', 'delete-volume', '--volume-id', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-EBS-3': { effort: 'medium' },
  'CLDBRN-AWS-EBS-1': { effort: 'medium' },
  'CLDBRN-AWS-EBS-4': { effort: 'medium' },
  'CLDBRN-AWS-EBS-5': { effort: 'medium' },
  'CLDBRN-AWS-EBS-6': { effort: 'medium' },
  'CLDBRN-AWS-EBS-7': {
    effort: 'low',
    command: ({ resourceId, region }) =>
      awsCommand('ec2', 'delete-snapshot', '--snapshot-id', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-EC2-3': {
    effort: 'low',
    command: ({ resourceId, region }) =>
      awsCommand('ec2', 'release-address', '--allocation-id', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-EC2-4': {
    effort: 'low',
    command: ({ resourceId, region }) =>
      awsCommand('ec2', 'delete-vpc-endpoints', '--vpc-endpoint-ids', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-EC2-5': { effort: 'medium' },
  'CLDBRN-AWS-EC2-1': { effort: 'medium' },
  'CLDBRN-AWS-EC2-6': { effort: 'medium' },
  'CLDBRN-AWS-EC2-8': { effort: 'medium' },
  'CLDBRN-AWS-EC2-9': { effort: 'medium' },
  'CLDBRN-AWS-EC2-11': {
    effort: 'medium',
    command: ({ resourceId, region }) =>
      awsCommand('ec2', 'delete-nat-gateway', '--nat-gateway-id', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-EC2-13': {
    effort: 'medium',
    command: ({ resourceId, region }) =>
      awsCommand('ec2', 'terminate-instances', '--instance-ids', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-ELB-1': { effort: 'low' },
  'CLDBRN-AWS-ELB-2': { effort: 'low' },
  'CLDBRN-AWS-ELB-3': { effort: 'low' },
  'CLDBRN-AWS-ELB-4': { effort: 'low' },
  'CLDBRN-AWS-ELB-5': { effort: 'medium' },
  'CLDBRN-AWS-CLOUDTRAIL-1': { effort: 'medium' },
  'CLDBRN-AWS-CLOUDTRAIL-2': { effort: 'medium' },
  'CLDBRN-AWS-COSTEXPLORER-1': { effort: 'medium' },
  'CLDBRN-AWS-DYNAMODB-2': { effort: 'medium' },
  'CLDBRN-AWS-ECS-1': { effort: 'medium' },
  'CLDBRN-AWS-ECS-2': { effort: 'medium' },
  'CLDBRN-AWS-ECS-3': { effort: 'medium' },
  'CLDBRN-AWS-EKS-1': { effort: 'medium' },
  'CLDBRN-AWS-ELASTICACHE-3': { effort: 'medium' },
  'CLDBRN-AWS-EMR-1': { effort: 'medium' },
  'CLDBRN-AWS-RDS-1': { effort: 'medium' },
  'CLDBRN-AWS-RDS-2': { effort: 'medium' },
  'CLDBRN-AWS-RDS-4': { effort: 'medium' },
  'CLDBRN-AWS-RDS-5': { effort: 'medium' },
  'CLDBRN-AWS-RDS-6': { effort: 'medium' },
  'CLDBRN-AWS-RDS-7': {
    effort: 'low',
    command: ({ resourceId, region }) =>
      awsCommand('rds', 'delete-db-snapshot', '--db-snapshot-identifier', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-RDS-9': { effort: 'medium' },
  'CLDBRN-AWS-RDS-10': {
    effort: 'low',
    command: ({ resourceId, region }) =>
      awsCommand('rds', 'delete-db-snapshot', '--db-snapshot-identifier', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-RDS-11': { effort: 'medium' },
  'CLDBRN-AWS-REDSHIFT-1': { effort: 'medium' },
  'CLDBRN-AWS-REDSHIFT-3': { effort: 'medium' },
  'CLDBRN-AWS-ELASTICACHE-2': { effort: 'medium' },
  'CLDBRN-AWS-EMR-2': { effort: 'medium' },
  'CLDBRN-AWS-DYNAMODB-1': { effort: 'low' },
  'CLDBRN-AWS-DYNAMODB-3': { effort: 'medium' },
  'CLDBRN-AWS-CLOUDFRONT-2': { effort: 'medium' },
  'CLDBRN-AWS-CLOUDWATCH-1': { effort: 'medium' },
  'CLDBRN-AWS-CLOUDWATCH-2': {
    effort: 'low',
    command: ({ resourceId, region }) =>
      awsCommand('logs', 'delete-log-group', '--log-group-name', resourceId, '--region', region ?? 'global'),
  },
  'CLDBRN-AWS-CLOUDWATCH-3': { effort: 'low' },
  'CLDBRN-AWS-LAMBDA-2': { effort: 'medium' },
  'CLDBRN-AWS-LAMBDA-1': { effort: 'medium' },
  'CLDBRN-AWS-LAMBDA-3': { effort: 'medium' },
  'CLDBRN-AWS-LAMBDA-4': { effort: 'medium' },
  'CLDBRN-AWS-SAGEMAKER-1': { effort: 'low' },
  'CLDBRN-AWS-SAGEMAKER-2': { effort: 'medium' },
  'CLDBRN-AWS-SECRETSMANAGER-1': {
    effort: 'low',
    command: ({ resourceId, region }) =>
      awsCommand(
        'secretsmanager',
        'delete-secret',
        '--secret-id',
        resourceId,
        '--recovery-window-in-days',
        '30',
        '--region',
        region ?? 'global',
      ),
  },
  'CLDBRN-AWS-ROUTE53-2': { effort: 'low' },
  'CLDBRN-AWS-ROUTE53-1': { effort: 'medium' },
  'CLDBRN-AWS-S3-1': { effort: 'medium' },
  'CLDBRN-AWS-S3-2': { effort: 'medium' },
  'CLDBRN-AWS-S3-3': { effort: 'medium' },
  'CLDBRN-AWS-S3-5': { effort: 'medium' },
  'CLDBRN-AWS-ECR-1': { effort: 'medium' },
};

const serviceDisplayNames: Record<string, string> = {
  apigateway: 'API Gateway',
  cloudfront: 'CloudFront',
  cloudtrail: 'CloudTrail',
  cloudwatch: 'CloudWatch',
  costexplorer: 'Cost Explorer',
  dynamodb: 'DynamoDB',
  ebs: 'EBS',
  ec2: 'EC2',
  ecr: 'ECR',
  ecs: 'ECS',
  eks: 'EKS',
  elasticache: 'ElastiCache',
  elb: 'Elastic Load Balancing',
  emr: 'EMR',
  lambda: 'Lambda',
  rds: 'RDS',
  redshift: 'Redshift',
  route53: 'Route 53',
  s3: 'S3',
  sagemaker: 'SageMaker',
  secretsmanager: 'Secrets Manager',
};

const getServiceDisplayName = (service: string): string => serviceDisplayNames[service] ?? service;

/** Stable SDK-owned profile metadata for AWS unused-resource discovery. */
export const awsUnusedResourcesProfile = {
  description: 'AWS resource-level cost optimization checks with auditable resource evidence.',
  id: 'aws-unused-resources',
  name: 'AWS Unused Resources',
  ruleIds: Object.keys(unusedResourceDefinitions),
};

const awsDiscoveryRulesById = new Map(
  awsRules.filter((rule) => rule.supports.includes('discovery')).map((rule) => [rule.id, rule]),
);
export const awsUnusedResourceRules = awsUnusedResourcesProfile.ruleIds.map((ruleId) => {
  const rule = awsDiscoveryRulesById.get(ruleId);
  if (!rule) {
    throw new Error(`Unused-resources profile references unknown discovery rule ${ruleId}.`);
  }
  return rule;
});

const resourceKey = ({ accountId, region, resourceId }: { accountId?: string; region?: string; resourceId: string }) =>
  `${accountId ?? ''}\u0000${region || 'global'}\u0000${resourceId}`;

const affectedResourceKey = ({ accountId, region, resourceId, resourceType }: EvaluatedResource): string =>
  `${accountId ?? ''}\u0000${region}\u0000${resourceType}\u0000${resourceId}`;

/** Builds the product-ready unused-resources contract from one evidence-enabled live scan. */
export const buildUnusedResourcesScanResult = (scan: ScanResult): UnusedResourcesScanResult => {
  const findingByRuleId = new Map(
    scan.providers.flatMap((provider) => provider.rules.map((finding) => [finding.ruleId, finding] as const)),
  );
  const resourceSets = new Map(scan.evaluations?.resourceSets.map((set) => [set.id, set.resources]));
  const resourcesByRuleId = new Map(
    scan.evaluations?.rules.map((evaluation) => [evaluation.ruleId, resourceSets.get(evaluation.resourceSetId) ?? []]),
  );
  const skippedReasonByRuleId = new Map(
    scan.diagnostics?.flatMap((diagnostic) =>
      diagnostic.status === 'skipped' && diagnostic.ruleId ? ([[diagnostic.ruleId, diagnostic.message]] as const) : [],
    ),
  );

  const findings: UnusedResourceFinding[] = [];
  const checks: UnusedResourcesCheckResult[] = [];
  const findingSummaryByRuleId = new Map<
    string,
    { ruleId: string; ruleName: string; service: string; resourceCount: number }
  >();
  const findingSummaryByService = new Map<
    string,
    { resourceKeys: Set<string>; ruleIds: Set<string>; service: string; serviceName: string }
  >();

  for (const rule of awsUnusedResourceRules) {
    const groupedFinding = findingByRuleId.get(rule.id);
    const evaluatedResources = resourcesByRuleId.get(rule.id);
    const evaluatedByKey = groupedFinding?.findings.length
      ? new Map(evaluatedResources?.map((resource) => [resourceKey(resource), resource]))
      : undefined;
    const definition = unusedResourceDefinitions[rule.id];
    if (!definition) {
      throw new Error(`Unused-resources rule ${rule.id} is missing its profile definition.`);
    }

    for (const match of groupedFinding?.findings ?? []) {
      const resource =
        evaluatedByKey?.get(resourceKey(match)) ??
        ({
          ...match,
          region: match.region ?? 'global',
          resourceType: rule.service,
        } satisfies EvaluatedResource);
      const command = definition.command?.(resource);
      findings.push({
        ...resource,
        remediationEffort: definition.effort,
        ...(command ? { remediation: { command } } : {}),
        ruleDescription: rule.description,
        ruleId: rule.id,
        ruleName: rule.name,
        service: rule.service,
        serviceName: getServiceDisplayName(rule.service),
      });

      const ruleSummary = findingSummaryByRuleId.get(rule.id) ?? {
        resourceCount: 0,
        ruleId: rule.id,
        ruleName: rule.name,
        service: rule.service,
      };
      ruleSummary.resourceCount += 1;
      findingSummaryByRuleId.set(rule.id, ruleSummary);

      const serviceSummary = findingSummaryByService.get(rule.service) ?? {
        resourceKeys: new Set<string>(),
        ruleIds: new Set<string>(),
        service: rule.service,
        serviceName: getServiceDisplayName(rule.service),
      };
      serviceSummary.resourceKeys.add(affectedResourceKey(resource));
      serviceSummary.ruleIds.add(rule.id);
      findingSummaryByService.set(rule.service, serviceSummary);
    }

    const findingCount = groupedFinding?.findings.length ?? 0;
    const skippedReason = skippedReasonByRuleId.get(rule.id);
    const status = findingCount > 0 ? 'triggered' : skippedReason ? 'not_applicable' : 'passed';
    checks.push({
      findingCount,
      ...(status !== 'triggered' && evaluatedResources
        ? {
            evaluatedResourceCount: evaluatedResources.length,
            ...(status === 'passed' ? { resources: evaluatedResources } : {}),
          }
        : {}),
      ...(skippedReason ? { reason: skippedReason } : {}),
      ruleDescription: rule.description,
      ruleId: rule.id,
      ruleName: rule.name,
      service: rule.service,
      serviceName: getServiceDisplayName(rule.service),
      status,
    });
  }

  const findingsByRule = [...findingSummaryByRuleId.values()];

  return {
    ...(scan.diagnostics ? { diagnostics: scan.diagnostics } : {}),
    findings,
    summary: {
      checks,
      findingCount: findings.length,
      findingsByRule,
      findingsByService: [...findingSummaryByService.values()].map(({ resourceKeys, ruleIds, ...service }) => ({
        ...service,
        resourceCount: resourceKeys.size,
        ruleCount: ruleIds.size,
      })),
      resourceCount: new Set(findings.map(affectedResourceKey)).size,
      ruleCount: findingsByRule.length,
    },
  };
};
