import { describe, expect, it } from 'vitest';
import { formatError } from '../src/formatters/error.js';
import { renderResponse } from '../src/formatters/output.js';

const resultWithoutLocation = {
  providers: [
    {
      provider: 'aws' as const,
      rules: [
        {
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          severity: 'medium' as const,
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

const resultWithSkippedRuleDiagnostic = {
  diagnostics: [
    {
      details: 'Amazon CloudWatch Logs DescribeLogStreams failed in us-east-1 with ThrottlingException: Rate exceeded.',
      message: 'Skipped rule CLDBRN-AWS-CLOUDWATCH-2 because required discovery datasets were unavailable.',
      provider: 'aws' as const,
      ruleId: 'CLDBRN-AWS-CLOUDWATCH-2',
      service: 'cloudwatch',
      source: 'discovery' as const,
      status: 'skipped' as const,
    },
  ],
  providers: [],
};

const resultWithFindingAndDiagnostic = {
  diagnostics: [
    {
      message: 'Skipped dynamodb discovery in eu-central-1 because access is denied by a resource-based policy.',
      provider: 'aws' as const,
      region: 'eu-central-1',
      service: 'dynamodb',
      source: 'discovery' as const,
      status: 'access_denied' as const,
    },
  ],
  providers: resultWithoutLocation.providers,
};

const resultWithSuppressedFinding = {
  providers: [],
  suppressed: [
    {
      finding: {
        location: { column: 3, line: 5, path: 'main.tf' },
        resourceId: 'aws_ebs_volume.legacy',
      },
      message: 'EBS volumes should use current-generation storage.',
      provider: 'aws' as const,
      ruleId: 'CLDBRN-AWS-EBS-1',
      service: 'ebs',
      severity: 'medium' as const,
      source: 'iac' as const,
      suppression: {
        kind: 'rule' as const,
        location: { column: 1, line: 1, path: 'main.tf' },
        reason: 'legacy volume',
        ruleId: 'CLDBRN-AWS-EBS-1',
      },
    },
  ],
};

const withStdoutColumns = (columns: number, run: () => void): void => {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, 'columns');

  Object.defineProperty(process.stdout, 'columns', {
    configurable: true,
    value: columns,
  });

  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(process.stdout, 'columns', descriptor);
    } else {
      Reflect.deleteProperty(process.stdout, 'columns');
    }
  }
};

describe('renderResponse', () => {
  it('shows the exact recommendation action in table output', () => {
    const baseRule = resultWithoutLocation.providers[0]?.rules[0];
    if (!baseRule) throw new Error('Missing base rule fixture');
    const result = {
      providers: [
        {
          provider: 'aws' as const,
          rules: [
            {
              ...baseRule,
              findings: [{ resourceId: 'database', actionType: 'Delete' }],
            },
          ],
        },
      ],
    };
    const output = renderResponse({ kind: 'scan-result', result }, 'table');
    expect(output).toContain('Action');
    expect(output).toContain('Delete');
  });
  it('renders scan results as an ascii table', () => {
    const output = renderResponse({ kind: 'scan-result', result: resultWithoutLocation }, 'table');

    expect(output).toContain('Severity');
    expect(output).toMatchInlineSnapshot(`
      "+----------+------------------+----------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+
      | Provider | RuleId           | Severity | Source    | Service | ResourceId | AccountId    | Region    | Message                                            |
      +----------+------------------+----------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+
      | aws      | CLDBRN-AWS-EBS-1 | medium   | discovery | ebs     | vol-123    | 123456789012 | us-east-1 | EBS volumes should use current-generation storage. |
      +----------+------------------+----------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+"
    `);
  });

  it('renders a finding resource namespace in table output', () => {
    const resultWithResourceType = {
      ...resultWithoutLocation,
      providers: resultWithoutLocation.providers.map((provider) => ({
        ...provider,
        rules: provider.rules.map((rule) => ({
          ...rule,
          findings: rule.findings.map((finding) => ({ ...finding, resourceType: 'ebs:volume' })),
        })),
      })),
    };

    const output = renderResponse({ kind: 'scan-result', result: resultWithResourceType }, 'table');

    expect(output).toContain('ResourceType');
    expect(output).toContain('ebs:volume');
  });

  it('renders skipped-rule diagnostics with their rule id in table mode', () => {
    const output = renderResponse({ kind: 'scan-result', result: resultWithSkippedRuleDiagnostic }, 'table');

    expect(output).toContain('Diagnostics');
    expect(output).toContain('Status');
    expect(output).toContain('CLDBRN-AWS-CLOUDWATCH-2');
    expect(output).toContain('Skipped rule CLDBRN-AWS-CLOUDWATCH-2');
    expect(output).not.toContain('ResourceId');
    expect(output).not.toContain('AccountId');
  });

  it('renders diagnostics in a separate table when findings also exist', () => {
    const output = renderResponse({ kind: 'scan-result', result: resultWithFindingAndDiagnostic }, 'table');

    expect(output).toContain('CLDBRN-AWS-EBS-1');
    expect(output).toContain('vol-123');
    expect(output).toContain('Diagnostics');
    expect(output).toContain('access_denied');
    expect(output).toContain(
      'Skipped dynamodb discovery in eu-central-1 because access is denied by a resource-based policy.',
    );
  });

  it('retains suppressed findings in json and reports their count in table output', () => {
    const json = JSON.parse(
      renderResponse({ kind: 'scan-result', result: resultWithSuppressedFinding }, 'json'),
    ) as typeof resultWithSuppressedFinding;

    expect(json.suppressed).toHaveLength(1);
    expect(json.suppressed[0]?.suppression.reason).toBe('legacy volume');
    expect(renderResponse({ kind: 'scan-result', result: resultWithSuppressedFinding }, 'table')).toBe(
      'No active findings.\n\nSuppressed: 1',
    );
  });

  it('wraps long status values to the available terminal width in table mode', () => {
    withStdoutColumns(60, () => {
      const output = renderResponse(
        {
          kind: 'status',
          data: {
            aggregatorRegion: 'eu-west-1',
            indexType: 'aggregator',
            message: 'Resource Explorer setup already exists in eu-west-1.',
            regions: [
              'ap-northeast-1',
              'ap-northeast-2',
              'ap-northeast-3',
              'ap-south-1',
              'ap-southeast-1',
              'ap-southeast-2',
              'ca-central-1',
              'eu-central-1',
              'eu-north-1',
              'eu-west-1',
              'eu-west-2',
              'eu-west-3',
            ],
            status: 'EXISTING',
          },
        },
        'table',
      );

      expect(output.split('\n').every((line) => line.length <= 60)).toBe(true);
      expect(output).toContain('ap-northeast-1,');
      expect(output).toContain('eu-west-3');
    });
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
        'table',
      ),
    ).toBe('No rows.');
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
    const err = new Error('User is not authorized to perform: resource-explorer-2:ListIndexes');
    err.name = 'AccessDeniedException';

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('ACCESS_DENIED');
    expect(output.error.message).toBe('User is not authorized to perform: resource-explorer-2:ListIndexes');
  });

  it('categorizes preserved AccessDeniedException codes as ACCESS_DENIED', () => {
    const err = Object.assign(
      new Error('AWS Lambda ListFunctions failed in us-east-1 with AccessDeniedException: denied.'),
      {
        code: 'AccessDeniedException',
      },
    );

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('ACCESS_DENIED');
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
