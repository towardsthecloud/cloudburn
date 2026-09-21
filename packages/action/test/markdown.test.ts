import type { ScanResult } from '@cloudburn/sdk';
import { describe, expect, it } from 'vitest';
import { flattenFindings } from '../src/findings.js';
import { renderScanMarkdown } from '../src/markdown.js';

const render = (scan: ScanResult, header: string): string =>
  renderScanMarkdown(
    {
      findings: flattenFindings(scan),
      suppressed: scan.suppressed ?? [],
      diagnostics: scan.diagnostics ?? [],
    },
    { header },
  );

const result: ScanResult = {
  providers: [
    {
      provider: 'aws',
      rules: [
        {
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          source: 'iac',
          severity: 'medium',
          message: 'Use gp3 volumes instead of gp2.',
          findings: [
            {
              resourceId: 'aws_ebs_volume.legacy',
              location: { path: 'main.tf', line: 4, column: 3 },
            },
            { resourceId: 'aws_ebs_volume.other' },
          ],
        },
      ],
    },
  ],
  suppressed: [
    {
      provider: 'aws',
      ruleId: 'CLDBRN-AWS-EBS-1',
      service: 'ebs',
      source: 'iac',
      severity: 'medium',
      message: 'Use gp3 volumes instead of gp2.',
      finding: {
        resourceId: 'aws_ebs_volume.retained',
        location: { path: 'main.tf', line: 1, column: 1 },
      },
      suppression: { kind: 'rule', ruleId: 'CLDBRN-AWS-EBS-1', location: { path: 'main.tf', line: 1, column: 1 } },
    },
  ],
  diagnostics: [
    {
      provider: 'aws',
      service: 'terraform',
      source: 'iac',
      status: 'skipped',
      code: 'TERRAFORM_PARSE_ERROR',
      message: 'Skipped Terraform file broken.tf because it could not be parsed.',
    },
  ],
};

describe('renderScanMarkdown', () => {
  it('renders the header, findings table, suppressed details, diagnostics, and footer', () => {
    const markdown = render(result, '## CloudBurn scan');
    expect(markdown).toContain('## CloudBurn scan');
    expect(markdown).toContain('**2 findings** · 1 suppressed');
    expect(markdown).toContain('| Severity | Rule | Resource | Location | Message |');
    expect(markdown).toContain('| medium | `CLDBRN-AWS-EBS-1` | `aws_ebs_volume.legacy` | `main.tf:4` |');
    expect(markdown).toContain('`aws_ebs_volume.other` |  |');
    expect(markdown).toContain('<details><summary>Suppressed findings (1)</summary>');
    expect(markdown).toContain('`aws_ebs_volume.retained`');
    expect(markdown).toContain('### Diagnostics');
    expect(markdown).toContain('Skipped Terraform file broken.tf because it could not be parsed.');
    expect(markdown).toContain('@cloudburn/sdk 0.0.0-test');
    expect(markdown).toContain('@cloudburn/rules 0.0.0-test');
  });

  it('normalizes extra heading markers from the header input', () => {
    const markdown = render({ providers: [] }, '#### Custom heading');
    expect(markdown).toContain('## Custom heading');
    expect(markdown).toContain('**No findings.**');
  });

  it('reports no active findings when only suppressed findings exist', () => {
    const markdown = render({ providers: [], suppressed: result.suppressed }, '## Scan');
    expect(markdown).toContain('**No active findings.** 1 suppressed.');
  });

  it('keeps a backtick in a filename inside a longer code span', () => {
    const scan: ScanResult = {
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-S3-1',
              service: 's3',
              source: 'iac',
              severity: 'low',
              message: 'm',
              findings: [
                {
                  resourceId: 'aws_s3_bucket.logs',
                  location: { path: 'weird`name.tf', line: 1, column: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    const markdown = render(scan, '## Scan');
    expect(markdown).toContain('`` weird`name.tf:1 ``');
  });
});
