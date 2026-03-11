export {
  createEc2Client,
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
