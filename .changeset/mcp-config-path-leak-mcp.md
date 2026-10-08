---
'@cloudburn/mcp': patch
---

Restrict `configPath` to `.cloudburn.yml` and `.cloudburn.yaml` files so arbitrary files cannot be read through the scan tools.
This changes behavior: a `configPath` with any other filename, such as `settings.yaml`, now returns `INVALID_ARGUMENT`.
Rename a custom config file to `.cloudburn.yml` or `.cloudburn.yaml` to keep using it through MCP.
