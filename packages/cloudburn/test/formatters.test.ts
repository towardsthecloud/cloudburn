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
                line: 4,
                column: 3,
              },
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
      details:
        'Amazon CloudWatch Logs DescribeMetricFilters failed in us-east-1 with ThrottlingException: Rate exceeded.',
      message: 'Skipped rule CLDBRN-AWS-CLOUDWATCH-3 because required discovery datasets were unavailable.',
      provider: 'aws' as const,
      ruleId: 'CLDBRN-AWS-CLOUDWATCH-3',
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
      message: 'Skipped lambda discovery in us-east-1 because access is denied by AWS permissions.',
      provider: 'aws' as const,
      region: 'us-east-1',
      service: 'lambda',
      source: 'discovery' as const,
      status: 'access_denied' as const,
    },
  ],
  providers: resultWithoutLocation.providers,
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
      delete (process.stdout as NodeJS.WriteStream & { columns?: number }).columns;
    }
  }
};

describe('renderResponse', () => {
  it('renders scan results as json', () => {
    expect(renderResponse({ kind: 'scan-result', result: resultWithoutLocation }, 'json')).toContain('123456789012');
  });

  it('renders scan results as an ascii table', () => {
    expect(renderResponse({ kind: 'scan-result', result: resultWithoutLocation }, 'table')).toMatchInlineSnapshot(`
      "+----------+------------------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+
      | Provider | RuleId           | Source    | Service | ResourceId | AccountId    | Region    | Message                                            |
      +----------+------------------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+
      | aws      | CLDBRN-AWS-EBS-1 | discovery | ebs     | vol-123    | 123456789012 | us-east-1 | EBS volumes should use current-generation storage. |
      +----------+------------------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+"
    `);
  });

  it('renders skipped-rule diagnostics with their rule id in table mode', () => {
    const output = renderResponse({ kind: 'scan-result', result: resultWithSkippedRuleDiagnostic }, 'table');

    expect(output).toContain('Diagnostics');
    expect(output).toContain('Status');
    expect(output).toContain('CLDBRN-AWS-CLOUDWATCH-3');
    expect(output).toContain('Skipped rule CLDBRN-AWS-CLOUDWATCH-3');
    expect(output).not.toContain('ResourceId');
    expect(output).not.toContain('AccountId');
  });

  it('renders diagnostics in a separate table when findings also exist', () => {
    const output = renderResponse({ kind: 'scan-result', result: resultWithFindingAndDiagnostic }, 'table');

    expect(output).toContain('CLDBRN-AWS-EBS-1');
    expect(output).toContain('vol-123');
    expect(output).toContain('Diagnostics');
    expect(output).toContain('access_denied');
    expect(output).toContain('Skipped lambda discovery in us-east-1');
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

  it('omits columns that are empty for every scan result row', () => {
    const output = renderResponse({ kind: 'scan-result', result: resultWithLocation }, 'table');

    expect(output).not.toContain('AccountId');
    expect(output).not.toContain('Region');
    expect(output).toContain('Path');
    expect(output).toContain('Column');
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

  it('renders discovery status responses as structured json', () => {
    const response = {
      kind: 'discovery-status' as const,
      columns: [
        { key: 'region', header: 'Region' },
        { key: 'indexType', header: 'IndexType' },
        { key: 'status', header: 'Status' },
      ],
      rows: [
        {
          region: 'eu-west-1',
          indexType: 'aggregator (active)',
          status: 'indexed',
        },
        {
          region: 'ap-south-1',
          indexType: '',
          status: 'access_denied',
        },
      ],
      summary: {
        aggregatorRegion: 'eu-west-1',
        coverage: 'partial',
        indexedRegionCount: 1,
        totalRegionCount: 17,
      },
    };

    expect(renderResponse(response, 'json')).toBe(`{
  "summary": {
    "aggregatorRegion": "eu-west-1",
    "coverage": "partial",
    "indexedRegionCount": 1,
    "totalRegionCount": 17
  },
  "regions": [
    {
      "region": "eu-west-1",
      "indexType": "aggregator (active)",
      "status": "indexed"
    },
    {
      "region": "ap-south-1",
      "indexType": "",
      "status": "access_denied"
    }
  ]
}`);
  });

  it('renders discovery status responses as structured json', () => {
    expect(
      renderResponse(
        {
          kind: 'discovery-status',
          summary: {
            aggregatorRegion: 'eu-central-1',
            coverage: 'partial',
            indexedRegionCount: 3,
            totalRegionCount: 17,
          },
          rows: [
            {
              region: 'eu-central-1',
              indexType: 'aggregator (active)',
              status: 'indexed',
              viewStatus: 'present',
              notes: '',
            },
          ],
        },
        'json',
      ),
    ).toBe(`{
  "summary": {
    "aggregatorRegion": "eu-central-1",
    "coverage": "partial",
    "indexedRegionCount": 3,
    "totalRegionCount": 17
  },
  "regions": [
    {
      "region": "eu-central-1",
      "indexType": "aggregator (active)",
      "status": "indexed",
      "viewStatus": "present",
      "notes": ""
    }
  ]
}`);
  });

  it('renders documents as structured json', () => {
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
        'table',
      ),
    ).toBe('No rows.');
  });
});

describe('parseOutputFormat', () => {
  it('rejects text and other unsupported values', () => {
    expect(() => parseOutputFormat('text')).toThrow('Allowed formats: json, table.');
    expect(() => parseOutputFormat('sarif')).toThrow('Allowed formats: json, table.');
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
      new Error('AWS Lambda GetFunctionConfiguration failed in us-east-1 with AccessDeniedException: denied.'),
      {
        code: 'AccessDeniedException',
      },
    );

    const output = JSON.parse(formatError(err)) as { error: { code: string; message: string } };

    expect(output.error.code).toBe('ACCESS_DENIED');
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
