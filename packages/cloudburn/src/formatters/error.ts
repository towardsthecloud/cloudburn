type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
  };
};

/**
 * Categorizes a runtime error and returns a structured JSON string
 * suitable for writing to stderr.
 */
export const formatError = (err: unknown): string => {
  const envelope: ErrorEnvelope = { error: categorize(err) };
  return JSON.stringify(envelope, null, 2);
};

const categorize = (err: unknown): ErrorEnvelope['error'] => {
  if (!(err instanceof Error)) {
    return { code: 'RUNTIME_ERROR', message: 'An unexpected error occurred.' };
  }

  if (err.name === 'CredentialsProviderError' || err.name === 'ExpiredTokenException') {
    return {
      code: 'CREDENTIALS_ERROR',
      message: "AWS credentials not found or expired. Run 'aws sts get-caller-identity' to verify your session.",
    };
  }

  if (err.name.includes('AccessDenied')) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Insufficient AWS permissions. Check your IAM role or policy.',
    };
  }

  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    const path = (err as NodeJS.ErrnoException).path ?? 'unknown';
    return { code: 'PATH_NOT_FOUND', message: `Path not found: ${path}` };
  }

  return { code: 'RUNTIME_ERROR', message: err.message || 'An unexpected error occurred.' };
};
