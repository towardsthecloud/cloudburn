// Intent: define rule metadata contracts shared across provider rule packs.
// TODO(cloudburn): extend finding shape with remediation and confidence score.

/** Indicates how a rule discovers resources: live AWS API calls or IaC file parsing. */
export type Source = 'discovery' | 'iac';

/** Deprecated compatibility alias for the scan source discriminator. */
export type ScanSource = Source;

/** Supported cloud providers for built-in and custom rules. */
export type CloudProvider = 'aws' | 'azure' | 'gcp';

/** Source coordinates for an IaC declaration that produced a finding. */
export type SourceLocation = {
  path: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
};

export type AwsEbsVolume = {
  volumeId: string;
  volumeType: string;
  sizeGiB: number;
  iops?: number;
  state?: string;
  attachments?: Array<{
    instanceId?: string;
  }>;
  region: string;
  accountId: string;
};

/** Discovered EBS snapshot normalized for age-based cleanup checks. */
export type AwsEbsSnapshot = {
  snapshotId: string;
  startTime?: string;
  state?: string;
  volumeId?: string;
  volumeSizeGiB?: number;
  region: string;
  accountId: string;
};

/** Discovered AWS CloudTrail trail with scope metadata for redundancy checks. */
export type AwsCloudTrailTrail = {
  trailArn: string;
  trailName: string;
  homeRegion: string;
  isMultiRegionTrail: boolean;
  isOrganizationTrail: boolean;
  region: string;
  accountId: string;
};

/** Discovered CloudWatch Logs log group normalized for retention checks. */
export type AwsCloudWatchLogGroup = {
  logGroupArn: string;
  logGroupName: string;
  retentionInDays?: number;
  logGroupClass?: string;
  storedBytes?: number;
  region: string;
  accountId: string;
};

/** Discovered CloudWatch Logs log stream normalized for cleanup checks. */
export type AwsCloudWatchLogStream = {
  arn: string;
  logGroupName: string;
  logStreamName: string;
  creationTime?: number;
  firstEventTimestamp?: number;
  lastEventTimestamp?: number;
  lastIngestionTime?: number;
  region: string;
  accountId: string;
};

/** Discovered AWS ECR repository with lifecycle-policy state. */
export type AwsEcrRepository = {
  repositoryName: string;
  arn: string;
  hasLifecyclePolicy: boolean;
  region: string;
  accountId: string;
};

/** Discovered AWS EC2 instance with its normalized instance type. */
export type AwsEc2Instance = {
  instanceId: string;
  instanceType: string;
  architecture?: string;
  launchTime?: string;
  state?: string;
  region: string;
  accountId: string;
};

/** Discovered EC2 reserved instance normalized for renewal review checks. */
export type AwsEc2ReservedInstance = {
  reservedInstancesId: string;
  instanceType: string;
  state?: string;
  endTime?: string;
  region: string;
  accountId: string;
};

/** Discovered Elastic IP with its current association state. */
export type AwsEc2ElasticIp = {
  allocationId: string;
  publicIp: string;
  associationId?: string;
  instanceId?: string;
  networkInterfaceId?: string;
  region: string;
  accountId: string;
};

/** Discovered ElastiCache cluster normalized for reservation checks. */
export type AwsElastiCacheCluster = {
  cacheClusterId: string;
  cacheNodeType: string;
  engine: string;
  numCacheNodes: number;
  cacheClusterCreateTime?: string;
  cacheClusterStatus?: string;
  region: string;
  accountId: string;
};

/** Discovered ElastiCache reserved node normalized for coverage checks. */
export type AwsElastiCacheReservedNode = {
  reservedCacheNodeId: string;
  cacheNodeType: string;
  cacheNodeCount: number;
  productDescription?: string;
  startTime?: string;
  state?: string;
  region: string;
  accountId: string;
};

/** Discovered VPC endpoint with its 30-day data transfer total. */
export type AwsEc2VpcEndpointActivity = {
  vpcEndpointId: string;
  vpcId: string;
  subnetIds: string[];
  serviceName: string;
  vpcEndpointType: string;
  /** `null` means CloudWatch returned incomplete datapoints for the 30-day lookback window. */
  bytesProcessedLast30Days: number | null;
  region: string;
  accountId: string;
};

/** Discovered EMR cluster normalized for instance-generation and idle checks. */
export type AwsEmrCluster = {
  clusterId: string;
  clusterName: string;
  instanceTypes: string[];
  normalizedInstanceHours?: number;
  readyDateTime?: string;
  endDateTime?: string;
  state?: string;
  region: string;
  accountId: string;
};

/** Discovered EMR cluster with its recent idle summary. */
export type AwsEmrClusterMetric = {
  clusterId: string;
  idlePeriodsLast30Minutes: number | null;
  region: string;
  accountId: string;
};

/** Discovered AWS Lambda function with architecture metadata. */
export type AwsLambdaFunction = {
  functionName: string;
  /** Normalized function architectures. Missing AWS API values default to `['x86_64']`. */
  architectures: string[];
  /** Configured function timeout in seconds. */
  timeoutSeconds: number;
  region: string;
  accountId: string;
};

/** Discovered AWS Lambda function with recent error and duration summaries. */
export type AwsLambdaFunctionMetric = {
  functionName: string;
  /** `null` means CloudWatch did not return a usable 7-day invocation total. */
  totalInvocationsLast7Days: number | null;
  /** `null` means CloudWatch did not return a usable 7-day error total. */
  totalErrorsLast7Days: number | null;
  /** `null` means CloudWatch did not return a usable 7-day average duration. */
  averageDurationMsLast7Days: number | null;
  region: string;
  accountId: string;
};

/** Discovered AWS RDS DB instance with its normalized instance class. */
export type AwsRdsInstance = {
  dbInstanceIdentifier: string;
  dbInstanceStatus?: string;
  engine?: string;
  engineVersion?: string;
  instanceClass: string;
  instanceCreateTime?: string;
  multiAz?: boolean;
  region: string;
  accountId: string;
};

/** Discovered RDS DB instance with a 7-day connection summary. */
export type AwsRdsInstanceActivity = {
  dbInstanceIdentifier: string;
  instanceClass: string;
  /** `null` means CloudWatch returned incomplete datapoints for the 7-day lookback window. */
  maxDatabaseConnectionsLast7Days: number | null;
  region: string;
  accountId: string;
};

/** Discovered RDS reserved DB instance normalized for coverage checks. */
export type AwsRdsReservedInstance = {
  reservedDbInstanceId: string;
  instanceClass: string;
  instanceCount: number;
  multiAz?: boolean;
  productDescription?: string;
  state?: string;
  startTime?: string;
  region: string;
  accountId: string;
};

/** Discovered RDS DB instance with its 30-day CPU summary. */
export type AwsRdsInstanceCpuMetric = {
  dbInstanceIdentifier: string;
  /** `null` means CloudWatch returned incomplete datapoints for the 30-day lookback window. */
  averageCpuUtilizationLast30Days: number | null;
  region: string;
  accountId: string;
};

/** Discovered RDS DB snapshot normalized for orphaned snapshot review. */
export type AwsRdsSnapshot = {
  dbSnapshotIdentifier: string;
  dbInstanceIdentifier?: string;
  snapshotCreateTime?: string;
  snapshotType?: string;
  region: string;
  accountId: string;
};

/** Discovered EC2 instance with its low-utilization summary. */
export type AwsEc2InstanceUtilization = {
  instanceId: string;
  instanceType: string;
  lowUtilizationDays: number;
  averageCpuUtilizationLast14Days: number;
  averageDailyNetworkBytesLast14Days: number;
  region: string;
  accountId: string;
};

/** Discovered Redshift cluster normalized for utilization and reservation checks. */
export type AwsRedshiftCluster = {
  clusterIdentifier: string;
  nodeType: string;
  numberOfNodes: number;
  clusterCreateTime?: string;
  clusterStatus?: string;
  automatedSnapshotRetentionPeriod?: number;
  hasPauseSchedule: boolean;
  hasResumeSchedule: boolean;
  /** `false` means schedule state could not be loaded, usually because `DescribeScheduledActions` was denied. */
  pauseResumeStateAvailable?: boolean;
  hsmEnabled: boolean;
  multiAz?: string;
  region: string;
  accountId: string;
  vpcId?: string;
};

/** Discovered Redshift cluster with its low-CPU summary. */
export type AwsRedshiftClusterMetric = {
  clusterIdentifier: string;
  averageCpuUtilizationLast14Days: number | null;
  region: string;
  accountId: string;
};

/** Discovered Redshift reserved node normalized for coverage checks. */
export type AwsRedshiftReservedNode = {
  reservedNodeId: string;
  nodeType: string;
  nodeCount: number;
  startTime?: string;
  state?: string;
  region: string;
  accountId: string;
};

/** Discovered Elastic Load Balancer normalized for cleanup checks. */
export type AwsEc2LoadBalancer = {
  loadBalancerArn: string;
  loadBalancerName: string;
  loadBalancerType: 'application' | 'classic' | 'gateway' | 'network';
  attachedTargetGroupArns: string[];
  instanceCount: number;
  region: string;
  accountId: string;
};

/** Discovered target group normalized for target registration checks. */
export type AwsEc2TargetGroup = {
  targetGroupArn: string;
  loadBalancerArns: string[];
  registeredTargetCount: number;
  region: string;
  accountId: string;
};

/** Discovered ECS container instance enriched with backing EC2 instance metadata when available. */
export type AwsEcsContainerInstance = {
  containerInstanceArn: string;
  clusterArn: string;
  ec2InstanceId?: string;
  instanceType?: string;
  architecture?: string;
  region: string;
  accountId: string;
};

/** Discovered ECS cluster normalized for advisory utilization checks. */
export type AwsEcsCluster = {
  clusterArn: string;
  clusterName: string;
  region: string;
  accountId: string;
};

/** Discovered ECS cluster with a 14-day CPU utilization summary. */
export type AwsEcsClusterMetric = {
  clusterArn: string;
  clusterName: string;
  /** `null` means CloudWatch returned incomplete datapoints for the 14-day lookback window. */
  averageCpuUtilizationLast14Days: number | null;
  region: string;
  accountId: string;
};

/** Discovered ECS service normalized for autoscaling-policy evaluation. */
export type AwsEcsService = {
  serviceArn: string;
  clusterArn: string;
  clusterName: string;
  serviceName: string;
  desiredCount: number;
  schedulingStrategy: string;
  status?: string;
  region: string;
  accountId: string;
};

/** Discovered ECS autoscaling state for a specific service desired-count target. */
export type AwsEcsServiceAutoscaling = {
  serviceArn: string;
  clusterName: string;
  serviceName: string;
  hasScalableTarget: boolean;
  hasScalingPolicy: boolean;
  region: string;
  accountId: string;
};

/** Discovered EKS managed node group normalized for architecture review checks. */
export type AwsEksNodegroup = {
  nodegroupArn: string;
  nodegroupName: string;
  clusterArn: string;
  clusterName: string;
  instanceTypes: string[];
  amiType?: string;
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
export type SharedDatasetKey =
  | 'aws-ebs-volumes'
  | 'aws-ecr-repositories'
  | 'aws-ec2-instances'
  | 'aws-lambda-functions'
  | 'aws-rds-instances'
  | 'aws-s3-bucket-analyses';

/** Rule-facing live discovery dataset key exposed through the evaluation context. */
export type DiscoveryDatasetKey =
  | 'aws-cloudtrail-trails'
  | 'aws-cloudwatch-log-groups'
  | 'aws-cloudwatch-log-streams'
  | 'aws-ebs-snapshots'
  | 'aws-ebs-volumes'
  | 'aws-elasticache-clusters'
  | 'aws-elasticache-reserved-nodes'
  | 'aws-ecs-autoscaling'
  | 'aws-ecs-cluster-metrics'
  | 'aws-ecs-clusters'
  | 'aws-ecs-container-instances'
  | 'aws-ecs-services'
  | 'aws-ecr-repositories'
  | 'aws-ec2-elastic-ips'
  | 'aws-ec2-instances'
  | 'aws-ec2-instance-utilization'
  | 'aws-ec2-load-balancers'
  | 'aws-ec2-reserved-instances'
  | 'aws-ec2-target-groups'
  | 'aws-ec2-vpc-endpoint-activity'
  | 'aws-eks-nodegroups'
  | 'aws-emr-clusters'
  | 'aws-emr-cluster-metrics'
  | 'aws-lambda-functions'
  | 'aws-lambda-function-metrics'
  | 'aws-rds-instance-activity'
  | 'aws-rds-instance-cpu-metrics'
  | 'aws-rds-instances'
  | 'aws-rds-reserved-instances'
  | 'aws-rds-snapshots'
  | 'aws-redshift-clusters'
  | 'aws-redshift-cluster-metrics'
  | 'aws-redshift-reserved-nodes'
  | 'aws-s3-bucket-analyses';

/** Normalized live discovery datasets available to rule evaluators. */
export type DiscoveryDatasetMap = {
  'aws-cloudtrail-trails': AwsCloudTrailTrail[];
  'aws-cloudwatch-log-groups': AwsCloudWatchLogGroup[];
  'aws-cloudwatch-log-streams': AwsCloudWatchLogStream[];
  'aws-ebs-snapshots': AwsEbsSnapshot[];
  'aws-ebs-volumes': AwsEbsVolume[];
  'aws-elasticache-clusters': AwsElastiCacheCluster[];
  'aws-elasticache-reserved-nodes': AwsElastiCacheReservedNode[];
  'aws-ecs-autoscaling': AwsEcsServiceAutoscaling[];
  'aws-ecs-cluster-metrics': AwsEcsClusterMetric[];
  'aws-ecs-clusters': AwsEcsCluster[];
  'aws-ecs-container-instances': AwsEcsContainerInstance[];
  'aws-ecs-services': AwsEcsService[];
  'aws-ecr-repositories': AwsEcrRepository[];
  'aws-ec2-elastic-ips': AwsEc2ElasticIp[];
  'aws-ec2-instances': AwsEc2Instance[];
  'aws-ec2-instance-utilization': AwsEc2InstanceUtilization[];
  'aws-ec2-load-balancers': AwsEc2LoadBalancer[];
  'aws-ec2-reserved-instances': AwsEc2ReservedInstance[];
  'aws-ec2-target-groups': AwsEc2TargetGroup[];
  'aws-ec2-vpc-endpoint-activity': AwsEc2VpcEndpointActivity[];
  'aws-eks-nodegroups': AwsEksNodegroup[];
  'aws-emr-clusters': AwsEmrCluster[];
  'aws-emr-cluster-metrics': AwsEmrClusterMetric[];
  'aws-lambda-functions': AwsLambdaFunction[];
  'aws-lambda-function-metrics': AwsLambdaFunctionMetric[];
  'aws-rds-instance-activity': AwsRdsInstanceActivity[];
  'aws-rds-instance-cpu-metrics': AwsRdsInstanceCpuMetric[];
  'aws-rds-instances': AwsRdsInstance[];
  'aws-rds-reserved-instances': AwsRdsReservedInstance[];
  'aws-rds-snapshots': AwsRdsSnapshot[];
  'aws-redshift-clusters': AwsRedshiftCluster[];
  'aws-redshift-cluster-metrics': AwsRedshiftClusterMetric[];
  'aws-redshift-reserved-nodes': AwsRedshiftReservedNode[];
  'aws-s3-bucket-analyses': AwsS3BucketAnalysis[];
};

/** Rule-facing static IaC dataset key exposed through the evaluation context. */
export type StaticDatasetKey = SharedDatasetKey | 'aws-ec2-vpc-endpoints';

/** Normalized static EBS volume dataset entry with a precomputed finding target. */
export type AwsStaticEbsVolume = {
  resourceId: string;
  volumeType: string | null;
  location?: SourceLocation;
};

/** Normalized static ECR repository dataset entry with lifecycle-policy state. */
export type AwsStaticEcrRepository = {
  resourceId: string;
  hasLifecyclePolicy: boolean;
  location?: SourceLocation;
};

/** Normalized static EC2 instance dataset entry with a precomputed finding target. */
export type AwsStaticEc2Instance = {
  resourceId: string;
  instanceType: string | null;
  location?: SourceLocation;
};

/** Normalized static RDS instance dataset entry with a precomputed finding target. */
export type AwsStaticRdsInstance = {
  resourceId: string;
  instanceClass: string | null;
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
  'aws-ecr-repositories': AwsStaticEcrRepository[];
  'aws-ec2-instances': AwsStaticEc2Instance[];
  'aws-lambda-functions': AwsStaticLambdaFunction[];
  'aws-ec2-vpc-endpoints': AwsStaticEc2VpcEndpoint[];
  'aws-rds-instances': AwsStaticRdsInstance[];
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
  source: Source;
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
  supports: Source[];
  discoveryDependencies?: DiscoveryDatasetKey[];
  staticDependencies?: StaticDatasetKey[];
  evaluateLive?: (context: LiveEvaluationContext) => Finding | null;
  evaluateStatic?: (context: StaticEvaluationContext) => Finding | null;
};
