---
'@cloudburn/sdk': patch
---

Harden live discovery and static scanning: CloudWatch Logs metric-filter hydration now bounds concurrent DescribeMetricFilters calls, every AWS client uses adaptive retry mode with explicit connection/request timeouts, and malformed Terraform files are skipped instead of aborting the entire static scan.
