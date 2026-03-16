export {
  createCloudTrailClient,
  createCloudWatchClient,
  createCloudWatchLogsClient,
  createEc2Client,
  createEcrClient,
  createLambdaClient,
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
