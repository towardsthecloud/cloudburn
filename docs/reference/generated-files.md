# Generated files

Edit authoritative inputs, then run the owning command. Do not hand-edit disposable build output.

| Output                                    | Authoritative input                                      | Command                                              | Tracked? |
| ----------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | -------- |
| `packages/*/dist/`                        | Package `src/`, `tsup.config.ts`, and manifest           | `pnpm build`                                         | No       |
| `.turbo/`                                 | Root/package Turbo configuration and task inputs         | Any Turbo task                                       | No       |
| `coverage/`                               | Package tests and Vitest configuration                   | `pnpm --filter <package> exec vitest run --coverage` | No       |
| `pnpm-lock.yaml`                          | Root/package manifests and `pnpm-workspace.yaml` catalog | `pnpm install`                                       | Yes      |
| Package versions and `CHANGELOG.md` files | `.changeset/*.md` files and Changesets configuration     | Automated `pnpm changeset:version`                   | Yes      |

Coverage is opt-in; no root coverage script is defined. Select a workspace package with the command above.

The CLI build starts at `packages/cloudburn/src/cli.ts` and publishes `dist/cli.js`. The SDK and rules builds start at
their `src/index.ts` files and publish ESM, CommonJS, and declaration output described by their package manifests.
The SDK also emits internal chunks for deferred live imports in both formats; publish the complete `dist/` directory.

The action build starts at `packages/action/src/index.ts` and produces `dist/index.cjs` plus `dist/main.wasm.gz`, the
`@cdktf/hcl2json` parser binary copied during bundling. Both are build output — the release workflow copies them into
`towardsthecloud/cloudburn-action`, where they are committed artifacts of that repository.
The build also emits `dist/metafile-cjs.json` for tests to inspect bundle dependencies; the release workflow does not
copy this validation metadata to the action repository.

The action's [tsup configuration](../../packages/action/tsup.config.ts) owns the WASM relocation and dependency
exclusions. Its `noExternal` pattern must exclude AWS SDK and Smithy packages because tsup checks it before `external`;
use regular expressions for the package-prefix exclusions. Discovery imports remain deferred in the SDK so static
scans do not need those external packages at runtime. The [bundle regression](../../packages/action/test/e2e/bundle.test.mjs)
checks the emitted metadata, and [isolated scan tests](../../packages/action/test/e2e/action.test.mjs) verify the shipped
artifacts. Build with `pnpm exec turbo run build --filter @cloudburn/action`, then run `pnpm --filter @cloudburn/action test:e2e`.

The MCP build starts at `packages/mcp/src/cli.ts` and publishes `dist/cli.js`. The same `build` script runs
[the plugin build](../../packages/mcp/scripts/build-plugin.mjs), which copies `packages/mcp/plugin/` and the root
`LICENSE` to `dist/plugin/`, then stamps the package version into the plugin manifests and MCP launchers. The npm
package excludes `dist/plugin/`; the release workflow copies it into `towardsthecloud/cloudburn-plugin`, where it is
committed. Edit `packages/mcp/plugin/`, never `dist/plugin/` or the plugin repository.

The reference pages for [rule IDs](rule-ids.md), [configuration](config-schema.md), and [finding shapes](finding-shape.md)
are manually maintained from the code sources named at the top of each page. No generator currently updates them; change
the reference in the same pull request as its source contract.
