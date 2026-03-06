#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const ALLOWED_TYPES = [
  "feat",
  "fix",
  "refactor",
  "build",
  "ci",
  "chore",
  "revert",
  "docs",
  "style",
  "perf",
  "test",
];

const COMMIT_HEADER_RE = new RegExp(
  `^(?<type>${ALLOWED_TYPES.join("|")})(?:\\((?<scope>[a-z0-9-]+)\\))?(?<breaking>!)?: (?<subject>.+)$`,
);

const PACKAGE_SCOPES = [
  ["packages/cloudburn", "cli"],
  ["packages/sdk", "sdk"],
  ["packages/rules", "rules"],
];

const SKIPPED_PREFIXES = ["Merge ", "fixup! ", "squash! ", 'Revert "'];

export function collectTouchedPackageScopes(stagedPaths) {
  const scopes = new Set();

  for (const stagedPath of stagedPaths) {
    for (const [prefix, scope] of PACKAGE_SCOPES) {
      if (stagedPath === prefix || stagedPath.startsWith(`${prefix}/`)) {
        scopes.add(scope);
      }
    }
  }

  return [...scopes].sort();
}

export function requiredScopeForPaths(stagedPaths) {
  const scopes = collectTouchedPackageScopes(stagedPaths);
  return scopes.length === 1 ? scopes[0] : null;
}

export function validateCommitMessage(message, stagedPaths) {
  const header = message.split(/\r?\n/u, 1)[0]?.trim() ?? "";

  if (!header) {
    return {
      ok: false,
      error: "Commit message cannot be empty.",
    };
  }

  if (SKIPPED_PREFIXES.some((prefix) => header.startsWith(prefix))) {
    return { ok: true };
  }

  const match = header.match(COMMIT_HEADER_RE);
  if (!match?.groups) {
    return {
      ok: false,
      error: `Commit message must match <type>(<scope>): <subject> with one of: ${ALLOWED_TYPES.join(", ")}.`,
    };
  }

  const requiredScope = requiredScopeForPaths(stagedPaths);
  const { scope, type, subject } = match.groups;

  if (requiredScope && scope !== requiredScope) {
    return {
      ok: false,
      error: `Staged changes touch only packages/${requiredScope}, so the commit scope must be \`${requiredScope}\`. Example: \`${type}(${requiredScope}): ${subject}\`.`,
    };
  }

  return { ok: true };
}

function readStagedPaths() {
  const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"], {
    encoding: "utf8",
  });

  return output
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function run(argv = process.argv.slice(2)) {
  const commitMessagePath = argv[0];

  if (!commitMessagePath) {
    process.stderr.write("Commit message path is required.\n");
    return 1;
  }

  const message = readFileSync(commitMessagePath, "utf8");
  const stagedPaths = readStagedPaths();
  const result = validateCommitMessage(message, stagedPaths);

  if (result.ok) {
    return 0;
  }

  process.stderr.write(`${result.error}\n`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run());
}
