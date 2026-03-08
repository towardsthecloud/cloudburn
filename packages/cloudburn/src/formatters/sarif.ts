import type { FindingMatch, ScanResult } from '@cloudburn/sdk';
import { flattenScanResult } from './shared.js';

const toSarifLocation = (finding: FindingMatch) => {
  if (!finding.location) {
    return undefined;
  }

  return [
    {
      physicalLocation: {
        artifactLocation: {
          uri: finding.location.path,
        },
        region: {
          startLine: finding.location.startLine,
          startColumn: finding.location.startColumn,
          ...(finding.location.endLine ? { endLine: finding.location.endLine } : {}),
          ...(finding.location.endColumn ? { endColumn: finding.location.endColumn } : {}),
        },
      },
    },
  ];
};

// Intent: emit SARIF so scanners can integrate with code scanning platforms.
// TODO(cloudburn): map findings to a complete SARIF 2.1.0 structure.
export const formatSarif = (result: ScanResult): string =>
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
          results: flattenScanResult(result).map(({ ruleId, message, finding }) => ({
            ruleId,
            // Severity was intentionally removed — all findings are warnings until a priority model is added.
            level: 'warning',
            message: { text: message },
            ...(finding.location ? { locations: toSarifLocation(finding) } : {}),
          })),
        },
      ],
    },
    null,
    2,
  );
