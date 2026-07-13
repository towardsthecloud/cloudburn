---
'@cloudburn/sdk': minor
---

Harden live discovery throughput and resilience: RDS instances and snapshots are described in filtered batches instead of one call per identifier, ELBv2 target-group lookups run in bounded parallel batches, Route 53 operations share the account-wide five-request-per-second budget across datasets, retries, and concurrent discovery runs, shared SageMaker endpoint configs are described once per region, every discover run caps combined in-flight AWS calls per service and region across concurrent datasets, Resource Explorer catalog failures degrade to account-scoped datasets with diagnostics instead of aborting the run, and `CloudBurnClient.discover` accepts an `onProgress` callback streaming catalog and dataset progress events.
