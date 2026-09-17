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
