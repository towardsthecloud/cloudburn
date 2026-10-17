# SDK Live Metric Evidence

How live discovery collects ELB request activity and CloudWatch metric evidence. The [live scan](live-scan.md#live-scan)
owns the overall discovery flow.

## ELB inventory and request activity

The ELB activity loader resolves `aws-ec2-load-balancers` through the per-run dataset context. Inventory and activity
share load-balancer descriptions and attached target-group ARNs. For 10 ALBs in one Region, loading both datasets uses
10 load-balancer-scoped `DescribeTargetGroups` calls and 1 `DescribeLoadBalancers` call, absent pagination or retries.
CloudWatch queries, target-group dataset descriptions, and target-health requests are separate from those 11 calls.
Both target-group lookup paths follow `NextMarker`, retaining relationships from later pages and the selected catalog
scope. Deleted load balancers are skipped, including deletion during relationship pagination.
See the [DescribeTargetGroups contract](https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DescribeTargetGroups.html).

`CLDBRN-AWS-ELB-5` uses daily `Sum` values over the previous 14 complete UTC days and flags an average below 10 HTTP
requests per day. It requires complete CloudWatch evidence with all 14 daily points. Missing, empty, partial, forbidden,
and failed evidence remains unknown; missing days are never filled with zero. Empty-target cleanup rules retain
precedence and can establish an assessed result independently of activity evidence.

| Load balancer | HTTP activity contract |
| --- | --- |
| Application | `AWS/ApplicationELB`, `RequestCount`, `LoadBalancer=app/name/id` |
| Classic, HTTP/HTTPS listeners only | `AWS/ELB`, `RequestCount`, `LoadBalancerName=name` |
| Classic with TCP/SSL, mixed, empty, or unknown listeners | Unsupported for the HTTP request threshold; retained as unknown coverage |
| Network and Gateway | Unsupported for the HTTP request threshold; retained as unknown coverage without HTTP metric queries |

Classic inventory includes `listenerProtocols` from the existing describe response. AWS defines Classic
[`RequestCount`](https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/elb-cloudwatch-metrics.html) as requests
for HTTP listeners and connections for TCP listeners, so an HTTP-only listener set is required.
[Application metrics](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html)
count requests for which a target was selected. Network and Gateway expose flow counts in
[`AWS/NetworkELB`](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-cloudwatch-metrics.html)
and [`AWS/GatewayELB`](https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/cloudwatch-metrics.html).
Flow counts do not have an established idle threshold in this rule and are never stored as HTTP request counts.

The SDK populates `requestActivityStatus` as `complete`, `unknown`, or `unsupported` on normalized activity rows.
`averageRequestsPerDayLast14Days` stays nullable. Both the status and Classic listener metadata are additive optional
fields for existing custom dataset producers. An absent status retains numeric evidence compatibility for supported
inventories; absent Classic listener metadata cannot establish HTTP-only support.

## CloudWatch metric evidence

With evidence caching configured, metric collectors reuse complete historical intervals through the existing scoped
cache. A bounded planner coalesces compatible pending queries across datasets and gives shared requests independent
cancellation ownership. Requested windows, per-series status, and raw Sum/SampleCount inputs remain intact. See
[incremental metrics](../reference/evidence-cache.md#incremental-cloudwatch-metrics) for revalidation, storage sizing,
planning limits, telemetry, and measured synthetic request savings.

The [metric helper](../../packages/sdk/src/providers/aws/resources/cloudwatch.ts) returns one `CloudWatchMetricEvidence`
record for every requested query ID. Each record retains the final AWS status, requested start/end and aggregation
period, normalized points, expected and observed interval counts, request/query messages, and query attempt count.
An absent series has status `Missing`; a returned series without a status has `Unknown`. `Complete` with no points is
distinct from both. Coverage counts describe returned intervals; `Complete` means CloudWatch returned all available
points, not that the service emitted a point in every interval. These semantics follow the AWS
[MetricDataResult contract](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_MetricDataResult.html).

Pagination accumulates points until the query finishes. Identical points are deduplicated, conflicting points in one
aggregation interval make the series incomplete, and out-of-window or malformed values cannot fill coverage gaps.
Recoverable `PartialData` and `InternalError` results receive up to 3 query attempts. Each attempt follows pagination,
retries only the unresolved query IDs, and replaces the previous attempt's points while retaining diagnostics.
`Forbidden`, missing series, and missing status do not trigger query retries. Physical request retries and concurrency
budgets remain owned by `runAwsRequest`; query backoff honors discovery cancellation.

Loaders explicitly choose an observation window independently of `Period`. Daily checks use previous complete UTC
days. Lambda uses a rolling 7-day window ending at the latest whole minute, with hourly sums and duration sample
counts. Duration is `sum(Duration Sum) / sum(Duration SampleCount)` for matching observed intervals, avoiding an
unweighted average of bucket averages. EMR uses a rolling 30-minute window. AWS request rounding is documented in
[GetMetricData](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricData.html).

Only complete series reach metric summaries. Regular metrics require their full expected daily or five-minute coverage.
EC2 can establish its low-utilization finding from at least 4 complete daily CPU/network observations; a non-finding
requires all 14 days, recorded as `observedDays`. DynamoDB inactivity requires 90 observed complete days for an old-enough
table. SageMaker empty invocation evidence stays unknown. Lambda errors have one narrow sparse-metric exception:
complete-empty `Errors` can become zero when complete, nonempty `Invocations` establish activity in the same window.
Missing or failed `Errors` stays unknown. This uses Lambda's documented
[invocation outcome metrics](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html).

Unknown metrics remain nullable in normalized datasets. Config retains affected resource-type identities with null
metric-derived counts and estimates. Rules use the optional pure `getLiveEvaluationCoverage` callback to distinguish
assessed resources from candidates missing evidence, while `evaluateLive` continues to return `Finding | null`.
The engine emits skipped diagnostics for unknown resource coverage even when evaluation resources were not requested.
