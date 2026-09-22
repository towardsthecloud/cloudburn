---
'@cloudburn/action': patch
---

Ship CloudBurn's IaC scan as a GitHub Action. `@cloudburn/action` bundles the SDK into a single `dist/index.cjs`,
annotates findings on pull requests, posts a sticky comment, writes a step summary, and fails the job through the same
`fail-on`/`exit-code` policy semantics as `cloudburn scan`. The release workflow syncs the built bundle to the public
`towardsthecloud/cloudburn-action` repository behind version and floating major tags.

The bundle excludes AWS discovery clients and runs without installed dependencies. Sticky comments support custom
GitHub App installation tokens as well as the default workflow token and personal access tokens.
