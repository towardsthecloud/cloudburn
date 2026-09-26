# Releasing

## Contributor changesets

Add a changeset for a user-facing change to a versioned package: `cloudburn`, `@cloudburn/sdk`, `@cloudburn/rules`,
`@cloudburn/mcp`, or `@cloudburn/action` (versioned and tagged, but not published to npm — see
[GitHub Action sync](#github-action-sync)). Changes to the agent plugin or its skill ship as `@cloudburn/mcp` changes;
see [agent plugin sync](#agent-plugin-sync). Documentation-only changes do not need one.

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

## GitHub Action sync

`@cloudburn/action` is private: `changeset publish` never sends it to npm, but
`privatePackages: { version: true, tag: true }` in `.changeset/config.json` still versions it and emits the
`@cloudburn/action@x.y.z` tag and GitHub release. Its `@cloudburn/sdk` dependency is pinned with `workspace:*`
(an exact version), so every SDK release leaves the action out of range and Changesets patch-bumps it — the action
version therefore tracks the SDK automatically. Keep the `workspace:*` pin; a ranged dependency would break tracking
for patch releases.

After publishing, the `Sync GitHub Action` step reads `packages/action/package.json`, builds the bundle, clones
`towardsthecloud/cloudburn-action` with `ACTION_REPO_TOKEN`, copies `action.yml`, `dist/index.cjs`,
`dist/main.wasm.gz`, `README.md`, and `LICENSE`, and commits only on content changes. It then reconciles each
artifact independently — `v<version>` tag, floating `v<major>` tag, and GitHub release from
`packages/action/CHANGELOG.md` — so re-runs heal partial syncs. When the remote already holds a newer version (a
`published-release-ref` recovery for an older release), the step preserves `main` and the "latest" release marker.
The floating major tag advances independently: recovering the newest `v1` release still repairs `v1` when `v2` exists,
but recovering an older `v1` release never moves `v1` backwards. Version tags remain immutable.

Before the first sync, create the public `towardsthecloud/cloudburn-action` repository with `main` as its default branch
and configure the `ACTION_REPO_TOKEN` secret with `contents: write` on that repository — the same pattern as
`HOMEBREW_TAP_TOKEN`. The first automated release remains a draft. Publish that draft through the GitHub UI with
"Publish this Action to the GitHub Marketplace" checked (`action.yml` carries the `branding` metadata). The Marketplace
listing is [CloudBurn Scan](https://github.com/marketplace/actions/cloudburn-scan); its name comes from `action.yml`
`name`, so keep that value unchanged to preserve the listing. This listing setup is manual. Verify a workflow using the first published action and record the result
in the rollout issue. Then verify that the first subsequent automated release updates the Marketplace listing and
record that result too; successful monorepo CI alone does not establish either rollout requirement.

The workflow and `.changeset/config.json` are authoritative for release automation. Maintainers may dispatch the workflow
manually; local versioning and publishing require an explicit maintenance task. Changesets uses its GitHub changelog
adapter through [the local changelog wrapper](../../scripts/changelog.cjs), so generated changelog entries include pull
request and commit links. The wrapper retries GitHub's explicit internal-query failure up to 3 attempts, waiting 1 second
then 2 seconds. Concurrent release and dependency entries share each retry delay to preserve request batching.
Authentication, permission, and other query failures still fail immediately; exhausted retries fail the release without
substituting incomplete changelog entries. This retry policy applies only to changelog lookups. It does not rerun versioning
or publishing. `pnpm release:test` covers changelog failures against a local synthetic GitHub endpoint and release
recovery against temporary Git remotes. It runs as part of `pnpm test` and `pnpm verify`.

## Agent plugin sync

`@cloudburn/mcp` is published to npm like the other public packages. Its `workspace:*` SDK pin makes every SDK release
patch-bump it, as with the action. Its build also writes the agent plugin to `packages/mcp/dist/plugin/`, stamping the
package version into the plugin manifests and the `npx -y @cloudburn/mcp@<version>` launchers.

After a release publishes `@cloudburn/mcp`, the `Sync agent plugin` step builds the package, clones
`towardsthecloud/cloudburn-plugin` with `PLUGIN_REPO_TOKEN`, replaces everything except `.git` with the built plugin,
and commits only on content changes. It creates the immutable `v<version>` tag before pushing `main`, then creates the
GitHub release from `packages/mcp/CHANGELOG.md`. The sync runs after npm publication, so the plugin never pins an
unpublished server. When the remote already holds a newer version, a recovery sync tags the older release but keeps
`main` and the latest release marker.

Release prerequisites, which a passing source build does not establish:

1. npm trusted publishing requires an existing package. Before the first automated release, a maintainer publishes an
   initial `@cloudburn/mcp` version manually and configures this repository's release workflow as its trusted
   publisher.
2. Create the public `towardsthecloud/cloudburn-plugin` repository with `main` as its default branch and issues
   disabled, then configure the `PLUGIN_REPO_TOKEN` secret with `contents: write` on that repository.
3. After the first sync, install from the plugin repository in Claude Code and Codex and run a scan through each.
4. Submit the plugin repository root as a **Plugin bundle** in Anthropic's developer portal at
   `claude.ai/directory/manage`, tracking `main`, and follow its review. The directory scans every new commit on
   `main`, and each version is held for review because the MCP server starts through `npx`.
5. Public repositories appear on skills.sh once people install their skills; there is no submission step. The public
   Codex directory accepts only remote MCP servers, so Codex users install from the plugin repository marketplace.

Record the verification of each step in the rollout issue.

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

If follow-up steps were skipped, verify each published npm version and tarball first. Action-only releases skip this npm check.
Dispatch the Release workflow on `main` with `published-release-ref` set to the original version commit's full SHA.
The workflow checks out that commit, verifies it belongs to `main`, and identifies only packages whose versions changed
in that commit. For each changed npm package, it verifies the exact npm version and that its provenance names the
repository and release SHA. The private `@cloudburn/action` package needs no npm version or provenance.
Recovery bypasses Changesets publishing and creates or pushes only the selected packages' tags. It verifies every
selected tag against the original release commit before creating GitHub releases from the versioned changelogs.
Unchanged packages' older tags remain untouched, including missing tags. A rejected tag push fails recovery instead of
allowing GitHub release creation to silently attach a new tag to current `main`.

Recovery supports any released subset, including action-only releases. Missing or mismatched npm provenance fails
recovery; existing selected tags must already point to the same commit. Ancestry and the absence of pending changesets
are checked immediately after checkout, before repository setup or installation; this prevents recovery from rewriting
a version PR. Recovery can resume after a partial failure: missing GitHub releases are created, existing releases are
kept, Homebrew runs only when `cloudburn` changed, action sync runs only when `@cloudburn/action` changed, and plugin
sync runs only when `@cloudburn/mcp` changed.
It never overwrites existing version tags or republishes npm packages.
GitHub may reject a historical tag push by the workflow token when the release commit has an older workflow definition.
In that case, an authorized maintainer must create the missing tags at the provenance-verified commit using their existing
repository access, then rerun recovery. Do not broaden token permissions or accept a different tag target to make recovery pass.
A normal dispatch with no recovery ref retains the standard version-PR/publish flow.
