---
'@cloudburn/sdk': patch
---

Complete the coordinated optimization-contract release with immutable rule IDs, a minimal SDK integration example, and installed-package checks. SDK 0.37.1 pins @cloudburn/rules 0.34.1; upgrade the application's SDK dependency and lockfile together (and any direct rules dependency to 0.34.1).

Intentional pre-1.0 changes from SDK 0.36.x: Hub financial fields are nullable; canonical identity, freshness deduplication, and action-aware precedence can change final finding membership/counts/order. Hub Graviton evidence supersedes equivalent native EC2/RDS findings, and Savings Plans namespaces distinguish purchase families. Update runtime guards and persisted result contracts to retain scoped capabilities, recommendation provenance/identity, and optional normalized impact. Unknown financial evidence never means zero. Final providers are post-precedence; evaluations retain pre-precedence evidence. Distinct actions are not automatically additive.

[CloudBurn Cloud #141](https://github.com/towardsthecloud/cloudburn-monorepo/issues/141) must replace its pre-launch result/worker/artifact contract directly; no compatibility adapter or migration is provided. Product profiles remain application-owned. See the [SDK upgrade notes](https://github.com/towardsthecloud/cloudburn/blob/main/packages/sdk/README.md#optimization-contract-upgrade) for the example and integration requirements. The release does not change rule IDs or discovery algorithms from SDK 0.37.0.
