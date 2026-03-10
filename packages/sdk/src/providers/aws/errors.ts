export const RESOURCE_EXPLORER_SETUP_DOCS_URL =
  'https://docs.aws.amazon.com/resource-explorer/latest/userguide/getting-started-setting-up.html';

/** Stable AWS discovery error codes surfaced by the SDK and CLI. */
export const AWS_DISCOVERY_ERROR_CODES = [
  'INVALID_AWS_REGION',
  'INVALID_RESOURCE_EXPLORER_RESOURCE_TYPE',
  'RESOURCE_EXPLORER_AGGREGATOR_REQUIRED',
  'RESOURCE_EXPLORER_DEFAULT_VIEW_REQUIRED',
  'RESOURCE_EXPLORER_FILTERED_VIEW_UNSUPPORTED',
  'RESOURCE_EXPLORER_NOT_ENABLED',
  'RESOURCE_EXPLORER_REGION_NOT_ENABLED',
] as const;

/** Union of all AWS discovery error codes emitted by CloudBurn. */
export type AwsDiscoveryErrorCode = (typeof AWS_DISCOVERY_ERROR_CODES)[number];

/**
 * Type guard for CloudBurn AWS discovery error codes.
 *
 * @param code - Runtime error code candidate.
 * @returns Whether the value is a known AWS discovery error code.
 */
export const isAwsDiscoveryErrorCode = (code: string): code is AwsDiscoveryErrorCode =>
  AWS_DISCOVERY_ERROR_CODES.includes(code as AwsDiscoveryErrorCode);

/**
 * Error type used for AWS live discovery setup and runtime failures.
 */
export class AwsDiscoveryError extends Error {
  /**
   * Stable error code exposed to the CLI error formatter.
   */
  public readonly code: AwsDiscoveryErrorCode;

  /**
   * Creates a typed AWS discovery error.
   *
   * @param code - Stable CloudBurn discovery error code.
   * @param message - User-facing error message.
   */
  public constructor(code: AwsDiscoveryErrorCode, message: string) {
    super(message);
    this.name = 'AwsDiscoveryError';
    this.code = code;
  }
}
