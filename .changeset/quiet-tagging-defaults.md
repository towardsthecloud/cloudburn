---
'@cloudburn/sdk': patch
---

Exclude built-in AWS defaults and service-managed resources from untagged-resource discovery. Use scoped EC2, KMS and SSM metadata to distinguish default resources from customer resources, and expose uncertain creation origins as unknown coverage instead of tagging findings.
