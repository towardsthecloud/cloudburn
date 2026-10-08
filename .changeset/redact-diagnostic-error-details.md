---
'@cloudburn/sdk': patch
---

Redact AWS error text in discovery diagnostic `details`, Resource Explorer region status `notes`, and debug logs the same way `categorizeError` redacts thrown errors, and replace credential-provider failures there with fixed credentials guidance. Redaction now also covers ECS and EKS container credential endpoints, `X-Amz-Credential` and SigV4 `Authorization` header values, plain-text AWS secret keys and session tokens, and access key IDs.
