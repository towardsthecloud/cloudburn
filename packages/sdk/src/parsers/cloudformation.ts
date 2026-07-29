import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import type { SourceLocation } from '@cloudburn/rules';
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import { createEmptyIaCParseResult, createSkippedIaCParseResult } from './result.js';
import { extractSuppressionComments, findResourceSuppressions } from './suppressions.js';
import type { IaCParseResult } from './types.js';

const SKIPPED_DIRECTORIES = new Set(['.git', '.terraform', 'node_modules']);
const SUPPORTED_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);
const MAX_TEMPLATE_SIZE_BYTES = 5 * 1024 * 1024;

const INTRINSIC_TAG_NAMES: Record<string, string> = {
  '!And': 'Fn::And',
  '!Base64': 'Fn::Base64',
  '!Cidr': 'Fn::Cidr',
  '!Condition': 'Condition',
  '!Equals': 'Fn::Equals',
  '!FindInMap': 'Fn::FindInMap',
  '!GetAtt': 'Fn::GetAtt',
  '!GetAZs': 'Fn::GetAZs',
  '!If': 'Fn::If',
  '!ImportValue': 'Fn::ImportValue',
  '!Join': 'Fn::Join',
  '!Not': 'Fn::Not',
  '!Or': 'Fn::Or',
  '!Ref': 'Ref',
  '!Select': 'Fn::Select',
  '!Split': 'Fn::Split',
  '!Sub': 'Fn::Sub',
  '!Transform': 'Fn::Transform',
};

type LocationCarrier = {
  range?: [number, number, number];
};

type TagCarrier = {
  tag?: string;
};

type PairLike = {
  key?: unknown;
  value?: unknown;
};

const toRelativePath = (path: string, scanRoot: string): string => {
  const relativePath = relative(scanRoot, path);

  return (relativePath === '' ? basename(path) : relativePath).split(sep).join('/');
};

const hasSupportedExtension = (path: string): boolean => SUPPORTED_EXTENSIONS.has(extname(path));

const toSourceLocation = (node: unknown, lineCounter: LineCounter, path: string): SourceLocation | undefined => {
  if (typeof node !== 'object' || node === null || !('range' in node)) {
    return undefined;
  }

  const { range } = node as LocationCarrier;

  if (!range) {
    return undefined;
  }

  const position = lineCounter.linePos(range[0]);

  return {
    path,
    line: position.line,
    column: position.col,
  };
};

const toEndLine = (node: unknown, lineCounter: LineCounter): number | undefined => {
  if (typeof node !== 'object' || node === null || !('range' in node)) {
    return undefined;
  }

  const { range } = node as LocationCarrier;
  if (!range) {
    return undefined;
  }

  return lineCounter.linePos(Math.max(range[0], range[1] - 1)).line;
};

const collectBlockScalarContentLines = (
  node: unknown,
  lineCounter: LineCounter,
  lines: Set<number> = new Set(),
): Set<number> => {
  if (isScalar(node)) {
    const scalarType = (node as { type?: string }).type;
    if ((scalarType === 'BLOCK_LITERAL' || scalarType === 'BLOCK_FOLDED') && node.range) {
      const startLine = lineCounter.linePos(node.range[0]).line;
      const endLine = lineCounter.linePos(Math.max(node.range[0], node.range[1] - 1)).line;
      for (let line = startLine + 1; line <= endLine; line += 1) {
        lines.add(line);
      }
    }
    return lines;
  }

  if (isMap(node)) {
    for (const item of node.items) {
      const pair = item as PairLike;
      collectBlockScalarContentLines(pair.key, lineCounter, lines);
      collectBlockScalarContentLines(pair.value, lineCounter, lines);
    }
    return lines;
  }

  if (isSeq(node)) {
    for (const item of node.items) {
      collectBlockScalarContentLines(item, lineCounter, lines);
    }
  }

  return lines;
};

const toNodeTag = (node: unknown): string | undefined => {
  if (typeof node !== 'object' || node === null || !('tag' in node)) {
    return undefined;
  }

  return (node as TagCarrier).tag;
};

const toNodeValue = (node: unknown): unknown => {
  if (isMap(node)) {
    return Object.fromEntries(
      node.items.flatMap((item) => {
        const pair = item as PairLike;

        if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
          return [];
        }

        return [[pair.key.value, toRawValue(pair.value)]];
      }),
    );
  }

  if (isSeq(node)) {
    return node.items.map((item) => toRawValue(item));
  }

  if (isScalar(node)) {
    return node.value;
  }

  return node;
};

const toRawValue = (node: unknown): unknown => {
  const intrinsicName = INTRINSIC_TAG_NAMES[toNodeTag(node) ?? ''];

  if (intrinsicName) {
    return {
      [intrinsicName]: toNodeValue(node),
    };
  }

  return toNodeValue(node);
};

const toAttributeLocations = (
  resourceNode: unknown,
  lineCounter: LineCounter,
  path: string,
): Record<string, SourceLocation> | undefined => {
  if (!isMap(resourceNode)) {
    return undefined;
  }

  const attributeLocations = Object.fromEntries(
    resourceNode.items.flatMap((item) => {
      const pair = item as PairLike;

      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
        return [];
      }

      const location = toSourceLocation(pair.key, lineCounter, path);

      return location ? [[pair.key.value, location]] : [];
    }),
  ) as Record<string, SourceLocation>;

  const propertiesNode = resourceNode.get('Properties', true);

  if (isMap(propertiesNode)) {
    for (const item of propertiesNode.items) {
      const pair = item as PairLike;

      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
        continue;
      }

      const location = toSourceLocation(pair.key, lineCounter, path);

      if (location) {
        attributeLocations[`Properties.${pair.key.value}`] = location;
      }
    }
  }

  return Object.keys(attributeLocations).length > 0 ? attributeLocations : undefined;
};

const toIaCResources = async (path: string, relativePath: string): Promise<IaCParseResult> => {
  if (!hasSupportedExtension(path)) {
    return createEmptyIaCParseResult();
  }

  const pathStats = await stat(path);

  if (pathStats.size > MAX_TEMPLATE_SIZE_BYTES) {
    return createSkippedIaCParseResult({
      code: 'CLOUDFORMATION_TEMPLATE_TOO_LARGE',
      details: `Template size ${pathStats.size} bytes exceeds the ${MAX_TEMPLATE_SIZE_BYTES}-byte limit.`,
      message: `Skipped CloudFormation file ${relativePath} because it exceeds the 5 MiB size limit.`,
      service: 'cloudformation',
    });
  }

  const contents = await readFile(path, 'utf8');
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, {
    keepSourceTokens: true,
    lineCounter,
    prettyErrors: true,
    stringKeys: true,
  });

  // YAML/JSON extensions are ambiguous in mixed repos, so parse failures are
  // reported as skipped files rather than aborting the scan.
  if (document.errors.length > 0) {
    return createSkippedIaCParseResult({
      code: 'CLOUDFORMATION_PARSE_ERROR',
      message: `Skipped CloudFormation file ${relativePath} because it could not be parsed.`,
      service: 'cloudformation',
    });
  }

  const blockScalarContentLines = collectBlockScalarContentLines(document.contents, lineCounter);
  const suppressionComments = extractSuppressionComments(contents, relativePath, 'yaml', blockScalarContentLines);

  const resourcesNode = document.get('Resources', true);

  if (!isMap(resourcesNode)) {
    return createEmptyIaCParseResult();
  }

  return {
    diagnostics: [],
    resources: resourcesNode.items.flatMap((item) => {
      const pair = item as PairLike;

      if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || !isMap(pair.value)) {
        return [];
      }

      const resourceTypeNode = pair.value.get('Type', true);

      if (!isScalar(resourceTypeNode) || typeof resourceTypeNode.value !== 'string') {
        return [];
      }

      if (!resourceTypeNode.value.startsWith('AWS::')) {
        return [];
      }

      const attributes = Object.fromEntries(
        pair.value.items.flatMap((resourceItem) => {
          const resourcePair = resourceItem as PairLike;

          if (!isScalar(resourcePair.key) || typeof resourcePair.key.value !== 'string') {
            return [];
          }

          if (resourcePair.key.value === 'Type') {
            return [];
          }

          return [[resourcePair.key.value, toRawValue(resourcePair.value)]];
        }),
      );
      const resourceLocation = toSourceLocation(pair.key, lineCounter, relativePath);
      const resourceEndLine = toEndLine(pair.value, lineCounter) ?? resourceLocation?.line;
      const suppressions =
        resourceLocation && resourceEndLine
          ? findResourceSuppressions(suppressionComments, resourceLocation.line, resourceEndLine)
          : [];

      return [
        {
          provider: 'aws' as const,
          type: resourceTypeNode.value,
          name: pair.key.value,
          location: resourceLocation,
          attributeLocations: toAttributeLocations(pair.value, lineCounter, relativePath),
          ...(suppressions.length > 0 ? { suppressions } : {}),
          attributes,
        },
      ];
    }),
  };
};

const parseCloudFormationPath = async (
  path: string,
  scanRoot: string,
  filesystemPath: string = path,
  allowSymbolicLinkTarget = false,
): Promise<IaCParseResult> => {
  const linkStats = await lstat(filesystemPath);

  if (linkStats.isSymbolicLink()) {
    if (!allowSymbolicLinkTarget) {
      return createEmptyIaCParseResult();
    }

    filesystemPath = await realpath(filesystemPath);
  }

  const pathStats = await stat(filesystemPath);

  if (pathStats.isFile()) {
    return toIaCResources(filesystemPath, toRelativePath(path, scanRoot));
  }

  if (!pathStats.isDirectory()) {
    return createEmptyIaCParseResult();
  }

  const entries = (await readdir(filesystemPath, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const results = await Promise.all(
    entries.flatMap((entry) => {
      if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) {
        return [];
      }

      if (entry.isFile() && !hasSupportedExtension(entry.name)) {
        return [];
      }

      return [parseCloudFormationPath(join(path, entry.name), scanRoot, join(filesystemPath, entry.name))];
    }),
  );

  const resources = results.flatMap((result) => result.resources);

  return {
    diagnostics: results.flatMap((result) => result.diagnostics),
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

      return `${left.type}.${left.name}`.localeCompare(`${right.type}.${right.name}`);
    }),
  };
};

/**
 * Parses CloudFormation templates into normalized IaC resources and skipped-file diagnostics.
 *
 * @param path - CloudFormation template or directory to parse.
 * @returns Parsed resources plus non-fatal diagnostics.
 */
export const parseCloudFormation = async (path: string): Promise<IaCParseResult> =>
  parseCloudFormationPath(path, path, path, true);
