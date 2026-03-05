// Intent: expose AWS provider adapter APIs for live scanning.
// TODO(cloudburn): add service-specific options and typed resource envelopes.
export { createAwsClient } from './client.js';
export { scanAwsResources } from './scanner.js';
