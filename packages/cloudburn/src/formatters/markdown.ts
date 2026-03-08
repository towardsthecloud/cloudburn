import type { FindingMatch, ScanResult } from '@cloudburn/sdk';

const formatLocation = (finding: FindingMatch): string =>
  finding.location ? `${finding.location.path}:${finding.location.startLine}:${finding.location.startColumn}` : '';

// Intent: provide markdown output for PR comments and issue bodies.
// TODO(cloudburn): include remediation and source location columns.
export const formatMarkdown = (result: ScanResult): string => {
  if (result.providers.length === 0) {
    return '## CloudBurn Findings\n\nNo findings.';
  }

  const sections = result.providers.flatMap((providerGroup) => {
    const providerSections = [`### ${providerGroup.provider}`];

    for (const ruleGroup of providerGroup.rules) {
      const hasLocations = ruleGroup.findings.some((finding) => finding.location);
      const rows = ruleGroup.findings
        .map((finding) =>
          hasLocations
            ? `| ${ruleGroup.source} | ${ruleGroup.service} | ${finding.resourceId} | ${ruleGroup.message} | ${formatLocation(finding)} |`
            : `| ${ruleGroup.source} | ${ruleGroup.service} | ${finding.resourceId} | ${ruleGroup.message} |`,
        )
        .join('\n');

      providerSections.push(`#### ${ruleGroup.ruleId}`);
      providerSections.push(
        hasLocations
          ? `| Source | Service | Resource | Message | Location |\n| --- | --- | --- | --- | --- |\n${rows}`
          : `| Source | Service | Resource | Message |\n| --- | --- | --- | --- |\n${rows}`,
      );
    }

    return providerSections;
  });

  return `## CloudBurn Findings\n\n${sections.join('\n\n')}`;
};
