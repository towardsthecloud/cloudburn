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

const locateAwsEbsVolumeBlocks = (contents: string, path: string): Map<string, ResourceLocationMetadata> => {
  const lines = contents.split(/\r?\n/u);
  const locations = new Map<string, ResourceLocationMetadata>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];

    if (line === undefined) {
      continue;
    }

    const blockMatch = /^(\s*)resource\s+"aws_ebs_volume"\s+"([^"]+)"\s*\{/u.exec(line);

    if (!blockMatch) {
      continue;
    }

    const leadingWhitespace = blockMatch[1] ?? '';
    const resourceName = blockMatch[2];

    if (!resourceName) {
      continue;
    }

    const blockLocation: SourceLocation = {
      path,
      startLine: lineIndex + 1,
      startColumn: leadingWhitespace.length + 1,
    };
    const attributeLocations: Record<string, SourceLocation> = {};
    let depth = countBraceDelta(line);

    for (let blockLineIndex = lineIndex + 1; blockLineIndex < lines.length && depth > 0; blockLineIndex += 1) {
      const blockLine = lines[blockLineIndex];

      if (blockLine === undefined) {
        continue;
      }

      if (depth === 1 && !attributeLocations.type) {
        const typeMatch = /^(\s*)type\s*=/u.exec(blockLine);

        if (typeMatch) {
          const attributeLeadingWhitespace = typeMatch[1] ?? '';

          attributeLocations.type = {
            path,
            startLine: blockLineIndex + 1,
            startColumn: attributeLeadingWhitespace.length + 1,
          };
        }
      }

      depth += countBraceDelta(blockLine);

      if (depth === 0) {
        lineIndex = blockLineIndex;
      }
    }

    locations.set(resourceName, {
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
  const locations = locateAwsEbsVolumeBlocks(contents, relativePath);
  const parsed = await parseHcl(path, contents);
  const ebsResources = parsed.resource?.aws_ebs_volume;

  if (!ebsResources || typeof ebsResources !== 'object') {
    return [];
  }

  return Object.entries(ebsResources).flatMap(([name, definitions]) => {
    if (!Array.isArray(definitions)) {
      return [];
    }

    return definitions
      .filter(
        (definition): definition is Record<string, unknown> => typeof definition === 'object' && definition !== null,
      )
      .map((definition) => {
        const resourceLocations = locations.get(name);

        return {
          provider: 'aws',
          service: 'ebs',
          type: 'aws_ebs_volume',
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
};

const parseTerraformPath = async (path: string, scanRoot: string): Promise<IaCResource[]> => {
  const pathStats = await stat(path);

  if (pathStats.isFile()) {
    return toIaCResources(path, scanRoot);
  }

  if (!pathStats.isDirectory()) {
    return [];
  }
  const entries = await readdir(path, { withFileTypes: true });
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
// TODO(cloudburn): integrate HCL parser and map TF resources to services.
export const parseTerraform = async (path: string): Promise<IaCResource[]> => parseTerraformPath(path, path);
