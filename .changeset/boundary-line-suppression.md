---
'@cloudburn/sdk': patch
---

Attribute a suppression directive on a resource's own boundary line to that resource only. A directive such as `} # cloudburn-ignore-all` closing one resource directly above the next no longer also suppresses findings on the resource that starts on the following line, so those findings stay active and still trigger `--exit-code` and `--fail-on`. This applies to both Terraform and CloudFormation YAML. A standalone comment line between two resources still applies to the resource below it.
