import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { parse as parseHcl } from '@cdktf/hcl2json';
import type { SourceLocation } from '@cloudburn/rules';
import type { IaCResource } from './types.js';

const SKIPPED_DIRECTORIES = new Set(['.git', '.terraform', 'node_modules']);

type ResourceLocationMetadata = {
  blockLocation: SourceLocation;
  attributeLocations: Record<string, SourceLocation>;
};

const toRelativePath = (path: string, scanRoot: string): string => {
  const relativePath = relative(scanRoot, path);

  return (relativePath === '' ? basename(path) : relativePath).split(sep).join('/');
};

const countBraceDelta = (line: string): number => {
  let delta = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === '\\') {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '/' && nextCharacter === '/') {
      break;
    }

    if (character === '#') {
      break;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      delta += 1;
    }

    if (character === '}') {
      delta -= 1;
    }
  }

  return delta;
};

const toResourceLocationKey = (resourceType: string, resourceName: string): string => `${resourceType}.${resourceName}`;

const locateResourceBlocks = (contents: string, path: string): Map<string, ResourceLocationMetadata> => {
  const lines = contents.split(/\r?\n/u);
  const locations = new Map<string, ResourceLocationMetadata>();

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
    let depth = countBraceDelta(line);

    for (let blockLineIndex = lineIndex + 1; blockLineIndex < lines.length && depth > 0; blockLineIndex += 1) {
      const blockLine = lines[blockLineIndex];

      if (blockLine === undefined) {
        continue;
      }

      if (depth === 1) {
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

      depth += countBraceDelta(blockLine);

      if (depth === 0) {
        lineIndex = blockLineIndex;
      }
    }

    locations.set(toResourceLocationKey(resourceType, resourceName), {
      blockLocation,
      attributeLocations,
    });
  }

  return locations;
};

const toIaCResources = async (path: string, scanRoot: string): Promise<IaCResource[]> => {
  if (extname(path) !== '.tf') {
    return [];
  }

  const contents = await readFile(path, 'utf8');
  const relativePath = toRelativePath(path, scanRoot);
  const locations = locateResourceBlocks(contents, relativePath);
  const parsed = await parseHcl(path, contents);
  const parsedResources = parsed.resource;

  if (!parsedResources || typeof parsedResources !== 'object') {
    return [];
  }

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
            attributes: definition,
          };
        });
    });
  });

  return resources.sort((left, right) => {
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
  });
};

const parseTerraformPath = async (path: string, scanRoot: string): Promise<IaCResource[]> => {
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

      if (entry.isFile() && extname(entry.name) !== '.tf') {
        return [];
      }

      return [parseTerraformPath(join(path, entry.name), scanRoot)];
    }),
  );

  return resources.flat();
};

// Intent: parse Terraform files into normalized IaCResource entries.
// TODO(cloudburn): extend parsing beyond AWS resources as new providers land.
export const parseTerraform = async (path: string): Promise<IaCResource[]> => parseTerraformPath(path, path);
