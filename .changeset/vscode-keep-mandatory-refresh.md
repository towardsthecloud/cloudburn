---
'@cloudburn/vscode': patch
---

Keep a refresh started by a file change, setting change, or workspace scan when a save interrupts it and save scans are
then turned off, so warnings for deleted or renamed files no longer linger.
