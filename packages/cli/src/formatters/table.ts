import type { Finding } from '@cloudburn/sdk';

// Intent: render human-readable table output for terminal users.
// TODO(cloudburn): implement aligned columns with colorized output.
export const formatTable = (findings: Finding[]): string => {
  if (findings.length === 0) {
    return 'No findings.';
  }

  return findings.map((finding) => `${finding.ruleId} ${finding.resource.resourceId} ${finding.message}`).join('\n');
};
