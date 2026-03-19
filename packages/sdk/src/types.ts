import type {
  AwsCloudTrailTrail,
  AwsCloudWatchLogGroup,
  AwsCloudWatchLogStream,
  AwsDiscoveredResource,
  AwsDiscoveryCatalog,
  AwsEbsVolume,
  AwsEc2Instance,
  AwsEc2LoadBalancer,
  AwsEc2ReservedInstance,
  AwsEc2TargetGroup,
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
  AwsLambdaFunction,
  AwsRdsInstance,
  AwsRdsInstanceActivity,
  AwsRedshiftCluster,
  AwsRedshiftClusterMetric,
  AwsRedshiftReservedNode,
  AwsS3BucketAnalysis,
  AwsS3BucketAnalysisFlags,
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
  LiveResourceBag,
  Rule,
  Source,
  SourceLocation,
  StaticDatasetKey,
  StaticDatasetMap,
  StaticResourceBag,
} from '@cloudburn/rules';

// Intent: define SDK-facing contracts for scanner orchestration.
// TODO(cloudburn): extend config and result metadata as new providers/resources land.

/** Supported output formats that can be configured for scan and discovery commands. */
export type ConfigOutputFormat = 'json' | 'table';

/** Configurable rule and format settings for one scan mode. */
export type CloudBurnModeConfig = {
  enabledRules?: string[];
  disabledRules?: string[];
  services?: string[];
  format?: ConfigOutputFormat;
};

/** Deprecated compatibility alias for historical SDK consumers. */
export type RuleConfig = CloudBurnModeConfig;

/** Deprecated compatibility alias for the scan source discriminator. */
export type ScanSource = Source;

/** Serializable metadata surfaced for built-in rules in SDK and CLI inspection commands. */
export type BuiltInRuleMetadata = Pick<Rule, 'id' | 'name' | 'description' | 'provider' | 'service' | 'supports'>;

/** Selects how a live AWS discovery resolves its search region or index scope. */
export type AwsDiscoveryTarget =
  | { mode: 'current' }
  | { mode: 'all' }
  | {
      mode: 'region';
      region: string;
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
  status: 'access_denied';
  message: string;
  code?: string;
  details?: string;
  region?: string;
};

/** Result of a scan execution containing provider-grouped lean rule findings. */
export type ScanResult = {
  diagnostics?: ScanDiagnostic[];
  providers: ProviderFindingGroup[];
};

export type RegisteredRules = {
  activeRules: Rule[];
};

export type {
  AwsCloudTrailTrail,
  AwsCloudWatchLogGroup,
  AwsCloudWatchLogStream,
  AwsDiscoveryCatalog,
  AwsDiscoveredResource,
  AwsEbsVolume,
  AwsElastiCacheCluster,
  AwsElastiCacheReservedNode,
  AwsEcsCluster,
  AwsEcsClusterMetric,
  AwsEcsContainerInstance,
  AwsEcsService,
  AwsEcsServiceAutoscaling,
  AwsEc2Instance,
  AwsEc2LoadBalancer,
  AwsEc2ReservedInstance,
  AwsEc2TargetGroup,
  AwsEksNodegroup,
  AwsEmrCluster,
  AwsEmrClusterMetric,
  AwsLambdaFunction,
  AwsRdsInstance,
  AwsRdsInstanceActivity,
  AwsRedshiftCluster,
  AwsRedshiftClusterMetric,
  AwsRedshiftReservedNode,
  AwsS3BucketAnalysis,
  AwsS3BucketAnalysisFlags,
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
  LiveResourceBag,
  Rule,
  Source,
  SourceLocation,
  StaticDatasetKey,
  StaticDatasetMap,
  StaticResourceBag,
};
