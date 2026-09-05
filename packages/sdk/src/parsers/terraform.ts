import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parse as parseHcl } from '@cdktf/hcl2json';
import type { SourceLocation } from '@cloudburn/rules';
import { type IaCFileParser, parseIaCFiles } from './files.js';
import { createEmptyIaCParseResult, createSkippedIaCParseResult } from './result.js';
import { extractSuppressionComments, findResourceSuppressions } from './suppressions.js';
import { createTerraformLexerState, scanTerraformLine } from './terraform-lexer.js';
import type { IaCParseResult } from './types.js';

type ResourceLocationMetadata = {
  blockLocation: SourceLocation;
  attributeLocations: Record<string, SourceLocation>;
  suppressions: ReturnType<typeof findResourceSuppressions>;
};

const toResourceLocationKey = (resourceType: string, resourceName: string): string => `${resourceType}.${resourceName}`;

const locateResourceBlocks = (contents: string, path: string): Map<string, ResourceLocationMetadata> => {
  const lines = contents.split(/\r?\n/u);
  const locations = new Map<string, ResourceLocationMetadata>();
  const suppressionComments = extractSuppressionComments(contents, path, 'terraform');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];

    if (line === undefined) {
      continue;
    }

    const blockMatch = /^(\s*)resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/u.exec(line);

    if (!blockMatch) {
      continue;
    }

    const leadingWhitespace = blockMatch[1] ?? '';
    const resourceType = blockMatch[2];
    const resourceName = blockMatch[3];

    if (!resourceType || !resourceName) {
      continue;
    }

    const blockLocation: SourceLocation = {
      path,
      line: lineIndex + 1,
      column: leadingWhitespace.length + 1,
    };
    const attributeLocations: Record<string, SourceLocation> = {};
    const lexerState = createTerraformLexerState();
    let depth = scanTerraformLine(line, lexerState).braceDelta;
    let blockEndLine = lineIndex + 1;

    for (let blockLineIndex = lineIndex + 1; blockLineIndex < lines.length && depth > 0; blockLineIndex += 1) {
      const blockLine = lines[blockLineIndex];

      if (blockLine === undefined) {
        continue;
      }

      const lineScan = scanTerraformLine(blockLine, lexerState);

      if (depth === 1 && !lineScan.isLiteralLine) {
        const attributeMatch = /^(\s*)([A-Za-z0-9_]+)\s*=/u.exec(blockLine);

        if (attributeMatch) {
          const attributeLeadingWhitespace = attributeMatch[1] ?? '';
          const attributeName = attributeMatch[2];

          if (attributeName && !attributeLocations[attributeName]) {
            attributeLocations[attributeName] = {
              path,
              line: blockLineIndex + 1,
              column: attributeLeadingWhitespace.length + 1,
            };
          }
        }
      }

      depth += lineScan.braceDelta;

      if (depth === 0) {
        blockEndLine = blockLineIndex + 1;
        lineIndex = blockLineIndex;
      }
    }

    locations.set(toResourceLocationKey(resourceType, resourceName), {
      blockLocation,
      attributeLocations,
      suppressions: findResourceSuppressions(suppressionComments, blockLocation.line, blockEndLine),
    });
  }

  return locations;
};

const toIaCResources = async (path: string, relativePath: string): Promise<IaCParseResult> => {
  if (extname(path) !== '.tf') {
    return createEmptyIaCParseResult();
  }

  const contents = await readFile(path, 'utf8');

  // Parse failures are treated as "not a valid Terraform file" rather than
  // aborting the scan, matching the CloudFormation parser's behavior for
  // malformed templates.
  let parsed: Awaited<ReturnType<typeof parseHcl>>;

  try {
    parsed = await parseHcl(path, contents);
  } catch {
    return createSkippedIaCParseResult({
      code: 'TERRAFORM_PARSE_ERROR',
      message: `Skipped Terraform file ${relativePath} because it could not be parsed.`,
      service: 'terraform',
    });
  }

  const parsedResources = parsed.resource;

  if (!parsedResources || typeof parsedResources !== 'object') {
    return createEmptyIaCParseResult();
  }

  const locations = locateResourceBlocks(contents, relativePath);

  const resources = Object.entries(parsedResources).flatMap(([resourceType, namedResources]) => {
    if (!resourceType.startsWith('aws_') || typeof namedResources !== 'object' || namedResources === null) {
      return [];
    }

    return Object.entries(namedResources).flatMap(([name, definitions]) => {
      if (!Array.isArray(definitions)) {
        return [];
      }

      return definitions
        .filter(
          (definition): definition is Record<string, unknown> => typeof definition === 'object' && definition !== null,
        )
        .map((definition) => {
          const resourceLocations = locations.get(toResourceLocationKey(resourceType, name));

          return {
            provider: 'aws' as const,
            type: resourceType,
            name,
            location: resourceLocations?.blockLocation,
            attributeLocations:
              resourceLocations && Object.keys(resourceLocations.attributeLocations).length > 0
                ? resourceLocations.attributeLocations
                : undefined,
            ...(resourceLocations && resourceLocations.suppressions.length > 0
              ? { suppressions: resourceLocations.suppressions }
              : {}),
            attributes: definition,
          };
        });
    });
  });

  return {
    diagnostics: [],
    resources: resources.sort((left, right) => {
      const leftPath = left.location?.path ?? '';
      const rightPath = right.location?.path ?? '';

      if (leftPath !== rightPath) {
        return leftPath.localeCompare(rightPath);
      }

      const leftLine = left.location?.line ?? 0;
      const rightLine = right.location?.line ?? 0;

      if (leftLine !== rightLine) {
        return leftLine - rightLine;
      }

      const leftColumn = left.location?.column ?? 0;
      const rightColumn = right.location?.column ?? 0;

      if (leftColumn !== rightColumn) {
        return leftColumn - rightColumn;
      }

      return toResourceLocationKey(left.type, left.name).localeCompare(toResourceLocationKey(right.type, right.name));
    }),
  };
};

/** Terraform file format and its single-file parser. */
export const terraformFileParser: IaCFileParser = { extensions: new Set(['.tf']), parseFile: toIaCResources };

/**
 * Parses Terraform files into normalized IaC resources and skipped-file diagnostics.
 *
 * @param path - Terraform file or directory to parse.
 * @returns Parsed resources plus non-fatal diagnostics.
 */
export const parseTerraform = async (path: string): Promise<IaCParseResult> =>
  parseIaCFiles(path, [terraformFileParser]);
