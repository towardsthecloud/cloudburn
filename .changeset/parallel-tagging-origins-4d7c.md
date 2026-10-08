---
'@cloudburn/sdk': patch
---

Speed up untagged-resource discovery by resolving EC2, KMS and SSM creation-origin metadata concurrently within each region.
