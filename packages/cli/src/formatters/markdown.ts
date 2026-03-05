import type { Finding } from '@cloudburn/sdk';

// Intent: provide markdown output for PR comments and issue bodies.
// TODO(cloudburn): include remediation and source location columns.
export const formatMarkdown = (findings: Finding[]): string => {
  if (findings.length === 0) {
    return '## CloudBurn Findings\n\nNo findings.';
  }

  const rows = findings.map((finding) => `| ${finding.ruleId} | ${finding.severity} | ${finding.message} |`).join('\n');

  return `## CloudBurn Findings\n\n| Rule | Severity | Message |\n| --- | --- | --- |\n${rows}`;
};
