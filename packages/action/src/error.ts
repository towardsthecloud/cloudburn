type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
  };
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

/**
 * Categorizes a runtime error and returns a structured JSON string, matching
 * the CLI's stderr error envelope. Only codes reachable from a static scan
 * (file access, parsing, configuration) are categorized.
 *
 * @param err - The thrown value; non-Error inputs map to a generic envelope.
 * @returns A pretty-printed `{"error": {...}}` JSON string for stderr.
 */
export const formatError = (err: unknown): string => {
  const envelope: ErrorEnvelope = { error: categorize(err) };
  return JSON.stringify(envelope, null, 2);
};

const categorize = (err: unknown): ErrorEnvelope['error'] => {
  if (!(err instanceof Error)) {
    return { code: 'RUNTIME_ERROR', message: 'An unexpected error occurred.' };
  }

  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    const path = (err as NodeJS.ErrnoException).path ?? 'unknown';
    return { code: 'PATH_NOT_FOUND', message: `Path not found: ${path}` };
  }

  const sanitizedMessage = sanitizeRuntimeErrorMessage(err.message).trim();

  return {
    code: 'RUNTIME_ERROR',
    message: sanitizedMessage || 'An unexpected error occurred.',
  };
};
