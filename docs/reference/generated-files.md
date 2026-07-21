# Generated files

Edit authoritative inputs, then run the owning command. Do not hand-edit disposable build output.

| Output                                    | Authoritative input                                      | Command                            | Tracked? |
| ----------------------------------------- | -------------------------------------------------------- | ---------------------------------- | -------- |
| `packages/*/dist/`                        | Package `src/`, `tsup.config.ts`, and manifest           | `pnpm build`                       | No       |
| `.turbo/`                                 | Root/package Turbo configuration and task inputs         | Any Turbo task                     | No       |
| `coverage/`                               | Package tests and Vitest configuration                   | Coverage task when requested       | No       |
| `pnpm-lock.yaml`                          | Root/package manifests and `pnpm-workspace.yaml` catalog | `pnpm install`                     | Yes      |
| Package versions and `CHANGELOG.md` files | `.changeset/*.md` files and Changesets configuration     | Automated `pnpm changeset:version` | Yes      |

The CLI build starts at `packages/cloudburn/src/cli.ts` and publishes `dist/cli.js`. The SDK and rules builds start at
their `src/index.ts` files and publish ESM, CommonJS, and declaration output described by their package manifests.

The reference pages for [rule IDs](rule-ids.md), [configuration](config-schema.md), and [finding shapes](finding-shape.md)
are manually maintained from the code sources named at the top of each page. No generator currently updates them; change
the reference in the same pull request as its source contract.
