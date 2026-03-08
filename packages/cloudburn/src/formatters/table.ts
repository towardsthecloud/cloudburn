import type { ScanResult } from '@cloudburn/sdk';
import { flattenScanResult } from './shared.js';

// Intent: render human-readable table output for terminal users.
// TODO(cloudburn): implement aligned columns with colorized output.
export const formatTable = (result: ScanResult): string => {
  const flattenedFindings = flattenScanResult(result);

  if (flattenedFindings.length === 0) {
    return 'No findings.';
  }

  return flattenedFindings
    .map(({ provider, ruleId, source, service, message, finding }) => {
      const location = finding.location
        ? ` ${finding.location.path}:${finding.location.startLine}:${finding.location.startColumn}`
        : '';

      return `${provider} ${ruleId} ${source} ${service} ${finding.resourceId}${location} ${message}`;
    })
    .join('\n');
};
