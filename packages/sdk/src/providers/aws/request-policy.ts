/** AWS quota identity shared by callers regardless of their credentials or datasets. */
export type AwsQuotaScope = {
  accountId: string;
  partition: string;
  region?: string;
  service: string;
  group: string;
  resource?: string;
};

/** Admission and retry limits for one AWS quota domain. */
export type AwsQuotaPolicy = {
  ratePerSecond: number;
  burst: number;
  concurrency: number;
  retryCapacity: number;
};

/** Explicit local limits indexed by the canonical `service:group` quota name. */
export type AwsQuotaOverrides = Record<string, Partial<AwsQuotaPolicy>>;

// An explicit local fallback, not a claim about an undocumented AWS quota.
const DEFAULT_POLICY: AwsQuotaPolicy = { ratePerSecond: 10, burst: 10, concurrency: 10, retryCapacity: 20 };

const GLOBAL_SERVICES = new Set(['route53', 'cloudfront', 'budgets', 'cost-explorer', 'cost-optimization-hub']);
const KNOWN_SERVICES = new Set([
  ...GLOBAL_SERVICES,
  'application-autoscaling',
  'cloudtrail',
  'cloudwatch',
  'compute-optimizer',
  'config',
  'dynamodb',
  'ec2',
  'ecr',
  'ecs',
  'eks',
  'elasticloadbalancing',
  'elasticloadbalancingv2',
  'elasticache',
  'emr',
  'kms',
  'lambda',
  'logs',
  'rds',
  'redshift',
  'resource-explorer-2',
  's3',
  'sagemaker',
  'secretsmanager',
  'sts',
]);

type RequestLimit = { ratePerSecond: number; burst?: number; group?: string };

// AWS references checked 2026-09-07. Unverified local limits are labeled below.
// Local bursts for verified quotas are deliberately below AWS burst allowances.
// https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html
// https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_limits.html
const REQUEST_LIMITS: Record<string, RequestLimit> = {
  'logs:DescribeLogStreams': { ratePerSecond: 25 },
  'logs:DescribeLogGroups': { ratePerSecond: 10 },
  'cloudwatch:GetMetricData': { ratePerSecond: 500 },
  'cloudwatch:ListMetrics': { ratePerSecond: 25 },
  // EC2 quotas apply per API, even when the documented rates share a category.
  // Ten requests/second also covers the smaller unfiltered/unpaginated read bucket.
  // https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-throttling.html
  'ec2:DescribeAddresses': { ratePerSecond: 10, burst: 10 },
  'ec2:DescribeInstances': { ratePerSecond: 10, burst: 10 },
  'ec2:DescribeNatGateways': { ratePerSecond: 10, burst: 10 },
  'ec2:DescribeReservedInstances': { ratePerSecond: 10, burst: 10 },
  'ec2:DescribeSnapshots': { ratePerSecond: 10, burst: 10 },
  'ec2:DescribeTransitGatewayAttachments': { ratePerSecond: 10, burst: 10 },
  'ec2:DescribeTransitGatewayVpcAttachments': { ratePerSecond: 10, burst: 10 },
  'ec2:DescribeVolumes': { ratePerSecond: 10, burst: 10 },
  'ec2:DescribeVpcEndpoints': { ratePerSecond: 10, burst: 10 },
  // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/request-throttling.html
  'ecs:DescribeServices': { ratePerSecond: 20, group: 'service-read' },
  'ecs:ListServices': { ratePerSecond: 20, group: 'service-read' },
  'ecs:DescribeContainerInstances': { ratePerSecond: 20, group: 'cluster-resource-read' },
  'ecs:DescribeTasks': { ratePerSecond: 20, group: 'cluster-resource-read' },
  'ecs:ListAttributes': { ratePerSecond: 20, group: 'cluster-resource-read' },
  'ecs:ListContainerInstances': { ratePerSecond: 20, group: 'cluster-resource-read' },
  'ecs:ListTasks': { ratePerSecond: 20, group: 'cluster-resource-read' },
  // This aggregate read budget also stays within GetResourcePolicy's lower 100/s quota.
  // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html
  'dynamodb:DescribeTable': { ratePerSecond: 100, group: 'control-plane-read' },
  'dynamodb:ListTables': { ratePerSecond: 100, group: 'control-plane-read' },
  'dynamodb:GetResourcePolicy': { ratePerSecond: 100, group: 'control-plane-read' },
  // Each ELB API version has a separate aggregate account/region budget of 10/s.
  // https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/elb-api-throttling.html
  'elasticloadbalancing:DescribeLoadBalancers': { ratePerSecond: 10, group: 'all-requests' },
  'elasticloadbalancingv2:DescribeLoadBalancers': { ratePerSecond: 10, group: 'all-requests' },
  'elasticloadbalancingv2:DescribeTargetGroups': { ratePerSecond: 10, group: 'all-requests' },
  'elasticloadbalancingv2:DescribeTargetHealth': { ratePerSecond: 10, group: 'all-requests' },
  // KMS control-plane quotas count every key; resource identifiers must not split them.
  // https://docs.aws.amazon.com/kms/latest/developerguide/requests-per-second.html
  'kms:GetKeyLastUsage': { ratePerSecond: 5 },
  'kms:DescribeKey': { ratePerSecond: 100 },
  'kms:ListAliases': { ratePerSecond: 100 },
  'kms:ListKeyRotations': { ratePerSecond: 100 },
  // https://docs.aws.amazon.com/general/latest/gr/emr.html
  'emr:DescribeCluster': { ratePerSecond: 1 },
  'emr:ListInstances': { ratePerSecond: 0.5 },
  // https://docs.aws.amazon.com/general/latest/gr/ct.html
  'cloudtrail:DescribeTrails': { ratePerSecond: 10 },
  // Shared remainder-control-plane quota; excludes operations with dedicated limits.
  // https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
  'lambda:ListFunctions': { ratePerSecond: 15, group: 'control-plane' },
  'lambda:ListVersionsByFunction': { ratePerSecond: 15, group: 'control-plane' },
  // https://docs.aws.amazon.com/resource-explorer/latest/userguide/quotas.html
  'resource-explorer-2:ListResources': { ratePerSecond: 3, group: 'non-search' },
  // https://docs.aws.amazon.com/general/latest/gr/sagemaker.html
  'sagemaker:DescribeEndpoint': { ratePerSecond: 5 },
  'sagemaker:DescribeEndpointConfig': { ratePerSecond: 5 },
  // Local bucket-control-plane budget: object-prefix throughput does not establish
  // the AWS quota for these configuration reads. Share across both reads and buckets.
  's3:GetBucketLifecycleConfiguration': { ratePerSecond: 10, burst: 10, group: 'bucket-control-plane' },
  's3:ListBucketIntelligentTieringConfigurations': { ratePerSecond: 10, burst: 10, group: 'bucket-control-plane' },
};

const canonicalService = (service: string): string => {
  const name = service
    .trim()
    .replace(/^(Amazon|AWS)\s+/i, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (name === 'cloudwatch-logs') return 'logs';
  if (name === 'route-53') return 'route53';
  if (name === 'elastic-load-balancing') return 'elasticloadbalancing';
  if (name === 'elastic-load-balancing-v2') return 'elasticloadbalancingv2';
  if (name === 'secrets-manager') return 'secretsmanager';
  if (name === 'application-auto-scaling') return 'application-autoscaling';
  if (name === 'resource-explorer') return 'resource-explorer-2';
  return name;
};

const partitionForRegion = (region: string): string => {
  if (region.startsWith('cn-')) return 'aws-cn';
  if (region.startsWith('us-gov-')) return 'aws-us-gov';
  return 'aws';
};

const applyOverrides = (key: string, policy: AwsQuotaPolicy, overrides?: AwsQuotaOverrides): AwsQuotaPolicy => {
  const override = overrides && Object.hasOwn(overrides, key) ? overrides[key] : undefined;
  const merged = { ...policy, ...override };
  const result = {
    ratePerSecond: merged.ratePerSecond,
    burst: merged.burst,
    concurrency: merged.concurrency,
    retryCapacity: merged.retryCapacity,
  };
  if (!Number.isFinite(result.ratePerSecond) || result.ratePerSecond <= 0) {
    throw new RangeError(`AWS quota ${key} ratePerSecond must be finite and positive.`);
  }
  if (!Number.isFinite(result.burst) || result.burst < 1 || result.burst > Math.max(1, result.ratePerSecond)) {
    throw new RangeError(`AWS quota ${key} burst must be at least one and no greater than max(1, ratePerSecond).`);
  }
  if (!Number.isSafeInteger(result.concurrency) || result.concurrency <= 0) {
    throw new RangeError(`AWS quota ${key} concurrency must be a positive safe integer.`);
  }
  if (!Number.isSafeInteger(result.retryCapacity) || result.retryCapacity < 0) {
    throw new RangeError(`AWS quota ${key} retryCapacity must be a nonnegative safe integer.`);
  }
  return result;
};

/**
 * Resolves conservative request limits without introducing dataset or credential isolation into the quota key.
 *
 * @param service - Collector service label or canonical AWS service name.
 * @param operation - AWS operation being requested.
 * @param region - Region of the service endpoint.
 * @param accountId - AWS account charged for the request.
 * @param options - Existing collector policy selector, explicit local limits, and optional resource identity.
 * @returns The shared quota scope and its admission policy.
 */
export const resolveAwsRequestQuota = (
  service: string,
  operation: string,
  region: string,
  accountId: string,
  options: { callPolicy?: 'default' | 'route53'; overrides?: AwsQuotaOverrides; resource?: string } = {},
): { scope: AwsQuotaScope; policy: AwsQuotaPolicy } => {
  const name = options.callPolicy === 'route53' ? 'route53' : canonicalService(service);
  const partition = partitionForRegion(region);
  if (name === 'route53') {
    // Keep CloudBurn's existing global 5/s budget. AWS now documents 10/s both
    // across the account and per default operation, so this remains conservative.
    // https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/throttling-api-requests.html
    return {
      scope: { accountId, partition, service: name, group: 'all-requests' },
      policy: applyOverrides(
        'route53:all-requests',
        { ...DEFAULT_POLICY, ratePerSecond: 5, burst: 5 },
        options.overrides,
      ),
    };
  }
  const limit = REQUEST_LIMITS[`${name}:${operation}`];
  const group = limit?.group ?? operation;
  return {
    scope: {
      accountId,
      partition,
      ...(GLOBAL_SERVICES.has(name) ? {} : { region }),
      service: name,
      group,
      ...(!KNOWN_SERVICES.has(name) && options.resource ? { resource: options.resource } : {}),
    },
    policy: applyOverrides(
      `${name}:${group}`,
      {
        ...DEFAULT_POLICY,
        ratePerSecond: limit?.ratePerSecond ?? DEFAULT_POLICY.ratePerSecond,
        burst: limit ? (limit.burst ?? 1) : DEFAULT_POLICY.burst,
      },
      options.overrides,
    ),
  };
};

/**
 * Reserves the complete requested CloudWatch page against its regional datapoint quota.
 *
 * @param input - SDK GetMetricData input, inspected without retaining query content.
 * @param region - CloudWatch endpoint region.
 * @param accountId - AWS account charged for the request.
 * @param now - Current timestamp in milliseconds, used to classify the original StartTime.
 * @param overrides - Explicit local limits indexed by the canonical datapoint quota name.
 * @returns The datapoint quota scope, policy, and conservative cost of each page or retry.
 */
export const resolveAwsMetricDataQuota = (
  input: unknown,
  region: string,
  accountId: string,
  now: number,
  overrides?: AwsQuotaOverrides,
): { scope: AwsQuotaScope; policy: AwsQuotaPolicy; cost: number } => {
  const request = (input && typeof input === 'object' ? input : {}) as { StartTime?: unknown; MaxDatapoints?: unknown };
  const startTime = request.StartTime instanceof Date ? request.StartTime.getTime() : Number.NaN;
  const older = Number.isFinite(now) && Number.isFinite(startTime) && now - startTime > 3 * 60 * 60 * 1_000;
  const group = older ? 'GetMetricData:older-datapoints' : 'GetMetricData:recent-datapoints';
  const ratePerSecond = older ? 396_000 : 180_000;
  // MaxDatapoints bounds one returned page. Reserving that whole page also handles
  // sparse metrics and rounded StartTime values without estimating query density.
  // https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricData.html
  const maxDatapoints = request.MaxDatapoints;
  const cost =
    typeof maxDatapoints === 'number' && Number.isSafeInteger(maxDatapoints) && maxDatapoints > 0
      ? Math.min(maxDatapoints, 100_800)
      : 100_800;
  return {
    scope: { accountId, partition: partitionForRegion(region), region, service: 'cloudwatch', group },
    policy: applyOverrides(
      `cloudwatch:${group}`,
      { ...DEFAULT_POLICY, ratePerSecond, burst: ratePerSecond },
      overrides,
    ),
    cost,
  };
};
