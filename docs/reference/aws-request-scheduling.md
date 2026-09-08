# AWS request scheduling

Catalog, control-plane, and collector requests share rate, burst, concurrency, and retry limits across public discovery operations. Independent
CLI or SDK processes coordinate when they run as the same OS user and use the same admission directory on one machine.
This page owns the configuration and guarantees for [the request module](../../packages/sdk/src/providers/aws/request.ts).

## Scope and guarantees

Quota identity includes the AWS partition, account, service, operation or operation group, and applicable region.
Region is omitted for global services such as Route 53. Service aliases resolve to the same identity. Requests for
different datasets or resources share admission when AWS applies an account quota; different accounts and independent
quota groups can progress separately. Credential providers, clients, lookup caches, and dataset caches retain their
existing isolation. Quota sharing does not grant access to another scan's credentials or results.

Discovery resolves the signing caller's account once per run. That identity takes precedence over account hints from
catalog resources, which can belong to member accounts in an organization. If caller resolution fails, requests use
isolated in-memory admission for that run and telemetry identifies the scope as `unresolved:<run-id>`. Pacing and retry
limits still apply within that run, but cross-scan coordination is unavailable until caller identity can be resolved.
Cancellation during identity resolution still stops dispatch. The initial STS `GetCallerIdentity` request has its own
bounded in-memory budget, deadline, cancellation, and retry owner. Its account is unknown until it completes, so this
bootstrap request cannot participate in account-scoped cross-process admission. STS results, including failures, are
memoized only for the active operation.

Each attempt reserves concurrency before SDK execution. Final admission atomically charges request capacity and
CloudWatch datapoints where applicable immediately before physical transport, after SDK preparation. Pagination and
retries use the same limits. Cancellation removes pending waits and prevents queued attempts from dispatching. Active
requests receive the discovery cancellation signal, and completed work releases its concurrency reservation.

Final admission waits at most 4 minutes with a prepared signature, leaving a margin within the usual
[5-minute AWS signing window](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html). Longer waits
restart SDK preparation to obtain a fresh signature while retaining the same concurrency reservation. This refresh
does not send an HTTP request, spend retry allowance, or advance the physical attempt count. The discovery deadline
and cancellation signal continue to bound preparation and admission.

Admission enforces both a token bucket and a rolling window. The window spans 1 second for rates of at least 1/s;
lower rates allow at most 1 start in `1 / ratePerSecond` seconds.

The public facade starts one request budget before catalog collection and retains it through dataset loading.
Status, initialization, and supported-resource-type listing use the same lifecycle. Resource Explorer catalog reads,
setup mutations, and polls all share its regional `non-search` quota; EC2 region listing uses `DescribeRegions` admission.
Status limits regional work to 5 workers and preserves sorted output. Each regional `ListIndexes`, `GetDefaultView`,
and `GetView` status probe makes at most 2 physical attempts before reporting unavailable status evidence; both
attempts still acquire the shared quota. Catalog collection and setup mutations retain their separate retry budgets. Direct internal hydrator calls outside a budget
keep wrapper-owned retries without shared admission. Other applications using the same AWS account are outside this
coordinator's control, so AWS can still throttle a locally admitted request.

Public Transit Gateway pricing uses unauthenticated HTTP and has no AWS account quota. Its 5-second timeout is composed
with operation cancellation, including response-body reads. An HTTP or pricing-only timeout failure keeps pricing
optional; operation cancellation stops discovery. Unused error response bodies are cancelled.

## Configuration

These environment variables apply to both CLI discovery and SDK discovery. They do not change AWS account quotas,
and CloudBurn does not call Service Quotas to discover account-specific increases.

| Variable                        | Default                                                       | Meaning                                                                   |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `CLOUDBURN_AWS_ADMISSION_DIR`   | Platform cache or shared temporary directory, described below | Private local directory shared by all processes that should coordinate.   |
| `CLOUDBURN_AWS_QUOTA_OVERRIDES` | Unset                                                         | JSON object of partial policies keyed by canonical `service:group` names. |

Without an explicit admission directory, CloudBurn uses `$XDG_CACHE_HOME/cloudburn/aws-admission-v1` when
`XDG_CACHE_HOME` is set, or `~/.cache/cloudburn/aws-admission-v1` otherwise. If a new cache cannot be initialized because
of permissions, a read-only filesystem, or an unusable home path,
CloudBurn can use a private `cloudburn-<user-id>/aws-admission-v1` directory under the system temporary directory
(including `TMPDIR` on POSIX). This fallback remains shared across processes; it does not switch to in-memory admission.
An existing temporary coordinator is reused while the primary directory remains absent, even if the home becomes writable.

Shared admission requires writable local storage. Errors in explicit admission directories or existing coordinator state fail without
selecting a new location. Paths whose state cannot be inspected also fail with an actionable error. If both default and
temporary locations exist, stop participating processes and select the active state with `CLOUDBURN_AWS_ADMISSION_DIR`.
Database corruption and lock errors never select a new directory.
Set `CLOUDBURN_AWS_ADMISSION_DIR` to the same writable local path in every participating container or SDK process.

For example, this policy reserves a smaller share of the account's log-stream quota:

```bash
export CLOUDBURN_AWS_QUOTA_OVERRIDES='{"logs:DescribeLogStreams":{"ratePerSecond":5,"burst":1,"concurrency":3,"retryCapacity":10}}'
```

| Policy field    | Type and validation                                    | Meaning                                                                        |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `ratePerSecond` | Finite positive number                                 | Sustained request or datapoint refill rate. Fractional rates are supported.    |
| `burst`         | Finite number from `1` through `max(1, ratePerSecond)` | Maximum token capacity; it must accommodate the cost of one attempt.           |
| `concurrency`   | Positive safe integer                                  | Maximum concurrent reservations for the quota.                                 |
| `retryCapacity` | Nonnegative safe integer                               | Shared allowance for additional attempts. `0` disables retries for that quota. |

Unspecified fields retain their defaults, except an inherited burst is capped at `max(1, ratePerSecond)` when the rate
is lowered. For example, setting only an EC2 read rate to 5/s also lowers its default burst from 10 to 5. Explicit burst
values must satisfy the validation above. Overlapping processes with different policies use the strictest value of
each field. A healthy quota can adopt a less restrictive policy after 60 seconds without active reservations. Changing
the directory starts a separate coordinator, so all participating processes must use the same path. Keep shared state
in place while scans are active. The idle reset also applies to CloudWatch datapoint policies.

Invalid JSON or malformed policy objects fail before the AWS request callback executes. The error identifies
`CLOUDBURN_AWS_QUOTA_OVERRIDES` without including the supplied JSON.

## Default policies

The [policy resolver](../../packages/sdk/src/providers/aws/request-policy.ts) owns the complete operation mapping.
Defaults were checked against AWS documentation on 2026-09-07. These are conservative local limits; some are lower
than AWS defaults. Every request policy starts with concurrency `10` and retry allowance `20`.

| Canonical quota                                                                       | Requests/second | Burst | Scope and AWS reference                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | --------------: | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logs:DescribeLogStreams`                                                             |              25 |     1 | Account, region, operation. [CloudWatch Logs quotas](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html)                                                                                                     |
| `logs:DescribeLogGroups`                                                              |              10 |     1 | Account, region, operation. [CloudWatch Logs quotas](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html)                                                                                                     |
| `route53:all-requests`                                                                |               5 |     5 | Global account budget preserved from earlier CloudBurn behavior. AWS now documents 10/s for the account and default operations. [Route 53 throttling](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/throttling-api-requests.html) |
| `ec2:<supported read operation>`                                                      |              10 |    10 | Separate quota per API, including the smaller unfiltered/unpaginated read allowance. [EC2 throttling](https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-throttling.html)                                                                |
| `ecs:service-read`, `ecs:cluster-resource-read`                                       |         20 each |     1 | Separate account/region operation groups. [ECS throttling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/request-throttling.html)                                                                                               |
| `elasticloadbalancing:all-requests`, `elasticloadbalancingv2:all-requests`            |         10 each |     1 | Separate account/region budgets for each API version. [ELB throttling](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/elb-api-throttling.html)                                                                             |
| `dynamodb:control-plane-read`                                                         |             100 |     1 | Shared read-control-plane budget across tables. [DynamoDB constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)                                                                                     |
| `kms:GetKeyLastUsage`                                                                 |               5 |     1 | Account/region operation quota across all keys. Other supported KMS reads use 100/s. [KMS quotas](https://docs.aws.amazon.com/kms/latest/developerguide/requests-per-second.html)                                                             |
| `emr:DescribeCluster`, `emr:ListInstances`                                            |          1, 0.5 |     1 | Separate account/region operation quotas; refill rates differ from AWS burst allowances. [EMR quotas](https://docs.aws.amazon.com/general/latest/gr/emr.html)                                                                                 |
| `cloudtrail:DescribeTrails`                                                           |              10 |     1 | Account, region, operation. [CloudTrail quotas](https://docs.aws.amazon.com/general/latest/gr/ct.html)                                                                                                                                        |
| `cloudwatch:ListMetrics`, `cloudwatch:GetMetricData`                                  |         25, 500 |     1 | Separate account/region request quotas; metric data also consumes the datapoint budget below. [CloudWatch quotas](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_limits.html)                                      |
| `lambda:control-plane`                                                                |              15 |     1 | Shared by the supported function/version listing operations. [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html).                                                                                        |
| `resource-explorer-2:non-search`                                                      |               3 |     1 | Account/region budget for supported non-search operations, including catalog reads, status, supported types, setup mutations, and polls. [Resource Explorer quotas](https://docs.aws.amazon.com/resource-explorer/latest/userguide/quotas.html).                                                 |
| `sagemaker:DescribeEndpoint`, `sagemaker:DescribeEndpointConfig`                      |          5 each |     1 | Separate account/region operation quotas. [SageMaker quotas](https://docs.aws.amazon.com/general/latest/gr/sagemaker.html).                                                                                                                   |
| `s3:GetBucketLifecycleConfiguration`, `s3:ListBucketIntelligentTieringConfigurations` |         10 each |    10 | Separate local operation budgets shared across buckets in the account and region; not verified AWS quotas.                                                                                                                                    |
| Other operations                                                                      |              10 |    10 | Local fallback per account, applicable region, service, and operation; not a verified AWS quota.                                                                                                                                              |

The S3 [lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketLifecycleConfiguration.html) and
[intelligent-tiering](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListBucketIntelligentTieringConfigurations.html)
API references do not establish a combined request quota for these configuration reads. CloudBurn applies its local
fallback to each operation independently; calls to the same operation still share admission and retry feedback across
buckets and scans. Larger workloads can need explicit quota overrides or a longer discovery `timeoutMs`. Local rate
policies and the default deadline do not guarantee completion for every account size.

### CloudWatch datapoints

`GetMetricData` consumes its request budget and one account/region datapoint budget, selected by the age of the
original request's `StartTime` at the attempt:

| Override key                                 | Datapoints/second |   Burst |
| -------------------------------------------- | ----------------: | ------: |
| `cloudwatch:GetMetricData:recent-datapoints` |           180,000 | 180,000 |
| `cloudwatch:GetMetricData:older-datapoints`  |           396,000 | 396,000 |

The recent bucket applies when `StartTime` is at most 3 hours old, including exactly 3 hours. A request starting
earlier uses the older bucket even when its end includes recent metrics. These are the separate
[AWS datapoint quotas](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_limits.html).

For inspectable `MetricStat` queries, each page and retry reserves the sum of the per-series datapoint upper bounds.
The calculation includes AWS `StartTime` rounding and partial leading periods, honors the exclusive `EndTime`, and
caps the total at `MaxDatapoints`, up to 100,800. Missing or invalid `MaxDatapoints` uses 100,800 as the cap. For example,
500 daily series over 14 complete UTC days reserve 7,000 datapoints. Queries with `ReturnData: false` remain included.

Expressions, unknown query shapes, and missing or invalid time windows reserve the full page cap. Invalid start times
use the stricter recent bucket. Each page and retry uses its own bound; prior responses never reduce the reservation.
Current collectors submit explicit `MetricStat` queries; Metrics Insights and expression-specific quotas are outside
their scope. See the [GetMetricData contract](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricData.html).

## Retries and recovery

The wrapper owns retries and permits at most 6 physical attempts by default. Each attempt uses a single SDK attempt,
so SDK retries cannot multiply that limit. A retry must reacquire admission and consumes 1 unit from the shared allowance.
Exhausting the allowance stops retries while allowing newly admitted initial requests to probe for recovery.

Retryable failures before physical dispatch, including credential timeouts, retain bounded per-call retries without
publishing shared failure feedback. A retry reservation is required only after the call has dispatched a request;
cleanup returns that unit if preparation fails before its next dispatch. Preparations that do not reach transport
also do not count as successful recovery probes.

Throttling and retryable transient failures halve the affected quota's effective refill rate, down to 1/32
of the configured rate. They also apply a shared cooldown starting at 500 ms and doubling to 8 seconds. Individual retries
retain exponential backoff with jitter. Successful attempts replenish 1 retry unit. A success admitted after the latest
failure reduces the penalty by one step and clears its cooldown; an older in-flight success does not clear newer failure
feedback. Elapsed time alone does not refill an exhausted retry allowance during a continuing failure.

Direct calls outside wrapper retry ownership retain the configured SDK behavior. The installed AWS clients use SDK
version `3.1085.0` or `3.1120.0`, with Smithy core `3.29.3` or `3.33.3`. Their 2026 retry behavior requires an explicit
environment opt-in. CloudBurn's shared allowance and backoff are local policies, independent of the numerical defaults
on the [AWS retry behavior page](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).

## Local coordinator and crash recovery

The coordinator uses Node's built-in SQLite support and a separate database for each hashed quota key. It requires no
daemon or Redis. The directory is restricted to mode `0700` and databases to `0600`. Files contain admission state,
process reservations, and failure feedback; they do not contain credentials, request payloads, or response payloads.
Each transaction closes its database handle. Calls sharing a store and quota queue locally so only one waiting caller
checks admission at a time. Queued callers retain their own cancellation signals and deadlines; cancellation removes
their pending callbacks and timers. Checks that leave quota state unchanged release the transaction without a write.

SQLite rolls back an interrupted transaction. Reservations record their process, generation, and expiry. Expiry follows
the discovery deadline: 5 minutes by default, or the caller's `timeoutMs`. Later admission removes reservations whose
process no longer exists or whose deadline has passed, bounding stale reservations even after PID reuse or a reboot.
Managed SDK transport requires an owned, unexpired reservation and receives the discovery cancellation signal.

A crash after a committed reservation can conservatively consume rate or retry capacity even if transport never started.
Persistent files retain quota feedback across runs.

Storage errors during admission prevent dispatch instead of silently bypassing coordination. A database lock held for
5 seconds produces an actionable error. Final cleanup has a separate 100 ms budget, including after cancellation.
Completion cleanup releases a reservation only after its underlying request settles. A cleanup failure preserves the
AWS response or original error and emits `cleanupOutcome: "deferred"`.

Completed reservations whose cleanup failed enter a process-local retry queue, grouped by store and quota. The queue
retries release and failure feedback until storage becomes writable or the original reservation deadline passes.
These retries can restore capacity for another process while the owner remains alive and idle. Each retry has at most
1 second to acquire storage, followed by at most 100 ms before another attempt. Cleanup timers are unreferenced, so
they do not keep the process alive, and clear when the queue drains or expires. The queue retains only the store,
quota key, reservation ID, outcome, retry-refund flag, and deadline, outside discovery caches and credential-resolution contexts.

Stop all participating CloudBurn processes before repairing corrupted state or removing admission files, and check
directory permissions and disk space before retrying.

Coordination supports one OS user on one machine with a shared local filesystem path. Separate users, directories,
containers without the same local state, or hosts have independent limits. Network filesystems are unsupported. Future
hosted workers across machines need a distributed coordinator with atomic admission and the same quota identities;
the local store does not provide that guarantee.

## Attempt telemetry

Debug logging emits `aws: attempt` followed by one JSON object for each admission or physical attempt.

| Fields                                                               | Meaning                                                                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `operation`, `quota`                                                 | Operation and canonical quota scope; `quota` is `null` outside a request budget.                                  |
| `attempt`, `retryCount`, `startedAtMs`                               | Attempt number, completed retry count, and attempt start timestamp.                                               |
| `preparationCount`                                                   | SDK preparations for this attempt, including signature refreshes before dispatch; absent for unmanaged callbacks. |
| `queueDurationMs`, `transportDurationMs`, `dispatched`, `statusCode` | Pre-transport wait, measured HTTP duration, dispatch status, and available HTTP status.                           |
| `outcome`, `retryOutcome`                                            | Success, failure, throttle, cancellation, or exhaustion and the retry decision.                                   |
| `attribution`                                                        | Generated `scanId` and collector identity; `dataset` appears only when the budget caller supplies it.             |
| `cleanupOutcome`                                                     | `released` after successful finalization, or `deferred` when storage failed or cleanup timed out.                 |
| `datapoints`                                                         | Optional CloudWatch datapoint scope and charged cost.                                                             |

Public pricing emits a separate `aws: attempt` record with `service: "AWS Public Pricing"`,
`operation: "GetPublicPriceList"`, `region`, `durationMs`, optional `statusCode`, and
`outcome: "success" | "unavailable" | "cancelled"`. It does not emit an account quota or use AWS SDK retries.

Discovery orchestration does not currently add dataset attribution. Telemetry excludes request bodies, headers,
credentials, and raw error payloads. Queue duration includes admission, credential preparation, and signing. Cancellation
before physical dispatch reports `dispatched: false` and zero transport duration.

## Offline performance fixtures

Run the reproducible benchmark from the repository root with the pinned Node and pnpm versions:

```bash
corepack pnpm --filter @cloudburn/sdk exec node scripts/benchmark-aws-requests.ts
```

The [benchmark](../../packages/sdk/scripts/benchmark-aws-requests.ts) starts independent processes with synthetic
responses and temporary local admission state. It makes no live AWS requests. Fast-response, sustained-throttling,
concurrent-dataset, and cancellation fixtures report logical requests, physical attempts, retries, queue wait,
transport duration, and elapsed time. Queue statistics include cancelled requests and exhausted retry admissions.
Wall-clock timings vary with host load; request counts and configured pacing are the comparison points.

Baseline measured on 2026-09-07 with Node `v24.18.0`. The first 3 scenarios use `DescribeLogStreams` at 4 requests/s,
burst 2, and shared retry allowance 2. Cancellation uses 1 request/s, burst 1, and concurrency 1.

| Scenario             | Processes | Logical requests | Physical attempts (retries) | Total queue wait | Mean queue wait |  Elapsed |
| -------------------- | --------: | ---------------: | --------------------------: | ---------------: | --------------: | -------: |
| Fast responses       |         1 |                8 |                       8 (0) |         5,526 ms |          691 ms | 1,520 ms |
| Sustained throttling |         1 |                2 |                       4 (2) |         6,018 ms |        1,003 ms | 3,037 ms |
| Concurrent datasets  |         2 |                8 |                       8 (0) |         5,546 ms |          693 ms | 1,531 ms |
| Cancellation         |         1 |                8 |                       1 (0) |            32 ms |            4 ms |    22 ms |

The concurrent fixture splits requests between `logActivity` and `logRetention` in the same synthetic account.
Throttling produces 6 attempt observations, including 2 exhausted retry admissions. Cancellation stops 7 requests
before dispatch and aborts the first held request. Total queue wait sums overlapping waits, so it can exceed elapsed
time. Synthetic transport totals were 0–2 ms; these figures measure coordinator behavior, not AWS network latency.

A separate deterministic large-account regression fixture follows the S3 collector’s batches of 10 buckets with
2 parallel configuration reads per bucket and 100 ms of simulated transport per read. For 1,500 buckets, all 3,000
synthetic calls start within 150 seconds while each operation stays within its local 10/s budget. Real network delays,
pagination, throttling, and larger inventories can still require overrides or a longer discovery timeout.
