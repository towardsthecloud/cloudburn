---
'cloudburn': patch
---

Escape terminal control characters (ANSI/OSC sequences, BEL, carriage returns, other C0/C1 controls) and bidi overrides in `table` output so values from scanned IaC, such as resource IDs and file paths, cannot rewrite or hide rows in the terminal.
