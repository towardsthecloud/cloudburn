---
'@cloudburn/rules': patch
---

`CLDBRN-AWS-EBS-3` reports volumes attached to an instance that is missing from the inventory, or whose state was not reported, as unknown coverage instead of a silent pass.
