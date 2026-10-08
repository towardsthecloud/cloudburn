---
'@cloudburn/sdk': patch
---

Make YAML suppression-comment detection linear so long `&`/`!` runs, many quotes, or whitespace-padded directives in a scanned file can no longer hang static scans.
