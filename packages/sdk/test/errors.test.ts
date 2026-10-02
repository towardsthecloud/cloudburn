import { describe, expect, it } from 'vitest';
import { categorizeError } from '../src/index.js';

describe('categorizeError', () => {
  it('categorizes CredentialsProviderError as CREDENTIALS_ERROR', () => {
    const err = new Error('Could not load credentials');
    err.name = 'CredentialsProviderError';

    expect(categorizeError(err)).toEqual({
      code: 'CREDENTIALS_ERROR',
      message: expect.stringContaining('AWS credentials not found or expired'),
    });
  });

  it('categorizes ExpiredTokenException as CREDENTIALS_ERROR', () => {
    const err = new Error('Token expired');
    err.name = 'ExpiredTokenException';

    expect(categorizeError(err).code).toBe('CREDENTIALS_ERROR');
  });

  it('categorizes AccessDeniedException as ACCESS_DENIED', () => {
    const err = new Error('User is not authorized to perform: resource-explorer-2:ListIndexes');
    err.name = 'AccessDeniedException';

    expect(categorizeError(err)).toEqual({
      code: 'ACCESS_DENIED',
      message: 'User is not authorized to perform: resource-explorer-2:ListIndexes',
    });
  });

  it('categorizes preserved AccessDeniedException codes as ACCESS_DENIED', () => {
    const err = Object.assign(
      new Error('AWS Lambda ListFunctions failed in us-east-1 with AccessDeniedException: denied.'),
      { code: 'AccessDeniedException' },
    );

    expect(categorizeError(err).code).toBe('ACCESS_DENIED');
  });

  it('reports a missing path as PATH_NOT_FOUND', () => {
    const err = Object.assign(new Error("ENOENT: no such file or directory, stat '/missing'"), {
      code: 'ENOENT',
      path: '/missing',
    });

    expect(categorizeError(err)).toEqual({ code: 'PATH_NOT_FOUND', message: 'Path not found: /missing' });
  });

  it('preserves typed AWS discovery error codes', () => {
    const err = Object.assign(new Error('Invalid AWS region provided.'), { code: 'INVALID_AWS_REGION' });

    expect(categorizeError(err)).toEqual({ code: 'INVALID_AWS_REGION', message: 'Invalid AWS region provided.' });
  });

  it('redacts metadata endpoints, URL credentials, signed parameters, and bearer tokens', () => {
    const err = new Error(
      'Timeout reached http://169.254.169.254/latest/meta-data/ via https://user:secret@example.com/' +
        '?X-Amz-Signature=abc123&token=xyz Authorization: Bearer eyJhbGciOi.payload',
    );

    expect(categorizeError(err)).toEqual({
      code: 'RUNTIME_ERROR',
      message:
        'Timeout reached http://[redacted-host]/latest/meta-data/ via https://[redacted-auth]@example.com/' +
        '?X-Amz-Signature=[redacted]&token=[redacted] Authorization: Bearer [redacted]',
    });
  });

  it('handles non-Error values gracefully', () => {
    expect(categorizeError('string error')).toEqual({
      code: 'RUNTIME_ERROR',
      message: 'An unexpected error occurred.',
    });
  });
});
