---
"cloudburn": minor
---

Refactor the CLI output system around a global `--format` flag with `text`, `json`, and `table` output, while preserving raw YAML as the default for `cloudburn init`.

This removes `sarif` output support from the CLI, which is a breaking change for existing integrations using `--format sarif`.
