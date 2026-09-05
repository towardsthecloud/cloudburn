import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { mapWithConcurrency } from '../utils/concurrency.js';
import type { IaCParseResult, IaCResource } from './types.js';

const SKIPPED_DIRECTORIES = new Set(['.git', '.terraform', 'node_modules']);
const FILE_PARSE_CONCURRENCY = 8;

/** A source parser that reads one supported file and preserves its display path. */
export type IaCFileParser = {
  extensions: ReadonlySet<string>;
  parseFile: (path: string, relativePath: string) => Promise<IaCParseResult>;
};

type SourceFile = { path: string; relativePath: string };

const collectSourceFiles = async (root: string, extensions: Set<string>): Promise<SourceFile[]> => {
  // Only an explicitly selected root may follow a symlink. Dirent checks below
  // skip every nested symlink, including loops, duplicates, and dangling links.
  const filesystemRoot = await realpath(root);
  const rootStats = await stat(filesystemRoot);
  if (rootStats.isFile())
    return extensions.has(extname(filesystemRoot)) ? [{ path: filesystemRoot, relativePath: basename(root) }] : [];
  if (!rootStats.isDirectory()) return [];
  const directories = [{ path: filesystemRoot, relativePath: '' }];
  const files: SourceFile[] = [];
  while (directories.length > 0) {
    const directory = directories.pop();
    if (!directory) break;
    for (const entry of await readdir(directory.path, { withFileTypes: true })) {
      const source = {
        path: join(directory.path, entry.name),
        relativePath: [directory.relativePath, entry.name].filter(Boolean).join('/'),
      };
      if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) directories.push(source);
      else if (entry.isFile() && extensions.has(extname(entry.name))) files.push(source);
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

const compareIaCResources = (left: IaCResource, right: IaCResource): number => {
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
};

const compareDiagnostics = (
  left: IaCParseResult['diagnostics'][number],
  right: IaCParseResult['diagnostics'][number],
): number =>
  left.service.localeCompare(right.service) ||
  left.message.localeCompare(right.message) ||
  (left.code ?? '').localeCompare(right.code ?? '');

/**
 * Walks a scan root once and parses supported files with bounded I/O concurrency.
 *
 * @param root - Explicit file or directory to scan.
 * @param parsers - Source formats required by the active datasets.
 * @returns Combined parser results in stable source order.
 */
export const parseIaCFiles = async (root: string, parsers: IaCFileParser[]): Promise<IaCParseResult> => {
  if (parsers.length === 0) return { diagnostics: [], resources: [] };
  const extensions = new Set(parsers.flatMap((parser) => [...parser.extensions]));
  const files = await collectSourceFiles(root, extensions);
  const results = await mapWithConcurrency(files, FILE_PARSE_CONCURRENCY, async (file) => {
    const parser = parsers.find((candidate) => candidate.extensions.has(extname(file.path)));
    return parser ? parser.parseFile(file.path, file.relativePath) : { diagnostics: [], resources: [] };
  });
  return {
    diagnostics: results.flatMap((result) => result.diagnostics).sort(compareDiagnostics),
    resources: results.flatMap((result) => result.resources).sort(compareIaCResources),
  };
};
