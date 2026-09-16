---
'@cloudburn/rules': minor
---

Add the AWS capability catalog and pure rule-to-capability mapping helpers. `AWS_CAPABILITIES`, `AwsCapability`, `getAwsDatasetCapability`, and `getAwsRuleCapabilities` name the setup-gated capabilities a live rule's required discovery datasets depend on, and the AWS Core preset now derives its opt-in exclusions from that mapping with unchanged membership.
