---
'cloudburn': minor
---

The discover command streams progress lines (catalog ready, datasets completed) to stderr on interactive terminals, and usage errors such as unknown options or invalid option arguments now exit with the runtime-error code 2 instead of colliding with the policy-violation exit code 1.
