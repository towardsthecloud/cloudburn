---
'@cloudburn/rules': patch
---

Add optional live evaluation coverage so metric rules distinguish assessed resources from resources with incomplete
or missing evidence. Preserve existing grouped finding returns, track observed EC2 utilization days, and allow
unknown AWS Config metric counts and savings estimates to remain null.
