---
'@cloudburn/sdk': patch
---

Speed up CloudWatch log-stream discovery on accounts with many log groups. Log streams are now listed for up to 10 log groups at a time per region instead of one log group after another, with the same results.
