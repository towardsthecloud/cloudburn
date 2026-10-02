import { isAwsDiscoveryErrorCode } from './providers/aws/errors.js';
import type { CategorizedError } from './types.js';

const redactErrorMessage = (message: string): string =>
  message
    .replace(/169\.254\.169\.254/g, '[redacted-host]')
    .replace(/fd00:ec2::254/gi, '[redacted-host]')
    .replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, '$1[redacted-auth]@')
    .replace(
      /([?&](?:access_token|authorization|token|x-amz-security-token|x-amz-signature|signature)=)[^&\s]+/gi,
      '$1[redacted]',
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[redacted]');

/**
 * Maps a thrown value to a stable error code and a message that is safe to show users or agents.
 *
 * Credential failures get fixed guidance instead of the provider message. Other messages have metadata endpoints,
 * URL credentials, signed request parameters, and bearer tokens redacted.
 *
 * @param err - The thrown value; non-Error inputs map to a generic runtime error.
 * @returns `CREDENTIALS_ERROR`, `ACCESS_DENIED`, `PATH_NOT_FOUND`, an AWS discovery error code, or `RUNTIME_ERROR`,
 *   with its redacted message.
 */
export const categorizeError = (err: unknown): CategorizedError => {
  if (!(err instanceof Error)) {
    return { code: 'RUNTIME_ERROR', message: 'An unexpected error occurred.' };
  }

  const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined;
  const message = redactErrorMessage(err.message).trim();

  if (
    err.name === 'CredentialsProviderError' ||
    err.name === 'ExpiredTokenException' ||
    code === 'CredentialsProviderError' ||
    code === 'ExpiredTokenException'
  ) {
    return {
      code: 'CREDENTIALS_ERROR',
      message: "AWS credentials not found or expired. Run 'aws sts get-caller-identity' to verify your session.",
    };
  }

  if (err.name.includes('AccessDenied') || code?.includes('AccessDenied') === true) {
    return {
      code: 'ACCESS_DENIED',
      message: message || 'Insufficient AWS permissions. Check your IAM role or policy.',
    };
  }

  if (code === 'ENOENT') {
    return { code: 'PATH_NOT_FOUND', message: `Path not found: ${(err as NodeJS.ErrnoException).path ?? 'unknown'}` };
  }

  if (code !== undefined && isAwsDiscoveryErrorCode(code)) {
    return { code, message: message || 'AWS Resource Explorer discovery failed.' };
  }

  return { code: 'RUNTIME_ERROR', message: message || 'An unexpected error occurred.' };
};
