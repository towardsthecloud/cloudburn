// Intent: define rule metadata contracts shared across provider rule packs.
// TODO(cloudburn): extend finding shape with remediation and confidence score.

/** Indicates how a rule discovers resources: live AWS API calls or IaC file parsing. */
export type ScanSource = 'discovery' | 'iac';

/** Supported cloud providers for built-in and custom rules. */
export type CloudProvider = 'aws' | 'azure' | 'gcp';

/** Source coordinates for an IaC declaration that produced a finding. */
export type SourceLocation = {
  path: string;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
};

export type AwsEbsVolume = {
  volumeId: string;
  volumeType: string;
  region: string;
  accountId: string;
};

/** Discovered AWS EC2 instance with its normalized instance type. */
export type AwsEc2Instance = {
  instanceId: string;
  instanceType: string;
  region: string;
  accountId: string;
};

/** Discovered AWS Lambda function with architecture metadata. */
export type AwsLambdaFunction = {
  functionName: string;
  /** Normalized function architectures. Missing AWS API values default to `['x86_64']`. */
  architectures: string[];
  region: string;
  accountId: string;
};

/** Shared S3 lifecycle and storage-optimization analysis flags across scan modes. */
export type AwsS3BucketAnalysisFlags = {
  hasLifecycleSignal: boolean;
  hasCostFocusedLifecycle: boolean;
  hasIntelligentTieringConfiguration: boolean;
  hasIntelligentTieringTransition: boolean;
  hasAlternativeStorageClassTransition: boolean;
  hasUnclassifiedTransition: boolean;
};

/** Discovered AWS S3 bucket normalized for live cost-optimization evaluation. */
export type AwsS3BucketAnalysis = AwsS3BucketAnalysisFlags & {
  bucketName: string;
  region: string;
  accountId: string;
};

/** Normalized AWS Resource Explorer property attached to a discovered resource. */
export type AwsResourceProperty = {
  name?: string;
  data?: unknown;
  lastReportedAt?: string;
};

/** Generic AWS resource returned by the live discovery catalog. */
export type AwsDiscoveredResource = {
  arn: string;
  accountId: string;
  region: string;
  service: string;
  resourceType: string;
  name?: string;
  properties: AwsResourceProperty[];
};

/** Resource Explorer-backed discovery catalog used as the live scan seed. */
export type AwsDiscoveryCatalog = {
  resources: AwsDiscoveredResource[];
  searchRegion: string;
  indexType: 'LOCAL' | 'AGGREGATOR';
  viewArn?: string;
};

/** Rule-facing live discovery dataset key exposed through the evaluation context. */
export type DiscoveryDatasetKey =
  | 'aws-ebs-volumes'
  | 'aws-ec2-instances'
  | 'aws-lambda-functions'
  | 'aws-s3-bucket-analyses';

/** Normalized live discovery datasets available to rule evaluators. */
export type DiscoveryDatasetMap = {
  'aws-ebs-volumes': AwsEbsVolume[];
  'aws-ec2-instances': AwsEc2Instance[];
  'aws-lambda-functions': AwsLambdaFunction[];
  'aws-s3-bucket-analyses': AwsS3BucketAnalysis[];
};

/** Rule-facing static IaC dataset key exposed through the evaluation context. */
export type StaticDatasetKey = DiscoveryDatasetKey | 'aws-ec2-vpc-endpoints' | 'aws-s3-bucket-analyses';

/** Normalized static EBS volume dataset entry with a precomputed finding target. */
export type AwsStaticEbsVolume = {
  resourceId: string;
  volumeType: string | null;
  location?: SourceLocation;
};

/** Normalized static EC2 instance dataset entry with a precomputed finding target. */
export type AwsStaticEc2Instance = {
  resourceId: string;
  instanceType: string | null;
  location?: SourceLocation;
};

/** Normalized static Lambda function dataset entry with source-aware architecture metadata. */
export type AwsStaticLambdaFunction = {
  resourceId: string;
  architectures: string[] | null;
  location?: SourceLocation;
};

/** Normalized static EC2 VPC endpoint dataset entry with preselected source location. */
export type AwsStaticEc2VpcEndpoint = {
  resourceId: string;
  serviceName: string | null;
  vpcEndpointType: string | null;
  location?: SourceLocation;
};

/** Aggregated static S3 bucket analysis dataset entry. */
export type AwsStaticS3BucketAnalysis = AwsS3BucketAnalysisFlags & {
  resourceId: string;
  location?: SourceLocation;
};

/** Normalized static datasets available to rule evaluators. */
export type StaticDatasetMap = {
  'aws-ebs-volumes': AwsStaticEbsVolume[];
  'aws-ec2-instances': AwsStaticEc2Instance[];
  'aws-lambda-functions': AwsStaticLambdaFunction[];
  'aws-ec2-vpc-endpoints': AwsStaticEc2VpcEndpoint[];
  'aws-s3-bucket-analyses': AwsStaticS3BucketAnalysis[];
};

/** Typed bag of normalized live discovery datasets prepared by the SDK. */
export class LiveResourceBag {
  readonly #datasets: Partial<DiscoveryDatasetMap>;

  /**
   * Creates a new dataset bag for live rule evaluation.
   *
   * @param datasets - Optional preloaded normalized datasets keyed by dataset name.
   */
  public constructor(datasets: Partial<DiscoveryDatasetMap> = {}) {
    this.#datasets = { ...datasets };
  }

  /**
   * Returns the normalized dataset for a specific discovery dependency.
   *
   * Missing datasets default to an empty array so rules can read dependencies
   * without defensive checks.
   *
   * @param key - Stable dataset key declared by a discovery-capable rule.
   * @returns The normalized dataset value for the requested key.
   */
  public get<K extends DiscoveryDatasetKey>(key: K): DiscoveryDatasetMap[K] {
    return (this.#datasets[key] ?? []) as DiscoveryDatasetMap[K];
  }
}

/** Typed bag of normalized static IaC datasets prepared by the SDK. */
export class StaticResourceBag {
  readonly #datasets: Partial<StaticDatasetMap>;

  /**
   * Creates a new dataset bag for static rule evaluation.
   *
   * @param datasets - Optional preloaded normalized datasets keyed by dataset name.
   */
  public constructor(datasets: Partial<StaticDatasetMap> = {}) {
    this.#datasets = { ...datasets };
  }

  /**
   * Returns the normalized dataset for a specific static dependency.
   *
   * Missing datasets default to an empty array so rules can read dependencies
   * without defensive checks.
   *
   * @param key - Stable dataset key declared by a static-capable rule.
   * @returns The normalized dataset value for the requested key.
   */
  public get<K extends StaticDatasetKey>(key: K): StaticDatasetMap[K] {
    return (this.#datasets[key] ?? []) as StaticDatasetMap[K];
  }
}

/**
 * Normalized IaC resource shape shared across Terraform and CloudFormation
 * parsers.
 */
export type IaCResource = {
  provider: CloudProvider;
  type: string;
  name: string;
  location?: SourceLocation;
  attributeLocations?: Record<string, SourceLocation>;
  attributes: Record<string, unknown>;
};

export type LiveEvaluationContext = {
  catalog: AwsDiscoveryCatalog;
  resources: LiveResourceBag;
};

/** Provider-normalized IaC resources available to static rule evaluators. */
export type StaticEvaluationContext = {
  resources: StaticResourceBag;
};

/** A resource-level policy match emitted inside a rule finding group. */
export type FindingMatch = {
  resourceId: string;
  accountId?: string;
  region?: string;
  location?: SourceLocation;
};

/** A rule-level finding group containing all matched resources for that rule. */
export type Finding = {
  ruleId: string;
  service: string;
  source: ScanSource;
  message: string;
  findings: FindingMatch[];
};

/** A declarative cost-optimization rule with optional live and static evaluators. */
export type Rule = {
  id: string;
  name: string;
  description: string;
  message: string;
  provider: CloudProvider;
  service: string;
  supports: ScanSource[];
  discoveryDependencies?: DiscoveryDatasetKey[];
  staticDependencies?: StaticDatasetKey[];
  evaluateLive?: (context: LiveEvaluationContext) => Finding | null;
  evaluateStatic?: (context: StaticEvaluationContext) => Finding | null;
};
