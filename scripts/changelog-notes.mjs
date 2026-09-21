import { readFileSync } from 'node:fs';

// Prints the changelog section for a version. Exits non-zero when the section
// is missing or empty unless --fallback is passed, which emits a generic line.
// Usage: node scripts/changelog-notes.mjs <changelog-path> <version> [--fallback]
const [changelogPath, version, flag] = process.argv.slice(2);
if (changelogPath === undefined || version === undefined) {
  console.error('Usage: changelog-notes.mjs <changelog-path> <version> [--fallback]');
  process.exit(1);
}

const changelog = readFileSync(changelogPath, 'utf8');
const marker = `## ${version}\n`;
const start = changelog.indexOf(marker);
const notes = start < 0 ? '' : changelog.slice(start + marker.length).split('\n## ')[0].trim();

if (notes === '') {
  if (flag === '--fallback') {
    process.stdout.write(`Release ${version}\n`);
    process.exit(0);
  }
  console.error(`Missing changelog section for ${version} in ${changelogPath}`);
  process.exit(1);
}
process.stdout.write(`${notes}\n`);
