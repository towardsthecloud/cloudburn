import { describe, expect, it } from 'vitest';
import { formatError } from '../src/formatters/error.js';
import { formatSarif } from '../src/formatters/sarif.js';
import { formatTable } from '../src/formatters/table.js';

const resultWithoutLocation = {
  providers: [
    {
      provider: 'aws' as const,
      rules: [
        {
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          source: 'discovery' as const,
          message: 'EBS volumes should use current-generation storage.',
          findings: [
            {
              resourceId: 'vol-123',
              region: 'us-east-1',
            },
          ],
        },
      ],
    },
  ],
};

const resultWithLocation = {
  providers: [
    {
      provider: 'aws' as const,
      rules: [
        {
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          source: 'iac' as const,
          message: 'EBS volumes should use current-generation storage.',
          findings: [
            {
              resourceId: 'aws_ebs_volume.gp2_logs',
              location: {
                path: 'main.tf',
                startLine: 4,
                startColumn: 3,
              },
            },
          ],
        },
      ],
    },
  ],
};

describe('formatters', () => {
  it('flattens provider-grouped findings for table output', () => {
    expect(formatTable(resultWithLocation)).toBe(
      'aws CLDBRN-AWS-EBS-1 iac ebs aws_ebs_volume.gp2_logs main.tf:4:3 EBS volumes should use current-generation storage.',
    );
  });

  it('omits sarif locations when a finding has no source location', () => {
    const output = JSON.parse(formatSarif(resultWithoutLocation)) as {
      runs: Array<{
        results: Array<{
          message: { text: string };
          locations?: Array<Record<string, unknown>>;
        }>;
      }>;
    };

    expect(output.runs[0]?.results[0]?.message.text).toBe('EBS volumes should use current-generation storage.');
    expect(output.runs[0]?.results[0]).not.toHaveProperty('locations');
  });

  it('emits sarif locations when a finding has a source location', () => {
    const output = JSON.parse(formatSarif(resultWithLocation)) as {
      runs: Array<{
        results: Array<{
          locations?: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: Record<string, number>;
            };
          }>;
        }>;
      }>;
    };

    expect(output.runs[0]?.results[0]?.locations).toEqual([
      {
        physicalLocation: {
          artifactLocation: {
            uri: 'main.tf',
          },
          region: {
            startLine: 4,
            startColumn: 3,
          },
        },
      },
    ]);
  });
});

describe('formatError', () => {
  it('categorizes CredentialsProviderError as CREDENTIALS_ERROR', () => {
    const err = new Error('Could not load credentials');
    err.name = 'CredentialsProviderError';

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('CREDENTIALS_ERROR');
    expect(output.error.message).toContain('AWS credentials not found or expired');
  });

  it('categorizes ExpiredTokenException as CREDENTIALS_ERROR', () => {
    const err = new Error('Token expired');
    err.name = 'ExpiredTokenException';

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('CREDENTIALS_ERROR');
  });

  it('categorizes AccessDeniedException as ACCESS_DENIED', () => {
    const err = new Error('Access denied');
    err.name = 'AccessDeniedException';

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('ACCESS_DENIED');
    expect(output.error.message).toContain('Insufficient AWS permissions');
  });

  it('categorizes ENOENT as PATH_NOT_FOUND', () => {
    const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT', path: '/missing/dir' });

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('PATH_NOT_FOUND');
    expect(output.error.message).toContain('/missing/dir');
  });

  it('falls back to RUNTIME_ERROR for unknown errors', () => {
    const err = new Error('Timeout reached http://169.254.169.254/latest/meta-data/iam/security-credentials/');

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('RUNTIME_ERROR');
    expect(output.error.message).toBe(
      'Timeout reached http://[redacted-host]/latest/meta-data/iam/security-credentials/',
    );
    expect(output.error.message).not.toContain('169.254.169.254');
  });

  it('preserves non-sensitive unknown runtime errors for diagnostics', () => {
    const err = new Error('YAML parse error in template.yaml at line 12, column 4');

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('RUNTIME_ERROR');
    expect(output.error.message).toBe('YAML parse error in template.yaml at line 12, column 4');
  });

  it('preserves typed aws discovery errors in the formatter output', () => {
    const err = Object.assign(new Error('Invalid AWS region provided.'), { code: 'INVALID_AWS_REGION' });

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('INVALID_AWS_REGION');
    expect(output.error.message).toBe('Invalid AWS region provided.');
  });

  it('handles non-Error values gracefully', () => {
    const output = JSON.parse(formatError('string error')) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('RUNTIME_ERROR');
    expect(output.error.message).toBe('An unexpected error occurred.');
  });
});
