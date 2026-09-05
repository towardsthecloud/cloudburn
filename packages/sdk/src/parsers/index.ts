import { cloudFormationFileParser, parseCloudFormation } from './cloudformation.js';
import { parseIaCFiles } from './files.js';
import { parseTerraform, terraformFileParser } from './terraform.js';
import type { IaCParseResult, IaCResource } from './types.js';

const PARSER_LOADERS = {
  cloudformation: cloudFormationFileParser,
  terraform: terraformFileParser,
} as const;

/** Supported static IaC source kinds that can be parsed for dataset loading. */
export type IaCSourceKind = keyof typeof PARSER_LOADERS;

/** Optional parser selection controls for static scan orchestration. */
export type ParseIaCOptions = {
  sourceKinds?: IaCSourceKind[];
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
 * @param options - Optional parser selection for dataset-driven static scans.
 * @returns Normalized IaC resources and non-fatal skipped-file diagnostics.
 */
export const parseIaCWithDiagnostics = async (path: string, options?: ParseIaCOptions): Promise<IaCParseResult> => {
  const sourceKinds = options?.sourceKinds ?? ['terraform', 'cloudformation'];
  return parseIaCFiles(
    path,
    sourceKinds.map((sourceKind) => PARSER_LOADERS[sourceKind]),
  );
};

/**
 * Parses supported IaC inputs into normalized resources.
 *
 * @param path - Terraform file, CloudFormation template, or directory to scan.
 * @param options - Optional parser selection for dataset-driven static scans.
 * @returns Normalized IaC resources discovered from supported inputs.
 */
export const parseIaC = async (path: string, options?: ParseIaCOptions): Promise<IaCResource[]> =>
  (await parseIaCWithDiagnostics(path, options)).resources;

export type { IaCParseResult, IaCResource } from './types.js';
// Intent: expose parser entrypoints behind a stable SDK surface.
export { parseCloudFormation, parseTerraform };
