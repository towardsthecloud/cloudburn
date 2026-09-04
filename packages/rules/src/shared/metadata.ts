// Intent: define rule metadata contracts shared across provider rule packs.
// TODO(cloudburn): extend finding shape with remediation and confidence score.

/** Indicates how a rule discovers resources: live AWS API calls or IaC file parsing. */
export type Source = 'discovery' | 'iac';

/** Deprecated compatibility alias for the scan source discriminator. */
export type ScanSource = Source;

/** Supported cloud providers for built-in and custom rules. */
export type CloudProvider = 'aws' | 'azure' | 'gcp';

/** Supported severity levels in descending priority order. */
export const SEVERITIES = ['high', 'medium', 'low'] as const;

/** Relative cost impact used to prioritize rules and findings. */
export type Severity = (typeof SEVERITIES)[number];

/** Source coordinates for an IaC declaration that produced a finding. */
export type SourceLocation = {
  path: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
};

/** A resource-scoped IaC comment that suppresses one rule or every rule. */
export type IaCSuppression =
  | {
      kind: 'all';
      location: SourceLocation;
      reason?: string;
    }
  | {
      kind: 'rule';
      location: SourceLocation;
      reason?: string;
      ruleId: string;
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
  createTime?: string;
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

/** Effective AWS Config recording-mode override for one or more resource types. */
export type AwsConfigRecordingModeOverride = {
  description?: string;
  recordingFrequency: 'CONTINUOUS' | 'DAILY';
  resourceTypes: string[];
};

/** Evidence for reviewing one high-volume AWS Config resource type. */
export type AwsConfigRecordingFrequencyReview = {
  accountId: string;
  allSupported: boolean;
  configurationItemsRecorded: number;
  configuredResourceTypes: string[];
  continuousRecordingUnitPriceUsd: number;
  currentRecordingFrequency: 'CONTINUOUS';
  dailyRecordingUnitPriceUsd: number;
  defaultRecordingFrequency: 'CONTINUOUS' | 'DAILY';
  estimatedMonthlyConfigurationItemReduction: number;
  estimatedMonthlyRecordingCostReductionUsd: number;
  excludedResourceTypes: string[];
  firewallManagerDependent: boolean;
  includeGlobalResourceTypes: boolean;
  observationWindowDays: number;
  paidServiceLinkedRecorderDependent: boolean;
  recentlyDeletedResourceCount?: number;
  recorderArn: string;
  recorderName: string;
  recordedResourceCount: number;
  recordingModeOverrides: AwsConfigRecordingModeOverride[];
  recordingScope?: string;
  recordingStrategy: string;
  region: string;
  resourceType: string;
  turnoverEstimateReliable?: boolean;
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

/** Discovered CloudWatch Logs latest-stream activity summary keyed by log group. */
export type AwsCloudWatchLogGroupRecentStreamActivity = {
  logGroupArn?: string;
  logGroupName: string;
  latestStreamArn?: string;
  latestStreamName?: string;
  lastEventTimestamp?: number;
  lastIngestionTime?: number;
  lastActivityAt?: string;
  region: string;
  accountId: string;
};

/** Discovered CloudFront distribution normalized for price-class review checks. */
export type AwsCloudFrontDistribution = {
  distributionArn: string;
  distributionId: string;
  priceClass?: string;
  region: string;
  accountId: string;
};

/** Discovered CloudFront distribution with 30-day request activity coverage. */
export type AwsCloudFrontDistributionRequestActivity = {
  distributionArn: string;
  distributionId: string;
  /** `null` means CloudWatch returned incomplete datapoints for the 30-day lookback window. */
  totalRequestsLast30Days: number | null;
  region: string;
  accountId: string;
};

/** Cost Explorer service spend comparison across the last two full months. */
export type AwsCostUsage = {
  serviceName: string;
  /** Stable kebab-case identifier used for account-scoped Cost Explorer findings. */
  serviceSlug: string;
  previousMonthCost: number;
  currentMonthCost: number;
  costIncrease: number;
  /** The AWS cost metric unit, which is usually `USD`. */
  costUnit: string;
  accountId: string;
};

/** Normalized spend details for one configured AWS Budget. */
export type AwsCostGuardrailBudgetSpend = {
  budgetName: string;
  actualSpend: number;
  budgetLimit: number;
  spendUnit: string;
  forecastedSpend?: number;
};

/** Account-scoped AWS Budget summary used by cost guardrail rules. */
export type AwsCostGuardrailBudget = {
  budgetCount: number;
  accountId: string;
  /** Normalized details are optional for compatibility with custom dataset authors. */
  budgets?: AwsCostGuardrailBudgetSpend[];
};

/** Account-scoped Cost Anomaly Detection monitor summary used by guardrail rules. */
export type AwsCostAnomalyMonitor = {
  monitorCount: number;
  accountId: string;
};

/** Discovered AWS ECR repository with lifecycle-policy state. */
export type AwsEcrRepository = {
  repositoryName: string;
  arn: string;
  hasLifecyclePolicy: boolean;
  hasTaggedImageRetentionCap?: boolean | null;
  hasUntaggedImageExpiry?: boolean | null;
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
  stoppedAt?: string;
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

/** Discovered NAT gateway with 7-day traffic totals for idle checks. */
export type AwsEc2NatGatewayActivity = {
  natGatewayId: string;
  subnetId: string;
  state: string;
  /** `null` means CloudWatch returned incomplete datapoints for the 7-day lookback window. */
  bytesInFromDestinationLast7Days: number | null;
  /** `null` means CloudWatch returned incomplete datapoints for the 7-day lookback window. */
  bytesOutToDestinationLast7Days: number | null;
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

/** Discovered ElastiCache cluster with 14-day cache-hit and connection activity coverage. */
export type AwsElastiCacheClusterActivity = {
  cacheClusterId: string;
  /** `null` means CloudWatch returned incomplete datapoints or the cluster engine is unsupported in v1. */
  averageCacheHitRateLast14Days: number | null;
  /** `null` means CloudWatch returned incomplete datapoints or the cluster engine is unsupported in v1. */
  averageCurrentConnectionsLast14Days: number | null;
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
  /** Unqualified function ARN when returned by the AWS Lambda API. */
  functionArn?: string;
  /** Normalized function architectures. Missing AWS API values default to `['x86_64']`. */
  architectures: string[];
  /** Configured function memory size in MB. */
  memorySizeMb: number;
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

/** AWS Compute Optimizer evidence for a Lambda function whose memory can be reduced. */
export type AwsLambdaMemoryRecommendation = {
  functionArn: string;
  region: string;
  accountId: string;
};

/** Alias-pattern cohort aggregated without retaining the underlying KMS alias values. */
export type AwsKmsAliasPatternGroup = {
  keyCount: number;
  patternId: string;
};

/** Completeness-aware KMS usage classification derived from `GetKeyLastUsage`. */
export type AwsKmsKeyUsageEvidence =
  | 'no_kms_usage_since_creation'
  | 'unavailable'
  | 'unobserved_before_tracking'
  | 'used';

/** Per-key lifecycle and usage evidence retained without aliases. */
export type AwsKmsKeyUsage = {
  accountId: string;
  creationDate: string;
  estimatedMonthlyStorageCostUsd: number;
  keyArn: string;
  lastUsageAt?: string;
  multiRegion: boolean;
  region: string;
  storageCostEstimateComplete: boolean;
  trackingStartDate?: string;
  usageEvidence: AwsKmsKeyUsageEvidence;
};

/** Regional evidence for customer-managed KMS key proliferation and creation churn. */
export type AwsKmsKeyChurnReview = {
  accountId: string;
  aliasPatternGroups: AwsKmsAliasPatternGroup[];
  aliasPatternsAvailable: boolean;
  creationWindowEnd: string;
  creationWindowStart: string;
  enabledCustomerManagedKeyCount: number;
  estimatedMonthlyStorageCostUsd: number;
  /** Whether every discovered KMS key could be classified through `DescribeKey`. */
  keyMetadataComplete: boolean;
  /** Discovered KMS keys whose manager, state, and creation date could not be read. */
  keyMetadataUnavailableCount: number;
  keys: AwsKmsKeyUsage[];
  keysCreatedInWindow: number;
  multiRegionKeyCount: number;
  noKmsUsageSinceCreationKeyCount: number;
  region: string;
  reviewId: string;
  rotatedKeyCount: number;
  storageCostEstimateComplete: boolean;
  unobservedBeforeTrackingKeyCount: number;
  usageMetadataUnavailableKeyCount: number;
  usedKeyCount: number;
};

/** Discovered SageMaker notebook instance normalized for running-state checks. */
export type AwsSageMakerNotebookInstance = {
  notebookInstanceName: string;
  notebookInstanceStatus: string;
  instanceType: string;
  lastModifiedTime?: string;
  region: string;
  accountId: string;
};

/** Discovered SageMaker endpoint with 14-day invocation totals for idle checks. */
export type AwsSageMakerEndpointActivity = {
  endpointArn: string;
  endpointName: string;
  endpointStatus: string;
  endpointConfigName: string;
  creationTime?: string;
  lastModifiedTime?: string;
  /** `null` means CloudWatch did not return complete invocation coverage for the 14-day window. */
  totalInvocationsLast14Days: number | null;
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
  storageType?: string;
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

/** Discovered Elastic Load Balancer with 14-day request activity coverage. */
export type AwsEc2LoadBalancerRequestActivity = {
  loadBalancerArn: string;
  /** `null` means CloudWatch returned incomplete datapoints for the 14-day lookback window. */
  averageRequestsPerDayLast14Days: number | null;
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

/** Discovered DynamoDB table with billing mode and stream-label metadata. */
export type AwsDynamoDbTable = {
  tableArn: string;
  tableName: string;
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
  tableStatus?: string;
  creationDateTime?: string;
  /** Present only when DynamoDB Streams is enabled and AWS reports a latest stream label. */
  latestStreamLabel?: string;
  region: string;
  accountId: string;
};

/** Discovered DynamoDB Application Auto Scaling state for table read/write capacity. */
export type AwsDynamoDbAutoscaling = {
  tableArn: string;
  tableName: string;
  hasReadTarget: boolean;
  hasWriteTarget: boolean;
  region: string;
  accountId: string;
};

/** Discovered DynamoDB table with 30-day consumed-capacity summaries. */
export type AwsDynamoDbTableUtilization = {
  tableArn: string;
  tableName: string;
  /** `null` means CloudWatch returned incomplete datapoints for the 30-day read lookback window. */
  totalConsumedReadCapacityUnitsLast30Days: number | null;
  /** `null` means CloudWatch returned incomplete datapoints for the 30-day write lookback window. */
  totalConsumedWriteCapacityUnitsLast30Days: number | null;
  /** `null` or `undefined` means the table lacks a complete 90-day write-activity window. */
  totalConsumedWriteCapacityUnitsLast90Days?: number | null;
  region: string;
  accountId: string;
};

/** Shared S3 lifecycle and storage-optimization analysis flags across scan modes. */
export type AwsS3BucketAnalysisFlags = {
  hasLifecycleSignal: boolean;
  hasCostFocusedLifecycle: boolean;
  hasAbortIncompleteMultipartUploadAfter7Days: boolean;
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

/** Discovered Route 53 hosted zone normalized for record-set analysis. */
export type AwsRoute53Zone = {
  hostedZoneArn: string;
  hostedZoneId: string;
  zoneName: string;
  region: string;
  accountId: string;
};

/** Discovered Route 53 record set normalized for TTL and health-check analysis. */
export type AwsRoute53Record = {
  recordId: string;
  hostedZoneId: string;
  recordName: string;
  recordType: string;
  /** Alias records inherit TTL behavior from their targets and are evaluated separately. */
  isAlias: boolean;
  recordSetIdentifier?: string;
  ttl?: number;
  healthCheckId?: string;
  region: string;
  accountId: string;
};

/** Discovered Route 53 health check normalized for orphaned-check analysis. */
export type AwsRoute53HealthCheck = {
  healthCheckArn: string;
  healthCheckId: string;
  region: string;
  accountId: string;
};

/** Discovered Secrets Manager secret normalized for unused-secret review checks. */
export type AwsSecretsManagerSecret = {
  secretArn: string;
  secretName: string;
  lastAccessedDate?: string;
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

/** Taggable AWS resource that Resource Explorer reports without user-created tags. */
export type AwsUntaggedResource = Pick<
  AwsDiscoveredResource,
  'accountId' | 'arn' | 'region' | 'resourceType' | 'service'
>;

/** Resource Explorer-backed discovery catalog used as the live scan seed. */
export type AwsDiscoveryCatalog = {
  resources: AwsDiscoveredResource[];
  searchRegion: string;
  indexType: 'LOCAL' | 'AGGREGATOR';
  viewArn?: string;
};

/** Rule-facing live discovery dataset key exposed through the evaluation context. */
export type SharedDatasetKey =
  | 'aws-cloudfront-distributions'
  | 'aws-cloudwatch-log-groups'
  | 'aws-dynamodb-autoscaling'
  | 'aws-dynamodb-tables'
  | 'aws-ebs-volumes'
  | 'aws-ecs-autoscaling'
  | 'aws-ecs-services'
  | 'aws-ecr-repositories'
  | 'aws-ec2-elastic-ips'
  | 'aws-ec2-instances'
  | 'aws-elasticache-clusters'
  | 'aws-eks-nodegroups'
  | 'aws-emr-clusters'
  | 'aws-lambda-functions'
  | 'aws-rds-instances'
  | 'aws-redshift-clusters'
  | 'aws-route53-health-checks'
  | 'aws-route53-records'
  | 'aws-s3-bucket-analyses';

/** Rule-facing live discovery dataset key exposed through the evaluation context. */
export type DiscoveryDatasetKey =
  | 'aws-cloudtrail-trails'
  | 'aws-cloudfront-distributions'
  | 'aws-cloudfront-distribution-request-activity'
  | 'aws-cloudwatch-log-groups'
  | 'aws-cloudwatch-log-group-recent-stream-activity'
  | 'aws-cloudwatch-log-streams'
  | 'aws-config-recording-frequency-reviews'
  | 'aws-cost-usage'
  | 'aws-cost-anomaly-monitors'
  | 'aws-cost-guardrail-budgets'
  | 'aws-dynamodb-autoscaling'
  | 'aws-dynamodb-table-utilization'
  | 'aws-dynamodb-tables'
  | 'aws-ebs-snapshots'
  | 'aws-ebs-volumes'
  | 'aws-elasticache-cluster-activity'
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
  | 'aws-ec2-nat-gateway-activity'
  | 'aws-ec2-load-balancer-request-activity'
  | 'aws-ec2-load-balancers'
  | 'aws-ec2-reserved-instances'
  | 'aws-ec2-target-groups'
  | 'aws-ec2-vpc-endpoint-activity'
  | 'aws-eks-nodegroups'
  | 'aws-emr-clusters'
  | 'aws-emr-cluster-metrics'
  | 'aws-lambda-functions'
  | 'aws-lambda-function-metrics'
  | 'aws-lambda-memory-recommendations'
  | 'aws-kms-key-churn-reviews'
  | 'aws-kms-key-usage'
  | 'aws-rds-instance-activity'
  | 'aws-rds-instance-cpu-metrics'
  | 'aws-rds-instances'
  | 'aws-rds-reserved-instances'
  | 'aws-rds-snapshots'
  | 'aws-redshift-clusters'
  | 'aws-redshift-cluster-metrics'
  | 'aws-redshift-reserved-nodes'
  | 'aws-route53-health-checks'
  | 'aws-route53-records'
  | 'aws-route53-zones'
  | 'aws-s3-bucket-analyses'
  | 'aws-sagemaker-endpoint-activity'
  | 'aws-sagemaker-notebook-instances'
  | 'aws-resource-explorer-untagged-resources'
  | 'aws-secretsmanager-secrets';

/** Normalized live discovery datasets available to rule evaluators. */
export type DiscoveryDatasetMap = {
  'aws-cloudtrail-trails': AwsCloudTrailTrail[];
  'aws-cloudfront-distributions': AwsCloudFrontDistribution[];
  'aws-cloudfront-distribution-request-activity': AwsCloudFrontDistributionRequestActivity[];
  'aws-cloudwatch-log-groups': AwsCloudWatchLogGroup[];
  'aws-cloudwatch-log-group-recent-stream-activity': AwsCloudWatchLogGroupRecentStreamActivity[];
  'aws-cloudwatch-log-streams': AwsCloudWatchLogStream[];
  'aws-config-recording-frequency-reviews': AwsConfigRecordingFrequencyReview[];
  'aws-cost-usage': AwsCostUsage[];
  'aws-cost-anomaly-monitors': AwsCostAnomalyMonitor[];
  'aws-cost-guardrail-budgets': AwsCostGuardrailBudget[];
  'aws-dynamodb-autoscaling': AwsDynamoDbAutoscaling[];
  'aws-dynamodb-table-utilization': AwsDynamoDbTableUtilization[];
  'aws-dynamodb-tables': AwsDynamoDbTable[];
  'aws-ebs-snapshots': AwsEbsSnapshot[];
  'aws-ebs-volumes': AwsEbsVolume[];
  'aws-elasticache-cluster-activity': AwsElastiCacheClusterActivity[];
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
  'aws-ec2-nat-gateway-activity': AwsEc2NatGatewayActivity[];
  'aws-ec2-load-balancer-request-activity': AwsEc2LoadBalancerRequestActivity[];
  'aws-ec2-load-balancers': AwsEc2LoadBalancer[];
  'aws-ec2-reserved-instances': AwsEc2ReservedInstance[];
  'aws-ec2-target-groups': AwsEc2TargetGroup[];
  'aws-ec2-vpc-endpoint-activity': AwsEc2VpcEndpointActivity[];
  'aws-eks-nodegroups': AwsEksNodegroup[];
  'aws-emr-clusters': AwsEmrCluster[];
  'aws-emr-cluster-metrics': AwsEmrClusterMetric[];
  'aws-lambda-functions': AwsLambdaFunction[];
  'aws-lambda-function-metrics': AwsLambdaFunctionMetric[];
  'aws-lambda-memory-recommendations': AwsLambdaMemoryRecommendation[];
  'aws-kms-key-churn-reviews': AwsKmsKeyChurnReview[];
  'aws-kms-key-usage': AwsKmsKeyUsage[];
  'aws-rds-instance-activity': AwsRdsInstanceActivity[];
  'aws-rds-instance-cpu-metrics': AwsRdsInstanceCpuMetric[];
  'aws-rds-instances': AwsRdsInstance[];
  'aws-rds-reserved-instances': AwsRdsReservedInstance[];
  'aws-rds-snapshots': AwsRdsSnapshot[];
  'aws-redshift-clusters': AwsRedshiftCluster[];
  'aws-redshift-cluster-metrics': AwsRedshiftClusterMetric[];
  'aws-redshift-reserved-nodes': AwsRedshiftReservedNode[];
  'aws-route53-health-checks': AwsRoute53HealthCheck[];
  'aws-route53-records': AwsRoute53Record[];
  'aws-route53-zones': AwsRoute53Zone[];
  'aws-s3-bucket-analyses': AwsS3BucketAnalysis[];
  'aws-sagemaker-endpoint-activity': AwsSageMakerEndpointActivity[];
  'aws-sagemaker-notebook-instances': AwsSageMakerNotebookInstance[];
  'aws-resource-explorer-untagged-resources': AwsUntaggedResource[];
  'aws-secretsmanager-secrets': AwsSecretsManagerSecret[];
};

/** Rule-facing static IaC dataset key exposed through the evaluation context. */
export type StaticDatasetKey = SharedDatasetKey | 'aws-ec2-vpc-endpoints';

/** Normalized static CloudFront distribution dataset entry. */
export type AwsStaticCloudFrontDistribution = {
  resourceId: string;
  priceClass: string | null;
  location?: SourceLocation;
};

/** Normalized static CloudWatch log group dataset entry. */
export type AwsStaticCloudWatchLogGroup = {
  resourceId: string;
  retentionInDays: number | null | undefined;
  logGroupClass: string | null | undefined;
  location?: SourceLocation;
};

/** Normalized static DynamoDB table dataset entry. */
export type AwsStaticDynamoDbTable = {
  resourceId: string;
  tableName: string | null;
  billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED' | null;
  location?: SourceLocation;
};

/** Normalized static DynamoDB table autoscaling dataset entry. */
export type AwsStaticDynamoDbAutoscaling = {
  tableName: string | null;
  hasReadTarget: boolean;
  hasWriteTarget: boolean;
  readMinCapacity?: number | null;
  readMaxCapacity?: number | null;
  writeMinCapacity?: number | null;
  writeMaxCapacity?: number | null;
};

/** Normalized static EBS volume dataset entry with a precomputed finding target. */
export type AwsStaticEbsVolume = {
  resourceId: string;
  sizeGiB: number | null;
  iops: number | null;
  throughputMiBps?: number | null;
  volumeType: string | null;
  location?: SourceLocation;
};

/** Normalized static ECR repository dataset entry with lifecycle-policy state. */
export type AwsStaticEcrRepository = {
  resourceId: string;
  hasLifecyclePolicy: boolean;
  hasTaggedImageRetentionCap?: boolean | null;
  hasUntaggedImageExpiry?: boolean | null;
  location?: SourceLocation;
};

/** Normalized static EC2 instance dataset entry with a precomputed finding target. */
export type AwsStaticEc2Instance = {
  resourceId: string;
  detailedMonitoringEnabled?: boolean;
  instanceType: string | null;
  location?: SourceLocation;
};

/** Normalized static Elastic IP dataset entry with derived association state. */
export type AwsStaticEc2ElasticIp = {
  resourceId: string;
  isAssociated: boolean;
  location?: SourceLocation;
};

/** Normalized static EKS node group dataset entry. */
export type AwsStaticEksNodegroup = {
  resourceId: string;
  instanceTypes: string[];
  amiType: string | null;
  location?: SourceLocation;
};

/** Normalized static EMR cluster dataset entry. */
export type AwsStaticEmrCluster = {
  resourceId: string;
  instanceTypes: string[];
  location?: SourceLocation;
};

/** Normalized static Route 53 record dataset entry. */
export type AwsStaticRoute53Record = {
  resourceId: string;
  isAlias: boolean;
  ttl: number | null | undefined;
  referencedHealthCheckResourceId: string | null;
  location?: SourceLocation;
};

/** Normalized static Route 53 health check dataset entry. */
export type AwsStaticRoute53HealthCheck = {
  resourceId: string;
  location?: SourceLocation;
};

/** Normalized static RDS instance dataset entry with a precomputed finding target. */
export type AwsStaticRdsInstance = {
  resourceId: string;
  instanceClass: string | null;
  engine: string | null;
  engineVersion: string | null;
  performanceInsightsEnabled?: boolean | null;
  performanceInsightsRetentionPeriod?: number | null | undefined;
  storageType?: string | null;
  location?: SourceLocation;
};

/** Normalized static Lambda function dataset entry with source-aware architecture metadata. */
export type AwsStaticLambdaFunction = {
  resourceId: string;
  architectures: string[] | null;
  location?: SourceLocation;
};

/** Normalized static ECS service dataset entry. */
export type AwsStaticEcsService = {
  resourceId: string;
  clusterName: string | null;
  serviceName: string | null;
  schedulingStrategy: string | null;
  location?: SourceLocation;
};

/** Normalized static ECS autoscaling dataset entry. */
export type AwsStaticEcsServiceAutoscaling = {
  clusterName: string | null;
  serviceName: string | null;
  hasScalableTarget: boolean;
  hasScalingPolicy: boolean;
};

/** Normalized static Redshift cluster dataset entry. */
export type AwsStaticRedshiftCluster = {
  resourceId: string;
  automatedSnapshotRetentionPeriod: number | null | undefined;
  hasPauseSchedule: boolean;
  hasResumeSchedule: boolean;
  hasVpc: boolean;
  hsmEnabled: boolean | null;
  multiAz: boolean | null;
  location?: SourceLocation;
};

/** Normalized static ElastiCache cluster dataset entry. */
export type AwsStaticElastiCacheCluster = {
  resourceId: string;
  cacheNodeType: string | null;
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
  hasNoncurrentVersionCleanup?: boolean;
  resourceId: string;
  versioningEnabled?: boolean | null;
  location?: SourceLocation;
};

/** Normalized static datasets available to rule evaluators. */
export type StaticDatasetMap = {
  'aws-cloudfront-distributions': AwsStaticCloudFrontDistribution[];
  'aws-cloudwatch-log-groups': AwsStaticCloudWatchLogGroup[];
  'aws-dynamodb-autoscaling': AwsStaticDynamoDbAutoscaling[];
  'aws-dynamodb-tables': AwsStaticDynamoDbTable[];
  'aws-ebs-volumes': AwsStaticEbsVolume[];
  'aws-ecr-repositories': AwsStaticEcrRepository[];
  'aws-ecs-autoscaling': AwsStaticEcsServiceAutoscaling[];
  'aws-ecs-services': AwsStaticEcsService[];
  'aws-ec2-elastic-ips': AwsStaticEc2ElasticIp[];
  'aws-ec2-instances': AwsStaticEc2Instance[];
  'aws-elasticache-clusters': AwsStaticElastiCacheCluster[];
  'aws-eks-nodegroups': AwsStaticEksNodegroup[];
  'aws-emr-clusters': AwsStaticEmrCluster[];
  'aws-lambda-functions': AwsStaticLambdaFunction[];
  'aws-ec2-vpc-endpoints': AwsStaticEc2VpcEndpoint[];
  'aws-rds-instances': AwsStaticRdsInstance[];
  'aws-redshift-clusters': AwsStaticRedshiftCluster[];
  'aws-route53-health-checks': AwsStaticRoute53HealthCheck[];
  'aws-route53-records': AwsStaticRoute53Record[];
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
  suppressions?: IaCSuppression[];
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
  severity: Severity;
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
  severity: Severity;
  supports: Source[];
  discoveryDependencies?: DiscoveryDatasetKey[];
  staticDependencies?: StaticDatasetKey[];
  evaluateLive?: (context: LiveEvaluationContext) => Finding | null;
  evaluateStatic?: (context: StaticEvaluationContext) => Finding | null;
};
