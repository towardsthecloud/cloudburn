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

On `main`, the release workflow uses Changesets to create or update a `chore: version packages` pull request. Merging that
pull request runs `pnpm release`, which verifies the repository, force-builds packages, and publishes changed packages to
npm. When the `cloudburn` CLI is published, the same workflow updates its formula in the Homebrew tap from the npm tarball.

The workflow and `.changeset/config.json` are authoritative for release automation. Maintainers may dispatch the workflow
manually; local versioning and publishing require an explicit maintenance task. Changesets uses its GitHub changelog
adapter, so generated changelog entries include pull request and commit links.
