---
"@cloudburn/sdk": minor
---

Route live AWS discovery through AWS Resource Explorer catalogs plus targeted hydrators, expose discovery setup and introspection helpers on `CloudBurnClient`, remove the legacy `scanLive()` / `live.*` compatibility surface, require discovery rules to declare `liveDiscovery`, and fail fast on missing or filtered default Resource Explorer views.
