# @cloudburn/mcp

Source of the CloudBurn MCP server and the agent plugin that the `towardsthecloud/cloudburn-plugin` repository
receives on release. The [package README](README.md) owns server usage; the [plugin README](plugin/README.md) is the
public plugin repository's README.

## Boundaries

- The server is a local stdio distribution channel for `@cloudburn/sdk`. Call `CloudBurnClient`, `builtInRuleMetadata`,
  and SDK helpers only; never import `@cloudburn/rules` or the `cloudburn` package. Tool semantics mirror the CLI
  `scan`, `discover`, `discover status`, and `rules list` commands, and results use the SDK's public JSON shapes.
- Every tool is read-only. Keep AWS setup that mutates accounts, such as `discover init`, in the CLI.
- Tool names, input schemas, and result shapes are a public contract for agents and skills: additive changes only.
- Path arguments must be absolute. Agent hosts start the server in different working directories; Codex uses the
  plugin cache. Implicit config discovery still follows the SDK's `process.cwd()` search, so the skill passes
  `configPath`.
- stdout carries JSON-RPC. Write diagnostics only to stderr.
- The server speaks MCP 2026-07-28 and 2025-era clients through `serveStdio` from the TypeScript SDK v2 packages.
- The `workspace:*` SDK pin makes every SDK release bump this package, and each bump republishes the plugin pinned to
  the new server version. Keep the pin.

## Plugin

- `plugin/` is the plugin source. `pnpm build` writes `dist/plugin/` with [the plugin build](scripts/build-plugin.mjs),
  which stamps the package version into both manifests and pins `npx -y @cloudburn/mcp@<version>` in `.mcp.json`
  (Claude Code) and `mcp.json` (Agent Plugins clients such as Codex). Never hand-edit `dist/plugin/`.
- One folder serves Claude Code, Codex, and skills.sh: `.claude-plugin/` for Claude, root `plugin.json`, `mcp.json`, and
  `.agents/plugins/marketplace.json` for Agent Plugins clients, and `skills/` for all of them.
- Keep the plugin within Anthropic's directory checks: regular text files under 256 KiB, a README of at least 40 words,
  a license, an exact `npx` pin, and no credentials. Describe everything the plugin runs or sends in its README.
- For release sync, directory submission, and npm bootstrap, follow the [agent plugin sync](../../docs/guides/releasing.md#agent-plugin-sync).

## Testing

- `vitest` tests connect a client over an in-memory transport and mock `CloudBurnClient` to cover discovery wiring,
  progress, and error redaction without AWS.
- `test/e2e/` starts the built server over stdio in isolated directories against the CLI's Terraform and
  CloudFormation fixtures, with AWS SDK modules blocked, and audits the built plugin folder.
- `test/package/` installs the packed server, SDK, and rules into an isolated consumer and scans through the installed
  executable, because users only ever run the published package through `npx`.
- For focused validation, run
  `pnpm exec turbo run lint typecheck test test:e2e test:package --filter @cloudburn/mcp`. When a change touches the
  plugin, also run `claude plugin validate --strict packages/mcp/dist/plugin` if Claude Code is installed. Finish
  with the root `pnpm verify` gate.
