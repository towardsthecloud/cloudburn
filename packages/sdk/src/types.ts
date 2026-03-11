import type {
  AwsDiscoveredResource,
  AwsDiscoveryCatalog,
  AwsEbsVolume,
  AwsEc2Instance,
  AwsLambdaFunction,
  CloudProvider,
  DiscoveryDatasetKey,
  DiscoveryDatasetMap,
  Finding,
  FindingMatch,
  LiveResourceBag,
  Rule,
  ScanSource,
  SourceLocation,
} from '@cloudburn/rules';

// Intent: define SDK-facing contracts for scanner orchestration.
// TODO(cloudburn): extend config and result metadata as new providers/resources land.

export type RuleConfig = Record<string, unknown>;

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

/** Result returned after CloudBurn bootstraps AWS Resource Explorer. */
export type AwsDiscoveryInitialization = {
  status: 'CREATED' | 'EXISTING';
  aggregatorRegion: string;
  regions: string[];
  /** AWS setup task ID when a new setup task was created. */
  taskId?: string;
};

/** Supported AWS resource type exposed through Resource Explorer. */
export type AwsSupportedResourceType = {
  resourceType: string;
  service?: string;
};

export type CloudBurnConfig = {
  version: number;
  profile: string;
  profiles: Record<string, Record<string, RuleConfig>>;
  rules: Record<string, RuleConfig>;
  customRules: string[];
};

/** Rule finding groups organized under a cloud provider in scan output. */
export type ProviderFindingGroup = {
  provider: CloudProvider;
  rules: Finding[];
};

/** Result of a scan execution containing provider-grouped lean rule findings. */
export type ScanResult = {
  providers: ProviderFindingGroup[];
};

export type RegisteredRules = {
  activeRules: Rule[];
};

export type {
  AwsDiscoveryCatalog,
  AwsDiscoveredResource,
  AwsEbsVolume,
  AwsEc2Instance,
  AwsLambdaFunction,
  CloudProvider,
  DiscoveryDatasetKey,
  DiscoveryDatasetMap,
  Finding,
  FindingMatch,
  LiveResourceBag,
  Rule,
  ScanSource,
  SourceLocation,
};
