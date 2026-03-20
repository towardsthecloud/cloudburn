---
"cloudburn": patch
---

Replace the legacy `init` config workflow with a dedicated `config` command.

`cloudburn config --init` now creates the starter config, `cloudburn config --print` prints the discovered config file, and `cloudburn config --print-template` prints the starter template without writing a file.
