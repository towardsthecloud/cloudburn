import { isAwsDiscoveryErrorCode } from '@cloudburn/sdk';
import type { CallToolResult } from '@modelcontextprotocol/server';

/** Tool argument error raised before any scan starts. */
export class InvalidArgumentError extends Error {
  public readonly code = 'INVALID_ARGUMENT';
}

type ToolErrorBody = {
  code: string;
  message: string;
};

const sanitizeRuntimeErrorMessage = (message: string): string =>
  message
    .replace(/169\.254\.169\.254/g, '[redacted-host]')
    .replace(/fd00:ec2::254/gi, '[redacted-host]')
    .replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, '$1[redacted-auth]@')
    .replace(
      /([?&](?:access_token|authorization|token|x-amz-security-token|x-amz-signature|signature)=)[^&\s]+/gi,
      '$1[redacted]',
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[redacted]');

const categorize = (err: unknown): ToolErrorBody => {
  if (!(err instanceof Error)) {
    return { code: 'RUNTIME_ERROR', message: 'An unexpected error occurred.' };
  }

  const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined;

  if (err instanceof InvalidArgumentError) {
    return { code: err.code, message: err.message };
  }

  if (
    err.name === 'CredentialsProviderError' ||
    err.name === 'ExpiredTokenException' ||
    code === 'CredentialsProviderError' ||
    code === 'ExpiredTokenException'
  ) {
    return {
      code: 'CREDENTIALS_ERROR',
      message:
        "AWS credentials not found or expired. Refresh the session (for example 'aws sts get-caller-identity') and set AWS_PROFILE or AWS_REGION in the environment that starts the MCP server.",
    };
  }

  if (err.name.includes('AccessDenied') || code?.includes('AccessDenied') === true) {
    return {
      code: 'ACCESS_DENIED',
      message:
        sanitizeRuntimeErrorMessage(err.message).trim() ||
        'Insufficient AWS permissions. Check your IAM role or policy.',
    };
  }

  if (code === 'ENOENT') {
    const path = (err as NodeJS.ErrnoException).path ?? 'unknown';
    return { code: 'PATH_NOT_FOUND', message: `Path not found: ${path}` };
  }

  if (code && isAwsDiscoveryErrorCode(code)) {
    return {
      code,
      message: sanitizeRuntimeErrorMessage(err.message).trim() || 'AWS Resource Explorer discovery failed.',
    };
  }

  return {
    code: 'RUNTIME_ERROR',
    message: sanitizeRuntimeErrorMessage(err.message).trim() || 'An unexpected error occurred.',
  };
};

/**
 * Converts a thrown value into an MCP tool error result with the CLI's `{ error: { code, message } }` envelope.
 * Messages are redacted so credentials, signed URLs, and metadata endpoints never reach the model.
 *
 * @param err - The thrown value; non-Error inputs map to a generic runtime error.
 * @returns A tool result flagged with `isError` whose text is the JSON error envelope.
 */
export const toToolError = (err: unknown): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: categorize(err) }) }],
});

/**
 * Wraps a JSON-serializable value as a successful MCP tool result.
 *
 * @param value - Scan result, status, or rule metadata to return to the client.
 * @returns A tool result whose text content is compact JSON.
 */
export const toToolResult = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
});
