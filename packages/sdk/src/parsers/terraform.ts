import type { IaCResource } from './types.js';

// Intent: parse Terraform files into normalized IaCResource entries.
// TODO(cloudburn): integrate HCL parser and map TF resources to services.
export const parseTerraform = async (_path: string): Promise<IaCResource[]> => [];
