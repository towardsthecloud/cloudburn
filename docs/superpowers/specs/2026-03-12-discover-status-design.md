# Discover Status Design

## Summary

CloudBurn should stop treating the `CreateResourceExplorerSetup` API response as the source of truth for discovery readiness. AWS can accept the setup request while only creating indexes in a subset of regions, especially when SCPs or regional permission gaps block Resource Explorer access elsewhere.

This design adds a post-setup verification model and a new `discover status` command that reports the actual Resource Explorer state across all account regions.

## Goals

- Show actual discovery coverage after `discover init`, not just the initial setup request payload.
- Add `cloudburn discover status` to list all enabled AWS regions and the Resource Explorer state for each region.
- Identify which region is the aggregator when one exists.
- Distinguish indexed regions from unindexed regions and access-denied regions.
- Tell the user when limited discovery coverage may be intentional because of SCP-enforced regional restrictions.

## Non-Goals

- Do not add per-service discovery fan-out beyond Resource Explorer status inspection.
- Do not change the existing `discover` rule-evaluation surface beyond using clearer setup metadata.
- Do not attempt to bypass or remediate SCP restrictions automatically.

## User Experience

### `cloudburn discover status`

`discover status` will inspect every AWS region returned by `DescribeRegions(AllRegions: false)` and attempt to read Resource Explorer index state in that region.

Table output will contain:

- `region`
- `indexType` — `aggregator`, `local`, or empty
- `status` — `indexed`, `not indexed`, `access denied`, `error`, or `unsupported`
- `defaultView` — `present`, `missing`, `filtered`, `unknown`, or empty when no index is visible
- `notes` — short human-readable explanation

Behavior rules:

- The aggregator region is explicitly labeled in `indexType`.
- Regions without an index are shown as `not indexed`.
- Regions where Resource Explorer access is denied are shown as `access denied`.
- Regions with non-auth AWS failures such as throttling or service-side errors are shown as `error`.
- Regions that cannot be evaluated because Resource Explorer is not available in that region are shown as `unsupported`.
- When one or more regions are denied, the command includes a summary note that discovery coverage is limited and that SCP restrictions may be intentional.

### `cloudburn discover init`

`discover init` will still request setup, but it will no longer trust the API request payload as the final result. After the setup verification policy runs, it will execute the same status collector used by `discover status`.

The command will then render a truthful summary:

- `status` will continue to describe whether CloudBurn changed anything: `CREATED` or `EXISTING`.
- `coverage` will describe the observed result: `full`, `partial`, `local_only`, or `none`.
- `readiness` will describe whether discovery is actually usable from the relevant search region: `ready`, `degraded`, or `unusable`.
- `verificationStatus` will describe whether the observed result is final: `verified` or `timed_out`.

The CLI message will summarize the actual outcome, for example:

- `Resource Explorer aggregator created in eu-central-1, but only 3 of 17 regions are indexed. Discovery coverage is limited.`
- `Local Resource Explorer setup is available only in eu-central-1. Discovery outside that region is unavailable.`

If verification times out after setup, the message must say that setup is still converging and that the observed coverage may still change.

## SDK Design

### New Types

Add SDK-facing types for observed status:

- `AwsDiscoveryRegionStatus`
- `AwsDiscoveryStatus`
- `AwsDiscoveryInitialization`

`AwsDiscoveryRegionStatus` will include:

- `region`
- `indexType?: 'local' | 'aggregator'`
- `indexStatus: 'indexed' | 'not_indexed' | 'access_denied' | 'error' | 'unsupported'`
- `defaultViewStatus?: 'present' | 'missing' | 'filtered' | 'access_denied' | 'error' | 'unsupported' | 'unknown'`
- `errorCode?: string`
- `notes?: string`

`AwsDiscoveryStatus` will include:

- `regions: AwsDiscoveryRegionStatus[]`
- `aggregatorRegion?: string`
- `indexedRegionCount`
- `accessibleRegionCount`
- `totalRegionCount`
- `coverage: 'full' | 'partial' | 'local_only' | 'none'`
- `readiness: 'ready' | 'degraded' | 'unusable'`
- `warning?: string`

`AwsDiscoveryInitialization` will include:

- `status: 'CREATED' | 'EXISTING'`
- `verificationStatus: 'verified' | 'timed_out'`
- `taskId?: string`
- `observedStatus: AwsDiscoveryStatus`

### New SDK Methods

Add:

- `CloudBurnClient.getDiscoveryStatus(options?: { region?: string }): Promise<AwsDiscoveryStatus>`

This will delegate to a new provider helper in `packages/sdk/src/providers/aws/discovery.ts`.

### Status Collection Flow

1. Resolve the current or explicit region.
2. Call `DescribeRegions(AllRegions: false)` to get the account’s enabled AWS regions.
3. For each region:
   - create a regional Resource Explorer client
   - call `ListIndexes`
   - if an index exists, record `local` or `aggregator`
   - call `GetDefaultView` and `GetView` to classify the default view as `present`, `missing`, or `filtered`
   - if access is denied, record `access_denied`
   - if a non-auth AWS error occurs, record `error`
   - if the region cannot support Resource Explorer status inspection, record `unsupported`
4. Derive the global summary:
   - aggregator region
   - indexed count
   - coverage classification
   - readiness classification based on whether the relevant search region has a usable unfiltered default view
   - warning text when denied regions, missing indexes, or search-region view problems limit discovery

The status collector must preserve per-region denial messages so the CLI can report why coverage is limited.

### Post-Init Verification Policy

`discover init` must not infer final coverage directly from `CreateResourceExplorerSetup`.

Verification flow:

1. Call `CreateResourceExplorerSetup`.
2. If AWS returns `TaskId`, poll `GetResourceExplorerSetup` for that task.
3. Poll up to 10 attempts with a 3-second interval.
4. Stop early when AWS reports terminal task state for the setup request.
5. After polling completes, run the region status collector.
6. If the task never reached a terminal state inside the poll window, return `verificationStatus: 'timed_out'` and clearly say the result is still converging.

This keeps `discover init` from declaring `partial` or `local_only` as a final outcome while AWS setup work is still in progress.

## CLI Design

### New Command

Add:

- `cloudburn discover status`

It will use the shared formatter system:

- `table` for a summary section plus the region matrix
- `json` for the raw structured status payload
- `text` as a summary line followed by tab-delimited region rows

To keep this inside the shared formatter pipeline, add a dedicated CLI response shape for discovery status, for example:

- `kind: 'discovery-status'`
- `summary`
- `regions`

JSON output must preserve both the summary object and the per-region rows. Table and text output must derive from the same payload rather than assembling extra ad hoc strings in the command handler.

### Updated Init Output

`discover init` should render:

- observed `aggregatorRegion`
- observed `status`
- observed `coverage`
- observed `readiness`
- observed `verificationStatus`
- observed indexed regions, not the requested region list
- warning text when coverage is partial

It should stop printing the raw `RegionList` request payload as though that were the created state.

### Updated Init Flag Help

The `discover init --region <region>` help text should describe the region as the requested or preferred aggregator region, not as a guaranteed final outcome.

Required wording intent:

- this is the main region
- it aggregates Resource Explorer indexes from other regions
- it is where cross-region Resource Explorer results are queried from
- it still defaults to the current AWS region from `AWS_REGION` unless overridden

Example help text:

- `Requested aggregator region to create or reuse during setup. This is the main Resource Explorer region CloudBurn will try to use for aggregating indexes from other regions. Defaults to the current AWS region from AWS_REGION; use this flag to override it.`

## Error Handling

- Per-region access denial is not fatal for `discover status`; it becomes regional status data in the result.
- Per-region non-auth AWS failures are also not fatal; they become `error` regional status data with notes.
- A global failure to enumerate account regions remains fatal.
- Missing or filtered default views should be surfaced in status output as diagnostic data. They are directly relevant for the chosen search region and useful operator context in other indexed regions.
- Setup-path access denial should be translated into a partial/local-only result only after the verification policy runs.

## Testing

### SDK

Add tests for:

- full aggregator coverage
- partial coverage where only some regions become indexed
- local-only coverage
- per-region access denied results
- per-region non-auth error results
- unsupported region status results
- missing, filtered, and access-denied default-view results in indexed regions
- `initializeAwsDiscovery()` deriving `status`, `coverage`, `readiness`, and `verificationStatus` from observed status
- setup verification timeout behavior using `GetResourceExplorerSetup`

### CLI

Add tests for:

- `discover status` table output
- `discover status --format json`
- `discover init` reporting partial coverage after setup
- `discover init` reporting timed-out verification after setup
- SCP-style access-denied summary messaging

## Risks

- Status collection fans out across all enabled account regions, which adds latency.
- Some accounts may allow `DescribeRegions` but deny Resource Explorer APIs in most regions; this is expected and should be rendered as status, not failure.
- AWS setup can be eventually consistent. `discover init` may need a bounded wait or one recheck before declaring partial coverage immediately after task creation.

## Recommendation

Implement `discover status` and make `discover init` consume the same observed-status model. That keeps setup and diagnostics aligned and fixes the current misleading behavior at the root cause instead of layering more message heuristics on top.
