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
      "+----------+------------------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+
      | Provider | RuleId           | Source    | Service | ResourceId | AccountId    | Region    | Message                                            |
      +----------+------------------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+
      | aws      | CLDBRN-AWS-EBS-1 | discovery | ebs     | vol-123    | 123456789012 | us-east-1 | EBS volumes should use current-generation storage. |
      +----------+------------------+-----------+---------+------------+--------------+-----------+----------------------------------------------------+"
    `);
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
          text: 'Resource Explorer setup already exists in eu-west-1.',
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

  it('renders discovery status responses as text and structured json', () => {
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
      summaryText: 'Coverage: partial. Indexed 1 of 17 enabled regions. Aggregator region: eu-west-1.',
    };

    expect(renderResponse(response, 'text')).toBe(
      'Coverage: partial. Indexed 1 of 17 enabled regions. Aggregator region: eu-west-1.\neu-west-1\taggregator (active)\tindexed\nap-south-1\t\taccess_denied',
    );

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
          summaryText: 'Coverage: partial. Indexed 3 of 17 enabled regions. Aggregator region: eu-central-1.',
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

  it('renders discovery status responses as text', () => {
    expect(
      renderResponse(
        {
          kind: 'discovery-status',
          columns: [
            { key: 'region', header: 'Region' },
            { key: 'indexType', header: 'IndexType' },
            { key: 'status', header: 'Status' },
          ],
          summary: {
            aggregatorRegion: 'eu-central-1',
            coverage: 'partial',
          },
          summaryText: 'Coverage: partial. Indexed 3 of 17 enabled regions. Aggregator region: eu-central-1.',
          rows: [
            {
              region: 'eu-central-1',
              indexType: 'aggregator (active)',
              status: 'indexed',
            },
            {
              region: 'ap-south-1',
              indexType: '',
              status: 'access_denied',
            },
          ],
        },
        'text',
      ),
    ).toBe(
      'Coverage: partial. Indexed 3 of 17 enabled regions. Aggregator region: eu-central-1.\neu-central-1\taggregator (active)\tindexed\nap-south-1\t\taccess_denied',
    );
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
