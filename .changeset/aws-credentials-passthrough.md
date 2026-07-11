---
'@cloudburn/sdk': minor
---

Add scoped AWS credentials support for live discovery. `CloudBurnClient.discover()` accepts `aws.credentials` (a static identity or credential provider), and the new `withAwsClientCredentials()` helper scopes credentials to every AWS client created inside a callback. All client factories also accept explicit `credentials`. Existing behavior is unchanged when no credentials are supplied.
