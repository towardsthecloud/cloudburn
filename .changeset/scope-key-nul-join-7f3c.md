---
'@cloudburn/rules': patch
---

Build live-rule resource join keys with a delimiter join instead of `JSON.stringify`, reducing CPU on large accounts.
