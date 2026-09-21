import { isAbsolute, relative, resolve, sep } from 'node:path';
import * as core from '@actions/core';
import type { FlattenedFinding } from './findings.js';

/**
 * Emits one workflow annotation per located finding. High severity findings
 * become errors, everything else a warning, matching the CLI's severity order.
 *
 * Finding locations are relative to the scanned path, so they are resolved
 * against the scan root and reported relative to the workspace for GitHub's
 * file matching. Findings without a location, or outside the workspace, render
 * in the markdown table only.
 *
 * @param findings - Flattened findings from the completed scan.
 * @param options - Workspace root and the resolved scan root.
 * @returns The number of annotations emitted.
 */
export const emitAnnotations = (
  findings: FlattenedFinding[],
  options: { workspace: string; scanRoot: string },
): number => {
  const { workspace, scanRoot } = options;
  let emitted = 0;

  for (const { ruleId, severity, message, finding } of findings) {
    const location = finding.location;
    if (location === undefined) {
      continue;
    }

    const file = relative(workspace, resolve(scanRoot, location.path));
    if (file === '..' || file.startsWith(`..${sep}`) || isAbsolute(file)) {
      continue;
    }

    const properties = {
      title: `${ruleId} ${finding.resourceId}`,
      file,
      startLine: location.line,
      startColumn: location.column,
      ...(location.endLine === undefined ? {} : { endLine: location.endLine }),
      ...(location.endColumn === undefined ? {} : { endColumn: location.endColumn }),
    };
    const text = `${finding.resourceId}: ${message}`;

    if (severity === 'high') {
      core.error(text, properties);
    } else {
      core.warning(text, properties);
    }
    emitted += 1;
  }

  return emitted;
};
