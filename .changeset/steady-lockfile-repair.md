---
'@cloudburn/sdk': patch
---

Refresh toolchain dependencies: pin TypeScript to 5.9.3 (guarded against `pnpm update --latest` via `updateConfig.ignoreDependencies`), update Biome to 2.5.4, and rebuild the workspace lockfile so installed versions match the declared catalog.
