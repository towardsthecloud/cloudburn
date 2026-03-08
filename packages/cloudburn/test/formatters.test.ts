import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../src/formatters/markdown.js';
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
  it('keeps markdown output unchanged when findings have no source locations', () => {
    expect(formatMarkdown(resultWithoutLocation)).toBe(`## CloudBurn Findings

### aws

#### CLDBRN-AWS-EBS-1

| Source | Service | Resource | Message |
| --- | --- | --- | --- |
| discovery | ebs | vol-123 | EBS volumes should use current-generation storage. |`);
  });

  it('adds a Location column to markdown output when a finding has a source location', () => {
    expect(formatMarkdown(resultWithLocation)).toBe(`## CloudBurn Findings

### aws

#### CLDBRN-AWS-EBS-1

| Source | Service | Resource | Message | Location |
| --- | --- | --- | --- | --- |
| iac | ebs | aws_ebs_volume.gp2_logs | EBS volumes should use current-generation storage. | main.tf:4:3 |`);
  });

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
