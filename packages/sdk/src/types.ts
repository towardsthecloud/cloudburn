import type {
  AwsCloudFrontDistribution,
  AwsCloudTrailTrail,
  AwsCloudWatchLogGroup,
  AwsCloudWatchLogStream,
  AwsConfigRecordingFrequencyReview,
  AwsConfigRecordingModeOverride,
  AwsCostOptimizationHubComputeConfiguration,
  AwsCostOptimizationHubDynamoDbReservationConfiguration,
  AwsCostOptimizationHubEc2ReservationConfiguration,
  AwsCostOptimizationHubElastiCacheReservationConfiguration,
  AwsCostOptimizationHubMemoryDbReservationConfiguration,
  AwsCostOptimizationHubOpenSearchReservationConfiguration,
  AwsCostOptimizationHubRdsReservationConfiguration,
  AwsCostOptimizationHubRecommendation,
  AwsCostOptimizationHubRedshiftReservationConfiguration,
  AwsCostOptimizationHubReservationConfiguration,
  AwsCostOptimizationHubReservationRecommendation,
  AwsCostOptimizationHubRightsizingConfigurationMap,
  AwsCostOptimizationHubRightsizingRecommendation,
  AwsCostOptimizationHubSavingsPlansRecommendation,
  AwsCostUsage,
  AwsDiscoveredResource,
  AwsDiscoveryCatalog,
  AwsDynamoDbAutoscaling,
  AwsDynamoDbTable,
  AwsEbsSnapshot,
  AwsEbsVolume,
  AwsEc2Instance,
  AwsEc2LoadBalancer,
  AwsEc2ReservedInstance,
  AwsEc2TargetGroup,
  AwsEc2TransitGatewayVpcAttachmentActivity,
  AwsEcsCluster,
  AwsEcsClusterMetric,
  AwsEcsContainerInstance,
  AwsEcsService,
  AwsEcsServiceAutoscaling,
  AwsEksNodegroup,
  AwsElastiCacheCluster,
  AwsElastiCacheReservedNode,
  AwsEmrCluster,
  AwsEmrClusterMetric,
  AwsKmsAliasPatternGroup,
  AwsKmsKeyChurnReview,
  AwsKmsKeyUsage,
  AwsKmsKeyUsageEvidence,
  AwsLambdaFunction,
  AwsLambdaFunctionMetric,
  AwsRdsInstance,
  AwsRdsInstanceActivity,
  AwsRdsInstanceCpuMetric,
  AwsRdsReservedInstance,
  AwsRdsSnapshot,
  AwsRedshiftCluster,
  AwsRedshiftClusterMetric,
  AwsRedshiftReservedNode,
  AwsRoute53HealthCheck,
  AwsRoute53Record,
  AwsRoute53Zone,
  AwsS3BucketAnalysis,
  AwsS3BucketAnalysisFlags,
  AwsSageMakerEndpointActivity,
  AwsSageMakerNotebookInstance,
  AwsSageMakerSavingsPlansCoverage,
  AwsSecretsManagerSecret,
  AwsStaticEbsVolume,
  AwsStaticEc2Instance,
  AwsStaticEc2VpcEndpoint,
  AwsStaticLambdaFunction,
  AwsStaticS3BucketAnalysis,
  CloudProvider,
  DiscoveryDatasetKey,
  DiscoveryDatasetMap,
  Finding,
  FindingMatch,
  IaCSuppression,
  LiveResourceBag,
  Rule,
  Severity,
  Source,
  SourceLocation,
  StaticDatasetKey,
  StaticDatasetMap,
  StaticResourceBag,
} from '@cloudburn/rules';
import type { AwsRegion } from './providers/aws/client.js';

export type { AwsRegion };

// Intent: define SDK-facing contracts for scanner orchestration.
// TODO(cloudburn): extend config and result metadata as new providers/resources land.

/** Supported output formats that can be configured for scan and discovery commands. */
export type ConfigOutputFormat = 'json' | 'table';

/** Configurable rule and format settings for one scan mode. */
export type CloudBurnModeConfig = {
  enabledRules?: string[];
  disabledRules?: string[];
  failOn?: Severity;
  services?: string[];
  format?: ConfigOutputFormat;
};

/** Deprecated compatibility alias for historical SDK consumers. */
export type RuleConfig = CloudBurnModeConfig;

/** Deprecated compatibility alias for the scan source discriminator. */
export type ScanSource = Source;

/** Serializable metadata surfaced for built-in rules in SDK and CLI inspection commands. */
export type BuiltInRuleMetadata = Pick<
  Rule,
  'id' | 'name' | 'description' | 'message' | 'provider' | 'service' | 'severity' | 'supports' | 'supersedesRuleIds'
>;

/** Selects how a live AWS discovery resolves its search region or index scope. */
export type AwsDiscoveryTarget =
  | { mode: 'current' }
  | { mode: 'all' }
  | {
      mode: 'region';
      region: string;
    }
  | {
      mode: 'regions';
      regions: AwsRegion[];
    };

/**
 * Progress event emitted while a live discovery run loads its catalog and
 * datasets, so callers can render feedback before the final result arrives.
 */
export type AwsDiscoveryProgressEvent =
  | {
      kind: 'catalog';
      resourceCount: number;
      searchRegion: string;
    }
  | {
      kind: 'dataset';
      completedDatasets: number;
      datasetKey: DiscoveryDatasetKey;
      totalDatasets: number;
    };

/** Describes one enabled Resource Explorer index region. */
export type AwsDiscoveryRegion = {
  region: string;
  type: 'local' | 'aggregator';
};

/** Observed Resource Explorer state for one AWS region. */
export type AwsDiscoveryRegionStatus = {
  region: string;
  indexType?: 'local' | 'aggregator';
  isAggregator?: boolean;
  status: 'indexed' | 'not_indexed' | 'access_denied' | 'error' | 'unsupported';
  viewStatus?: 'present' | 'missing' | 'filtered' | 'access_denied' | 'error' | 'unknown';
  errorCode?: string;
  notes?: string;
};

/** Observed Resource Explorer status across the account's enabled AWS regions. */
export type AwsDiscoveryStatus = {
  aggregatorRegion?: string;
  accessibleRegionCount: number;
  coverage: 'full' | 'partial' | 'local_only' | 'none';
  indexedRegionCount: number;
  regions: AwsDiscoveryRegionStatus[];
  totalRegionCount: number;
  warning?: string;
};

/** Result returned after CloudBurn bootstraps AWS Resource Explorer. */
export type AwsDiscoveryInitialization = {
  status: 'CREATED' | 'EXISTING';
  indexType: 'local' | 'aggregator';
  aggregatorRegion: string;
  aggregatorAction: 'created' | 'none' | 'promoted' | 'unchanged';
  createdIndexCount: number;
  reusedIndexCount: number;
  regions: string[];
  coverage: AwsDiscoveryStatus['coverage'];
  verificationStatus: 'verified' | 'timed_out';
  observedStatus: AwsDiscoveryStatus;
  /** AWS setup task ID when a new setup task was created. */
  taskId?: string;
  /** Optional warning surfaced when setup falls back to local-only behavior. */
  warning?: string;
};

/** Supported AWS resource type exposed through Resource Explorer. */
export type AwsSupportedResourceType = {
  resourceType: string;
  service?: string;
};

export type CloudBurnConfig = {
  discovery: CloudBurnModeConfig;
  iac: CloudBurnModeConfig;
};

/** Rule finding groups organized under a cloud provider in scan output. */
export type ProviderFindingGroup = {
  provider: CloudProvider;
  rules: Finding[];
};

/** Non-fatal scan diagnostic surfaced when CloudBurn cannot inspect part of a target. */
export type ScanDiagnostic = {
  provider: CloudProvider;
  service: string;
  source: Source;
  status: 'access_denied' | 'error' | 'skipped' | 'throttled';
  message: string;
  code?: string;
  details?: string;
  region?: string;
  ruleId?: string;
};

/** Observable result of evaluating active findings against a severity policy. */
export type ScanPolicyResult = {
  qualifyingFindingCount: number;
  threshold?: Severity;
  violated: boolean;
};

/** Serializable outcome and metadata for one completed or skipped discovery rule. */
export type RuleEvaluation = Omit<BuiltInRuleMetadata, 'id'> & {
  findingCount: number;
  resourceSetId?: string;
  ruleId: string;
  status: 'triggered' | 'passed' | 'not_applicable';
  source: 'discovery';
  reason?: string;
};

/** Deduplicated resource identities referenced by one or more live rule evaluations. */
export type EvaluationResourceSet = {
  id: string;
  resources: EvaluatedResource[];
};

/** Normalized identity and optional evidence for a resource inspected by a live rule. */
export type EvaluatedResource = Omit<FindingMatch, 'region'> & {
  region: string;
  resourceType: string;
  arn?: string;
  /** Provider-normalized evidence used to evaluate this resource. */
  data?: unknown;
  name?: string;
  tags?: Record<string, string>;
  createdAt?: string;
  lastActivityAt?: string;
};

/** Optional audit evidence produced for completed live rule evaluations. */
export type ScanEvaluations = {
  resourceSets: EvaluationResourceSet[];
  rules: RuleEvaluation[];
};

/** Result of a scan execution containing provider-grouped lean rule findings. */
export type ScanResult = {
  diagnostics?: ScanDiagnostic[];
  evaluations?: ScanEvaluations;
  policy?: ScanPolicyResult;
  providers: ProviderFindingGroup[];
  suppressed?: SuppressedFinding[];
};

/** One resource-level IaC match retained for audit after an inline suppression. */
export type SuppressedFinding = {
  finding: FindingMatch;
  message: string;
  provider: CloudProvider;
  ruleId: string;
  service: string;
  severity: Severity;
  source: 'iac';
  suppression: IaCSuppression;
};

export type RegisteredRules = {
  activeRules: Rule[];
};

export type {
  AwsCloudFrontDistribution,
  AwsCloudTrailTrail,
  AwsCloudWatchLogGroup,
  AwsCloudWatchLogStream,
  AwsConfigRecordingFrequencyReview,
  AwsConfigRecordingModeOverride,
  AwsCostOptimizationHubComputeConfiguration,
  AwsCostOptimizationHubDynamoDbReservationConfiguration,
  AwsCostOptimizationHubEc2ReservationConfiguration,
  AwsCostOptimizationHubElastiCacheReservationConfiguration,
  AwsCostOptimizationHubMemoryDbReservationConfiguration,
  AwsCostOptimizationHubOpenSearchReservationConfiguration,
  AwsCostOptimizationHubRdsReservationConfiguration,
  AwsCostOptimizationHubRecommendation,
  AwsCostOptimizationHubRedshiftReservationConfiguration,
  AwsCostOptimizationHubReservationConfiguration,
  AwsCostOptimizationHubReservationRecommendation,
  AwsCostOptimizationHubRightsizingConfigurationMap,
  AwsCostOptimizationHubRightsizingRecommendation,
  AwsCostOptimizationHubSavingsPlansRecommendation,
  AwsCostUsage,
  AwsDiscoveredResource,
  AwsDiscoveryCatalog,
  AwsDynamoDbAutoscaling,
  AwsDynamoDbTable,
  AwsEbsSnapshot,
  AwsEbsVolume,
  AwsEc2Instance,
  AwsEc2LoadBalancer,
  AwsEc2ReservedInstance,
  AwsEc2TargetGroup,
  AwsEc2TransitGatewayVpcAttachmentActivity,
  AwsEcsCluster,
  AwsEcsClusterMetric,
  AwsEcsContainerInstance,
  AwsEcsService,
  AwsEcsServiceAutoscaling,
  AwsEksNodegroup,
  AwsElastiCacheCluster,
  AwsElastiCacheReservedNode,
  AwsEmrCluster,
  AwsEmrClusterMetric,
  AwsKmsAliasPatternGroup,
  AwsKmsKeyChurnReview,
  AwsKmsKeyUsage,
  AwsKmsKeyUsageEvidence,
  AwsLambdaFunction,
  AwsLambdaFunctionMetric,
  AwsRdsInstance,
  AwsRdsInstanceActivity,
  AwsRdsInstanceCpuMetric,
  AwsRdsReservedInstance,
  AwsRdsSnapshot,
  AwsRedshiftCluster,
  AwsRedshiftClusterMetric,
  AwsRedshiftReservedNode,
  AwsRoute53HealthCheck,
  AwsRoute53Record,
  AwsRoute53Zone,
  AwsS3BucketAnalysis,
  AwsS3BucketAnalysisFlags,
  AwsSageMakerEndpointActivity,
  AwsSageMakerNotebookInstance,
  AwsSageMakerSavingsPlansCoverage,
  AwsSecretsManagerSecret,
  AwsStaticEbsVolume,
  AwsStaticEc2Instance,
  AwsStaticEc2VpcEndpoint,
  AwsStaticLambdaFunction,
  AwsStaticS3BucketAnalysis,
  CloudProvider,
  DiscoveryDatasetKey,
  DiscoveryDatasetMap,
  Finding,
  FindingMatch,
  IaCSuppression,
  LiveResourceBag,
  Rule,
  Severity,
  Source,
  SourceLocation,
  StaticDatasetKey,
  StaticDatasetMap,
  StaticResourceBag,
};
