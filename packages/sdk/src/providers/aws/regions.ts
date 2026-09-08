import { AwsDiscoveryError } from './errors.js';

const AWS_REGION_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;
export const AWS_REGIONS = [
  'af-south-1',
  'ap-east-1',
  'ap-east-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ap-southeast-5',
  'ap-southeast-6',
  'ap-southeast-7',
  'ca-central-1',
  'ca-west-1',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'il-central-1',
  'me-central-1',
  'me-south-1',
  'mx-central-1',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
] as const;

export type AwsRegion = (typeof AWS_REGIONS)[number];
const SUPPORTED_AWS_REGIONS_MESSAGE = AWS_REGIONS.join(', ');

const assertAwsRegionShape = (region: string | undefined): string => {
  if (!region || !AWS_REGION_PATTERN.test(region)) {
    throw new AwsDiscoveryError(
      'INVALID_AWS_REGION',
      `Invalid AWS region '${region ?? ''}'. Use a valid AWS region name such as 'eu-central-1' or 'us-east-1'.`,
    );
  }

  return region;
};

/**
 * Validates an AWS region string before it is used in clients or filters.
 *
 * @param region - AWS region to validate.
 * @returns The original region when valid.
 */
export const assertValidAwsRegion = (region: string | undefined): AwsRegion =>
  assertAwsRegionShape(region) as AwsRegion;

/**
 * Validates that a CLI-supplied AWS region is one of the known supported regions.
 *
 * @param region - AWS region supplied by the caller.
 * @returns The original region when it is part of the supported region list.
 */
export const assertSupportedAwsRegion = (region: string | undefined): AwsRegion => {
  if (!region || !AWS_REGION_PATTERN.test(region) || !AWS_REGIONS.includes(region as AwsRegion)) {
    throw new AwsDiscoveryError(
      'INVALID_AWS_REGION',
      `Invalid AWS region '${region ?? ''}'. Supported regions: ${SUPPORTED_AWS_REGIONS_MESSAGE}.`,
    );
  }

  return region as AwsRegion;
};
