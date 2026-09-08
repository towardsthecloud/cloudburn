# Discovery evidence cache

The SDK owns reusable normalized AWS evidence at the catalog and dataset loading interfaces. Rules, config merging,
finding precedence, and scan policy run again on every scan. The cache never stores AWS clients or credentials.

Authoritative sources: [public options](../../packages/sdk/src/types.ts),
[cache and store contract](../../packages/sdk/src/evidence-cache.ts),
[AWS scope and lifecycle](../../packages/sdk/src/providers/aws/evidence.ts), and
[dataset policies](../../packages/sdk/src/providers/aws/discovery-registry.ts).

## Options and defaults

`CloudBurnClient.discover({ cache })` accepts `AwsEvidenceCacheOptions`. Omitting `cache` disables reuse across scans.
An explicitly configured cache without a directory or store reuses memory on that `CloudBurnClient` instance.

| Option                 | Default                  | Meaning                                                                                                                          |
| ---------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                 | `normal` when configured | Reuse fresh complete evidence. `refresh` requires collection; `off` bypasses reuse, coordination, and persistence.               |
| `directory`            | None                     | Private local persistence directory shared by cooperating processes.                                                             |
| `store`                | None                     | Alternative `EvidenceCacheStore`; mutually exclusive with `directory`.                                                           |
| `authorizationContext` | None                     | Caller-supplied revision of effective permissions and execution context. Required for customer reuse with long-term credentials. |
| `maxEntries`           | `1000`                   | Maximum inactive stored entries after eviction.                                                                                  |
| `maxBytes`             | `134217728` (128 MiB)    | Maximum serialized entry bytes after eviction, excluding SQLite overhead and active leases.                                      |
| `ttlMs.catalog`        | `180000`                 | Freshness for search plans, resource-type catalogs, and declared filtered catalog queries.                                       |
| `ttlMs.datasets`       | Registry policies        | Map of dataset keys to freshness durations in milliseconds.                                                                      |
| `ttlMs.pricing`        | `43200000` (12 hours)    | Freshness for independent public pricing artifacts.                                                                              |

Freshness overrides are non-negative integer milliseconds. Zero requires recollection. `maxEntries` and `maxBytes`
must be positive safe integers. The CLI configures persistent normal mode by default; its flags and storage location
are documented in the [CLI README](../../packages/cloudburn/README.md#discover).

## Freshness policies

These initial values are tunable proposals, not measured optimal defaults. They trade repeated AWS requests for delayed
visibility of changes. They do not improve the freshness of the upstream service.

| Evidence                                    | Proposed TTL | Observation policy                                                       |
| ------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| Resource Explorer search plans and catalogs | 3 minutes    | Collected indexed-view snapshot                                          |
| Inventory and configuration                 | 10 minutes   | Collected configuration snapshot                                         |
| Recent activity                             | 5 minutes    | Dataset-specific complete UTC days or rolling interval                   |
| Billing and recommendations                 | 6 hours      | Complete source periods where known; otherwise provider-defined snapshot |
| KMS monthly churn/usage                     | 10 minutes   | Previous complete UTC month                                              |
| Public Transit Gateway pricing              | 12 hours     | Current regional product artifact; publication date when supplied        |

The registry owns each dataset's exact exception and interval. Daily windows use UTC midnight. Billing month boundaries
use UTC calendar months. Rolling Lambda and EMR evidence uses a timestamp at the start of its configured freshness
interval, then the loader's minute alignment. For example, the default Lambda cache collects a seven-day interval ending
at 12:00 for scans at 12:01 and 12:02; a scan at 12:05 collects an interval ending at 12:05. This limits reuse to the same
actual observation interval and can omit up to five minutes of recent activity under the default policy. Cache-off
collection retains the loader's normal per-scan timestamp.

`refresh` makes fresh requests for the policy's observation interval. It never silently returns older evidence after
denial, failure, cancellation, or partial collection. Once a refresh starts, an invalidation barrier prevents other
normal readers from using the older payload until a complete refresh succeeds. A crash leaves the barrier in place.
There is no stale-fallback mode.

## Authorization and scope

With reuse configured, the SDK resolves credentials once and uses that same in-memory credential identity for scope
validation and collection. Every scan validates its caller identity with STS. Customer keys include the partition,
signing account, a digest of the access key/session token and optional authorization-context revision, and the selected
target. Different sessions sharing the same account and role ARN remain separate. Expired credentials cannot read
cached evidence. If identity validation is unavailable, discovery continues with customer reuse disabled.

Temporary session credentials can derive a reuse scope. Long-term credentials require `authorizationContext`;
otherwise customer evidence stays uncached. The context must identify effective permission and environment revisions,
including relevant session-policy or request-context conditions. An account ID, profile name, or role ARN alone is
insufficient. AWS [session policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html#policies_session)
can limit what a session may access even when its role identity matches another session.

Credential identity does not detect later IAM, SCP, resource-policy, or network-condition changes. Change the context
revision when those inputs change, or use `refresh`/`off` to revalidate through collection. A successful STS call is an
identity check, not proof that every service operation is still authorized.

Resource Explorer `GetDefaultView` and `GetView` run again before cached resource evidence is read. View ARN, view
scope, filters, included properties, target/filter scope, and regional catalog membership participate in dependent keys.
Search-plan and `ListResources` results can be reused. Thus repeated unchanged scans avoid catalog listing and hydration
calls within policy, apart from STS and current-view validation. Auxiliary setup/status operations remain uncached.

## Dependencies and completeness

The registry declares dataset dependencies, catalog queries, schema versions, loader versions, and observation policy.
It rejects unknown dependencies and cycles. Discovery resolves these dependencies before reading a cached derived
dataset. Changed dependency versions, values, observation intervals, or relevant catalog membership invalidate dependent
evidence. Adding a newly discovered volume therefore recollects volume evidence even while the inventory TTL is valid.
Changing rule selection fetches missing resource types and datasets while reusing compatible evidence.

A complete cache entry means its normalized evidence contract is satisfied for the collected scope. It does not mean
all account resources exist in the catalog. Resource Explorer has indexing and replication delays, and an index or view
may cover only part of an account. See AWS [search troubleshooting](https://docs.aws.amazon.com/resource-explorer/latest/userguide/troubleshooting_search.html).

The envelope retains diagnostics and assessed/unknown resource identities from the corrected evidence contract.
Completeness combines catalog normalization, dataset availability, diagnostics, dependency completeness, and resource
coverage. Missing inventory candidates and unknown metrics prevent complete reuse. Conservative inventory matching may
also disable reuse for intentional filtering or enumeration datasets whose rows cannot reconcile to catalog identities.
An account-scoped successful empty result can be complete. No rule finding or config-dependent pass is cached.

Only a complete successful owner publishes a replacement payload. Failed, partial, and cancelled attempts invalidate
previous evidence without replacing it. Checksums, format versions, and artifact validators reject corrupt or obsolete
entries. Such entries are recollected; an unusable SQLite database or inaccessible configured store reports an error.

## Result provenance

Configuring cache controls adds `ScanResult.evidence`, independently of `includeEvaluationResources`:

| Field                     | Meaning                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `datasetKey`, `region`    | Artifact and optional regional scope; catalog and pricing artifacts have their own keys.  |
| `source`                  | `live` for this collection or `cache` for reused evidence.                                |
| `collectedAt`             | ISO timestamp when collection completed; unchanged on reuse.                              |
| `observedAt`              | Observation endpoint or snapshot timestamp; pricing uses publication date when available. |
| `observationWindow`       | Actual inclusive `start` and exclusive `end` for period-based evidence.                   |
| `complete`                | Whether this artifact satisfies its evidence contract.                                    |
| `cacheStatus`             | `miss`, `hit`, `stale`, `corrupt`, `obsolete`, `refresh`, or `off`.                       |
| `coverage`, `diagnostics` | Dataset assessed/unknown identities and collection diagnostics when applicable.           |

Supporting provenance survives reuse of its parent dataset. For example, unknown optional pricing remains visible when
complete activity evidence is cached. CLI JSON preserves the array; table output summarizes sources, incompleteness, and
the oldest observation. Existing `evaluations` retain rule-specific assessed/unknown coverage on every scan.

## Public pricing

Public pricing has no customer authorization key. The current implementation caches the normalized AmazonVPC VPC
Transit Gateway attachment hourly price by region, product, operation, attachment type, currency, and version policy.
The artifact retains the source price-list version and publication date when supplied. Its independent TTL controls
when the moving `current` source is fetched again. Missing pricing remains incomplete and supplies no estimate; activity
checks continue. A cached activity dataset may retain a missing price until its own freshness interval expires.

## Coordination and storage

Within a process, each key has one shared load. Each waiter has its own cancellation signal; cancelling one waiter does
not abort work needed by another. When all waiters leave, the shared load is cancelled. Collection owns a separate
five-minute AWS execution, clients, credentials, and quota budget; caller deadlines still bound each wait.

Local storage uses `evidence.sqlite` in a directory with mode `0700` and a database with mode `0600`. SQLite transactions
atomically acquire per-key leases and publish complete payloads. A 30-second lease is renewed every 10 seconds. Waiters
poll interruptibly, and an expired lease can be taken over after a process crash. Each publish/cleanup checks the owner
token and expiry, so an old writer cannot overwrite a successor. Transactions wait at most five seconds for a database
lock. Storage reclaims inactive entries by least-recent access to enforce count and byte limits; active leases and
temporary refresh/journal storage can exceed those limits until collection settles.

`createEvidenceCache()` exposes the same mechanism for normalized data. It accepts plain objects, arrays, JSON scalar
values, `undefined`, and `Date` instances. Dates survive persistence and results are copied between waiters. Unsupported
objects such as `Map`, `Set`, typed arrays, and class instances are rejected. Generic `leaseMs` and `pollMs` options must
be integer timer durations between 1 and 2147483647 milliseconds.

The local store is for processes on one machine using a local filesystem. A hosted consumer supplies
`EvidenceCacheStore` instead: `update(key, transition, signal)` must atomically read and commit each pure transition;
`prune(limits, signal)` must coordinate eviction with those transitions and preserve active leases. Keep the opaque entry,
lease token/expiry, `invalidated` barrier, and access timestamp intact, and use a consistent clock across workers. The
consumer owns backend transactions, fencing, access controls, encryption, retention, and cancellation. This repository
does not provision a hosted cache service or claim coordination across independent local disks.
