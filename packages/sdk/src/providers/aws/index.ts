export {
  createEc2Client,
  createLambdaClient,
  createResourceExplorerClient,
  listEnabledAwsRegions,
  resolveAwsAccountId,
  resolveCurrentAwsRegion,
} from './client.js';
export {
  initializeAwsDiscovery,
  listEnabledAwsDiscoveryRegions,
  listSupportedAwsResourceTypes,
  scanAwsResources,
} from './scanner.js';
