import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { scanFolder } from '../src/scan.js';

describe('CLI transport', () => {
  it('stops a running CLI when its scan is cancelled', async () => {
    const abort = new AbortController();
    const result = scanFolder(tmpdir(), {
      executable: process.execPath,
      arguments: ['-e', 'setInterval(() => {}, 1000)', '--'],
      configPath: '',
      signal: abort.signal,
    });
    abort.abort();
    await expect(result).rejects.toThrow('aborted');
  });
  it.each([
    {},
    { providers: [{}] },
    {
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EBS-1',
              service: 'ebs',
              source: 'iac',
              severity: 'invalid',
              message: 'Cost finding',
              findings: [],
            },
          ],
        },
      ],
    },
    {
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EBS-1',
              service: 'ebs',
              source: 'iac',
              severity: 'medium',
              message: 'Cost finding',
              findings: [{ resourceId: 'volume', location: { path: 'main.tf', line: 0, column: 1 } }],
            },
          ],
        },
      ],
    },
  ])('rejects incompatible CLI output instead of reporting a successful empty scan: %j', async (payload) => {
    await expect(
      scanFolder(tmpdir(), {
        executable: process.execPath,
        arguments: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(payload))})`, '--'],
        configPath: '',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('incompatible scan result');
  });
});
