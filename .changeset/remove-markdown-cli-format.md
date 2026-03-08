---
cloudburn: minor
---

Remove Markdown as a supported `cloudburn scan --format` value.

This is a breaking CLI change: `cloudburn scan --format markdown` now fails as an invalid format. Use `table`, `json`, or `sarif` instead.
