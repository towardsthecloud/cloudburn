---
'@cloudburn/sdk': patch
---

Defer live AWS imports until discovery operations need them. Static scans and package imports avoid AWS client and credential-provider loading, while preserving ESM/CommonJS exports, synchronous helpers, and managed credential and cancellation contexts.
