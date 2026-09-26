# CloudBurn plugin

CloudBurn finds AWS cost waste before and after deployment. This plugin gives Claude, Codex, and other agents the
CloudBurn MCP server plus a skill that teaches them when to scan infrastructure as code, when to check a live AWS
account, and how to act on the findings.

This repository is generated from [towardsthecloud/cloudburn](https://github.com/towardsthecloud/cloudburn). Open
issues and pull requests there.

## Install

Claude Code:

```bash
claude plugin marketplace add towardsthecloud/cloudburn-plugin
claude plugin install cloudburn@towardsthecloud
```

Codex:

```bash
codex plugin marketplace add towardsthecloud/cloudburn-plugin
codex plugin add cloudburn@towardsthecloud
```

Skill only, for any agent supported by [skills.sh](https://skills.sh):

```bash
npx skills add towardsthecloud/cloudburn-plugin
```

The skill falls back to the `cloudburn` CLI when the MCP tools are not installed.

## Requirements

- Node.js 24 or later with `npx` on `PATH`. The plugin starts the MCP server with
  `npx -y @cloudburn/mcp@<version>`, pinned to the release in `.mcp.json` and `mcp.json`.
- For live AWS scans only: AWS credentials in the environment that starts your agent, for example `AWS_PROFILE`
  and `AWS_REGION`, and AWS Resource Explorer set up with `cloudburn discover init`.

## What it runs and sends

The MCP server runs locally over stdio and exposes four read-only tools:

| Tool               | What it does                                             | Network access                                |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- |
| `scan_iac`         | Scans Terraform and CloudFormation files you point it at | None                                          |
| `discover`         | Evaluates live resources in one AWS region               | Read-only AWS API calls with your credentials |
| `discovery_status` | Reports AWS Resource Explorer index status               | Read-only AWS API calls with your credentials |
| `list_rules`       | Lists built-in CloudBurn rules                           | None                                          |

`npx` downloads `@cloudburn/mcp` and its dependencies from the npm registry on first use. Live discovery talks only
to AWS endpoints and caches collected evidence under `$XDG_CACHE_HOME/cloudburn/evidence` or
`~/.cache/cloudburn/evidence`, shared with the CLI. Credentials are never stored. CloudBurn sends no telemetry and
never changes AWS resources; setting up Resource Explorer stays a manual CLI step.

## Learn more

- [CloudBurn documentation](https://cloudburn.io/docs)
- [MCP server package](https://www.npmjs.com/package/@cloudburn/mcp)
- [Issues and feedback](https://github.com/towardsthecloud/cloudburn/issues)

## License

Apache-2.0. The license text is in the `LICENSE` file.
