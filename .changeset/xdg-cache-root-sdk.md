---
'@cloudburn/sdk': patch
---

Ignore empty or relative `XDG_CACHE_HOME` when resolving per-user cache directories, export `resolveCloudBurnCacheDirectory`, and refuse symbolic-linked or foreign-owned evidence cache directories.
