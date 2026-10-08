import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { parse as parseHcl } from '@cdktf/hcl2json';
import type { SourceLocation } from '@cloudburn/rules';
import { type IaCFileParser, parseIaCFiles } from './files.js';
import { createEmptyIaCParseResult, createSkippedIaCParseResult, MAX_IAC_FILE_SIZE_BYTES } from './result.js';
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
  const lexerState = createTerraformLexerState();
  let depth = 0;
  let openBlock:
    | {
        resourceType: string;
        resourceName: string;
        blockLocation: SourceLocation;
        attributeLocations: Record<string, SourceLocation>;
        startLine: number;
      }
    | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const scan = scanTerraformLine(line, lexerState);

    if (!openBlock && depth === 0 && !scan.isLiteralLine) {
      const blockMatch = /^(\s*)resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/u.exec(line);

      if (blockMatch?.[2] && blockMatch[3]) {
        const leadingWhitespace = blockMatch[1] ?? '';
        openBlock = {
          resourceType: blockMatch[2],
          resourceName: blockMatch[3],
          blockLocation: {
            path,
            line: lineIndex + 1,
            column: leadingWhitespace.length + 1,
          },
          attributeLocations: {},
          startLine: lineIndex + 1,
        };
      }
    } else if (openBlock && lineIndex + 1 !== openBlock.startLine && depth === 1 && !scan.isLiteralLine) {
      const attributeMatch = /^(\s*)([A-Za-z0-9_]+)\s*=/u.exec(line);

      if (attributeMatch?.[2]) {
        const attributeLeadingWhitespace = attributeMatch[1] ?? '';
        const attributeName = attributeMatch[2];

        if (!openBlock.attributeLocations[attributeName]) {
          openBlock.attributeLocations[attributeName] = {
            path,
            line: lineIndex + 1,
            column: attributeLeadingWhitespace.length + 1,
          };
        }
      }
    }

    depth = Math.max(0, depth + scan.braceDelta);

    if (openBlock && depth === 0) {
      locations.set(toResourceLocationKey(openBlock.resourceType, openBlock.resourceName), {
        blockLocation: openBlock.blockLocation,
        attributeLocations: openBlock.attributeLocations,
        suppressions: findResourceSuppressions(suppressionComments, openBlock.startLine, lineIndex + 1),
      });
      openBlock = undefined;
    }
  }

  if (openBlock) {
    locations.set(toResourceLocationKey(openBlock.resourceType, openBlock.resourceName), {
      blockLocation: openBlock.blockLocation,
      attributeLocations: openBlock.attributeLocations,
      suppressions: findResourceSuppressions(suppressionComments, openBlock.startLine, openBlock.startLine),
    });
  }

  return locations;
};

const toIaCResources = async (path: string, relativePath: string): Promise<IaCParseResult> => {
  if (extname(path) !== '.tf') {
    return createEmptyIaCParseResult();
  }

  const pathStats = await stat(path);

  if (pathStats.size > MAX_IAC_FILE_SIZE_BYTES) {
    return createSkippedIaCParseResult({
      code: 'TERRAFORM_FILE_TOO_LARGE',
      details: `File size ${pathStats.size} bytes exceeds the ${MAX_IAC_FILE_SIZE_BYTES}-byte limit.`,
      message: `Skipped Terraform file ${relativePath} because it exceeds the 5 MiB size limit.`,
      service: 'terraform',
    });
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
