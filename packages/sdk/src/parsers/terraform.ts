import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { parse as parseHcl } from '@cdktf/hcl2json';
import type { IaCResource } from './types.js';

const SKIPPED_DIRECTORIES = new Set(['.git', '.terraform', 'node_modules']);

const toIaCResources = async (path: string): Promise<IaCResource[]> => {
  if (extname(path) !== '.tf') {
    return [];
  }

  const contents = await readFile(path, 'utf8');
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
      .map((definition) => ({
        provider: 'aws',
        service: 'ebs',
        type: 'aws_ebs_volume',
        name,
        attributes: definition,
      }));
  });
};

// Intent: parse Terraform files into normalized IaCResource entries.
// TODO(cloudburn): integrate HCL parser and map TF resources to services.
export const parseTerraform = async (path: string): Promise<IaCResource[]> => {
  const pathStats = await stat(path);

  if (pathStats.isFile()) {
    return toIaCResources(path);
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

      return [parseTerraform(join(path, entry.name))];
    }),
  );

  return resources.flat();
};
