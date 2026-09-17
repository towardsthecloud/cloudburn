# Releasing

## Contributor changesets

Add a changeset for a user-facing change to a published package: `cloudburn`, `@cloudburn/sdk`, or `@cloudburn/rules`.
Documentation-only changes do not need one.

Write `.changeset/<random-kebab-case-slug>.md` directly with one package per file:

```md
---
'@cloudburn/sdk': patch
---

Describe the user-visible change.
```

Use `patch` for fixes and `minor` for features. Do not create major changesets. Never run the interactive changeset prompt,
version command, or publish command during feature work.

## Automated release flow

On `main`, the release workflow uses Changesets to create or update a `chore: version packages` pull request, then applies
the repository's existing `release` label. Maintainers must create this label in the repository. Labeling failures are
non-fatal so missing labels or temporary API errors do not fail a successful release run.
Merging that pull request runs `pnpm release`, which verifies the repository,
force-builds packages, and publishes changed packages to npm. When the `cloudburn` CLI is published, the same workflow
updates its formula in the Homebrew tap from the npm tarball.

The workflow and `.changeset/config.json` are authoritative for release automation. Maintainers may dispatch the workflow
manually; local versioning and publishing require an explicit maintenance task. Changesets uses its GitHub changelog
adapter through [the local changelog wrapper](../../scripts/changelog.cjs), so generated changelog entries include pull
request and commit links. The wrapper retries GitHub's explicit internal-query failure up to 3 attempts, waiting 1 second
then 2 seconds. Concurrent release and dependency entries share each retry delay to preserve request batching.
Authentication, permission, and other query failures still fail immediately; exhausted retries fail the release without
substituting incomplete changelog entries. This retry policy applies only to changelog lookups. It does not rerun versioning
or publishing. `pnpm release:test` covers recovery and failure behavior against a local synthetic GitHub endpoint and runs
as part of `pnpm test` and `pnpm verify`.

## Coordinated contract releases

For an explicitly authorized release task, first inspect current `main`, the open Changesets version PR, recent Release
workflow runs, and npm versions/dist-tags. If artifacts already exist, verify them before deciding whether remaining
policy, documentation, or validation changes need a follow-up changeset. Never republish an existing npm version.

After the release changes land, review the workflow-managed version PR: package changelogs, all dependent version
bumps, and lockfile changes. `workspace:*` is intentional in repository manifests and resolves to exact versions when
packed: CLI -> SDK -> rules. Merge that version PR to publish through the existing Release workflow; do not run a
second local publish alongside it.

`pnpm verify` includes package exports, declaration typechecks, real static scans, offline discovery, and installation
of all three packed packages in an isolated consumer. `pnpm release` repeats verification on the versioned checkout
and force-builds before publishing. The API/finding references are manually maintained, not generated; see
[generated-file ownership](../reference/generated-files.md).

After publication, confirm npm's exact versions, dist-tags, internal dependency versions, tarball contents, and
integrity metadata. Install those exact registry versions into a fresh consumer without workspace overrides and run
ESM/CommonJS discovery and declaration checks against the installed artifacts. Verify the CLI version and Homebrew
update when the CLI ships. A version commit, green build, or tarball packed locally is not publication evidence.
Record the verified versions and the [SDK upgrade example](../../packages/sdk/README.md#optimization-contract-upgrade)
in the release issue and downstream integration handoff.

### Recover published release follow-up steps

Changesets CLI v3 requires `changesets/action` v2. The v1 action parsed CLI v2 console messages and can report a
successful job after npm publication while missing the v3 publish events, Git tags, GitHub releases, and Homebrew
update. Keep the action's hyphenated v2 inputs/outputs aligned with the CLI major version.

If npm publication succeeded but those follow-up steps were skipped, verify every exact npm version and tarball first.
Dispatch the Release workflow on `main` with `published-release-ref` set to the original version commit's full SHA.
The workflow checks out that commit, verifies it belongs to `main`, that all three versions exist on npm, and that each npm provenance statement names
that exact repository and release SHA, then runs `changeset git-tag` instead of `pnpm release`. This emits the structured events the v2 action consumes without invoking
npm publication. Recovery disables the action's automatic GitHub releases, verifies all remote tags against the original
release commit after Git CLI tag pushing, then creates release notes from the versioned changelogs. The usual Homebrew
step runs from the published CLI tarball. A rejected tag push fails this remote verification instead of allowing GitHub
release creation to silently attach a new tag to current `main`.

Use this only when all three packages were published from that commit. Missing or mismatched provenance fails recovery;
existing tags must already point to the same commit. Ancestry and the absence of pending changesets are checked immediately after checkout, before any
repository setup or installation runs; this prevents recovery from rewriting a version PR. Recovery can resume after a partial failure: missing GitHub releases are created
from the versioned changelogs, existing releases are kept, and Homebrew runs even when no new tag events were emitted.
It never overwrites existing tags or republishes npm packages.
GitHub may reject a historical tag push by the workflow token when the release commit has an older workflow definition.
In that case, an authorized maintainer must create the missing tags at the provenance-verified commit using their existing
repository access, then rerun recovery. Do not broaden token permissions or accept a different tag target to make recovery pass.
A normal dispatch with no recovery ref retains the standard version-PR/publish flow.
