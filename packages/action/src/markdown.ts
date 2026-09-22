import type { ScanDiagnostic, SuppressedFinding } from '@cloudburn/sdk';
import type { FlattenedFinding } from './findings.js';
import { ACTION_VERSION, RULES_VERSION, SDK_VERSION } from './version.js';

// Table cells carry untrusted filenames and resource identifiers. Besides the
// pipe and newline guards, `\`, `[`, `]`, `<`, and `>` are escaped so embedded
// text cannot render as a bot-authored link or autolink.
const escapeCell = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/[[\]<>|]/g, '\\$&')
    .replace(/\r\n?|\n/g, ' ');

// A filename can legally contain backticks; a single-` code span would break
// open and let the remainder render as markup. Use a fence longer than the
// value's longest backtick run, padded so edge backticks stay literal.
const codeSpan = (value: string): string => {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return longest === 0 ? `${fence}${value}${fence}` : `${fence} ${value} ${fence}`;
};

const locationLabel = (location?: { path: string; line: number }): string =>
  location === undefined ? '' : codeSpan(`${escapeCell(location.path)}:${location.line}`);

const FINDING_HEADERS = '| Severity | Rule | Resource | Location | Message |';
const FINDING_DIVIDER = '| --- | --- | --- | --- | --- |';

const findingRow = (severity: string, ruleId: string, resourceId: string, location: string, message: string): string =>
  `| ${severity} | ${codeSpan(escapeCell(ruleId))} | ${codeSpan(escapeCell(resourceId))} | ${location} | ${escapeCell(message)} |`;

/** The report sections a completed scan contributes to the rendered markdown. */
export type ScanMarkdownSections = {
  findings: FlattenedFinding[];
  suppressed: SuppressedFinding[];
  diagnostics: ScanDiagnostic[];
};

/**
 * Renders a scan result as markdown for the step summary, the `markdown`
 * output, and the sticky pull request comment.
 *
 * @param scan - Flattened findings plus the suppressed and diagnostic sections.
 * @param options - Comment heading; leading `#` characters are normalized away.
 * @returns Markdown body with a findings table, collapsed suppressed findings,
 *   diagnostics, and a version footer.
 */
export const renderScanMarkdown = (scan: ScanMarkdownSections, options: { header: string }): string => {
  const header = options.header.replace(/^#+\s*/, '').trim() || 'CloudBurn scan';
  const { findings, suppressed, diagnostics } = scan;

  const summary =
    findings.length === 0
      ? suppressed.length === 0
        ? '**No findings.**'
        : `**No active findings.** ${suppressed.length} suppressed.`
      : `**${findings.length} finding${findings.length === 1 ? '' : 's'}**` +
        (suppressed.length === 0 ? '' : ` · ${suppressed.length} suppressed`);

  const parts = [`## ${header}\n\n${summary}`];

  if (findings.length > 0) {
    const rows = findings.map(({ severity, ruleId, message, finding }) =>
      findingRow(severity, ruleId, finding.resourceId, locationLabel(finding.location), message),
    );
    parts.push([FINDING_HEADERS, FINDING_DIVIDER, ...rows].join('\n'));
  }

  if (suppressed.length > 0) {
    const rows = suppressed.map((item) =>
      findingRow(
        item.severity,
        item.ruleId,
        item.finding.resourceId,
        locationLabel(item.finding.location),
        item.message,
      ),
    );
    parts.push(
      `<details><summary>Suppressed findings (${suppressed.length})</summary>\n\n${[FINDING_HEADERS, FINDING_DIVIDER, ...rows].join('\n')}\n\n</details>`,
    );
  }

  if (diagnostics.length > 0) {
    const rows = diagnostics.map(
      (diagnostic) => `| ${diagnostic.status} | ${diagnostic.service} | ${escapeCell(diagnostic.message)} |`,
    );
    parts.push(`### Diagnostics\n\n| Status | Service | Message |\n| --- | --- | --- |\n${rows.join('\n')}`);
  }

  parts.push(
    `<sub>CloudBurn action ${ACTION_VERSION} · @cloudburn/sdk ${SDK_VERSION} · @cloudburn/rules ${RULES_VERSION}</sub>`,
  );

  return parts.join('\n\n');
};
