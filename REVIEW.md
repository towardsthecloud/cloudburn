# Review guide

Rules for automated pull request reviewers. [AGENTS.md](AGENTS.md) owns orientation; each rule links to the page that
owns its details.

## Severity

- **Block (Medium or higher):** a broken public contract (rule IDs, `ScanResult` and finding shapes, SDK exports, CLI
  options and exit codes, `action.yml` inputs and outputs); a wrong verdict (false finding, missed finding, or a pass
  on unknown evidence); reuse of stale cached evidence; unexpected or repeated billable AWS calls; untrusted input
  reaching the action's PR output or the privileged release workflow; release tags or releases at the wrong commit.
- **Nit at most:** missing TSDoc on exports, naming, and documentation wording that does not change a contract.

## Always check

- **Rule IDs are immutable.** Under `packages/rules/src/aws/`, never renumber, reuse, or reassign an ID, even after
  removing a rule. Configuration, consumer profiles, and scan manifests pin IDs; the metadata test checks only
  uniqueness. See [rule ID compatibility](docs/reference/rule-ids.md#compatibility-status).
- **Static rules cover both IaC formats.** A static evaluator change needs Terraform-shaped and CloudFormation-shaped
  test cases; no check enforces this ([testing strategy](docs/TESTING.md)).
- **Cache versions follow dataset changes.** In `packages/sdk/src/providers/aws/discovery-registry.ts`, bump a
  dataset's `schemaVersion` when its normalized output changes and `loaderVersion` when its collection, normalization,
  or observation semantics change (loaders live in `packages/sdk/src/providers/aws/resources/`). Without the bump,
  cached evidence from the old loader is reused until its TTL expires. Bumping an unchanged dataset discards its
  cache and repeats billable CloudWatch collection. See [dataset versions](docs/guides/adding-a-provider-resource.md).
- **Unknown evidence stays unknown.** Missing, partial, failed, or unresolved evidence must surface as nullable
  values and `unknown` coverage (`getLiveEvaluationCoverage`), never as zero, `assessed`, or `passed`. Metric windows
  must match the declared `freshness.observation` window, which uses complete UTC days for daily lookbacks. See the
  [SDK architecture](docs/architecture/sdk.md).
- **Identity fails closed.** In `packages/rules/src/aws/resource-identity.ts`, `packages/rules/src/shared/`, the Cost
  Optimization Hub loader and rules, and `packages/sdk/src/engine/finding-precedence.ts`, contradictory or malformed
  IDs, ARNs, accounts, or Regions must drop `resourceKey` and `opportunityId` and keep provenance only. Otherwise
  precedence suppresses a real native finding. Tie-breaks use UTF-16 code-unit order, and freshness timestamps need
  an explicit timezone. See [finding identity](docs/reference/finding-shape.md#findingrecommendation).
- **Public shapes are additive and documented.** `ScanResult` is also the output of `cloudburn --format json`. A
  change to exported SDK types, result fields, CLI options, or exit codes must be additive and must update
  [the finding reference](docs/reference/finding-shape.md) and the affected package README in the same pull request.
  If a pull request deletes a test, check that the contract it covered is still tested elsewhere.
- **Action output treats PR content as untrusted.** In `packages/action/src/`, escape PR-controlled text such as
  file paths and diagnostics before it goes into comments or summaries. Update only marker comments written by the
  token's GraphQL viewer, and keep comment bodies under GitHub's 65,536-character limit. `action.yml` outputs are
  additive only, and its description stays under Marketplace's 125-character limit. See the
  [action instructions](packages/action/AGENTS.md).
- **Release recovery is privileged.** In `.github/workflows/release.yml`, validate a dispatched ref (ancestry, no
  pending changesets, npm provenance naming that exact SHA) before setup or `pnpm install`. Compare peeled commits
  for annotated tags, and create tags only for packages that commit released. Version tags are immutable, and the
  floating major tag never moves backwards. See
  [release recovery](docs/guides/releasing.md#recover-published-release-follow-up-steps).
- **Changesets.** A user-visible change to `cloudburn`, `@cloudburn/sdk`, `@cloudburn/rules`, or `@cloudburn/action`
  needs one `.changeset/*.md` file per package, `patch` or `minor` only. A missing changeset is Medium: the change is
  never versioned or released, so users do not receive it. Documentation-only changes need none. Keep the action's
  `workspace:*` SDK pin. See [contributor changesets](docs/guides/releasing.md#contributor-changesets).

## Intentional behavior

- Precedence output is sorted deterministically and does not preserve rule or evaluator order. The precedence graph
  is opportunity-local, so A→B→C does not suppress C when B has no match for that opportunity
  ([cross-rule precedence](docs/reference/finding-shape.md#cross-rule-precedence)).
- `findingCount` in `evaluations.rules` counts findings before precedence, so it can exceed what remains under
  `providers`.
- A `recommendation` without `opportunityId` skips precedence on purpose; the SDK never rebuilds identity from
  display fields.
- Auto Scaling group ARNs with a colon in the group name are not canonicalized, because AWS forbids colons there.
- Rule evaluator tests use SDK-normalized dataset fixtures. Template parsing and joins belong in SDK provider tests,
  not rule tests.
- The release workflow labels the version pull request after creating it, and a labeling failure does not fail the
  run. Changesets offers no atomic labeling, so the short race is accepted.

## Do not report

- Generated output: `packages/*/dist/`, `pnpm-lock.yaml`, and package versions and `CHANGELOG.md` files written
  by Changesets ([generated files](docs/reference/generated-files.md)).
- Files of upstream skills listed in `skills-lock.json`; the skills CLI owns them.
- Issues that CI already catches: Biome lint and formatting, typecheck, `turbo boundaries` import direction,
  `pnpm docs:check` links and aliases, the metadata test (unique IDs, evaluator modes, declared dataset reads,
  multi-dataset coverage hooks), and the action bundle test (no AWS SDK or Smithy in the static bundle).

## Evidence bar

Back any claim about AWS API behavior, serialization, or limits with AWS documentation or the installed SDK source.
For a finding about cache versions or coverage, name the normalized field or semantic that changed and the rule whose
verdict it affects.
