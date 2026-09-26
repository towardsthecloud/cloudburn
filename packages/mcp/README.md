# @cloudburn/mcp

CloudBurn's MCP server lets AI agents find AWS cost waste in Terraform, CloudFormation, and live AWS accounts. It runs
locally over stdio and exposes read-only tools backed by [`@cloudburn/sdk`](https://www.npmjs.com/package/@cloudburn/sdk).

## Install

The [CloudBurn plugin](https://github.com/towardsthecloud/cloudburn-plugin) bundles this server with a skill that teaches
agents when and how to use it. Prefer the plugin in Claude Code and Codex:

```bash
claude plugin marketplace add towardsthecloud/cloudburn-plugin
claude plugin install cloudburn@towardsthecloud

codex plugin marketplace add towardsthecloud/cloudburn-plugin
codex plugin add cloudburn@towardsthecloud
```

To add only the server, register it with your agent:

```bash
claude mcp add cloudburn -- npx -y @cloudburn/mcp
codex mcp add cloudburn -- npx -y @cloudburn/mcp
```

Other MCP clients use the same command in their configuration:

```json
{
  "mcpServers": {
    "cloudburn": {
      "command": "npx",
      "args": ["-y", "@cloudburn/mcp"]
    }
  }
}
```

Requires Node.js 24 or later.

## Tools

| Tool               | Purpose                                                                   | AWS access              |
| ------------------ | ------------------------------------------------------------------------- | ----------------------- |
| `scan_iac`         | Scan a Terraform file, CloudFormation template, or directory              | None                    |
| `discover`         | Evaluate live resources in one AWS region                                 | Read-only API calls     |
| `discovery_status` | Show AWS Resource Explorer index status across regions                    | Read-only API calls     |
| `list_rules`       | List built-in rules, optionally filtered by service, source, and severity | None                    |

`scan_iac` and `discover` accept `configPath`, `enabledRules`, `disabledRules`, and `services`, like the CLI's
`--config`, `--enabled-rules`, `--disabled-rules`, and `--service` flags. `discover` also accepts `region`,
`timeoutSeconds`, and `cache` (`normal`, `refresh`, or `off`) and reports progress to clients that request it.
Paths must be absolute because agents start the server in different working directories.

Results are the SDK's `ScanResult` JSON, the same shape as `cloudburn --format json`; see the
[finding reference](https://github.com/towardsthecloud/cloudburn/blob/main/docs/reference/finding-shape.md). Errors
return `isError` with a `{ "error": { "code", "message" } }` body, and messages are redacted before they reach the
agent.

## AWS access

`discover` and `discovery_status` use the standard AWS credential chain of the process that starts the server, so set
`AWS_PROFILE` and `AWS_REGION` in your agent's environment. Live discovery needs AWS Resource Explorer. Run
`npx -y cloudburn discover init` once; the server never changes AWS resources. Discovery shares the CLI's per-user
evidence cache at `$XDG_CACHE_HOME/cloudburn/evidence` or `~/.cache/cloudburn/evidence`. See the
[CLI README](https://github.com/towardsthecloud/cloudburn/tree/main/packages/cloudburn#discover) for rule
prerequisites and IAM permissions.

## License

Apache-2.0
