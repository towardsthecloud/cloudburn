import { parseCloudFormation } from './cloudformation.js';
import { parseTerraform } from './terraform.js';
import type { IaCResource } from './types.js';

const compareIaCResources = (left: IaCResource, right: IaCResource): number => {
  const leftPath = left.location?.path ?? '';
  const rightPath = right.location?.path ?? '';

  if (leftPath !== rightPath) {
    return leftPath.localeCompare(rightPath);
  }

  const leftLine = left.location?.startLine ?? 0;
  const rightLine = right.location?.startLine ?? 0;

  if (leftLine !== rightLine) {
    return leftLine - rightLine;
  }

  const leftColumn = left.location?.startColumn ?? 0;
  const rightColumn = right.location?.startColumn ?? 0;

  if (leftColumn !== rightColumn) {
    return leftColumn - rightColumn;
  }

  return `${left.type}.${left.name}`.localeCompare(`${right.type}.${right.name}`);
};

/**
 * Parses a file or directory by auto-detecting supported Terraform and
 * CloudFormation inputs.
 *
 * Aggregates resources from both parsers, preserves stable ordering for mixed
 * directories, and ignores unsupported files or invalid CloudFormation
 * templates that do not match the expected shape.
 *
 * @param path - Terraform file, CloudFormation template, or directory to scan.
 * @returns Normalized IaC resources discovered from supported inputs.
 */
export const parseIaC = async (path: string): Promise<IaCResource[]> => {
  const [terraformResources, cloudFormationResources] = await Promise.all([
    parseTerraform(path),
    parseCloudFormation(path),
  ]);

  return [...terraformResources, ...cloudFormationResources].sort(compareIaCResources);
};

// Intent: expose parser entrypoints behind a stable SDK surface.
export { parseCloudFormation, parseTerraform };
export type { IaCResource } from './types.js';
