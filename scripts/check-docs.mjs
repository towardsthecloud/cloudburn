#!/usr/bin/env node

import { lstat, readFile, readlink, readdir, realpath } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const repositoryRoot = await realpath(resolve(process.argv[2] ?? '.'));
const repositoryRealRoot = repositoryRoot;
const diagnostics = [];
const markdownGraph = new Map();
const markdownHeadings = new Map();

const displayPath = (path) => relative(repositoryRoot, path).split(sep).join('/') || '.';

const exists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

const walk = async (directory) => {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = resolve(directory, entry.name);
    paths.push(path);
    if (entry.isDirectory()) paths.push(...(await walk(path)));
  }
  return paths;
};

const visibleMarkdownLines = (contents) => {
  let fenced = false;
  let openingFence = null;
  return contents.split('\n').map((line) => {
    const fence = line.match(/^\s*(```+|~~~+)(.*)$/);
    if (fence) {
      if (!fenced) {
        fenced = true;
        openingFence = fence[1];
      } else if (
        fence[1][0] === openingFence[0] &&
        fence[1].length >= openingFence.length &&
        fence[2].trim() === ''
      ) {
        fenced = false;
        openingFence = null;
      }
      return '';
    }
    if (fenced) return '';
    return line.replace(/`+[^`]*`+/g, '');
  });
};

const inlineLinkDestinations = (line) => {
  const destinations = [];
  for (const match of line.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1].trim();
    const destination = raw.startsWith('<') ? raw.slice(1, raw.indexOf('>')) : raw.split(/\s+/)[0];
    destinations.push(destination);
  }
  return destinations;
};

const normalizeReferenceLabel = (label) => label.trim().replace(/\s+/g, ' ').toLowerCase();

const referenceDefinition = (line) => {
  const match = line.match(/^\s{0,3}\[([^\]]+)\]:\s*(.+)$/);
  if (!match) return null;
  const raw = match[2].trim();
  const destination = raw.startsWith('<') ? raw.slice(1, raw.indexOf('>')) : raw.split(/\s+/)[0];
  return { destination, label: normalizeReferenceLabel(match[1]) };
};

const referenceUses = (line) =>
  [...line.matchAll(/(?<!!)\[([^\]]+)\]\[([^\]]*)\]/g)].map((match) => normalizeReferenceLabel(match[2] || match[1]));

const headingSlugs = (lines) => {
  const slugs = new Set();
  const counts = new Map();
  const addHeading = (heading) => {
    const base = heading
      .replace(/<[^>]+>/g, '')
      .replace(/[`*_~]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
    const duplicate = counts.get(base) ?? 0;
    counts.set(base, duplicate + 1);
    slugs.add(duplicate === 0 ? base : `${base}-${duplicate}`);
  };

  for (const [index, line] of lines.entries()) {
    const atx = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (atx) {
      addHeading(atx[1]);
      continue;
    }
    if (line.trim() && /^\s{0,3}(?:=+|-+)\s*$/.test(lines[index + 1] ?? '')) {
      addHeading(line.trim());
    }
  }
  return slugs;
};

const checkLocalTarget = async (sourcePath, lineNumber, destination, recordEdge = true) => {
  if (!destination || destination.startsWith('//') || /^[a-z][a-z+.-]*:/i.test(destination)) return;

  const hashIndex = destination.indexOf('#');
  const destinationPath = hashIndex === -1 ? destination : destination.slice(0, hashIndex);
  const encodedPath = destinationPath.split('?', 1)[0];
  const encodedFragment = hashIndex === -1 ? null : destination.slice(hashIndex + 1);
  let localPath;
  let fragment;
  try {
    localPath = decodeURIComponent(encodedPath);
    fragment = encodedFragment === null ? null : decodeURIComponent(encodedFragment);
  } catch {
    diagnostics.push(`${displayPath(sourcePath)}:${lineNumber}: invalid URL encoding in local link: ${destination}`);
    return null;
  }

  const targetPath = localPath ? resolve(dirname(sourcePath), localPath) : sourcePath;
  const relativeTarget = relative(repositoryRoot, targetPath);
  if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`)) {
    diagnostics.push(`${displayPath(sourcePath)}:${lineNumber}: local link escapes repository: ${destination}`);
    return null;
  }
  if (!(await exists(targetPath))) {
    diagnostics.push(`${displayPath(sourcePath)}:${lineNumber}: local link target does not exist: ${destination}`);
    return null;
  }
  let resolvedTargetPath;
  try {
    resolvedTargetPath = await realpath(targetPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      diagnostics.push(`${displayPath(sourcePath)}:${lineNumber}: local link target does not exist: ${destination}`);
      return null;
    }
    throw error;
  }
  const realRelativeTarget = relative(repositoryRealRoot, resolvedTargetPath);
  if (realRelativeTarget === '..' || realRelativeTarget.startsWith(`..${sep}`)) {
    diagnostics.push(`${displayPath(sourcePath)}:${lineNumber}: local link escapes repository: ${destination}`);
    return null;
  }
  if (fragment !== null && resolvedTargetPath.endsWith('.md') && !markdownHeadings.get(resolvedTargetPath)?.has(fragment)) {
    diagnostics.push(`${displayPath(sourcePath)}:${lineNumber}: Markdown fragment does not exist: ${destination}`);
  }
  if (recordEdge && resolvedTargetPath.endsWith('.md')) {
    markdownGraph.get(sourcePath)?.add(resolvedTargetPath);
  }
  return resolvedTargetPath;
};

const checkAlias = async (agentsPath) => {
  const aliasPath = resolve(agentsPath, '..', 'CLAUDE.md');
  const label = displayPath(aliasPath);
  try {
    const stats = await lstat(aliasPath);
    const target = stats.isSymbolicLink() ? await readlink(aliasPath) : null;
    if (target !== 'AGENTS.md') {
      diagnostics.push(`${label}: expected a relative symlink to AGENTS.md`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      diagnostics.push(`${label}: expected a relative symlink to AGENTS.md`);
      return;
    }
    throw error;
  }
};

const checkInstructionSource = async (agentsPath) => {
  try {
    const stats = await lstat(agentsPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      diagnostics.push(`${displayPath(agentsPath)}: instruction source must be a regular file, not a symlink`);
      return false;
    }
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

for (const requiredPath of ['AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/README.md']) {
  if (!(await exists(resolve(repositoryRoot, requiredPath)))) {
    diagnostics.push(`${requiredPath}: required entry point is missing`);
  }
}

const repositoryPaths = await walk(repositoryRoot);
const agentsFiles = [resolve(repositoryRoot, 'AGENTS.md'), ...repositoryPaths.filter((path) => path.endsWith(`${sep}AGENTS.md`))];
for (const agentsPath of new Set(agentsFiles)) {
  if (await checkInstructionSource(agentsPath)) await checkAlias(agentsPath);
}

const markdownFiles = repositoryPaths.filter((path) => path.endsWith('.md') && !path.endsWith(`${sep}CLAUDE.md`));
const markdownDocuments = new Map();
for (const markdownPath of markdownFiles) {
  const stats = await lstat(markdownPath);
  if (!stats.isFile()) continue;
  const contents = await readFile(markdownPath, 'utf8');
  const lines = visibleMarkdownLines(contents);
  markdownDocuments.set(markdownPath, { contents, lines });
  markdownGraph.set(markdownPath, new Set());
  markdownHeadings.set(markdownPath, headingSlugs(lines));
}

for (const [markdownPath, { lines }] of markdownDocuments) {
  const definitions = new Map();
  for (const [index, line] of lines.entries()) {
    const definition = referenceDefinition(line);
    if (definition) definitions.set(definition.label, { ...definition, lineNumber: index + 1 });
  }
  for (const definition of definitions.values()) {
    definition.targetPath = await checkLocalTarget(
      markdownPath,
      definition.lineNumber,
      definition.destination,
      false,
    );
  }

  for (const [index, line] of lines.entries()) {
    const definition = referenceDefinition(line);
    if (definition) continue;
    for (const destination of inlineLinkDestinations(line)) {
      await checkLocalTarget(markdownPath, index + 1, destination);
    }
    for (const label of referenceUses(line)) {
      const target = definitions.get(label);
      if (!target) {
        diagnostics.push(`${displayPath(markdownPath)}:${index + 1}: undefined reference label: ${label}`);
      } else if (target.targetPath?.endsWith('.md')) markdownGraph.get(markdownPath)?.add(target.targetPath);
    }
  }
}

const rootAgents = resolve(repositoryRoot, 'AGENTS.md');
const rootAgentsDocument = markdownDocuments.get(rootAgents);
if (rootAgentsDocument) {
  const lineCount = rootAgentsDocument.contents.endsWith('\n')
    ? rootAgentsDocument.contents.split(/\r?\n/).length - 1
    : rootAgentsDocument.contents.split(/\r?\n/).length;
  if (lineCount > 150) diagnostics.push(`AGENTS.md: contains ${lineCount} lines; maximum is 150`);
}

const reachabilityRoots = [rootAgents, resolve(repositoryRoot, 'docs/README.md')];
const reachable = new Set();
const pending = reachabilityRoots.filter((path) => markdownGraph.has(path));
while (pending.length > 0) {
  const path = pending.pop();
  if (reachable.has(path)) continue;
  reachable.add(path);
  for (const target of markdownGraph.get(path) ?? []) {
    if (!reachable.has(target)) pending.push(target);
  }
}

const isCanonicalPage = (path) => {
  const label = displayPath(path);
  if (label.startsWith('docs/')) return true;
  if (label === 'CONTRIBUTING.md') return true;
  return /^packages\/[^/]+\/(?:AGENTS|README)\.md$/.test(label);
};
for (const markdownPath of markdownDocuments.keys()) {
  if (isCanonicalPage(markdownPath) && !reachable.has(markdownPath)) {
    diagnostics.push(`${displayPath(markdownPath)}: canonical Markdown page is not reachable from AGENTS.md or docs/README.md`);
  }
}

if (diagnostics.length > 0) {
  console.error(diagnostics.sort().join('\n'));
  process.exitCode = 1;
} else {
  console.log('Documentation check passed.');
}
