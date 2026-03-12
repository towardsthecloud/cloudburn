import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import type { SourceLocation } from '@cloudburn/rules';
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import type { IaCResource } from './types.js';

const SKIPPED_DIRECTORIES = new Set(['.git', '.terraform', 'node_modules']);
const SUPPORTED_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

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

const toIaCResources = async (path: string, scanRoot: string): Promise<IaCResource[]> => {
  if (!hasSupportedExtension(path)) {
    return [];
  }

  const contents = await readFile(path, 'utf8');
  const relativePath = toRelativePath(path, scanRoot);
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, {
    keepSourceTokens: true,
    lineCounter,
    prettyErrors: true,
    stringKeys: true,
  });

  // YAML/JSON extensions are ambiguous in mixed repos, so parse failures are
  // treated as "not a CloudFormation template" rather than aborting the scan.
  if (document.errors.length > 0) {
    return [];
  }

  const resourcesNode = document.get('Resources', true);

  if (!isMap(resourcesNode)) {
    return [];
  }

  return resourcesNode.items.flatMap((item) => {
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

    return [
      {
        provider: 'aws' as const,
        type: resourceTypeNode.value,
        name: pair.key.value,
        location: toSourceLocation(pair.key, lineCounter, relativePath),
        attributeLocations: toAttributeLocations(pair.value, lineCounter, relativePath),
        attributes,
      },
    ];
  });
};

const parseCloudFormationPath = async (path: string, scanRoot: string): Promise<IaCResource[]> => {
  const pathStats = await stat(path);

  if (pathStats.isFile()) {
    return toIaCResources(path, scanRoot);
  }

  if (!pathStats.isDirectory()) {
    return [];
  }

  const entries = (await readdir(path, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const resources = await Promise.all(
    entries.flatMap((entry) => {
      if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) {
        return [];
      }

      if (entry.isFile() && !hasSupportedExtension(entry.name)) {
        return [];
      }

      return [parseCloudFormationPath(join(path, entry.name), scanRoot)];
    }),
  );

  return resources.flat().sort((left, right) => {
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
  });
};

// Intent: parse CloudFormation templates into normalized IaCResource entries.
export const parseCloudFormation = async (path: string): Promise<IaCResource[]> => parseCloudFormationPath(path, path);
