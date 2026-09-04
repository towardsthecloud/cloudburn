---
'@cloudburn/rules': patch
'@cloudburn/sdk': patch
cloudburn: patch
---

Add a discovery check that recommends targeted daily AWS Config recording overrides when current inventory, recent resource turnover, and configuration-item volume show a saving. Keep continuous recording for Firewall Manager dependencies, and report bounded but inconclusive turnover inspection as unavailable instead of passed.
