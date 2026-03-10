import { describe, expect, it } from 'vitest';
import { formatError } from '../src/formatters/error.js';
import { parseOutputFormat, renderResponse } from '../src/formatters/output.js';

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
              accountId: '123456789012',
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

describe('renderResponse', () => {
  it('renders scan results as tab-delimited text rows', () => {
    expect(renderResponse({ kind: 'scan-result', result: resultWithLocation }, 'text')).toBe(
      'aws\tCLDBRN-AWS-EBS-1\tiac\tebs\taws_ebs_volume.gp2_logs\t\t\tmain.tf\t4\t3\tEBS volumes should use current-generation storage.',
    );
  });

  it('renders scan results as json', () => {
    expect(renderResponse({ kind: 'scan-result', result: resultWithoutLocation }, 'json')).toContain('123456789012');
  });

  it('renders scan results as an ascii table', () => {
    expect(renderResponse({ kind: 'scan-result', result: resultWithoutLocation }, 'table')).toMatchInlineSnapshot(`
      "+----------+------------------+-----------+---------+------------+--------------+-----------+------+-----------+-------------+----------------------------------------------------+
      | Provider | RuleId           | Source    | Service | ResourceId | AccountId    | Region    | Path | StartLine | StartColumn | Message                                            |
      +----------+------------------+-----------+---------+------------+--------------+-----------+------+-----------+-------------+----------------------------------------------------+
      | aws      | CLDBRN-AWS-EBS-1 | discovery | ebs     | vol-123    | 123456789012 | us-east-1 |      |           |             | EBS volumes should use current-generation storage. |
      +----------+------------------+-----------+---------+------------+--------------+-----------+------+-----------+-------------+----------------------------------------------------+"
    `);
  });

  it('renders known record lists with stable text column order', () => {
    expect(
      renderResponse(
        {
          kind: 'record-list',
          columns: [
            { key: 'region', header: 'Region' },
            { key: 'type', header: 'Type' },
          ],
          emptyMessage: 'No regions.',
          rows: [
            { region: 'eu-west-1', type: 'local' },
            { region: 'eu-central-1', type: 'aggregator' },
          ],
        },
        'text',
      ),
    ).toBe('eu-west-1\tlocal\neu-central-1\taggregator');
  });

  it('renders generic record lists alphabetically in text mode', () => {
    expect(
      renderResponse(
        {
          kind: 'record-list',
          emptyMessage: 'No rows.',
          rows: [{ zeta: 'last', alpha: 'first' }],
        },
        'text',
      ),
    ).toBe('first\tlast');
  });

  it('renders string lists as one value per line in text mode', () => {
    expect(
      renderResponse(
        {
          kind: 'string-list',
          columnHeader: 'RuleId',
          emptyMessage: 'No rules.',
          values: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-LAMBDA-1'],
        },
        'text',
      ),
    ).toBe('CLDBRN-AWS-EBS-1\nCLDBRN-AWS-LAMBDA-1');
  });

  it('renders status responses as structured json', () => {
    expect(
      renderResponse(
        {
          kind: 'status',
          data: {
            message: 'Resource Explorer setup created in eu-west-1.',
            regions: ['eu-west-1'],
            status: 'CREATED',
          },
          text: 'Resource Explorer setup created in eu-west-1.',
        },
        'json',
      ),
    ).toBe(`{
  "message": "Resource Explorer setup created in eu-west-1.",
  "regions": [
    "eu-west-1"
  ],
  "status": "CREATED"
}`);
  });

  it('renders documents as raw text and structured json', () => {
    expect(
      renderResponse(
        {
          kind: 'document',
          content: 'version: 1\\nprofile: dev',
          contentType: 'application/yaml',
        },
        'text',
      ),
    ).toBe('version: 1\\nprofile: dev');

    expect(
      renderResponse(
        {
          kind: 'document',
          content: 'version: 1\\nprofile: dev',
          contentType: 'application/yaml',
        },
        'json',
      ),
    ).toBe(`{
  "content": "version: 1\\\\nprofile: dev",
  "contentType": "application/yaml"
}`);
  });

  it('returns friendly empty messages for empty human-readable output', () => {
    expect(renderResponse({ kind: 'scan-result', result: { providers: [] } }, 'table')).toBe('No findings.');
    expect(
      renderResponse(
        {
          kind: 'record-list',
          emptyMessage: 'No rows.',
          rows: [],
        },
        'text',
      ),
    ).toBe('No rows.');
  });
});

describe('parseOutputFormat', () => {
  it('rejects sarif and other unsupported values', () => {
    expect(() => parseOutputFormat('sarif')).toThrow('Allowed formats: text, json, table.');
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
