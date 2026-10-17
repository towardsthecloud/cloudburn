#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { parseArgs } from 'node:util';

// Checks that a branch reviewed the pages owning what it changed (docs/README.md#maintenance).
// The `Editing sources and ownership` table in docs/README.md maps each source to its owning pages. A change to a
// source makes those pages due; a due page passes when the branch also changes it, or when the pull request
// description's `## Documentation` section names its path, recording why it stays true.
const { values } = parseArgs({ options: { since: { type: 'string' }, body: { type: 'string' } } });
if (!values.since) {
  console.error('Usage: node scripts/check-owning-pages.mjs --since <base> [--body <pull request description file>]');
  process.exit(2);
}

const index = 'docs/README.md';
/** Repository paths a table cell links to; a link to a heading on the index itself names the index. */
const links = (cell) =>
  [...cell.matchAll(/\]\(([^)\s]+)\)/g)].map(([, destination]) => {
    const path = destination.replace(/#.*$/, '');
    // `posix.join` keeps a directory link's trailing slash, which marks it as a prefix.
    return path ? posix.join(posix.dirname(index), path) : index;
  });

/** Rows of the ownership table: the pages that own a change and the sources it covers. */
function ownership() {
  const fail = (message) => {
    console.error(`${index}: ${message}`);
    process.exit(2);
  };
  const lines = readFileSync(index, 'utf8').split('\n');
  const start = lines.findIndex((line) => /^##\s+Editing sources and ownership\s*$/.test(line));
  if (start < 0) fail('expected an "Editing sources and ownership" section');
  const table = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) table.push(line.slice(1, -1).split('|'));
    else if (table.length || line.startsWith('#')) break;
  }
  const [header = [], , ...rows] = table;
  const pages = header.findIndex((cell) => cell.trim() === 'Owning guidance');
  const sources = header.findIndex((cell) => cell.trim() === 'Source to inspect or edit');
  if (pages < 0 || sources < 0) fail('expected "Owning guidance" and "Source to inspect or edit" columns');
  return rows.map((cells) => {
    const row = { pages: links(cells[pages]), sources: links(cells[sources]) };
    // A row whose page or source is plain text would silently make nothing due.
    if (!row.pages.length || !row.sources.length) fail(`link every owning page and source in row "${cells[0].trim()}"`);
    return row;
  });
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const base = git('merge-base', values.since, 'HEAD');
// Without rename detection, a source moved out of an owned directory still lists its old path.
const changed = new Set(git('diff', '--name-only', '--no-renames', `${base}...HEAD`).split('\n').filter(Boolean));
const covers = (source, file) => (source.endsWith('/') ? file.startsWith(source) : file === source);

/** Due pages the branch left unchanged, with the changed sources that made each due. */
const due = new Map();
for (const { pages, sources } of ownership()) {
  const touched = [...changed].filter((file) => sources.some((source) => covers(source, file)));
  for (const page of touched.length ? pages.filter((page) => !changed.has(page)) : []) {
    if (!due.has(page)) due.set(page, new Set());
    for (const file of touched) due.get(page).add(file);
  }
}

// The template's HTML comment names example pages; only the author's own text records a review.
const description = values.body ? readFileSync(values.body, 'utf8').replace(/<!--[\s\S]*?-->/g, '') : '';
const documentation =
  description.split(/^(?=##\s)/m).find((section) => /^##\s+Documentation\s*$/im.test(section)) ?? '';
/** Path-like words, with sentence punctuation dropped: a page is named only by its exact repository path. */
const named = new Set(documentation.match(/[\w./-]+/g)?.map((word) => word.replace(/\.+$/, '')));

const missing = [...due].filter(([page]) => !named.has(page));
if (missing.length > 0) {
  for (const [page, files] of missing) {
    const sources = [...files];
    const shown = sources.slice(0, 3).join(', ') + (sources.length > 3 ? ` and ${sources.length - 3} more` : '');
    console.error(`${page}: owns ${shown}, which this branch changed, but the page is unchanged.`);
  }
  console.error(
    '\nUpdate each page this change makes false. For a page that stays true, name its path in the pull request ' +
      "description's `## Documentation` section with why (pass the description with `--body <file>`).",
  );
  process.exit(1);
}
