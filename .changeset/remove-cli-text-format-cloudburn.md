---
"cloudburn": minor
---

Remove CLI `text` output support so `table` is the default human-readable format and `json` is the only alternate `--format` value. `cloudburn init` and `cloudburn init config --print` still emit raw YAML by default, while explicit format overrides render as table or JSON.
