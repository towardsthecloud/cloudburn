export {
  createCloudTrailClient,
  createCloudWatchClient,
  createCloudWatchLogsClient,
  createEc2Client,
  createEcrClient,
  createElastiCacheClient,
  createEmrClient,
  createLambdaClient,
  createRedshiftClient,
  createResourceExplorerClient,
  listEnabledAwsRegions,
  resolveAwsAccountId,
  resolveCurrentAwsRegion,
} from './client.js';
export {
  discoverAwsResources,
  initializeAwsDiscovery,
  listEnabledAwsDiscoveryRegions,
  listSupportedAwsResourceTypes,
} from './discovery.js';
