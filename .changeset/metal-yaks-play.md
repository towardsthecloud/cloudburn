---
'@cloudburn/rules': patch
---

Flag CloudWatch unused log streams when they have never received events or when their last ingestion was more than 90 days ago.
