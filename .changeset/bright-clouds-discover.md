---
'@cloudburn/sdk': patch
---

Enforce AWS request timeouts, use the discovery control region for STS account-ID resolution when the profile has no default region, and check regional indexes concurrently to reduce all-region discovery latency.

Cache regional dataset dependencies, load regions concurrently, and retain healthy-region findings when other regions fail. Exclude incomplete regional evidence from joined rules and evaluated-resource projections. Explicit targets also select the region for account and Resource Explorer control-plane calls.

Require complete CPU and both network directions before counting EC2 idle days, deduplicate daily observations, and align the observation window to complete UTC days.

Batch CloudWatch queries by supported query and datapoint limits with aligned windows and bounded concurrency, and keep recent log-stream hydration workers busy when individual requests are slow.

Isolate static dataset relationships and rule evaluation by Terraform module directory or CloudFormation template so one source cannot satisfy another source’s missing lifecycle or autoscaling configuration.

Index Terraform S3 and ECR policy references once per source scope to avoid rescanning every policy for every resource.

Use one bounded filesystem walk for mixed IaC scans, skip nested symlink loops and duplicate links, and preserve support for explicit symlink roots.
