import type { Finding } from '@cloudburn/sdk';

// Intent: emit SARIF so scanners can integrate with code scanning platforms.
// TODO(cloudburn): map findings to a complete SARIF 2.1.0 structure.
export const formatSarif = (findings: Finding[]): string =>
  JSON.stringify(
    {
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'cloudburn',
            },
          },
          results: findings.map((finding) => ({
            ruleId: finding.ruleId,
            // Severity was intentionally removed — all findings are warnings until a priority model is added.
            level: 'warning',
            message: { text: finding.message },
          })),
        },
      ],
    },
    null,
    2,
  );
