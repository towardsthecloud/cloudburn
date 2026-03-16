---
"@cloudburn/sdk": minor
---

Remove `text` from the config output-format contract. CloudBurn config now accepts only `table` or `json` for mode `format`, and existing `format: text` values fail validation.
