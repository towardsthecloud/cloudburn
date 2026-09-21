import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScanResult } from '@cloudburn/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitAnnotations } from '../src/annotations.js';
import { flattenFindings } from '../src/findings.js';

const result: ScanResult = {
  providers: [
    {
      provider: 'aws',
      rules: [
        {
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          source: 'iac',
          severity: 'high',
          message: 'Use gp3 volumes instead of gp2.',
          findings: [
            {
              resourceId: 'aws_ebs_volume.legacy',
              location: { path: 'main.tf', line: 4, column: 3, endLine: 8, endColumn: 2 },
            },
          ],
        },
        {
          ruleId: 'CLDBRN-AWS-S3-1',
          service: 's3',
          source: 'iac',
          severity: 'low',
          message: 'Enable lifecycle rules.',
          findings: [
            { resourceId: 'aws_s3_bucket.logs', location: { path: 'b/main.tf', line: 1, column: 1 } },
            { resourceId: 'aws_s3_bucket.nolocation' },
          ],
        },
      ],
    },
  ],
};

describe('emitAnnotations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits error annotations for high severity and warnings otherwise', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const emitted = emitAnnotations(flattenFindings(result), { workspace: '/workspace', scanRoot: '/workspace' });

    expect(emitted).toBe(2);
    const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain(
      '::error title=CLDBRN-AWS-EBS-1 aws_ebs_volume.legacy,file=main.tf,line=4,endLine=8,col=3,endColumn=2::',
    );
    expect(output).toContain('aws_ebs_volume.legacy: Use gp3 volumes instead of gp2.');
    expect(output).toContain('::warning title=CLDBRN-AWS-S3-1 aws_s3_bucket.logs,file=b/main.tf,line=1,col=1::');
    expect(output).not.toContain('aws_s3_bucket.nolocation::');
  });

  it('resolves finding paths against the scan root relative to the workspace', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    emitAnnotations(flattenFindings(result), { workspace: '/workspace', scanRoot: join('/workspace', 'iac') });

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('file=iac/main.tf,');
    expect(output).toContain('file=iac/b/main.tf,');
  });

  it('resolves a file scan target against its directory, not beneath the file', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    // The SDK reports a file scan's locations by basename beneath its directory.
    const scanRoot = fileURLToPath(new URL('./annotations.test.ts', import.meta.url));
    const fileResult: ScanResult = {
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-S3-1',
              service: 's3',
              source: 'iac',
              severity: 'low',
              message: 'Enable lifecycle rules.',
              findings: [
                {
                  resourceId: 'aws_s3_bucket.logs',
                  location: { path: 'annotations.test.ts', line: 1, column: 1 },
                },
              ],
            },
          ],
        },
      ],
    };

    const emitted = emitAnnotations(flattenFindings(fileResult), { workspace: dirname(scanRoot), scanRoot });

    expect(emitted).toBe(1);
    const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('file=annotations.test.ts,');
  });
});
