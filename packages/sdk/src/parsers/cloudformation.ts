import type { IaCResource } from './types.js';

// Intent: parse CloudFormation templates into normalized IaCResource entries.
// TODO(cloudburn): support both YAML and JSON template parsing.
export const parseCloudFormation = async (_path: string): Promise<IaCResource[]> => [];
