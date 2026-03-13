export const RESOURCE_EXPLORER_SETUP_DOCS_URL =
  'https://docs.aws.amazon.com/resource-explorer/latest/userguide/getting-started-setting-up.html';

/** Stable AWS discovery error codes surfaced by the SDK and CLI. */
export const AWS_DISCOVERY_ERROR_CODES = [
  'INVALID_AWS_REGION',
  'INVALID_RESOURCE_EXPLORER_RESOURCE_TYPE',
  'RESOURCE_EXPLORER_AGGREGATOR_REQUIRED',
  'RESOURCE_EXPLORER_AGGREGATOR_SWITCH_REQUIRES_DELAY',
  'RESOURCE_EXPLORER_DEFAULT_VIEW_REQUIRED',
  'RESOURCE_EXPLORER_FILTERED_VIEW_UNSUPPORTED',
  'RESOURCE_EXPLORER_NOT_ENABLED',
  'RESOURCE_EXPLORER_REGION_NOT_ENABLED',
] as const;

/** Union of all AWS discovery error codes emitted by CloudBurn. */
export type AwsDiscoveryErrorCode = (typeof AWS_DISCOVERY_ERROR_CODES)[number];

type AwsServiceErrorShape = Error & {
  code?: string;
  Code?: string;
  cause?: unknown;
  $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
  };
};

const toErrorChain = (err: unknown): AwsServiceErrorShape[] => {
  const chain: AwsServiceErrorShape[] = [];
  let current: unknown = err;
  let depth = 0;

  while (current instanceof Error && depth < 5) {
    chain.push(current as AwsServiceErrorShape);
    current = (current as AwsServiceErrorShape).cause;
    depth += 1;
  }

  return chain;
};

/**
 * Type guard for CloudBurn AWS discovery error codes.
 *
 * @param code - Runtime error code candidate.
 * @returns Whether the value is a known AWS discovery error code.
 */
export const isAwsDiscoveryErrorCode = (code: string): code is AwsDiscoveryErrorCode =>
  AWS_DISCOVERY_ERROR_CODES.includes(code as AwsDiscoveryErrorCode);

/**
 * Detects AWS access-denied style service failures across SDK exception shapes.
 *
 * @param err - Unknown runtime failure.
 * @returns Whether the error represents an authorization failure.
 */
export const isAwsAccessDeniedError = (err: unknown): boolean => {
  const chain = toErrorChain(err);

  if (chain.length === 0) {
    return false;
  }

  return chain.some((serviceError) => {
    const candidates = [serviceError.name, serviceError.code, serviceError.Code, serviceError.message]
      .filter((value): value is string => value !== undefined)
      .map((value) => value.toLowerCase());

    return candidates.some(
      (value) =>
        value.includes('accessdenied') ||
        value.includes('unauthorized') ||
        value.includes('not authorized') ||
        value.includes('access denied'),
    );
  });
};

/**
 * Detects AWS throttling and rate-limit style service failures across SDK exception shapes.
 *
 * @param err - Unknown runtime failure.
 * @returns Whether the error represents a throttling condition.
 */
export const isAwsThrottlingError = (err: unknown): boolean => {
  if (!(err instanceof Error)) {
    return false;
  }

  const serviceError = err as Error & {
    code?: string;
    Code?: string;
    $metadata?: {
      httpStatusCode?: number;
    };
  };
  const candidates = [err.name, serviceError.code, serviceError.Code, err.message]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase());

  return (
    candidates.some(
      (value) =>
        value.includes('throttl') ||
        value.includes('toomanyrequests') ||
        value.includes('ratelimit') ||
        value.includes('rate exceeded') ||
        value.includes('requestlimitexceeded'),
    ) || serviceError.$metadata?.httpStatusCode === 429
  );
};

/**
 * Extracts the most specific AWS error code from an error or its nested causes.
 *
 * @param err - Unknown runtime failure.
 * @returns The AWS error code or error name when available.
 */
export const getAwsErrorCode = (err: unknown): string | undefined => {
  for (const serviceError of toErrorChain(err)) {
    if (serviceError.code) {
      return serviceError.code;
    }

    if (serviceError.Code) {
      return serviceError.Code;
    }

    if (serviceError.name && serviceError.name !== 'Error') {
      return serviceError.name;
    }
  }

  return undefined;
};

/**
 * Wraps an AWS SDK error without discarding its identifying metadata.
 *
 * @param err - Original AWS SDK error.
 * @param service - AWS service label.
 * @param operation - AWS API operation name.
 * @param region - Region where the operation ran.
 * @returns Error with contextual message and preserved AWS identity fields.
 */
export const wrapAwsServiceError = (err: unknown, service: string, operation: string, region: string): Error => {
  const wrapped = new Error(formatAwsServiceErrorMessage(err, service, operation, region), {
    cause: err,
  }) as AwsServiceErrorShape;

  if (err instanceof Error) {
    const serviceError = err as AwsServiceErrorShape;

    if (serviceError.name && serviceError.name !== 'Error') {
      wrapped.name = serviceError.name;
    }

    if (serviceError.code) {
      wrapped.code = serviceError.code;
    }

    if (serviceError.Code) {
      wrapped.Code = serviceError.Code;
    }

    if (serviceError.$metadata) {
      wrapped.$metadata = { ...serviceError.$metadata };
    }
  }

  return wrapped;
};

const extractNestedAwsMessage = (cause: unknown): string | undefined => {
  if (!(cause instanceof Error)) {
    return undefined;
  }

  const message = cause.message.trim();
  return message.length > 0 ? message : undefined;
};

/**
 * Builds a contextual AWS service error message that preserves operation and region details.
 *
 * @param err - Original AWS SDK error.
 * @param service - AWS service label.
 * @param operation - AWS API operation name.
 * @param region - Region where the operation ran.
 * @returns Human-readable message with stable context.
 */
export const formatAwsServiceErrorMessage = (
  err: unknown,
  service: string,
  operation: string,
  region: string,
): string => {
  if (!(err instanceof Error)) {
    return `${service} ${operation} failed in ${region}.`;
  }

  const serviceError = err as AwsServiceErrorShape;
  const errorCode = serviceError.code ?? serviceError.Code ?? err.name;
  const requestId = serviceError.$metadata?.requestId;
  const message = err.message.trim();
  const nestedMessage = extractNestedAwsMessage(serviceError.cause);
  const bestMessage =
    nestedMessage && nestedMessage !== message && (message.length === 0 || message.toLowerCase() === 'rate exceeded')
      ? nestedMessage
      : message;
  const requestIdSuffix = requestId ? ` Request ID: ${requestId}.` : '';

  return `${service} ${operation} failed in ${region} with ${errorCode}: ${bestMessage || 'Unknown AWS service error.'}${requestIdSuffix}`;
};

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
